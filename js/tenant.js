import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  collection,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= MULTI-EMPRESA (TENANT) =================
// Resuelve a qué empresa pertenece el usuario y expone helpers para construir
// referencias siempre bajo empresas/{empresaId}/... Así cada usuario solo trabaja
// con los datos de su empresa. El aislamiento real lo imponen las reglas de Firestore.

// Correos con acceso total (pueden crear empresas y asignar usuarios).
const SUPER_ADMINS = ["rodrigo.briones.friz@gmail.com"];

let empresaId = null;
let usuario = null;       // { uid, email, empresaId, rol }
let currentUser = null;   // objeto de Firebase Auth

export function getEmpresaId() { return empresaId; }
export function getUsuario() { return usuario; }
export function getEmail() { return currentUser ? (currentUser.email || "") : ""; }

export function esSuperAdmin() {
  return SUPER_ADMINS.includes((getEmail()).toLowerCase());
}
export function esAdmin() {
  return esSuperAdmin() || (!!usuario && usuario.rol === "admin");
}

// Helpers de rutas scoped a la empresa del usuario
export function colE(nombre) {
  return collection(db, "empresas", empresaId, nombre);
}
export function docE(...segmentos) {
  return doc(db, "empresas", empresaId, ...segmentos);
}

// ---------- Pantalla "sin empresa" (gate) ----------
function gate() { return document.getElementById("empresa-gate"); }
function appEl() { return document.getElementById("app"); }

function mostrarGate() {
  const g = gate();
  if (g) g.classList.remove("hidden");
  if (appEl()) appEl().classList.add("hidden");

  const msg = document.getElementById("gate-msg");
  const boot = document.getElementById("gate-bootstrap");
  if (esSuperAdmin()) {
    if (msg) msg.textContent = "Tu cuenta de administrador aún no tiene una empresa. Crea la primera para comenzar.";
    if (boot) boot.classList.remove("hidden");
  } else {
    if (msg) msg.textContent = "Tu cuenta aún no tiene una empresa asignada. Contacta al administrador para que te asigne una.";
    if (boot) boot.classList.add("hidden");
  }
}
function ocultarGate() {
  const g = gate();
  if (g) g.classList.add("hidden");
}

async function crearEmpresaYAsignar(nombre) {
  const ref = await addDoc(collection(db, "empresas"), { nombre, createdAt: serverTimestamp() });
  await setDoc(doc(db, "usuarios", currentUser.uid), { empresaId: ref.id, rol: "admin" }, { merge: true });
  location.reload();
}

// ---------- Resolución al iniciar sesión ----------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    empresaId = null; usuario = null; currentUser = null;
    ocultarGate();
    return;
  }
  currentUser = user;

  const uref = doc(db, "usuarios", user.uid);
  let snap;
  try {
    snap = await getDoc(uref);
    if (!snap.exists()) {
      // Auto-provisión: el usuario queda registrado pero sin empresa hasta que un admin lo asigne.
      await setDoc(uref, { email: user.email || "", empresaId: null, rol: "user", createdAt: serverTimestamp() });
      snap = await getDoc(uref);
    }
  } catch (err) {
    console.error("Error resolviendo el usuario/empresa:", err);
    mostrarGate();
    return;
  }

  usuario = { uid: user.uid, ...snap.data() };
  empresaId = usuario.empresaId || null;

  if (empresaId) {
    ocultarGate();
    if (appEl()) appEl().classList.remove("hidden");
    window.dispatchEvent(new CustomEvent("empresa-ready", { detail: { empresaId } }));
  } else {
    mostrarGate();
  }
});

// ---------- Botón de arranque para super-admin ----------
const btnBoot = document.getElementById("gate-crear-empresa");
if (btnBoot) {
  btnBoot.addEventListener("click", async () => {
    const input = document.getElementById("gate-empresa-nombre");
    const nombre = (input && input.value.trim()) || "";
    if (!nombre) { alert("Escribe el nombre de la empresa."); return; }
    try {
      await crearEmpresaYAsignar(nombre);
    } catch (err) {
      console.error("Error creando la empresa:", err);
      alert("No se pudo crear la empresa. Revisa la consola y las reglas de Firestore.");
    }
  });
}
