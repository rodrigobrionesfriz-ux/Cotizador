import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, doc, onSnapshot, serverTimestamp, query, orderBy, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml, fmtNum, fmtFecha, nextFolio, attachProductoSearch } from "./inv-helpers.js";
import { getProductos, getProducto, crearProductoDesdeExterno } from "./productos.js";
import { getBodegas, bodegaNombre } from "./bodegas.js";

// ================= MOVIMIENTOS DE INVENTARIO (multibodega) =================
// ENTRADA (+), SALIDA (-), AJUSTE (+/-) sobre una bodega; TRASPASO mueve stock
// entre bodegas. Los movimientos se pueden editar y eliminar (eliminar = marca
// ELIMINADO y revierte su efecto; se conserva el registro pero no aparece).
// Nunca se permite dejar stock negativo en ninguna bodega.

const TIPOS = { ENTRADA: "Entrada", SALIDA: "Salida", AJUSTE: "Ajuste", TRASPASO: "Traspaso" };
let movimientos = [];
let filtro = "";
let draft = null;

export function getMovimientos() { return movimientos; }

const cont = () => document.getElementById("view-movimientos");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("movimientos"), orderBy("numero", "desc")), (snap) => {
    movimientos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("Error leyendo movimientos:", err));
}, { once: true });

function bodegasActivas() { return getBodegas().filter((b) => b.activo !== false); }
function primeraBodega() { const b = bodegasActivas()[0]; return b ? b.id : ""; }
function movGet(id) { return movimientos.find((m) => m.id === id); }

function bodegaTexto(m) {
  if (m.tipo === "TRASPASO") return bodegaNombre(m.bodegaOrigen) + " → " + bodegaNombre(m.bodegaDestino);
  return bodegaNombre(m.bodegaId);
}

// ---------- Lista (oculta los eliminados) ----------
function render() {
  const el = cont(); if (!el) return;
  let rows = movimientos.filter((m) => m.estado !== "ELIMINADO");
  if (filtro) { const s = filtro.toLowerCase(); rows = rows.filter((m) => ((m.numero || "") + " " + (m.tipo || "") + " " + (m.motivo || "") + " " + (m.referencia || "")).toLowerCase().includes(s)); }
  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="mov-search" placeholder="Buscar por N°, tipo, motivo…" value="${escapeHtml(filtro)}">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="movNuevo('ENTRADA')">+ Entrada</button>
        <button class="btn btn-ghost" onclick="movNuevo('SALIDA')">+ Salida</button>
        <button class="btn btn-ghost" onclick="movNuevo('AJUSTE')">+ Ajuste</button>
        <button class="btn btn-ghost" onclick="movNuevo('TRASPASO')">+ Traspaso</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>N°</th><th>Fecha</th><th>Tipo</th><th>Bodega</th><th>Motivo / Ref.</th><th class="col-num">Ítems</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay movimientos.</p></div>`}
    </div>`;
  const inp = document.getElementById("mov-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; render(); });
}

function rowHtml(m) {
  const badge = m.tipo === "ENTRADA" ? "badge-aceptada" : (m.tipo === "SALIDA" ? "badge-no_aceptada" : (m.tipo === "TRASPASO" ? "badge-vencida" : "badge-enviada"));
  return `<tr style="cursor:pointer" onclick="movVer('${m.id}')">
    <td class="cell-mono"><strong>${escapeHtml(m.numero || "")}</strong></td>
    <td>${fmtFecha(m.fecha)}</td>
    <td><span class="badge ${badge}">${TIPOS[m.tipo] || m.tipo}</span></td>
    <td style="font-size:12px">${escapeHtml(bodegaTexto(m))}</td>
    <td>${escapeHtml(m.motivo || m.referencia || "-")}</td>
    <td class="col-num">${(m.lineas || []).length}</td>
    <td class="row-actions" onclick="event.stopPropagation()"><button onclick="movEditar('${m.id}')">Editar</button></td>
  </tr>`;
}

// ---------- Formulario ----------
function bodegaOptions(sel) {
  return `<option value="">— Seleccione bodega —</option>` +
    bodegasActivas().map((b) => `<option value="${b.id}"${sel === b.id ? " selected" : ""}>${escapeHtml(b.nombre)}</option>`).join("");
}

function formBody() {
  const t = draft.tipo;
  const ayuda = t === "AJUSTE" ? "Usa cantidad negativa para descontar" : (t === "SALIDA" ? "Cantidad a descontar" : "Cantidad");
  const bodegaFields = (t === "TRASPASO")
    ? `<label>Bodega origen *<select id="mov-bodorigen">${bodegaOptions(draft.bodegaOrigen || "")}</select></label>
       <label>Bodega destino *<select id="mov-boddestino">${bodegaOptions(draft.bodegaDestino || "")}</select></label>`
    : `<label>Bodega *<select id="mov-bodega">${bodegaOptions(draft.bodegaId || "")}</select></label>
       <span></span>`;
  return `
    ${bodegasActivas().length ? "" : `<div class="muted" style="color:var(--red);margin-bottom:8px">No hay bodegas activas. Crea una en el módulo Bodegas antes de registrar movimientos.</div>`}
    <div class="form-row">
      <label>Fecha *<input type="date" id="mov-fecha" value="${escapeHtml(draft.fecha)}"></label>
      <label>Tipo<select id="mov-tipo" onchange="movCambiarTipo(this.value)">${Object.keys(TIPOS).map((k) => `<option value="${k}"${draft.tipo === k ? " selected" : ""}>${TIPOS[k]}</option>`).join("")}</select></label>
    </div>
    <div class="form-row">${bodegaFields}</div>
    <div class="form-row">
      <label>Motivo / glosa<input type="text" id="mov-motivo" value="${escapeHtml(draft.motivo || "")}" placeholder="Ej: Compra, consumo, ajuste"></label>
      <label>Referencia<input type="text" id="mov-ref" value="${escapeHtml(draft.referencia || "")}" placeholder="OC, proveedor, documento…"></label>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 6px">
      <strong>Productos</strong><span class="muted" style="font-size:11.5px">${ayuda}</span>
    </div>
    <div class="table-wrap table-scroll"><div id="mov-lineas"></div></div>
    <button class="btn btn-ghost btn-small" onclick="movAddLinea()" style="margin-top:8px">+ Agregar línea</button>`;
}

function renderLineas() {
  const wrap = document.getElementById("mov-lineas");
  if (!wrap) return;
  wrap.innerHTML = `<table class="data-table"><thead><tr><th style="min-width:240px">Producto</th><th class="col-num" style="min-width:110px">Cantidad</th><th></th></tr></thead>
    <tbody>${draft.lineas.map((l, i) => {
      const p = l.codigoInterno ? getProducto(l.codigoInterno) : null;
      return `<tr>
        <td>
          <input type="text" class="cell-mono" style="width:100%" id="mov-prod-${i}" value="${escapeHtml(l.codigoInterno || "")}" placeholder="🔍 Código o descripción" autocomplete="off">
          ${p ? `<div class="muted" style="font-size:10.5px">${escapeHtml(p.descripcion || "")} · stock total ${fmtNum(p.stock || 0, 2)} ${escapeHtml(p.unidadMedida || "")}</div>` : ""}
        </td>
        <td class="col-num"><input type="number" step="any" style="width:100%;text-align:right" value="${l.cantidad != null ? l.cantidad : ""}" oninput="movSetCant(${i},this.value)"></td>
        <td><button class="btn btn-ghost btn-small" onclick="movRemoveLinea(${i})" title="Quitar">✕</button></td>
      </tr>`;
    }).join("")}</tbody></table>`;
  draft.lineas.forEach((l, i) => {
    attachProductoSearch("mov-prod-" + i, () => getProductos().filter((p) => p.controlStock !== false),
      (cod) => { draft.lineas[i].codigoInterno = cod; renderLineas(); },
      { onCreate: (q) => { const esEAN = /^\d{8,14}$/.test(q || ""); crearProductoDesdeExterno(esEAN ? { codigoEAN: q } : { descripcion: q || "" }, (codigo) => { draft.lineas[i].codigoInterno = codigo; renderLineas(); }); } });
  });
}

function capturarHeader() {
  const g = (id) => { const e = document.getElementById(id); return e ? e.value : ""; };
  draft.fecha = g("mov-fecha"); draft.motivo = g("mov-motivo"); draft.referencia = g("mov-ref");
  if (draft.tipo === "TRASPASO") { draft.bodegaOrigen = g("mov-bodorigen"); draft.bodegaDestino = g("mov-boddestino"); }
  else { draft.bodegaId = g("mov-bodega"); }
}

window.movNuevo = function (tipo) {
  draft = { editId: null, tipo: tipo || "ENTRADA", fecha: new Date().toISOString().slice(0, 10), motivo: "", referencia: "", bodegaId: primeraBodega(), bodegaOrigen: "", bodegaDestino: "", lineas: [{}] };
  abrirForm();
};
window.movEditar = function (id) {
  const m = movGet(id); if (!m) return;
  draft = {
    editId: id, tipo: m.tipo, fecha: m.fecha || new Date().toISOString().slice(0, 10),
    motivo: m.motivo || "", referencia: m.referencia || "",
    bodegaId: m.bodegaId || "", bodegaOrigen: m.bodegaOrigen || "", bodegaDestino: m.bodegaDestino || "",
    lineas: (m.lineas || []).map((l) => ({ codigoInterno: l.codigoInterno, cantidad: l.cantidad }))
  };
  if (!draft.lineas.length) draft.lineas = [{}];
  abrirForm();
};
export function nuevoDesdeOC(oc) {
  draft = {
    editId: null, tipo: "ENTRADA", fecha: new Date().toISOString().slice(0, 10), motivo: "Compra", referencia: "OC " + (oc.folio || ""),
    bodegaId: primeraBodega(), bodegaOrigen: "", bodegaDestino: "",
    lineas: (oc.lineas || []).filter((l) => l.codigoInterno).map((l) => ({ codigoInterno: l.codigoInterno, cantidad: l.cantidad }))
  };
  if (!draft.lineas.length) draft.lineas = [{}];
  abrirForm();
}
window.nuevoMovDesdeOC = nuevoDesdeOC;

function abrirForm() {
  showModal(draft.editId ? "Editar movimiento" : "Nuevo movimiento", formBody(),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="movGuardar()">${draft.editId ? "Guardar cambios" : "Registrar movimiento"}</button>`, true);
  renderLineas();
}

window.movCambiarTipo = function (t) { capturarHeader(); draft.tipo = t; abrirForm(); };
window.movAddLinea = function () { capturarHeader(); draft.lineas.push({}); renderLineas(); };
window.movRemoveLinea = function (i) { draft.lineas.splice(i, 1); if (!draft.lineas.length) draft.lineas.push({}); renderLineas(); };
window.movSetCant = function (i, v) { draft.lineas[i].cantidad = v; };

// Efecto de un movimiento en el stock: { prodId: { 'stockPorBodega.<bod>': delta, __total } }
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
  (m.lineas || []).forEach((l) => {
    const cant = parseFloat(l.cantidad) || 0;
    if (!l.codigoInterno || cant === 0) return;
    if (m.tipo === "TRASPASO") { add(l.codigoInterno, m.bodegaOrigen, -Math.abs(cant)); add(l.codigoInterno, m.bodegaDestino, Math.abs(cant)); }
    else if (m.tipo === "SALIDA") { add(l.codigoInterno, m.bodegaId, -Math.abs(cant)); }
    else if (m.tipo === "AJUSTE") { add(l.codigoInterno, m.bodegaId, cant); }
    else { add(l.codigoInterno, m.bodegaId, Math.abs(cant)); }
  });
  return updates;
}

// Efecto neto = nuevo - anterior (para crear/editar/eliminar)
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
  if (!draft.fecha) { toast("Falta fecha", "", "error"); return; }
  if (draft.tipo === "TRASPASO") {
    if (!draft.bodegaOrigen || !draft.bodegaDestino) { toast("Faltan bodegas", "Indique origen y destino", "error"); return; }
    if (draft.bodegaOrigen === draft.bodegaDestino) { toast("Bodegas iguales", "Origen y destino deben ser distintas", "error"); return; }
  } else if (!draft.bodegaId) { toast("Falta bodega", "Seleccione la bodega", "error"); return; }

  const lineas = (draft.lineas || []).filter((l) => l.codigoInterno && (parseFloat(l.cantidad) || 0) !== 0)
    .map((l) => { const p = getProducto(l.codigoInterno); return { codigoInterno: l.codigoInterno, descripcion: p ? p.descripcion : (l.descripcion || ""), cantidad: parseFloat(l.cantidad) || 0 }; });
  if (!lineas.length) { toast("Sin productos", "Agregue al menos un producto con cantidad", "error"); return; }

  const reg = {
    tipo: draft.tipo, fecha: draft.fecha, motivo: draft.motivo || "", referencia: draft.referencia || "",
    bodegaId: draft.tipo === "TRASPASO" ? "" : (draft.bodegaId || ""),
    bodegaOrigen: draft.tipo === "TRASPASO" ? (draft.bodegaOrigen || "") : "",
    bodegaDestino: draft.tipo === "TRASPASO" ? (draft.bodegaDestino || "") : "",
    lineas, estado: "VIGENTE"
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
      const numero = await nextFolio("movimientos", "MOV-", 5);
      const ref = doc(colE("movimientos"));
      batch.set(ref, { numero, ...reg, createdAt: serverTimestamp(), _mod: Date.now() });
    }
    aplicarNet(batch, net);
    await batch.commit();
    closeGenModal();
    toast(draft.editId ? "Movimiento actualizado" : "Movimiento registrado", TIPOS[draft.tipo], "success");
    draft = null;
  } catch (err2) { console.error(err2); toast("No se pudo guardar", "", "error"); }
};

// ---------- Ver / Eliminar ----------
window.movVer = function (id) {
  const m = movGet(id); if (!m) return;
  showModal("Movimiento · " + escapeHtml(m.numero || ""), `
    <div class="form-row">
      <label>Fecha<div>${fmtFecha(m.fecha)}</div></label>
      <label>Tipo<div>${TIPOS[m.tipo] || m.tipo}</div></label>
    </div>
    <div class="form-row">
      <label>Bodega<div>${escapeHtml(bodegaTexto(m))}</div></label>
      <label>Referencia<div>${escapeHtml(m.referencia || "-")}</div></label>
    </div>
    ${m.motivo ? `<div class="form-row form-row-full"><label>Motivo<div>${escapeHtml(m.motivo)}</div></label></div>` : ""}
    <div class="table-wrap table-scroll" style="margin-top:8px"><table class="data-table">
      <thead><tr><th>Código</th><th>Descripción</th><th class="col-num">Cantidad</th></tr></thead>
      <tbody>${(m.lineas || []).map((l) => `<tr><td class="cell-mono">${escapeHtml(l.codigoInterno || "-")}</td><td>${escapeHtml(l.descripcion || "")}</td><td class="col-num">${fmtNum(l.cantidad, 2)}</td></tr>`).join("")}</tbody>
    </table></div>`,
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cerrar</button>
     <button class="btn btn-danger" onclick="movEliminar('${m.id}')">🗑 Eliminar</button>
     <button class="btn btn-primary" onclick="movEditar('${m.id}')">✏️ Editar</button>`);
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
