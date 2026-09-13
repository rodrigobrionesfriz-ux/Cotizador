import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml } from "./inv-helpers.js";

// ================= BODEGAS =================
let bodegas = [];
let filtro = "";

export function getBodegas() { return bodegas; }
export function getBodega(id) { return bodegas.find((b) => b.id === id); }
export function bodegaNombre(id) { const b = getBodega(id); return b ? b.nombre : (id || "-"); }

const cont = () => document.getElementById("view-bodegas");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("bodegas"), orderBy("nombre")), (snap) => {
    bodegas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("Error leyendo bodegas:", err));
}, { once: true });

function render() {
  const el = cont();
  if (!el) return;
  let rows = bodegas.slice();
  if (filtro) { const s = filtro.toLowerCase(); rows = rows.filter((b) => ((b.codigo || "") + " " + (b.nombre || "")).toLowerCase().includes(s)); }
  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="bod-search" placeholder="Buscar bodega…" value="${escapeHtml(filtro)}">
      <button class="btn btn-primary" onclick="bodNuevo()">+ Nueva bodega</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay bodegas.</p><p class="muted">Crea al menos una para poder registrar movimientos.</p></div>`}
    </div>`;
  const inp = document.getElementById("bod-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; render(); });
}

function rowHtml(b) {
  const activo = b.activo !== false;
  return `<tr>
    <td class="cell-mono"><strong>${escapeHtml(b.codigo || "")}</strong></td>
    <td>${escapeHtml(b.nombre || "")}</td>
    <td><span class="badge badge-${activo ? "activo" : "inactivo"}">${activo ? "Activa" : "Inactiva"}</span></td>
    <td class="row-actions"><button onclick="bodEditar('${b.id}')">Editar</button></td>
  </tr>`;
}

function formHtml(b) {
  b = b || {};
  return `
    <div class="form-row">
      <label>Código<input type="text" id="bod-codigo" value="${escapeHtml(b.codigo || "")}" placeholder="Ej: BOD1, CENTRAL"></label>
      <label>Estado<select id="bod-activo"><option value="si"${b.activo !== false ? " selected" : ""}>Activa</option><option value="no"${b.activo === false ? " selected" : ""}>Inactiva</option></select></label>
    </div>
    <div class="form-row form-row-full">
      <label>Nombre *<input type="text" id="bod-nombre" value="${escapeHtml(b.nombre || "")}"></label>
    </div>`;
}

window.bodNuevo = function () {
  showModal("Nueva bodega", formHtml({}),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="bodGuardar('')">Guardar</button>`);
};
window.bodEditar = function (id) {
  const b = getBodega(id); if (!b) return;
  showModal("Editar bodega", formHtml(b),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="bodEliminar('${id}')">Eliminar</button>
     <button class="btn btn-primary" onclick="bodGuardar('${id}')">Guardar cambios</button>`);
};
window.bodGuardar = async function (id) {
  const g = (x) => { const e = document.getElementById(x); return e ? e.value.trim() : ""; };
  const nombre = g("bod-nombre");
  if (!nombre) { toast("Falta nombre", "", "error"); return; }
  const data = { codigo: g("bod-codigo").toUpperCase(), nombre, activo: g("bod-activo") !== "no" };
  try {
    if (id) await updateDoc(docE("bodegas", id), data);
    else { data.createdAt = serverTimestamp(); await addDoc(colE("bodegas"), data); }
    closeGenModal();
    toast("Bodega guardada", nombre, "success");
  } catch (err) { console.error(err); toast("No se pudo guardar", "", "error"); }
};
window.bodEliminar = function (id) {
  const b = getBodega(id); if (!b) return;
  confirmDialog("Eliminar bodega", `¿Eliminar "${b.nombre}"? El stock que tenía asociado dejará de mostrarse por bodega.`, async () => {
    await deleteDoc(docE("bodegas", id));
    closeGenModal();
    toast("Bodega eliminada", b.nombre);
  }, "Eliminar", true);
};
