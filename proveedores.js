import { db } from "./firebase-config.js";
import { colE, docE } from "./tenant.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { showModal, closeGenModal, confirmDialog, toast, escapeHtml } from "./inv-helpers.js";

// ================= PROVEEDORES =================
let proveedores = [];
let filtro = "";

export function getProveedores() { return proveedores; }
export function getProveedor(id) { return proveedores.find((p) => p.id === id); }

const cont = () => document.getElementById("view-proveedores");

window.addEventListener("empresa-ready", () => {
  onSnapshot(query(colE("proveedores"), orderBy("razonSocial")), (snap) => {
    proveedores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => console.error("Error leyendo proveedores:", err));
}, { once: true });

function render() {
  const el = cont();
  if (!el) return;
  let rows = proveedores.slice();
  if (filtro) {
    const s = filtro.toLowerCase();
    rows = rows.filter((p) => ((p.razonSocial || "") + " " + (p.rut || "") + " " + (p.giro || "")).toLowerCase().includes(s));
  }
  el.innerHTML = `
    <div class="view-toolbar">
      <input type="text" class="search-input" id="prov-search" placeholder="Buscar por razón social o RUT…" value="${escapeHtml(filtro)}">
      <button class="btn btn-primary" onclick="provNuevo()">+ Nuevo proveedor</button>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Razón social</th><th>RUT</th><th>Giro</th><th>Contacto</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table>
      ${rows.length ? "" : `<div class="empty-state"><p>Aún no hay proveedores.</p></div>`}
    </div>`;
  const inp = document.getElementById("prov-search");
  if (inp) inp.addEventListener("input", () => { filtro = inp.value; render(); });
}

function rowHtml(p) {
  const activo = p.activo !== false;
  return `<tr>
    <td>${escapeHtml(p.razonSocial || "")}</td>
    <td class="cell-mono">${escapeHtml(p.rut || "-")}</td>
    <td>${escapeHtml(p.giro || "-")}</td>
    <td>${escapeHtml(p.contacto || "-")}</td>
    <td>${escapeHtml(p.telefono || "-")}</td>
    <td><span class="badge badge-${activo ? "activo" : "inactivo"}">${activo ? "Activo" : "Inactivo"}</span></td>
    <td class="row-actions"><button onclick="provEditar('${p.id}')">Editar</button></td>
  </tr>`;
}

function formHtml(p) {
  p = p || {};
  return `
    <div class="form-row">
      <label>Razón social *<input type="text" id="prov-razon" value="${escapeHtml(p.razonSocial || "")}"></label>
      <label>RUT<input type="text" id="prov-rut" value="${escapeHtml(p.rut || "")}" placeholder="76.123.456-7"></label>
    </div>
    <div class="form-row">
      <label>Giro<input type="text" id="prov-giro" value="${escapeHtml(p.giro || "")}"></label>
      <label>Contacto<input type="text" id="prov-contacto" value="${escapeHtml(p.contacto || "")}"></label>
    </div>
    <div class="form-row">
      <label>Teléfono<input type="text" id="prov-telefono" value="${escapeHtml(p.telefono || "")}"></label>
      <label>Email<input type="email" id="prov-email" value="${escapeHtml(p.email || "")}"></label>
    </div>
    <div class="form-row">
      <label>Dirección<input type="text" id="prov-direccion" value="${escapeHtml(p.direccion || "")}"></label>
      <label>Estado<select id="prov-activo"><option value="si"${p.activo !== false ? " selected" : ""}>Activo</option><option value="no"${p.activo === false ? " selected" : ""}>Inactivo</option></select></label>
    </div>`;
}

window.provNuevo = function () {
  showModal("Nuevo proveedor", formHtml({}),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-primary" onclick="provGuardar('')">Guardar proveedor</button>`);
};
window.provEditar = function (id) {
  const p = getProveedor(id);
  if (!p) return;
  showModal("Editar proveedor", formHtml(p),
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="provEliminar('${id}')">Eliminar</button>
     <button class="btn btn-primary" onclick="provGuardar('${id}')">Guardar cambios</button>`);
};
window.provGuardar = async function (id) {
  const g = (x) => { const e = document.getElementById(x); return e ? e.value.trim() : ""; };
  const razonSocial = g("prov-razon");
  if (!razonSocial) { toast("Falta razón social", "", "error"); return; }
  const data = {
    razonSocial, rut: g("prov-rut"), giro: g("prov-giro"), contacto: g("prov-contacto"),
    telefono: g("prov-telefono"), email: g("prov-email"), direccion: g("prov-direccion"),
    activo: g("prov-activo") !== "no"
  };
  try {
    if (id) await updateDoc(docE("proveedores", id), data);
    else { data.createdAt = serverTimestamp(); await addDoc(colE("proveedores"), data); }
    closeGenModal();
    toast("Proveedor guardado", razonSocial, "success");
  } catch (err) { console.error(err); toast("No se pudo guardar", "", "error"); }
};
window.provEliminar = function (id) {
  const p = getProveedor(id); if (!p) return;
  confirmDialog("Eliminar proveedor", `¿Eliminar a "${p.razonSocial}"?`, async () => {
    await deleteDoc(docE("proveedores", id));
    closeGenModal();
    toast("Proveedor eliminado", p.razonSocial);
  }, "Eliminar", true);
};
