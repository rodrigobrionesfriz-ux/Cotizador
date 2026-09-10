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
