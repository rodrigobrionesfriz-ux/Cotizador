import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { esSuperAdmin } from "./tenant.js";

// ================= ADMINISTRACIÓN (empresas y usuarios) =================
// Solo visible para super-admin. Permite crear empresas y asignar cada usuario
// a una empresa y rol. El aislamiento de datos lo imponen las reglas de Firestore.

const navAdmin = document.getElementById("nav-admin");
const inputEmpresa = document.getElementById("admin-empresa-nombre");
const btnCrearEmpresa = document.getElementById("btn-crear-empresa");
const empresasTbody = document.getElementById("admin-empresas-tbody");
const usuariosTbody = document.getElementById("admin-usuarios-tbody");

let empresas = [];
let usuarios = [];

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function nombreEmpresa(id) {
  const e = empresas.find((x) => x.id === id);
  return e ? e.nombre : "";
}

function renderEmpresas() {
  if (!empresasTbody) return;
  empresasTbody.innerHTML = empresas.length
    ? empresas.map((e) => `<tr><td>${escapeHtml(e.nombre || "")}</td><td class="cell-mono">${escapeHtml(e.id)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="muted">Aún no hay empresas.</td></tr>`;
}

function renderUsuarios() {
  if (!usuariosTbody) return;
  if (!usuarios.length) {
    usuariosTbody.innerHTML = `<tr><td colspan="4" class="muted">Aún no hay usuarios registrados.</td></tr>`;
    return;
  }
  const opts = (sel) => `<option value="">— Sin empresa —</option>` +
    empresas.map((e) => `<option value="${e.id}"${e.id === sel ? " selected" : ""}>${escapeHtml(e.nombre || e.id)}</option>`).join("");

  usuariosTbody.innerHTML = usuarios.map((u) => `
    <tr>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><select class="adm-empresa" data-uid="${u.uid}">${opts(u.empresaId || "")}</select></td>
      <td>
        <select class="adm-rol" data-uid="${u.uid}">
          <option value="user"${u.rol !== "admin" ? " selected" : ""}>Usuario</option>
          <option value="admin"${u.rol === "admin" ? " selected" : ""}>Admin</option>
        </select>
      </td>
      <td class="row-actions"><button data-guardar="${u.uid}">Guardar</button></td>
    </tr>`).join("");
}

async function guardarUsuario(uid) {
  const selEmp = usuariosTbody.querySelector(`.adm-empresa[data-uid="${uid}"]`);
  const selRol = usuariosTbody.querySelector(`.adm-rol[data-uid="${uid}"]`);
  const empresaId = selEmp ? (selEmp.value || null) : null;
  const rol = selRol ? selRol.value : "user";
  try {
    await updateDoc(doc(db, "usuarios", uid), { empresaId, rol });
    const btn = usuariosTbody.querySelector(`button[data-guardar="${uid}"]`);
    if (btn) { const p = btn.textContent; btn.textContent = "✓"; setTimeout(() => (btn.textContent = p), 1500); }
  } catch (err) {
    console.error("Error asignando usuario:", err);
    alert("No se pudo guardar la asignación. Revisa la consola y las reglas de Firestore.");
  }
}

function iniciar() {
  if (!esSuperAdmin()) return;
  if (navAdmin) navAdmin.classList.remove("hidden");

  onSnapshot(collection(db, "empresas"), (snap) => {
    empresas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEmpresas();
    renderUsuarios();
  }, (err) => console.error("Error leyendo empresas:", err));

  onSnapshot(collection(db, "usuarios"), (snap) => {
    usuarios = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    renderUsuarios();
  }, (err) => console.error("Error leyendo usuarios:", err));

  if (btnCrearEmpresa) {
    btnCrearEmpresa.addEventListener("click", async () => {
      const nombre = inputEmpresa ? inputEmpresa.value.trim() : "";
      if (!nombre) { alert("Escribe el nombre de la empresa."); return; }
      try {
        await addDoc(collection(db, "empresas"), { nombre, createdAt: serverTimestamp() });
        if (inputEmpresa) inputEmpresa.value = "";
      } catch (err) {
        console.error("Error creando empresa:", err);
        alert("No se pudo crear la empresa. Revisa la consola y las reglas de Firestore.");
      }
    });
  }

  if (usuariosTbody) {
    usuariosTbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-guardar]");
      if (btn) guardarUsuario(btn.dataset.guardar);
    });
  }
}

window.addEventListener("empresa-ready", iniciar, { once: true });
