import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml } from "./inv-helpers.js";

// ================= CENTROS DE COSTO =================
let centros = [];
let filtro = "";

export function getCentrosCosto() { return centros; }
export function getCentroCosto(codigo) { return centros.find((c) => c.codigo === codigo); }
export function ccLabel(codigo) {
  const c = getCentroCosto(codigo);
  return c ? (c.codigo + " · " + (c.descripcion || "")) : (codigo || "-");
}

const cont = () => document.getElementById("view-centros-costo");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("centrosCosto"), orderBy("codigo")), (snap) => {
    centros = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("Error leyendo centros de costo:", err));
}, { once: true });

function render() {
  const el = cont();
  if (!el) return;
  let rows = centros.slice();
  if (filtro) {
    const s = filtro.toLowerCase();
    rows = rows.filter((c) => ((c.codigo || "") + " " + (c.descripcion || "")).toLowerCase().includes(s));
  }
  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="cc-search" placeholder="Buscar por código o descripción…" value="${escapeHtml(filtro)}">
      <button class="btn btn-primary" onclick="ccNuevo()">+ Nuevo centro de costo</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Código</th><th>Descripción</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay centros de costo.</p></div>`}
    </div>`;
  const inp = document.getElementById("cc-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; render(); });
}

function rowHtml(c) {
  const activo = c.activo !== false;
  return `<tr>
    <td class="cell-mono"><strong>${escapeHtml(c.codigo || "")}</strong></td>
    <td>${escapeHtml(c.descripcion || "")}</td>
    <td><span class="badge badge-${activo ? "activo" : "inactivo"}">${activo ? "Activo" : "Inactivo"}</span></td>
    <td class="row-actions"><button onclick="ccEditar('${c.id}')">Editar</button></td>
  </tr>`;
}

function formHtml(c) {
  c = c || {};
  return `
    <div class="form-row">
      <label>Código *<input type="text" id="cc-codigo" value="${escapeHtml(c.codigo || "")}" placeholder="Ej: ADM, OBRA1"></label>
      <label>Estado<select id="cc-activo"><option value="si"${c.activo !== false ? " selected" : ""}>Activo</option><option value="no"${c.activo === false ? " selected" : ""}>Inactivo</option></select></label>
    </div>
    <div class="form-row form-row-full">
      <label>Descripción<input type="text" id="cc-desc" value="${escapeHtml(c.descripcion || "")}"></label>
    </div>`;
}

window.ccNuevo = function () {
  showModal("Nuevo centro de costo", formHtml({}),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="ccGuardar('')">Guardar</button>`);
};
window.ccEditar = function (id) {
  const c = centros.find((x) => x.id === id); if (!c) return;
  showModal("Editar centro de costo", formHtml(c),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="ccEliminar('${id}')">Eliminar</button>
     <button class="btn btn-primary" onclick="ccGuardar('${id}')">Guardar cambios</button>`);
};
window.ccGuardar = async function (id) {
  const g = (x) => { const e = document.getElementById(x); return e ? e.value.trim() : ""; };
  const codigo = g("cc-codigo").toUpperCase();
  if (!codigo) { toast("Falta código", "", "error"); return; }
  const dup = centros.find((c) => c.codigo === codigo && c.id !== id);
  if (dup) { toast("Código repetido", "Ya existe un centro con ese código", "error"); return; }
  const data = { codigo, descripcion: g("cc-desc"), activo: g("cc-activo") !== "no" };
  try {
    if (id) await updateDoc(docE("centrosCosto", id), data);
    else { data.createdAt = serverTimestamp(); await addDoc(colE("centrosCosto"), data); }
    closeGenModal();
    toast("Centro de costo guardado", codigo, "success");
  } catch (err) { console.error(err); toast("No se pudo guardar", "", "error"); }
};
window.ccEliminar = function (id) {
  const c = centros.find((x) => x.id === id); if (!c) return;
  confirmDialog("Eliminar centro de costo", `¿Eliminar "${c.codigo}"?`, async () => {
    await deleteDoc(docE("centrosCosto", id));
    closeGenModal();
    toast("Centro de costo eliminado", c.codigo);
  }, "Eliminar", true);
};
