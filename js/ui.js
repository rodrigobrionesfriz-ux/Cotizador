// ================= UI: bloqueo de scroll de fondo con modales =================
// Cuando hay un modal (o el editor visual) abierto, la página de atrás queda fija
// y solo el contenido del modal se desplaza. Funciona con todos los modales porque
// observa la aparición/ocultamiento de cualquier .modal-backdrop / .pl-editor-backdrop.

const SELECTOR = ".modal-backdrop, .pl-editor-backdrop";

function sincronizar() {
  const abierto = Array.from(document.querySelectorAll(SELECTOR))
    .some((el) => !el.classList.contains("hidden"));
  document.documentElement.classList.toggle("no-scroll", abierto);
  document.body.classList.toggle("no-scroll", abierto);
}

// Observa cambios de clase (abrir/cerrar) y de estructura (el editor se crea al vuelo).
const observer = new MutationObserver(sincronizar);
observer.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ["class"]
});

sincronizar();

// ================= UI: botón "atrás" del móvil =================
// La app es una SPA sin historial, así que el botón atrás del navegador/móvil
// cerraba la app por error. Aquí lo manejamos: cada "atrás" cierra primero lo que
// esté abierto (modal, editor visual, menú lateral, editor de cotización/OC) o
// vuelve a la vista Resumen. Solo se sale de la app con doble atrás seguido.

function toastAtras(msg) {
  // Reutiliza el toast global si existe; si no, crea uno mínimo.
  if (typeof window.toast === "function") {
    window.toast(msg);
    return;
  }
  let t = document.getElementById("ui-back-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "ui-back-toast";
    t.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
      "background:#111;color:#fff;padding:10px 16px;border-radius:8px;" +
      "font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.3);" +
      "opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw;text-align:center;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._hideT);
  t._hideT = setTimeout(() => {
    t.style.opacity = "0";
  }, 1800);
}

// Devuelve true si "consumió" el atrás cerrando algo. false = no había nada abierto.
function manejarAtras() {
  // (1) Modal o editor visual abierto: cerrar el que esté encima (último en el DOM).
  const modales = Array.from(
    document.querySelectorAll(".modal-backdrop, .pl-editor-backdrop")
  ).filter((el) => !el.classList.contains("hidden"));
  if (modales.length) {
    const top = modales[modales.length - 1];
    if (top.id === "gen-modal" && typeof window.closeGenModal === "function") {
      window.closeGenModal();
    } else {
      top.classList.add("hidden");
    }
    return true;
  }

  // (2) Menú lateral abierto (móvil).
  const sidebar = document.querySelector(".sidebar");
  if (sidebar && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
    const bd = document.getElementById("sidebar-backdrop");
    if (bd) bd.classList.remove("visible");
    return true;
  }

  // (3) Editor de cotización abierto: volver al listado.
  const cotEditor = document.getElementById("cotizaciones-editor");
  if (cotEditor && !cotEditor.classList.contains("hidden")) {
    const volver = document.getElementById("btn-volver-lista");
    if (volver) {
      volver.click();
      return true;
    }
  }

  // (4) Editor de orden de compra abierto: volver al listado de OC.
  const ocEditor = document.getElementById("oc-editor");
  if (ocEditor && !ocEditor.classList.contains("hidden")) {
    if (typeof window.ocRenderLista === "function") {
      window.ocRenderLista();
      return true;
    }
    if (typeof window.ocVolverLista === "function") {
      window.ocVolverLista();
      return true;
    }
  }

  // (5) No estamos en Resumen: volver a Resumen.
  const activo = document.querySelector(".nav-item.active[data-view]");
  if (activo && activo.dataset.view !== "dashboard") {
    const dash = document.querySelector('.nav-item[data-view="dashboard"]');
    if (dash) {
      dash.click();
      return true;
    }
  }

  // (6) Nada abierto y estamos en la raíz (Resumen): no consumimos el atrás.
  return false;
}

// Estado del doble-atrás para salir.
let permitirSalir = false;
let salirTimer = null;

// "Arma" una entrada de historial extra para capturar el próximo atrás.
function armar() {
  history.pushState({ cotizadorGuard: true }, "");
}

window.addEventListener("popstate", () => {
  const consumido = manejarAtras();

  if (consumido) {
    // Cerramos algo: re-armamos para seguir capturando el atrás y no salir.
    permitirSalir = false;
    if (salirTimer) {
      clearTimeout(salirTimer);
      salirTimer = null;
    }
    armar();
    return;
  }

  // Estamos en la raíz sin nada abierto.
  if (permitirSalir) {
    // Segundo atrás dentro de la ventana: dejamos salir de verdad.
    history.back();
    return;
  }

  // Primer atrás en la raíz: avisamos y re-armamos.
  permitirSalir = true;
  toastAtras("Pulsa atrás otra vez para salir");
  salirTimer = setTimeout(() => {
    permitirSalir = false;
    salirTimer = null;
  }, 2000);
  armar();
});

// Al cargar, armamos la primera entrada para que el primer atrás no cierre la app.
armar();
