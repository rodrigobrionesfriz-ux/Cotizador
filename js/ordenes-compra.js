import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml, fmtMon, fmtNum, fmtFecha, nextFolio, getEmpresa, attachProductoSearch } from "./inv-helpers.js";
import { getProductos, getProducto, crearProductoDesdeExterno } from "./productos.js";
import { getProveedores, getProveedor } from "./proveedores.js";
import { getCentrosCosto, ccLabel } from "./centros-costo.js";
import { nuevoDesdeOC } from "./movimientos.js";

// ================= ÓRDENES DE COMPRA =================
const FORMAS_PAGO = ["CONTADO", "TRANSFERENCIA", "CREDITO 30 DIAS", "CREDITO 60 DIAS", "CREDITO 90 DIAS", "CHEQUE", "OTRO"];
const IVA_PCT = 19;

let ordenes = [];
let filtro = { search: "", estado: "" };
let draft = null;

const lista = () => document.getElementById("oc-lista");
const editor = () => document.getElementById("oc-editor");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("ordenescompra"), orderBy("folio", "desc")), (snap) => {
    ordenes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!editor() || editor().classList.contains("hidden")) renderLista();
  }, (err) => console.error("Error leyendo órdenes de compra:", err));
}, { once: true });

function ocGet(id) { return ordenes.find((o) => o.id === id); }

// ═══════════ LISTA ═══════════
function renderLista() {
  const el = lista(); if (!el) return;
  editor().classList.add("hidden"); el.classList.remove("hidden");
  let rows = ordenes.slice();
  if (filtro.search) {
    const s = filtro.search.toLowerCase();
    rows = rows.filter((o) => ((o.folio || "") + " " + (o.proveedorNombre || "") + " " + (o.cotizacion || "")).toLowerCase().includes(s));
  }
  if (filtro.estado) rows = rows.filter((o) => (o.estado || "EMITIDA") === filtro.estado);

  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="oc-search" placeholder="Buscar por folio, proveedor…" value="${escapeHtml(filtro.search)}">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <select id="oc-estado" class="search-input" style="width:auto">
          <option value="">Todos</option>
          <option value="EMITIDA"${filtro.estado === "EMITIDA" ? " selected" : ""}>Emitidas</option>
          <option value="ANULADA"${filtro.estado === "ANULADA" ? " selected" : ""}>Anuladas</option>
        </select>
        <button class="btn btn-primary" onclick="ocNueva()">+ Nueva orden</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Folio</th><th>Fecha</th><th>Proveedor</th><th>C. Costo</th><th class="col-num">Total</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map((o) => {
          const anulada = o.estado === "ANULADA";
          return `<tr style="cursor:pointer;${anulada ? "opacity:.55" : ""}" onclick="ocVer('${o.id}')">
            <td class="cell-mono"><strong>${escapeHtml(o.folio || "")}</strong></td>
            <td>${fmtFecha(o.fecha)}</td>
            <td>${escapeHtml(o.proveedorNombre || "-")}</td>
            <td class="cell-mono">${escapeHtml(o.ccDefault || "-")}</td>
            <td class="col-num cell-mono"><strong>${fmtMon(o.total || 0)}</strong></td>
            <td>${anulada ? '<span class="badge badge-inactivo">Anulada</span>' : '<span class="badge badge-activo">Emitida</span>'}</td>
            <td class="row-actions" onclick="event.stopPropagation()"><button onclick="ocImprimir('${o.id}')">🖨️</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay órdenes de compra.</p></div>`}
    </div>`;
  const s = document.getElementById("oc-search"); if (s) s.addEventListener("input", () => { filtro.search = s.value; renderLista(); });
  const e = document.getElementById("oc-estado"); if (e) e.addEventListener("change", () => { filtro.estado = e.value; renderLista(); });
}
window.ocRenderLista = renderLista;

// ═══════════ EDITOR ═══════════
window.ocNueva = function () {
  draft = { id: null, folio: null, fecha: new Date().toISOString().slice(0, 10), proveedorCodigo: "", contacto: "", cotizacion: "", formaPago: "", ccDefault: "", entregarEn: "", notas: "", lineas: [{}] };
  renderEditor();
};
window.ocEditar = function (id) {
  const o = ocGet(id); if (!o) return;
  if (o.estado === "ANULADA") { toast("Orden anulada", "No se puede editar", "warning"); return; }
  draft = JSON.parse(JSON.stringify(o));
  if (!draft.lineas || !draft.lineas.length) draft.lineas = [{}];
  closeGenModal();
  renderEditor();
};

function renderEditor() {
  const el = editor(); if (!el) return;
  lista().classList.add("hidden"); el.classList.remove("hidden");
  const provs = getProveedores().filter((p) => p.activo !== false).slice().sort((a, b) => (a.razonSocial || "").localeCompare(b.razonSocial || ""));
  const ccs = getCentrosCosto().filter((c) => c.activo !== false).slice().sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));

  el.innerHTML = `
    <button class="link-btn back-link" onclick="ocRenderLista()">← Volver a órdenes</button>
    <div class="editor-header"><span class="editor-folio">${draft.id ? ("Editar " + (draft.folio || "OC")) : "Nueva orden (folio se asigna al guardar)"}</span></div>
    <div class="editor-grid">
      <label>Fecha *<input type="date" id="oc-fecha" value="${escapeHtml(draft.fecha || "")}"></label>
      <label>Folio<input type="text" value="${escapeHtml(draft.folio || "(automático OC-00001)")}" readonly></label>
      <label>Proveedor *
        <select id="oc-prov" onchange="ocSetProveedor(this.value)">
          <option value="">— Seleccione proveedor —</option>
          ${provs.map((p) => `<option value="${p.id}"${draft.proveedorCodigo === p.id ? " selected" : ""}>${escapeHtml(p.razonSocial)}${p.rut ? " · " + escapeHtml(p.rut) : ""}</option>`).join("")}
        </select>
      </label>
      <label>Contacto<input type="text" id="oc-contacto" value="${escapeHtml(draft.contacto || "")}"></label>
      <label>Cotización<input type="text" id="oc-cotiz" value="${escapeHtml(draft.cotizacion || "")}" placeholder="N° o referencia"></label>
      <label>Forma de pago
        <select id="oc-formapago"><option value="">— Seleccione —</option>${FORMAS_PAGO.map((f) => `<option value="${f}"${draft.formaPago === f ? " selected" : ""}>${f}</option>`).join("")}</select>
      </label>
      <label>Centro de costo (predeterminado)
        <select id="oc-ccdef" onchange="ocSetCCDefault(this.value)">
          <option value="">— Sin CC por defecto —</option>
          ${ccs.map((c) => `<option value="${escapeHtml(c.codigo)}"${draft.ccDefault === c.codigo ? " selected" : ""}>${escapeHtml(c.codigo)} · ${escapeHtml(c.descripcion || "")}</option>`).join("")}
        </select>
      </label>
      <label>Entregar en<input type="text" id="oc-entregar" value="${escapeHtml(draft.entregarEn || "")}"></label>
    </div>
    <label class="observaciones-label">Notas<textarea id="oc-notas" rows="2" placeholder="Observaciones para el proveedor">${escapeHtml(draft.notas || "")}</textarea></label>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 8px">
      <h4 class="section-label" style="margin:0">Productos</h4>
      <button class="btn btn-ghost btn-small" onclick="ocAddLinea()">+ Agregar línea</button>
    </div>
    <div class="table-wrap table-scroll"><div id="oc-lineas"></div></div>

    <div class="modal-actions" style="margin-top:16px">
      <button class="btn btn-ghost" onclick="ocRenderLista()">Cancelar</button>
      <button class="btn btn-primary" onclick="ocGuardar()">💾 ${draft.id ? "Guardar cambios" : "Emitir orden"}</button>
    </div>`;
  renderLineas();
}

function calcLinea(l) {
  const cant = parseFloat(l.cantidad) || 0, precio = parseFloat(l.precio) || 0;
  const neto = Math.round(cant * precio);
  const p = l.codigoInterno ? getProducto(l.codigoInterno) : null;
  const afecto = p ? (p.aplicaIVA !== false) : true;
  const iva = afecto ? Math.round(neto * IVA_PCT / 100) : 0;
  const otros = Math.round(parseFloat(l.otros) || 0);
  return { neto, iva, otros, total: neto + iva + otros, afecto };
}
function totales() {
  const t = { neto: 0, iva: 0, otros: 0, total: 0 };
  (draft.lineas || []).forEach((l) => { if (!l.codigoInterno && !(parseFloat(l.cantidad) || 0)) return; const c = calcLinea(l); t.neto += c.neto; t.iva += c.iva; t.otros += c.otros; t.total += c.total; });
  return t;
}
function prodOptions(sel) {
  const ps = getProductos().filter((p) => p.activo !== false).slice().sort((a, b) => (a.codigoInterno || "").localeCompare(b.codigoInterno || ""));
  return `<option value="">— Producto —</option>` +
    ps.map((p) => `<option value="${escapeHtml(p.codigoInterno)}"${sel === p.codigoInterno ? " selected" : ""}>${escapeHtml(p.codigoInterno)} · ${escapeHtml(p.descripcion || "")}</option>`).join("") +
    `<option value="__new__">➕ Crear nuevo producto…</option>`;
}
function ccOptions(sel) {
  const ccs = getCentrosCosto().filter((c) => c.activo !== false).slice().sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""));
  return `<option value="">—</option>` + ccs.map((c) => `<option value="${escapeHtml(c.codigo)}"${sel === c.codigo ? " selected" : ""}>${escapeHtml(c.codigo)}</option>`).join("");
}

function renderLineas() {
  const wrap = document.getElementById("oc-lineas"); if (!wrap) return;
  wrap.innerHTML = `<table class="data-table" style="min-width:820px">
    <thead><tr>
      <th style="min-width:180px">Producto</th><th style="min-width:180px">Descripción</th><th style="min-width:80px">C.Costo</th>
      <th class="col-num" style="min-width:80px">Cant.</th><th class="col-num" style="min-width:95px">P.Unit.</th>
      <th class="col-num">Neto</th><th class="col-num">IVA</th><th class="col-num" style="min-width:85px">Otros</th><th class="col-num">Total</th><th></th>
    </tr></thead>
    <tbody>${draft.lineas.map((l, i) => {
      const c = calcLinea(l);
      const p = l.codigoInterno ? getProducto(l.codigoInterno) : null;
      return `<tr>
        <td>
          <input type="text" class="cell-mono" style="width:100%" id="oc-prod-${i}" value="${escapeHtml(l.codigoInterno || "")}" placeholder="🔍 Código o descripción" autocomplete="off">
          ${p ? `<div class="muted" style="font-size:10.5px">${p.controlStock === false ? "servicio (sin stock)" : "stock: " + fmtNum(p.stock || 0, 2) + " " + escapeHtml(p.unidadMedida || "")}</div>` : ""}
        </td>
        <td><input type="text" style="width:100%" value="${escapeHtml(l.descripcion || "")}" onchange="ocUpd(${i},'descripcion',this.value)">${p ? `<div class="muted" style="font-size:10.5px">${escapeHtml(p.unidadMedida || "")}${c.afecto ? "" : " · EXENTO"}</div>` : ""}</td>
        <td><select style="width:100%" onchange="ocUpd(${i},'cc',this.value)">${ccOptions(l.cc || "")}</select></td>
        <td class="col-num"><input type="number" min="0" step="any" style="width:100%;text-align:right" value="${l.cantidad != null ? l.cantidad : ""}" oninput="ocUpd(${i},'cantidad',this.value)"></td>
        <td class="col-num"><input type="number" min="0" step="any" style="width:100%;text-align:right" value="${l.precio != null ? l.precio : ""}" oninput="ocUpd(${i},'precio',this.value)"></td>
        <td class="col-num cell-mono" id="oc-neto-${i}">${fmtMon(c.neto)}</td>
        <td class="col-num cell-mono" id="oc-iva-${i}">${fmtMon(c.iva)}</td>
        <td class="col-num"><input type="number" min="0" step="any" style="width:100%;text-align:right" value="${l.otros != null ? l.otros : ""}" oninput="ocUpd(${i},'otros',this.value)"></td>
        <td class="col-num cell-mono" id="oc-total-${i}"><strong>${fmtMon(c.total)}</strong></td>
        <td><button class="btn btn-ghost btn-small" onclick="ocRemoveLinea(${i})">✕</button></td>
      </tr>`;
    }).join("")}</tbody>
    <tfoot><tr style="font-weight:700">
      <td colspan="5" style="text-align:right">TOTALES</td>
      <td class="col-num cell-mono" id="oc-tot-neto"></td><td class="col-num cell-mono" id="oc-tot-iva"></td>
      <td class="col-num cell-mono" id="oc-tot-otros"></td><td class="col-num cell-mono" id="oc-tot-total"></td><td></td>
    </tr></tfoot>
  </table>`;
  // Buscador dinámico por línea (código o descripción)
  draft.lineas.forEach((l, i) => {
    attachProductoSearch("oc-prod-" + i, getProductos,
      (cod) => window.ocSetProd(i, cod),
      { onCreate: (q) => window.ocSetProd(i, "__new__", q) });
  });
  recalc();
}
function recalc() {
  (draft.lineas || []).forEach((l, i) => {
    const c = calcLinea(l);
    const n = document.getElementById("oc-neto-" + i), v = document.getElementById("oc-iva-" + i), t = document.getElementById("oc-total-" + i);
    if (n) n.textContent = fmtMon(c.neto); if (v) v.textContent = fmtMon(c.iva); if (t) t.innerHTML = "<strong>" + fmtMon(c.total) + "</strong>";
  });
  const tt = totales();
  const set = (id, val, strong) => { const e = document.getElementById(id); if (e) e.innerHTML = strong ? "<strong>" + fmtMon(val) + "</strong>" : fmtMon(val); };
  set("oc-tot-neto", tt.neto); set("oc-tot-iva", tt.iva); set("oc-tot-otros", tt.otros); set("oc-tot-total", tt.total, true);
}
function capturarHeader() {
  const g = (id) => { const e = document.getElementById(id); return e ? e.value : ""; };
  draft.fecha = g("oc-fecha"); draft.proveedorCodigo = g("oc-prov"); draft.contacto = g("oc-contacto");
  draft.cotizacion = g("oc-cotiz"); draft.formaPago = g("oc-formapago"); draft.ccDefault = g("oc-ccdef");
  draft.entregarEn = g("oc-entregar"); draft.notas = g("oc-notas");
}

window.ocSetProveedor = function (id) {
  draft.proveedorCodigo = id;
  const p = getProveedor(id);
  const inp = document.getElementById("oc-contacto");
  if (p && p.contacto && inp && !inp.value.trim()) inp.value = p.contacto;
};
window.ocSetCCDefault = function (cod) {
  const prev = draft.ccDefault || "";
  draft.ccDefault = cod;
  (draft.lineas || []).forEach((l) => { if (!l.cc || l.cc === prev) l.cc = cod; });
  renderLineas();
};
window.ocAddLinea = function () { capturarHeader(); draft.lineas.push({ cc: draft.ccDefault || "" }); renderLineas(); };
window.ocRemoveLinea = function (i) { draft.lineas.splice(i, 1); if (!draft.lineas.length) draft.lineas.push({ cc: draft.ccDefault || "" }); renderLineas(); };
window.ocUpd = function (i, k, v) { draft.lineas[i][k] = v; if (k === "cantidad" || k === "precio" || k === "otros") recalc(); };
function aplicarProductoALinea(i, codigo) {
  draft.lineas[i].codigoInterno = codigo;
  const p = getProducto(codigo);
  if (p) draft.lineas[i].descripcion = p.descripcion || "";
  // Precarga el precio de compra con el costo de referencia del producto (si está vacío)
  const precioVacio = draft.lineas[i].precio == null || draft.lineas[i].precio === "";
  if (precioVacio && p && p.costo) draft.lineas[i].precio = p.costo;
  if (!draft.lineas[i].cc) draft.lineas[i].cc = draft.ccDefault || "";
  renderLineas();
}
window.ocSetProd = function (i, cod, prefillDesc) {
  if (cod === "__new__") {
    capturarHeader();
    const esEAN = /^\d{8,14}$/.test(prefillDesc || "");
    crearProductoDesdeExterno(esEAN ? { codigoEAN: prefillDesc } : { descripcion: prefillDesc || "" }, (codigo) => aplicarProductoALinea(i, codigo));
    return;
  }
  aplicarProductoALinea(i, cod);
};

window.ocGuardar = async function () {
  capturarHeader();
  if (!draft.fecha) { toast("Falta fecha", "", "error"); return; }
  if (!draft.proveedorCodigo) { toast("Falta proveedor", "Seleccione el proveedor", "error"); return; }
  let lineas = (draft.lineas || []).filter((l) => (l.codigoInterno || l.descripcion) && (parseFloat(l.cantidad) || 0) > 0);
  if (!lineas.length) { toast("Sin productos", "Agregue al menos un producto con cantidad", "error"); return; }
  lineas = lineas.map((l) => { const c = calcLinea(l); return { codigoInterno: l.codigoInterno || "", descripcion: l.descripcion || "", cc: l.cc || draft.ccDefault || "", cantidad: parseFloat(l.cantidad) || 0, precio: parseFloat(l.precio) || 0, neto: c.neto, iva: c.iva, otros: c.otros, total: c.total }; });
  const tot = { neto: 0, iva: 0, otros: 0, total: 0 };
  lineas.forEach((l) => { tot.neto += l.neto; tot.iva += l.iva; tot.otros += l.otros; tot.total += l.total; });
  const prov = getProveedor(draft.proveedorCodigo);
  const esNueva = !draft.id;
  const data = {
    fecha: draft.fecha, proveedorCodigo: draft.proveedorCodigo,
    proveedorNombre: prov ? prov.razonSocial : "", proveedorRut: prov ? (prov.rut || "") : "",
    contacto: draft.contacto || "", cotizacion: draft.cotizacion || "", formaPago: draft.formaPago || "",
    ccDefault: draft.ccDefault || "", entregarEn: draft.entregarEn || "", notas: draft.notas || "",
    lineas, neto: tot.neto, iva: tot.iva, otros: tot.otros, total: tot.total,
    estado: draft.estado || "EMITIDA", modificado: serverTimestamp(), _mod: Date.now()
  };
  try {
    if (draft.id) { await updateDoc(docE("ordenescompra", draft.id), data); toast("Orden actualizada", data.folio || draft.folio, "success"); }
    else { data.folio = await nextFolio("ordenescompra", "OC-", 5); data.creado = serverTimestamp(); await addDoc(colE("ordenescompra"), data); toast("Orden emitida", data.folio + " · " + fmtMon(tot.total), "success"); }
    draft = null;
    renderLista();
  } catch (err) { console.error(err); toast("No se pudo guardar la orden", "", "error"); }
};

window.ocAnular = function (id) {
  const o = ocGet(id); if (!o) return;
  confirmDialog("Anular orden de compra", `¿Anular ${o.folio || ""} de ${o.proveedorNombre || ""}? Quedará marcada como ANULADA.`, async () => {
    await updateDoc(docE("ordenescompra", id), { estado: "ANULADA", _mod: Date.now() });
    closeGenModal();
    toast("Orden anulada", o.folio);
    renderLista();
  }, "Anular", true);
};

// ═══════════ VER DETALLE ═══════════
window.ocVer = function (id) {
  const o = ocGet(id); if (!o) return;
  const anulada = o.estado === "ANULADA";
  showModal("Orden de Compra · " + escapeHtml(o.folio || ""), `
    ${anulada ? '<div class="muted" style="color:var(--red);margin-bottom:8px">⛔ Esta orden está ANULADA</div>' : ""}
    <div class="form-row">
      <label>Fecha<div>${fmtFecha(o.fecha)}</div></label>
      <label>Cotización<div>${escapeHtml(o.cotizacion || "-")}</div></label>
    </div>
    <div class="form-row form-row-full"><label>Proveedor<div><strong>${escapeHtml(o.proveedorNombre || "-")}</strong>${o.proveedorRut ? " · " + escapeHtml(o.proveedorRut) : ""}</div></label></div>
    <div class="form-row">
      <label>Contacto<div>${escapeHtml(o.contacto || "-")}</div></label>
      <label>Forma de pago<div>${escapeHtml(o.formaPago || "-")}</div></label>
    </div>
    <div class="form-row">
      <label>C. Costo<div>${escapeHtml(ccLabel(o.ccDefault))}</div></label>
      <label>Entregar en<div>${escapeHtml(o.entregarEn || "-")}</div></label>
    </div>
    ${o.notas ? `<div class="form-row form-row-full"><label>Notas<div>${escapeHtml(o.notas)}</div></label></div>` : ""}
    <div class="table-wrap table-scroll" style="margin-top:8px"><table class="data-table">
      <thead><tr><th>Código</th><th>Descripción</th><th>C.C.</th><th class="col-num">Cant.</th><th class="col-num">P.Unit</th><th class="col-num">Neto</th><th class="col-num">IVA</th><th class="col-num">Otros</th><th class="col-num">Total</th></tr></thead>
      <tbody>${(o.lineas || []).map((l) => `<tr><td class="cell-mono">${escapeHtml(l.codigoInterno || "-")}</td><td>${escapeHtml(l.descripcion || "")}</td><td class="cell-mono">${escapeHtml(l.cc || "-")}</td><td class="col-num">${fmtNum(l.cantidad, 2)}</td><td class="col-num">${fmtMon(l.precio)}</td><td class="col-num">${fmtMon(l.neto)}</td><td class="col-num">${fmtMon(l.iva)}</td><td class="col-num">${fmtMon(l.otros)}</td><td class="col-num"><strong>${fmtMon(l.total)}</strong></td></tr>`).join("")}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="5" style="text-align:right">TOTALES</td><td class="col-num">${fmtMon(o.neto)}</td><td class="col-num">${fmtMon(o.iva)}</td><td class="col-num">${fmtMon(o.otros)}</td><td class="col-num">${fmtMon(o.total)}</td></tr></tfoot>
    </table></div>`,
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cerrar</button>
     ${anulada ? "" : `<button class="btn btn-danger" onclick="ocAnular('${o.id}')">⛔ Anular</button>`}
     ${anulada ? "" : `<button class="btn btn-ghost" onclick="ocEditar('${o.id}')">✏️ Editar</button>`}
     ${anulada ? "" : `<button class="btn btn-ghost" onclick="ocIngreso('${o.id}')">📦 Ingreso a inventario</button>`}
     <button class="btn btn-primary" onclick="ocImprimir('${o.id}')">🖨️ Imprimir</button>`, true);
};

// Registrar el ingreso real a inventario (movimiento de entrada) desde la OC
window.ocIngreso = function (id) {
  const o = ocGet(id); if (!o) return;
  closeGenModal();
  nuevoDesdeOC(o);
};

// ═══════════ IMPRESIÓN CON MEMBRETE ═══════════
window.ocImprimir = function (id) {
  const o = ocGet(id); if (!o) { toast("No encontrada", "", "error"); return; }
  const emp = getEmpresa() || {};
  const esc = escapeHtml;
  const membrete =
    `<div class="oc-hdr"><div class="oc-emp">${emp.logoBase64 ? `<img class="oc-logo" src="${emp.logoBase64}">` : ""}<div class="oc-emp-txt">
      <div class="oc-emp-nom">${esc(emp.nombre || "Empresa no configurada")}</div>
      ${emp.rut ? `<div>RUT: ${esc(emp.rut)}</div>` : ""}${emp.giro ? `<div>Giro: ${esc(emp.giro)}</div>` : ""}
      ${emp.direccion ? `<div>${esc(emp.direccion)}</div>` : ""}
      ${(emp.telefono || emp.email) ? `<div>${esc(emp.telefono || "")}${emp.telefono && emp.email ? " · " : ""}${esc(emp.email || "")}</div>` : ""}
    </div></div>
    <div class="oc-folio-box"><div class="oc-folio-t">ORDEN DE COMPRA</div><div class="oc-folio-n">N° ${esc(o.folio || "")}</div>
      <div class="oc-folio-f">Fecha: ${fmtFecha(o.fecha)}</div>${o.estado === "ANULADA" ? '<div class="oc-anulada">ANULADA</div>' : ""}</div></div>`;
  const datos =
    `<div class="oc-grid">
      <div class="oc-fld oc-span2"><div class="oc-l">Proveedor</div><div class="oc-v">${esc(o.proveedorNombre || "-")}${o.proveedorRut ? " · RUT " + esc(o.proveedorRut) : ""}</div></div>
      <div class="oc-fld"><div class="oc-l">Contacto</div><div class="oc-v">${esc(o.contacto || "-")}</div></div>
      <div class="oc-fld"><div class="oc-l">Cotización</div><div class="oc-v">${esc(o.cotizacion || "-")}</div></div>
      <div class="oc-fld"><div class="oc-l">Forma de pago</div><div class="oc-v">${esc(o.formaPago || "-")}</div></div>
      <div class="oc-fld"><div class="oc-l">Centro de Costo</div><div class="oc-v">${esc(ccLabel(o.ccDefault))}</div></div>
      <div class="oc-fld oc-span3"><div class="oc-l">Entregar en</div><div class="oc-v">${esc(o.entregarEn || "-")}</div></div>
    </div>`;
  const filas = (o.lineas || []).map((l) => `<tr><td class="mono">${esc(l.codigoInterno || "-")}</td><td>${esc(l.descripcion || "")}</td><td class="mono">${esc(l.cc || "-")}</td><td class="num">${fmtNum(l.cantidad, 2)}</td><td class="num">${fmtMon(l.precio)}</td><td class="num">${fmtMon(l.neto)}</td><td class="num">${fmtMon(l.iva)}</td><td class="num">${fmtMon(l.otros)}</td><td class="num"><strong>${fmtMon(l.total)}</strong></td></tr>`).join("");
  const tabla = `<table><thead><tr><th>Código</th><th>Descripción</th><th>C.C.</th><th class="num">Cant.</th><th class="num">P.Unit Neto</th><th class="num">Neto</th><th class="num">IVA 19%</th><th class="num">Otros Imp.</th><th class="num">Total</th></tr></thead><tbody>${filas}</tbody><tfoot><tr><td colspan="5" style="text-align:right">TOTALES</td><td class="num">${fmtMon(o.neto)}</td><td class="num">${fmtMon(o.iva)}</td><td class="num">${fmtMon(o.otros)}</td><td class="num">${fmtMon(o.total)}</td></tr></tfoot></table>`;
  const notas = o.notas ? `<div class="oc-notas"><div class="oc-l">Notas</div><div>${esc(o.notas)}</div></div>` : "";
  const firmas = `<div class="oc-firmas"><div class="oc-fbox">Solicitado por</div><div class="oc-fbox">Aprobado por</div><div class="oc-fbox">Proveedor (recepción)</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.folio || "Orden de Compra")}</title><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;font-size:12px;color:#111}body{padding:14px 18px}
    .oc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #1F2A38;padding-bottom:12px;margin-bottom:14px}
    .oc-emp{display:flex;gap:14px;align-items:center}.oc-logo{max-width:90px;max-height:90px;object-fit:contain}
    .oc-emp-txt{font-size:11px;color:#444;line-height:1.5}.oc-emp-nom{font-size:16px;font-weight:700;color:#111}
    .oc-folio-box{border:2px solid #1F2A38;border-radius:6px;padding:10px 16px;text-align:center;min-width:190px}
    .oc-folio-t{font-size:12px;font-weight:700;letter-spacing:1px;color:#1F2A38}.oc-folio-n{font-size:17px;font-weight:700;margin-top:3px}
    .oc-folio-f{font-size:11px;color:#555;margin-top:3px}.oc-anulada{margin-top:5px;color:#c0392b;font-weight:700;border:1px solid #c0392b;border-radius:4px;padding:2px 6px}
    .oc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.oc-span2{grid-column:span 2}.oc-span3{grid-column:span 3}
    .oc-fld{border:1px solid #ccc;border-radius:4px;padding:6px 8px}.oc-l{font-size:9px;font-weight:700;text-transform:uppercase;color:#666}.oc-v{font-size:12px;font-weight:600;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:6px}thead tr{background:#1F2A38}th{padding:7px 8px;color:#d1e8ff;font-size:10px;font-weight:700;text-transform:uppercase;text-align:left}
    td{padding:6px 8px;border-bottom:1px solid #e8e8e8;font-size:11px}tbody tr:nth-child(even){background:#fafafa}
    tfoot tr{background:#d1e8ff}tfoot td{font-weight:700;border-top:2px solid #0a6ed1}.num{text-align:right}th.num{text-align:right}.mono{font-family:Consolas,monospace}
    .oc-notas{border:1px solid #ccc;border-radius:4px;padding:8px 10px;margin-top:8px}
    .oc-firmas{margin-top:48px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;page-break-inside:avoid}.oc-fbox{border-top:1px solid #aaa;padding-top:8px;text-align:center;font-size:11px;color:#555}
    @page{margin:12mm}table tr{page-break-inside:avoid}thead{display:table-header-group}tfoot{display:table-footer-group}
    </style></head><body>${membrete}${datos}${tabla}${notas}${firmas}</body></html>`;

  const existing = document.getElementById("oc-print-iframe"); if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "oc-print-iframe";
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow ? iframe.contentWindow.document : iframe.contentDocument;
  if (!idoc) { toast("Error", "No se pudo preparar la impresión", "error"); iframe.remove(); return; }
  idoc.open(); idoc.write(html); idoc.close();
  setTimeout(() => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { toast("Error al imprimir", e.message, "error"); } setTimeout(() => { try { iframe.remove(); } catch (e) {} }, 2000); }, 350);
};
