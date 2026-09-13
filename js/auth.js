import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const loginScreen = document.getElementById("login-screen");
const appEl = document.getElementById("app");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

// Persistencia de SESIÓN: la sesión vive solo mientras la app está abierta.
// Al cerrar completamente la app (o la ventana instalada), se borra y el
// próximo inicio obliga a iniciar sesión de nuevo. Una recarga normal la mantiene.
const persistenciaLista = setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.warn("No se pudo fijar la persistencia de sesión:", err);
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await persistenciaLista;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = `${err.code || "error"}: ${err.message}`;
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));
const gateLogout = document.getElementById("gate-logout");
if (gateLogout) gateLogout.addEventListener("click", () => signOut(auth));

const gateEl = document.getElementById("empresa-gate");

// Registramos el observador después de fijar la persistencia de sesión, para que
// una sesión guardada de antes (persistencia local) se migre a solo-sesión.
persistenciaLista.finally(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginScreen.classList.add("hidden");
      appEl.classList.remove("hidden");
      userEmailEl.textContent = user.email;
      window.dispatchEvent(new CustomEvent("auth-ready"));
      // La visibilidad app vs. "sin empresa" la resuelve tenant.js.
    } else {
      loginScreen.classList.remove("hidden");
      appEl.classList.add("hidden");
      if (gateEl) gateEl.classList.add("hidden");
    }
  });
});
