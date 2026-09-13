import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml, fmtMon, fmtNum, fmtFecha, attachProductoSearch } from "./inv-helpers.js";
import { getBodegas, bodegaNombre } from "./bodegas.js";

// ================= PRODUCTOS (INVENTARIO) =================
// El stock se ajusta mediante Movimientos (entrada/salida/ajuste). Aquí se
// administra la ficha del producto y el stock inicial.

const UNIDADES = ["UN", "M", "M2", "M3", "KG", "HH", "GL", "LT", "CJ", "RO"];
let productos = [];
let filtro = "";
let soloBajoStock = false;
let pendingCrear = null; // { onCreated } para creación desde OC
let movsCache = [];      // movimientos, para el apartado de stock por producto
let stockSel = "";       // código del producto seleccionado en el apartado

export function getProductos() { return productos; }
export function getProducto(codigoInterno) { return productos.find((p) => p.codigoInterno === codigoInterno); }

const cont = () => document.getElementById("view-productos");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("productos"), orderBy("codigoInterno")), (snap) => {
    productos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("Error leyendo productos:", err));

  // Movimientos para el apartado "Stock por producto"
  onSnapshot(colE("movimientos"), (snap) => {
    movsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (stockSel) renderStockPanel();
  }, (err) => console.error("Error leyendo movimientos (productos):", err));
}, { once: true });

function esBajoStock(p) {
  if (p.controlStock === false) return false;
  const min = Number(p.stockMinimo) || 0;
  return min > 0 && (Number(p.stock) || 0) <= min;
}

function render() {
  const el = cont();
  if (!el) return;
  let rows = productos.slice();
  if (filtro) {
    const s = filtro.toLowerCase();
    rows = rows.filter((p) => ((p.codigoInterno || "") + " " + (p.descripcion || "") + " " + (p.codigoEAN || "") + " " + (p.grupo || "")).toLowerCase().includes(s));
  }
  if (soloBajoStock) rows = rows.filter(esBajoStock);
  const nBajo = productos.filter(esBajoStock).length;

  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="prod-search" placeholder="Buscar por código, descripción, EAN…" value="${escapeHtml(filtro)}">
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="prod-bajo" style="${soloBajoStock ? "border-color:var(--red);color:var(--red)" : ""}">Bajo stock (${nBajo})</button>
        <button class="btn btn-primary" onclick="prodNuevo()">+ Nuevo producto</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Descripción</th><th>UM</th><th>Grupo</th><th class="col-num">Stock</th><th class="col-num">Mínimo</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay productos.</p><p class="muted">Crea el primero con "+ Nuevo producto".</p></div>`}
    </div>

    <h4 class="section-label section-label-spaced">Stock por producto</h4>
    <div class="config-card">
      <label style="font-size:12px;color:var(--text-muted)">Buscar producto (código o descripción)
        <input type="text" class="cell-mono" id="prod-stock-search" placeholder="🔍 Escribe para buscar…" autocomplete="off" value="${escapeHtml(stockSel)}" style="width:100%;margin-top:6px">
      </label>
      <div id="prod-stock-panel" style="margin-top:12px"></div>
    </div>`;

  const inp = document.getElementById("prod-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; render(); });
  const b = document.getElementById("prod-bajo");
  if (b) b.addEventListener("click", () => { soloBajoStock = !soloBajoStock; render(); });

  // Apartado stock por producto: buscador dinámico
  attachProductoSearch("prod-stock-search", getProductos, (cod) => { stockSel = cod; render(); }, {});
  renderStockPanel();
}

// ---------- Apartado: stock por producto + sus movimientos (excepto eliminados) ----------
function renderStockPanel() {
  const panel = document.getElementById("prod-stock-panel");
  if (!panel) return;
  const p = getProducto(stockSel);
  if (!p) { panel.innerHTML = `<div class="muted" style="font-size:12.5px">Selecciona un producto para ver su stock y movimientos.</div>`; return; }

  const servicio = p.controlStock === false;
  const spb = p.stockPorBodega || {};
  const chips = Object.entries(spb).filter(([, v]) => (Number(v) || 0) !== 0)
    .map(([bid, v]) => `<span class="badge badge-activo" style="margin-right:6px">${escapeHtml(bodegaNombre(bid))}: ${fmtNum(v, 2)}</span>`).join("");

  const movs = movsCache
    .filter((m) => m.estado !== "ELIMINADO" && (m.lineas || []).some((l) => l.codigoInterno === stockSel))
    .sort((a, b) => (b.numero || "").localeCompare(a.numero || ""));

  const filas = movs.map((m) => {
    const l = (m.lineas || []).find((x) => x.codigoInterno === stockSel) || {};
    const cant = Number(l.cantidad) || 0;
    let signo = "", bod = "";
    if (m.tipo === "ENTRADA") { signo = "+" + fmtNum(cant, 2); bod = bodegaNombre(m.bodegaId); }
    else if (m.tipo === "SALIDA") { signo = "-" + fmtNum(cant, 2); bod = bodegaNombre(m.bodegaId); }
    else if (m.tipo === "AJUSTE") { signo = (cant >= 0 ? "+" : "") + fmtNum(cant, 2); bod = bodegaNombre(m.bodegaId); }
    else { signo = fmtNum(cant, 2); bod = bodegaNombre(m.bodegaOrigen) + " → " + bodegaNombre(m.bodegaDestino); }
    const badge = m.tipo === "ENTRADA" ? "badge-aceptada" : (m.tipo === "SALIDA" ? "badge-no_aceptada" : (m.tipo === "TRASPASO" ? "badge-vencida" : "badge-enviada"));
    return `<tr>
      <td class="cell-mono">${escapeHtml(m.numero || "")}</td>
      <td>${fmtFecha(m.fecha)}</td>
      <td><span class="badge ${badge}">${escapeHtml(m.tipo)}</span></td>
      <td style="font-size:12px">${escapeHtml(bod)}</td>
      <td>${escapeHtml(m.motivo || m.referencia || "-")}</td>
      <td class="col-num cell-mono">${signo}</td>
    </tr>`;
  }).join("");

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <div><strong class="cell-mono">${escapeHtml(p.codigoInterno || "")}</strong> · ${escapeHtml(p.descripcion || "")}</div>
      <div>${servicio ? '<span class="muted">Servicio (sin stock)</span>' : `Stock total: <strong>${fmtNum(p.stock || 0, 2)}</strong> ${escapeHtml(p.unidadMedida || "")}`}</div>
    </div>
    ${servicio ? "" : `<div style="margin-bottom:10px">${chips || '<span class="muted" style="font-size:12px">Sin stock por bodega.</span>'}</div>`}
    <div class="table-wrap table-scroll">
      <table class="data-table">
        <thead><tr><th>N°</th><th>Fecha</th><th>Tipo</th><th>Bodega</th><th>Motivo / Ref.</th><th class="col-num">Cantidad</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${movs.length ? "" : `<div class="empty-state" style="padding:24px"><p>Sin movimientos para este producto.</p></div>`}
    </div>`;
}

function rowHtml(p) {
  const activo = p.activo !== false;
  const bajo = esBajoStock(p);
  const servicio = p.controlStock === false;
  return `<tr style="cursor:pointer" onclick="prodVer('${p.id}')">
    <td class="cell-mono"><strong>${escapeHtml(p.codigoInterno || "")}</strong></td>
    <td>${escapeHtml(p.descripcion || "")}${servicio ? ' <span class="badge badge-enviada" style="font-size:9px">Servicio</span>' : ""}${p.aplicaIVA === false ? ' <span class="muted">· EXENTO</span>' : ""}</td>
    <td>${escapeHtml(p.unidadMedida || "-")}</td>
    <td>${escapeHtml(p.grupo || "-")}</td>
    <td class="col-num cell-mono" style="${bajo ? "color:var(--red);font-weight:700" : ""}">${servicio ? "—" : fmtNum(p.stock || 0, 2)}</td>
    <td class="col-num cell-mono">${servicio ? "—" : (p.stockMinimo ? fmtNum(p.stockMinimo, 2) : "-")}</td>
    <td>${activo ? '<span class="badge badge-activo">Activo</span>' : '<span class="badge badge-inactivo">Inactivo</span>'}</td>
    <td class="row-actions" onclick="event.stopPropagation()"><button onclick="prodEditar('${p.id}')">Editar</button></td>
  </tr>`;
}

function stockPorBodegaHtml(p) {
  if (p.controlStock === false) return "";
  const spb = p.stockPorBodega || {};
  const entries = Object.entries(spb).filter(([, v]) => (Number(v) || 0) !== 0);
  if (!getBodegas().length && !entries.length) return "";
  const filas = entries.length
    ? entries.map(([bid, v]) => `<tr><td>${escapeHtml(bodegaNombre(bid))}</td><td class="col-num cell-mono">${fmtNum(v, 2)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="muted">Sin stock por bodega todavía.</td></tr>`;
  return `<div style="margin-top:10px"><div class="section-label" style="font-size:13px;margin-bottom:6px">Stock por bodega</div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Bodega</th><th class="col-num">Cantidad</th></tr></thead><tbody>${filas}</tbody></table></div></div>`;
}

function sugerirCodigo() {
  let max = 0;
  productos.forEach((p) => { const m = /^PRD-(\d+)$/.exec(p.codigoInterno || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return "PRD-" + String(max + 1).padStart(5, "0");
}

function formHtml(p, esNuevo) {
  p = p || {};
  const um = (p.unidadMedida || "UN");
  return `
    <div class="form-row">
      <label>Código interno *<input type="text" class="cell-mono" id="p-cod" value="${escapeHtml(p.codigoInterno || (esNuevo ? sugerirCodigo() : ""))}" ${esNuevo ? "" : "readonly"}></label>
      <label>Código EAN<input type="text" id="p-ean" value="${escapeHtml(p.codigoEAN || "")}"></label>
    </div>
    <div class="form-row form-row-full">
      <label>Descripción *<input type="text" id="p-desc" value="${escapeHtml(p.descripcion || "")}"></label>
    </div>
    <div class="form-row">
      <label>Unidad de medida
        <select id="p-um">${UNIDADES.map((u) => `<option value="${u}"${u === um ? " selected" : ""}>${u}</option>`).join("")}</select>
      </label>
      <label>Grupo / familia<input type="text" id="p-grupo" value="${escapeHtml(p.grupo || "")}"></label>
    </div>
    <div class="form-row">
      <label>Costo neto<input type="number" min="0" step="1" id="p-costo" value="${p.costo != null ? p.costo : ""}"></label>
      <label>Precio de venta neto<input type="number" min="0" step="1" id="p-precio" value="${p.precio != null ? p.precio : ""}"><div class="muted" style="font-size:11px">Se usa en las cotizaciones</div></label>
    </div>
    <div class="form-row">
      <label class="checkbox-label"><input type="checkbox" id="p-control" ${p.controlStock !== false ? "checked" : ""} onchange="document.getElementById('p-stock-row').style.display=this.checked?'':'none'"> Controla stock</label>
      <label class="checkbox-label"><input type="checkbox" id="p-iva" ${p.aplicaIVA !== false ? "checked" : ""}> Afecto a IVA</label>
    </div>
    <div class="form-row" id="p-stock-row" style="${p.controlStock === false ? "display:none" : ""}">
      <label>Stock mínimo<input type="number" min="0" step="any" id="p-min" value="${p.stockMinimo != null ? p.stockMinimo : ""}"></label>
      ${esNuevo ? `<label>Stock inicial<input type="number" min="0" step="any" id="p-stock0" value="0"></label>` : `<label>Stock actual<input type="text" value="${fmtNum(p.stock || 0, 2)}" readonly><div class="muted" style="font-size:11px">Se ajusta desde Movimientos</div></label>`}
    </div>
    <div class="form-row">
      <label>Estado<select id="p-activo"><option value="si"${p.activo !== false ? " selected" : ""}>Activo</option><option value="no"${p.activo === false ? " selected" : ""}>Inactivo</option></select></label>
      <span></span>
    </div>`;
}

window.prodNuevo = function (prefill) {
  const p = prefill && typeof prefill === "object" ? prefill : {};
  showModal("Nuevo producto", formHtml(p, true),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="prodGuardar('')">Guardar producto</button>`);
};
window.prodEditar = function (id) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  showModal("Editar producto", formHtml(p, false),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="prodEliminar('${id}')">Eliminar</button>
     <button class="btn btn-primary" onclick="prodGuardar('${id}')">Guardar cambios</button>`);
};
window.prodVer = function (id) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  showModal("Producto · " + escapeHtml(p.codigoInterno || ""), `
    <div class="form-row"><label>Código<div>${escapeHtml(p.codigoInterno || "")}</div></label><label>EAN<div>${escapeHtml(p.codigoEAN || "-")}</div></label></div>
    <div class="form-row form-row-full"><label>Descripción<div><strong>${escapeHtml(p.descripcion || "")}</strong></div></label></div>
    <div class="form-row"><label>Unidad<div>${escapeHtml(p.unidadMedida || "-")}</div></label><label>Grupo<div>${escapeHtml(p.grupo || "-")}</div></label></div>
    <div class="form-row"><label>Stock actual<div class="cell-mono"><strong>${p.controlStock === false ? "Servicio (sin stock)" : fmtNum(p.stock || 0, 2)}</strong></div></label><label>Stock mínimo<div class="cell-mono">${p.controlStock === false ? "—" : (p.stockMinimo ? fmtNum(p.stockMinimo, 2) : "-")}</div></label></div>
    <div class="form-row"><label>Costo neto<div>${p.costo ? fmtMon(p.costo) : "-"}</div></label><label>Precio venta<div>${p.precio ? fmtMon(p.precio) : "-"}</div></label></div>
    <div class="form-row"><label>IVA<div>${p.aplicaIVA === false ? "Exento" : "Afecto"}</div></label><span></span></div>
    ${stockPorBodegaHtml(p)}`,
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cerrar</button>
     <button class="btn btn-primary" onclick="prodEditar('${id}')">Editar</button>`);
};

window.prodGuardar = async function (id) {
  const g = (x) => { const e = document.getElementById(x); return e ? e.value.trim() : ""; };
  const gn = (x) => { const e = document.getElementById(x); return e ? (parseFloat(e.value) || 0) : 0; };
  const codigoInterno = g("p-cod");
  const descripcion = g("p-desc");
  if (!codigoInterno) { toast("Falta código", "", "error"); return; }
  if (!descripcion) { toast("Falta descripción", "", "error"); return; }
  const dup = productos.find((p) => p.codigoInterno === codigoInterno && p.id !== id);
  if (dup) { toast("Código repetido", "Ya existe un producto con ese código", "error"); return; }

  const controlStock = document.getElementById("p-control") ? document.getElementById("p-control").checked : true;
  const data = {
    codigoInterno, descripcion,
    codigoEAN: g("p-ean"), unidadMedida: g("p-um"), grupo: g("p-grupo"),
    stockMinimo: controlStock ? gn("p-min") : 0, costo: gn("p-costo"), precio: gn("p-precio"),
    controlStock,
    aplicaIVA: document.getElementById("p-iva") ? document.getElementById("p-iva").checked : true,
    activo: g("p-activo") !== "no"
  };
  try {
    if (id) {
      await updateDoc(docE("productos", id), data);
      closeGenModal();
      toast("Producto guardado", codigoInterno, "success");
    } else {
      data.stock = gn("p-stock0");
      data.createdAt = serverTimestamp();
      await addDoc(colE("productos"), data);
      closeGenModal();
      toast("Producto creado", codigoInterno, "success");
      if (pendingCrear && pendingCrear.onCreated) { const cb = pendingCrear.onCreated; pendingCrear = null; setTimeout(() => cb(codigoInterno), 150); }
    }
  } catch (err) { console.error(err); toast("No se pudo guardar", "", "error"); }
};
window.prodEliminar = function (id) {
  const p = productos.find((x) => x.id === id); if (!p) return;
  confirmDialog("Eliminar producto", `¿Eliminar "${p.descripcion}" (${p.codigoInterno})? Sus movimientos históricos se conservan.`, async () => {
    await deleteDoc(docE("productos", id));
    closeGenModal();
    toast("Producto eliminado", p.codigoInterno);
  }, "Eliminar", true);
};

// Abrir el formulario de nuevo producto desde otro módulo (ej. OC), con callback
export function crearProductoDesdeExterno(prefill, onCreated) {
  pendingCrear = { onCreated };
  window.prodNuevo(prefill || {});
}
