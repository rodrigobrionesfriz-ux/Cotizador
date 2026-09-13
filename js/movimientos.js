import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, doc, onSnapshot, serverTimestamp, query, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml, fmtNum, fmtMon, fmtFecha, nextFolio, attachProductoSearch } from "./inv-helpers.js";
import { getProductos, getProducto, crearProductoDesdeExterno } from "./productos.js";
import { getBodegas, bodegaNombre } from "./bodegas.js";

// ================= MOVIMIENTOS DE INVENTARIO (criterio SCI) =================
// Cada movimiento es una ENTRADA (ENT) o SALIDA (SAL) tipificada. El tipo
// (COMPRA, VENTA, TRASPASO, MERMA, etc.) define qué datos se exigen: documento
// tributario, proveedor, cliente, centro de costo o bodega destino. Es el mismo
// criterio del SCI. Cada tipo lleva su propio correlativo. Los movimientos se
// pueden editar y eliminar (eliminar = marca ELIMINADO y revierte su efecto).
// Nunca se permite dejar stock negativo en ninguna bodega.

// ── Tipos de documento tributario ──
const TIPOS_DOC = ["FACTURA", "FACTURA EXENTA", "GUIA DE DESPACHO", "BOLETA", "NOTA DE CREDITO", "NOTA DE DEBITO"];

// ── Tipos de movimiento (cada uno con su correlativo y campos requeridos) ──
const TIPOS_MOV_ENT = [
  { tipo: "COMPRA",         prefijo: "COMP", label: "Compra",                        icon: "🛒", reqDoc: true,  reqProv: true },
  { tipo: "DEVOLUCION_CC",  prefijo: "DCC",  label: "Devolución de centro de costo", icon: "↩️", reqCC: true },
  { tipo: "AJUSTE_ENT",     prefijo: "AJE",  label: "Ajuste de inventario (entrada)", icon: "📋" },
  { tipo: "SALDO_INICIAL",  prefijo: "INI",  label: "Saldo inicial",                 icon: "📦" }
];
const TIPOS_MOV_SAL = [
  { tipo: "CONSUMO_CC",           prefijo: "CCC", label: "Consumo en obra / centro de costo", icon: "📤", reqCC: true },
  { tipo: "VENTA",                prefijo: "VTA", label: "Venta / despacho",                  icon: "💰", reqDoc: true, reqCli: true },
  { tipo: "TRASPASO",             prefijo: "TRB", label: "Traspaso entre bodegas",            icon: "🔄", reqBodDest: true },
  { tipo: "MERMA",                prefijo: "MER", label: "Merma o pérdida",                   icon: "🗑️" },
  { tipo: "DEVOLUCION_PROVEEDOR", prefijo: "DEV", label: "Devolución a proveedor",            icon: "↪️", reqDoc: true, reqProv: true },
  { tipo: "AJUSTE_SAL",           prefijo: "AJS", label: "Ajuste de inventario (salida)",     icon: "📋" }
];
function tiposDe(clase) { return clase === "ENT" ? TIPOS_MOV_ENT : TIPOS_MOV_SAL; }
function movCfg(clase, movTipo) { return tiposDe(clase).find((t) => t.tipo === movTipo) || null; }

let movimientos = [];
let provCache = [];
let cliCache = [];
let ccCache = [];
let filtro = "";
let draft = null;

export function getMovimientos() { return movimientos; }

const lista = () => document.getElementById("mov-lista");
const editor = () => document.getElementById("mov-editor");

window.addEventListener("empresa-ready", () => {
  onSnapshot(colE("movimientos"), (snap) => {
    movimientos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    movimientos.sort((a, b) => (msFecha(b) - msFecha(a)));
    if (!editor() || editor().classList.contains("hidden")) renderLista();
  }, (err) => console.error("Error leyendo movimientos:", err));

  onSnapshot(colE("proveedores"), (snap) => { provCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })); refrescarEditorSiAbierto(); });
  onSnapshot(colE("clientes"), (snap) => { cliCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })); refrescarEditorSiAbierto(); });
  onSnapshot(colE("centrosCosto"), (snap) => { ccCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })); refrescarEditorSiAbierto(); });
}, { once: true });

function msFecha(m) {
  const t = m.createdAt && m.createdAt.seconds ? m.createdAt.seconds * 1000 : (m._mod || 0);
  return t || (m.fecha ? Date.parse(m.fecha) : 0);
}
function bodegasActivas() { return getBodegas().filter((b) => b.activo !== false); }
function primeraBodega() { const b = bodegasActivas()[0]; return b ? b.id : ""; }
function movGet(id) { return movimientos.find((m) => m.id === id); }
function provGet(id) { return provCache.find((p) => p.id === id); }
function cliGet(id) { return cliCache.find((c) => c.id === id); }

// ── Compatibilidad con registros antiguos (tipo ENTRADA/SALIDA/AJUSTE/TRASPASO) ──
function claseDe(m) {
  if (m.clase) return m.clase;
  if (m.tipo === "SALIDA" || m.tipo === "TRASPASO") return "SAL";
  return "ENT";
}
function esTraspaso(m) { return m.movTipo === "TRASPASO" || m.tipo === "TRASPASO"; }
function movTipoTexto(m) {
  if (m.movTipoLabel) return m.movTipoLabel;
  const cfg = movCfg(claseDe(m), m.movTipo);
  if (cfg) return cfg.label;
  return m.movTipo || m.subtipo || { ENTRADA: "Entrada", SALIDA: "Salida", AJUSTE: "Ajuste", TRASPASO: "Traspaso" }[m.tipo] || m.tipo || "-";
}
function bodOrigenDe(m) { return m.bodegaOrigen || m.bodegaId || ""; }
function bodDestinoDe(m) { return m.bodegaDestino || m.bodegaDestinoId || ""; }
function bodegaTexto(m) {
  if (esTraspaso(m)) return bodegaNombre(bodOrigenDe(m)) + " → " + bodegaNombre(bodDestinoDe(m));
  return bodegaNombre(bodOrigenDe(m));
}

// ═══════════ LISTA ═══════════
function renderLista() {
  const el = lista(); if (!el) return;
  if (editor()) editor().classList.add("hidden");
  el.classList.remove("hidden");
  let rows = movimientos.filter((m) => m.estado !== "ELIMINADO");
  if (filtro) {
    const s = filtro.toLowerCase();
    rows = rows.filter((m) => ((m.numero || "") + " " + movTipoTexto(m) + " " + (m.proveedorNombre || "") + " " + (m.clienteNombre || "") + " " + (m.numeroDoc || "") + " " + (m.observaciones || "")).toLowerCase().includes(s));
  }
  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="mov-search" placeholder="Buscar por N°, tipo, proveedor, documento…" value="${escapeHtml(filtro)}">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-success" onclick="movNueva('ENT')">⬇️ Entrada</button>
        <button class="btn btn-primary" onclick="movNueva('SAL')">⬆️ Salida</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>N°</th><th>Fecha</th><th>Tipo</th><th>Bodega</th><th>Proveedor / Cliente</th><th>Documento</th><th class="col-num">Ítems</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay movimientos.</p></div>`}
    </div>`;
  const inp = document.getElementById("mov-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; renderLista(); });
}
window.movRenderLista = renderLista;

function rowHtml(m) {
  const clase = claseDe(m);
  const badge = esTraspaso(m) ? "badge-vencida" : (clase === "ENT" ? "badge-aceptada" : "badge-no_aceptada");
  const cfg = movCfg(clase, m.movTipo);
  const tercero = m.proveedorNombre || m.clienteNombre || "-";
  const docTxt = m.numeroDoc ? ((m.tipoDoc || "DOC") + " " + m.numeroDoc) : "-";
  return `<tr style="cursor:pointer" onclick="movVer('${m.id}')">
    <td class="cell-mono"><strong>${escapeHtml(m.numero || "")}</strong></td>
    <td>${fmtFecha(m.fecha)}</td>
    <td><span class="badge ${badge}">${cfg ? cfg.icon + " " : ""}${escapeHtml(movTipoTexto(m))}</span></td>
    <td style="font-size:12px">${escapeHtml(bodegaTexto(m))}</td>
    <td style="font-size:12px">${escapeHtml(tercero)}</td>
    <td class="cell-mono" style="font-size:11.5px">${escapeHtml(docTxt)}</td>
    <td class="col-num">${(m.lineas || []).length}</td>
    <td class="row-actions" onclick="event.stopPropagation()"><button onclick="movEditar('${m.id}')">Editar</button></td>
  </tr>`;
}

// ═══════════ EDITOR (formato SCI) ═══════════
window.movNueva = function (clase) {
  draft = {
    editId: null, clase: clase || "ENT", movTipo: "",
    fecha: new Date().toISOString().slice(0, 10),
    bodegaId: primeraBodega(), bodegaDestino: "",
    tipoDoc: "", numeroDoc: "", fechaVencDoc: "",
    proveedorCodigo: "", clienteCodigo: "", centroCosto: "",
    observaciones: "", lineas: [{}]
  };
  renderEditor();
};
window.movEditar = function (id) {
  const m = movGet(id); if (!m) return;
  if (m.estado === "ELIMINADO") { toast("Movimiento eliminado", "No se puede editar", "warning"); return; }
  closeGenModal();
  draft = {
    editId: id, clase: claseDe(m), movTipo: m.movTipo || "",
    fecha: m.fecha || new Date().toISOString().slice(0, 10),
    bodegaId: bodOrigenDe(m), bodegaDestino: bodDestinoDe(m),
    tipoDoc: m.tipoDoc || "", numeroDoc: m.numeroDoc || "", fechaVencDoc: m.fechaVencDoc || "",
    proveedorCodigo: m.proveedorCodigo || "", clienteCodigo: m.clienteCodigo || "", centroCosto: m.centroCosto || "",
    observaciones: m.observaciones || m.motivo || "",
    lineas: (m.lineas || []).map((l) => ({ codigoInterno: l.codigoInterno, descripcion: l.descripcion, cantidad: l.cantidad, costo: l.costo }))
  };
  if (!draft.movTipo) {
    // Registro antiguo sin tipo tipificado: intenta mapear su subtipo.
    draft.movTipo = draft.clase === "ENT" ? "AJUSTE_ENT" : (esTraspaso(m) ? "TRASPASO" : "AJUSTE_SAL");
  }
  if (!draft.lineas.length) draft.lineas = [{}];
  renderEditor();
};
export function nuevoDesdeOC(oc) {
  // La OC vive en otra vista: activa la vista de Movimientos antes de mostrar el editor.
  const nav = document.querySelector('.nav-item[data-view="movimientos"]');
  if (nav) nav.click();
  draft = {
    editId: null, clase: "ENT", movTipo: "COMPRA",
    fecha: new Date().toISOString().slice(0, 10),
    bodegaId: primeraBodega(), bodegaDestino: "",
    tipoDoc: "", numeroDoc: "", fechaVencDoc: "",
    proveedorCodigo: oc.proveedorCodigo || "", clienteCodigo: "", centroCosto: oc.ccDefault || "",
    observaciones: "OC " + (oc.folio || ""),
    lineas: (oc.lineas || []).filter((l) => l.codigoInterno).map((l) => ({ codigoInterno: l.codigoInterno, descripcion: l.descripcion, cantidad: l.cantidad, costo: l.precio }))
  };
  if (!draft.lineas.length) draft.lineas = [{}];
  renderEditor();
}
window.nuevoMovDesdeOC = nuevoDesdeOC;

function refrescarEditorSiAbierto() {
  if (draft && editor() && !editor().classList.contains("hidden")) { capturarHeader(); renderEditor(); }
}

function optBodegas(sel) {
  return `<option value="">— Seleccione —</option>` +
    bodegasActivas().map((b) => `<option value="${b.id}"${sel === b.id ? " selected" : ""}>${escapeHtml(b.nombre)}</option>`).join("");
}

function renderEditor() {
  const el = editor(); if (!el) return;
  if (lista()) lista().classList.add("hidden");
  el.classList.remove("hidden");
  const clase = draft.clase, isEnt = clase === "ENT";
  const cfg = movCfg(clase, draft.movTipo);
  const tipos = tiposDe(clase);

  const seccionDoc = cfg && cfg.reqDoc ? `
    <div class="editor-card">
      <h4 class="section-label">📄 Documento tributario</h4>
      <div class="editor-grid">
        <label>Tipo de documento *
          <select id="mv-tipodoc">
            <option value="">— Seleccione —</option>
            ${TIPOS_DOC.map((t) => `<option value="${t}"${draft.tipoDoc === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </label>
        <label>Número del documento *<input type="text" id="mv-numdoc" value="${escapeHtml(draft.numeroDoc || "")}" placeholder="Ej: 12345"></label>
        <label>Vencimiento del documento<input type="date" id="mv-vencdoc" value="${escapeHtml(draft.fechaVencDoc || "")}"></label>
      </div>
    </div>` : "";

  const seccionProv = cfg && cfg.reqProv ? `
    <div class="editor-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 class="section-label" style="margin:0">🚚 Proveedor</h4>
        <button class="btn btn-ghost btn-small" onclick="movCrearProveedor()">+ Crear proveedor</button>
      </div>
      <div class="editor-grid">
        <label class="editor-span2">Proveedor *
          <select id="mv-prov">
            <option value="">— Seleccione proveedor —</option>
            ${provCache.slice().sort((a, b) => (a.razonSocial || "").localeCompare(b.razonSocial || "")).map((p) => `<option value="${p.id}"${draft.proveedorCodigo === p.id ? " selected" : ""}>${escapeHtml(p.razonSocial || "")}${p.rut ? " · " + escapeHtml(p.rut) : ""}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>` : "";

  const seccionCli = cfg && cfg.reqCli ? `
    <div class="editor-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 class="section-label" style="margin:0">👤 Cliente</h4>
        <button class="btn btn-ghost btn-small" onclick="movCrearCliente()">+ Crear cliente</button>
      </div>
      <div class="editor-grid">
        <label class="editor-span2">Cliente *
          <select id="mv-cli">
            <option value="">— Seleccione cliente —</option>
            ${cliCache.slice().sort((a, b) => (a.razonSocial || "").localeCompare(b.razonSocial || "")).map((c) => `<option value="${c.id}"${draft.clienteCodigo === c.id ? " selected" : ""}>${escapeHtml(c.razonSocial || "")}${c.rut ? " · " + escapeHtml(c.rut) : ""}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>` : "";

  const seccionCC = cfg && cfg.reqCC ? `
    <div class="editor-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 class="section-label" style="margin:0">🏢 Centro de costo</h4>
        <button class="btn btn-ghost btn-small" onclick="movCrearCC()">+ Crear centro de costo</button>
      </div>
      <div class="editor-grid">
        <label class="editor-span2">Centro de costo *
          <select id="mv-cc">
            <option value="">— Seleccione —</option>
            ${ccCache.filter((c) => c.activo !== false).slice().sort((a, b) => (a.codigo || "").localeCompare(b.codigo || "")).map((c) => `<option value="${escapeHtml(c.codigo)}"${draft.centroCosto === c.codigo ? " selected" : ""}>${escapeHtml(c.codigo)} · ${escapeHtml(c.descripcion || "")}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>` : "";

  el.innerHTML = `
    <button class="link-btn back-link" onclick="movRenderLista()">← Volver a movimientos</button>
    <div class="editor-header"><span class="editor-folio">${draft.editId ? ("Editar " + (movGet(draft.editId)?.numero || "")) : ("Nueva " + (isEnt ? "entrada" : "salida") + " de bodega")}</span></div>

    <div class="editor-card">
      <h4 class="section-label">${isEnt ? "⬇️ Tipo de entrada" : "⬆️ Tipo de salida"}</h4>
      <div class="editor-grid">
        <label class="editor-span2">Motivo del movimiento *
          <select id="mv-movtipo" onchange="movCambiarTipo(this.value)" ${draft.editId ? "disabled" : ""}>
            <option value="">— Seleccione tipo de ${isEnt ? "entrada" : "salida"} —</option>
            ${tipos.map((t) => `<option value="${t.tipo}"${draft.movTipo === t.tipo ? " selected" : ""}>${t.icon} ${t.label}</option>`).join("")}
          </select>
          ${draft.editId ? `<span class="muted" style="font-size:11px">El tipo no se cambia al editar (el correlativo queda atado al tipo original).</span>` : ""}
        </label>
      </div>
    </div>

    ${!cfg ? `<div class="muted" style="padding:8px 2px">Seleccione el motivo del movimiento para continuar.</div>` : `
    <div class="editor-card">
      <h4 class="section-label">📅 Datos del movimiento</h4>
      <div class="editor-grid">
        <label>${isEnt ? "Fecha de ingreso" : "Fecha de salida"} *<input type="date" id="mv-fecha" value="${escapeHtml(draft.fecha || "")}"></label>
        <label>Bodega ${cfg.reqBodDest ? "origen" : (isEnt ? "destino" : "origen")} *<select id="mv-bodega">${optBodegas(draft.bodegaId || "")}</select></label>
        ${cfg.reqBodDest ? `<label>Bodega destino *<select id="mv-boddest">${optBodegas(draft.bodegaDestino || "")}</select></label>` : ""}
      </div>
    </div>
    ${seccionDoc}
    ${seccionProv}
    ${seccionCli}
    ${seccionCC}
    <div class="editor-card">
      <label class="observaciones-label">${draft.movTipo === "MERMA" ? "Motivo de la merma *" : "Observaciones"}<input type="text" id="mv-obs" value="${escapeHtml(draft.observaciones || "")}" placeholder="${draft.movTipo === "MERMA" ? "Ej: vencimiento, daño, pérdida" : "Notas opcionales"}"></label>
    </div>

    <div class="editor-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 class="section-label" style="margin:0">Detalle de productos</h4>
        <button class="btn btn-ghost btn-small" onclick="movAddLinea()">+ Agregar línea</button>
      </div>
      ${bodegasActivas().length ? "" : `<div class="muted" style="color:var(--red)">No hay bodegas activas. Crea una en el módulo Bodegas.</div>`}
      <div class="table-wrap table-scroll"><div id="mv-lineas"></div></div>
    </div>

    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="movRenderLista()">Cancelar</button>
      <button class="btn ${isEnt ? "btn-success" : "btn-primary"}" onclick="movGuardar()">${draft.editId ? "💾 Guardar cambios" : (isEnt ? "⬇️ Registrar entrada" : "⬆️ Registrar salida")}</button>
    </div>`}`;

  if (cfg) renderLineas();
}

function renderLineas() {
  const wrap = document.getElementById("mv-lineas");
  if (!wrap) return;
  const isEnt = draft.clase === "ENT";
  const bod = draft.bodegaId;
  let total = 0;
  wrap.innerHTML = `<table class="data-table" style="min-width:720px">
    <thead><tr>
      <th style="min-width:220px">Producto</th>
      <th class="col-num" style="min-width:90px">${isEnt ? "Saldo actual" : "Disponible"}</th>
      <th class="col-num" style="min-width:100px">Cantidad</th>
      <th class="col-num" style="min-width:110px">Costo unit.</th>
      <th class="col-num" style="min-width:100px">Total</th>
      <th></th>
    </tr></thead>
    <tbody>${draft.lineas.map((l, i) => {
      const p = l.codigoInterno ? getProducto(l.codigoInterno) : null;
      const saldoBod = (p && p.stockPorBodega && bod && p.stockPorBodega[bod]) || 0;
      const cant = parseFloat(l.cantidad) || 0, costo = parseFloat(l.costo) || 0;
      total += cant * costo;
      return `<tr>
        <td>
          <input type="text" class="cell-mono" style="width:100%" id="mv-prod-${i}" value="${escapeHtml(l.codigoInterno || "")}" placeholder="🔍 Código o descripción" autocomplete="off">
          ${p ? `<div class="muted" style="font-size:10.5px">${escapeHtml(p.descripcion || "")}${p.unidadMedida ? " · " + escapeHtml(p.unidadMedida) : ""}</div>` : ""}
        </td>
        <td class="col-num cell-mono" id="mv-saldo-${i}">${fmtNum(saldoBod, 2)}</td>
        <td class="col-num"><input type="number" min="0" step="any" style="width:100%;text-align:right" value="${l.cantidad != null ? l.cantidad : ""}" oninput="movUpd(${i},'cantidad',this.value)"></td>
        <td class="col-num"><input type="number" min="0" step="any" style="width:100%;text-align:right" value="${l.costo != null ? l.costo : ""}" oninput="movUpd(${i},'costo',this.value)"></td>
        <td class="col-num cell-mono" id="mv-lintot-${i}">${fmtMon(cant * costo)}</td>
        <td><button class="btn btn-ghost btn-small" onclick="movRemoveLinea(${i})" title="Quitar">✕</button></td>
      </tr>`;
    }).join("")}</tbody>
    <tfoot><tr style="font-weight:700"><td colspan="4" style="text-align:right">TOTAL</td><td class="col-num cell-mono" id="mv-grantot">${fmtMon(total)}</td><td></td></tr></tfoot>
  </table>`;
  draft.lineas.forEach((l, i) => {
    attachProductoSearch("mv-prod-" + i, () => getProductos().filter((p) => p.controlStock !== false),
      (cod) => { aplicarProductoALinea(i, cod); },
      { onCreate: (q) => {
          capturarHeader();
          const esEAN = /^\d{8,14}$/.test(q || "");
          crearProductoDesdeExterno(esEAN ? { codigoEAN: q } : { descripcion: q || "" }, (codigo) => { aplicarProductoALinea(i, codigo, true); });
        } });
  });
}
function aplicarProductoALinea(i, codigo, reRenderFull) {
  draft.lineas[i] = draft.lineas[i] || {};
  draft.lineas[i].codigoInterno = codigo;
  const p = getProducto(codigo);
  if (p) {
    if (!draft.lineas[i].descripcion) draft.lineas[i].descripcion = p.descripcion || "";
    // Precarga el costo con el costo de referencia del producto (si está vacío)
    const costoVacio = draft.lineas[i].costo == null || draft.lineas[i].costo === "";
    if (costoVacio && p.costo) draft.lineas[i].costo = p.costo;
  }
  if (reRenderFull) renderEditor(); else renderLineas();
}

function recalcTot() {
  let total = 0;
  draft.lineas.forEach((l, i) => {
    const cant = parseFloat(l.cantidad) || 0, costo = parseFloat(l.costo) || 0;
    total += cant * costo;
    const t = document.getElementById("mv-lintot-" + i);
    if (t) t.textContent = fmtMon(cant * costo);
  });
  const g = document.getElementById("mv-grantot");
  if (g) g.textContent = fmtMon(total);
}

window.movUpd = function (i, k, v) { draft.lineas[i][k] = v; if (k === "cantidad" || k === "costo") recalcTot(); };
window.movAddLinea = function () { capturarHeader(); draft.lineas.push({}); renderLineas(); };
window.movRemoveLinea = function (i) { capturarHeader(); draft.lineas.splice(i, 1); if (!draft.lineas.length) draft.lineas.push({}); renderLineas(); };
window.movCambiarTipo = function (t) { capturarHeader(); draft.movTipo = t; renderEditor(); };

window.movCrearProveedor = function () { capturarHeader(); if (typeof window.provNuevo === "function") window.provNuevo(); };
window.movCrearCliente = function () { capturarHeader(); if (typeof window.abrirNuevoCliente === "function") window.abrirNuevoCliente(); };
window.movCrearCC = function () { capturarHeader(); if (typeof window.ccNuevo === "function") window.ccNuevo(); };

function capturarHeader() {
  if (!draft) return;
  const g = (id) => { const e = document.getElementById(id); return e ? e.value : undefined; };
  const set = (k, id) => { const v = g(id); if (v !== undefined) draft[k] = v; };
  set("fecha", "mv-fecha"); set("bodegaId", "mv-bodega"); set("bodegaDestino", "mv-boddest");
  set("tipoDoc", "mv-tipodoc"); set("numeroDoc", "mv-numdoc"); set("fechaVencDoc", "mv-vencdoc");
  set("proveedorCodigo", "mv-prov"); set("clienteCodigo", "mv-cli"); set("centroCosto", "mv-cc");
  set("observaciones", "mv-obs");
}

// ═══════════ MOTOR DE STOCK ═══════════
// Efecto de un movimiento en el stock por bodega. Soporta registros nuevos y
// antiguos (tipo ENTRADA/SALIDA/AJUSTE/TRASPASO con cantidad con signo).
function computeUpdates(m) {
  const updates = {};
  const add = (cod, bodegaId, d) => {
    if (!bodegaId) return;
    const p = getProducto(cod); if (!p || !p.id || p.controlStock === false) return;
    updates[p.id] = updates[p.id] || { __total: 0 };
    const k = "stockPorBodega." + bodegaId;
    updates[p.id][k] = (updates[p.id][k] || 0) + d;
    updates[p.id].__total += d;
  };
  const oldAjuste = m.tipo === "AJUSTE" && !m.clase; // registro antiguo con cantidad con signo
  const traspaso = esTraspaso(m);
  const clase = claseDe(m);
  const origen = bodOrigenDe(m), destino = bodDestinoDe(m);
  (m.lineas || []).forEach((l) => {
    const cant = parseFloat(l.cantidad) || 0;
    if (!l.codigoInterno || cant === 0) return;
    if (traspaso) { add(l.codigoInterno, origen, -Math.abs(cant)); add(l.codigoInterno, destino, Math.abs(cant)); }
    else if (oldAjuste) { add(l.codigoInterno, origen, cant); }
    else if (clase === "SAL") { add(l.codigoInterno, origen, -Math.abs(cant)); }
    else { add(l.codigoInterno, origen, Math.abs(cant)); }
  });
  return updates;
}
function combinarUpdates(newReg, oldReg) {
  const net = {};
  const acc = (updates, sign) => {
    Object.entries(updates).forEach(([pid, obj]) => {
      net[pid] = net[pid] || { __total: 0 };
      Object.entries(obj).forEach(([k, v]) => {
        if (k === "__total") { net[pid].__total += sign * v; return; }
        net[pid][k] = (net[pid][k] || 0) + sign * v;
      });
    });
  };
  if (newReg) acc(computeUpdates(newReg), 1);
  if (oldReg) acc(computeUpdates(oldReg), -1);
  return net;
}
function validarNet(net) {
  for (const pid in net) {
    const p = getProductos().find((x) => x.id === pid);
    for (const k in net[pid]) {
      if (k === "__total") continue;
      const d = net[pid][k];
      if (d >= 0) continue;
      const bod = k.slice(k.indexOf(".") + 1);
      const actual = (p && p.stockPorBodega && p.stockPorBodega[bod]) || 0;
      if (actual + d < 0) return `Stock insuficiente de ${p ? p.codigoInterno : pid} en ${bodegaNombre(bod)}: disponible ${fmtNum(actual, 2)}, requerido ${fmtNum(-d, 2)}.`;
    }
  }
  return null;
}
function aplicarNet(batch, net) {
  Object.entries(net).forEach(([pid, obj]) => {
    const upd = {};
    Object.entries(obj).forEach(([k, v]) => { if (k === "__total") return; if (v !== 0) upd[k] = increment(v); });
    if (obj.__total !== 0) upd.stock = increment(obj.__total);
    if (Object.keys(upd).length) batch.update(docE("productos", pid), upd);
  });
}

window.movGuardar = async function () {
  capturarHeader();
  const cfg = movCfg(draft.clase, draft.movTipo);
  if (!cfg) { toast("Falta tipo", "Seleccione el motivo del movimiento", "error"); return; }
  if (!draft.fecha) { toast("Falta fecha", "", "error"); return; }
  if (!draft.bodegaId) { toast("Falta bodega", "Seleccione la bodega", "error"); return; }
  if (cfg.reqBodDest) {
    if (!draft.bodegaDestino) { toast("Falta bodega destino", "", "error"); return; }
    if (draft.bodegaDestino === draft.bodegaId) { toast("Bodegas iguales", "Origen y destino deben ser distintas", "error"); return; }
  }
  if (cfg.reqDoc && (!draft.tipoDoc || !draft.numeroDoc)) { toast("Falta documento", "Indique tipo y número de documento", "error"); return; }
  if (cfg.reqProv && !draft.proveedorCodigo) { toast("Falta proveedor", "", "error"); return; }
  if (cfg.reqCli && !draft.clienteCodigo) { toast("Falta cliente", "", "error"); return; }
  if (cfg.reqCC && !draft.centroCosto) { toast("Falta centro de costo", "", "error"); return; }
  if (draft.movTipo === "MERMA" && !(draft.observaciones || "").trim()) { toast("Falta motivo", "Indique el motivo de la merma", "error"); return; }

  const lineas = (draft.lineas || []).filter((l) => l.codigoInterno && (parseFloat(l.cantidad) || 0) > 0)
    .map((l) => { const p = getProducto(l.codigoInterno); return { codigoInterno: l.codigoInterno, descripcion: p ? p.descripcion : (l.descripcion || ""), cantidad: parseFloat(l.cantidad) || 0, costo: parseFloat(l.costo) || 0 }; });
  if (!lineas.length) { toast("Sin productos", "Agregue al menos un producto con cantidad", "error"); return; }

  const prov = provGet(draft.proveedorCodigo);
  const cli = cliGet(draft.clienteCodigo);
  const montoTotal = lineas.reduce((s, l) => s + Math.round(l.cantidad * l.costo), 0);

  const reg = {
    clase: draft.clase, movTipo: draft.movTipo, movTipoLabel: cfg.label,
    fecha: draft.fecha,
    bodegaId: draft.bodegaId,
    bodegaDestino: cfg.reqBodDest ? draft.bodegaDestino : "",
    tipoDoc: cfg.reqDoc ? draft.tipoDoc : "", numeroDoc: cfg.reqDoc ? draft.numeroDoc : "", fechaVencDoc: cfg.reqDoc ? (draft.fechaVencDoc || "") : "",
    proveedorCodigo: cfg.reqProv ? draft.proveedorCodigo : "",
    proveedorNombre: cfg.reqProv && prov ? (prov.razonSocial || "") : "",
    proveedorRut: cfg.reqProv && prov ? (prov.rut || "") : "",
    clienteCodigo: cfg.reqCli ? draft.clienteCodigo : "",
    clienteNombre: cfg.reqCli && cli ? (cli.razonSocial || "") : "",
    centroCosto: cfg.reqCC ? draft.centroCosto : "",
    observaciones: draft.observaciones || "",
    lineas, montoTotal, estado: "VIGENTE"
  };

  const original = draft.editId ? movGet(draft.editId) : null;
  const net = combinarUpdates(reg, original);
  const err = validarNet(net);
  if (err) { toast("Stock insuficiente", err, "error"); return; }

  try {
    const batch = writeBatch(db);
    if (draft.editId) {
      batch.update(docE("movimientos", draft.editId), { ...reg, _mod: Date.now() });
    } else {
      const numero = await nextFolio("mov_" + cfg.prefijo, cfg.prefijo + "-", 6);
      const ref = doc(colE("movimientos"));
      batch.set(ref, { numero, ...reg, createdAt: serverTimestamp(), _mod: Date.now() });
    }
    aplicarNet(batch, net);
    // En compras, actualiza el costo de referencia del producto al último costo de compra.
    if (draft.movTipo === "COMPRA") {
      lineas.forEach((l) => { if (l.costo > 0) { const p = getProducto(l.codigoInterno); if (p && p.id) batch.update(docE("productos", p.id), { costo: l.costo }); } });
    }
    await batch.commit();
    toast(draft.editId ? "Movimiento actualizado" : "Movimiento registrado", cfg.label, "success");
    draft = null;
    renderLista();
  } catch (err2) { console.error(err2); toast("No se pudo guardar", "", "error"); }
};

// ═══════════ VER / ELIMINAR ═══════════
window.movVer = function (id) {
  const m = movGet(id); if (!m) return;
  const clase = claseDe(m);
  const filasTerc = [];
  if (m.proveedorNombre) filasTerc.push(["Proveedor", (m.proveedorNombre || "") + (m.proveedorRut ? " · " + m.proveedorRut : "")]);
  if (m.clienteNombre) filasTerc.push(["Cliente", m.clienteNombre]);
  if (m.centroCosto) filasTerc.push(["Centro de costo", m.centroCosto]);
  if (m.numeroDoc) filasTerc.push(["Documento", (m.tipoDoc || "") + " " + m.numeroDoc]);
  showModal("Movimiento · " + escapeHtml(m.numero || ""), `
    <div class="form-row">
      <label>Fecha<div>${fmtFecha(m.fecha)}</div></label>
      <label>Tipo<div>${(clase === "ENT" ? "Entrada" : "Salida")} · ${escapeHtml(movTipoTexto(m))}</div></label>
    </div>
    <div class="form-row form-row-full"><label>Bodega<div>${escapeHtml(bodegaTexto(m))}</div></label></div>
    ${filasTerc.map((f) => `<div class="form-row form-row-full"><label>${f[0]}<div>${escapeHtml(f[1])}</div></label></div>`).join("")}
    ${m.observaciones ? `<div class="form-row form-row-full"><label>Observaciones<div>${escapeHtml(m.observaciones)}</div></label></div>` : ""}
    <div class="table-wrap table-scroll" style="margin-top:8px"><table class="data-table">
      <thead><tr><th>Código</th><th>Descripción</th><th class="col-num">Cantidad</th><th class="col-num">Costo</th><th class="col-num">Total</th></tr></thead>
      <tbody>${(m.lineas || []).map((l) => `<tr><td class="cell-mono">${escapeHtml(l.codigoInterno || "-")}</td><td>${escapeHtml(l.descripcion || "")}</td><td class="col-num">${fmtNum(l.cantidad, 2)}</td><td class="col-num">${fmtMon(l.costo || 0)}</td><td class="col-num">${fmtMon((parseFloat(l.cantidad) || 0) * (parseFloat(l.costo) || 0))}</td></tr>`).join("")}</tbody>
      ${m.montoTotal ? `<tfoot><tr style="font-weight:700"><td colspan="4" style="text-align:right">TOTAL</td><td class="col-num">${fmtMon(m.montoTotal)}</td></tr></tfoot>` : ""}
    </table></div>`,
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cerrar</button>
     <button class="btn btn-danger" onclick="movEliminar('${m.id}')">🗑 Eliminar</button>
     <button class="btn btn-primary" onclick="movEditar('${m.id}')">✏️ Editar</button>`, true);
};

window.movEliminar = function (id) {
  const m = movGet(id); if (!m) return;
  confirmDialog("Eliminar movimiento", `¿Eliminar ${m.numero}? Se revertirá su efecto en el stock. El registro queda como eliminado.`, async () => {
    const net = combinarUpdates(null, m); // revertir
    const err = validarNet(net);
    if (err) { toast("No se puede eliminar", err, "error"); return; }
    const batch = writeBatch(db);
    batch.update(docE("movimientos", id), { estado: "ELIMINADO", eliminadoEl: serverTimestamp(), _mod: Date.now() });
    aplicarNet(batch, net);
    await batch.commit();
    closeGenModal();
    toast("Movimiento eliminado", m.numero);
  }, "Eliminar", true);
};
