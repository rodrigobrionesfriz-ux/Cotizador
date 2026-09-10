import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const tbody = document.getElementById("clientes-tbody");
const emptyState = document.getElementById("clientes-empty");
const searchInput = document.getElementById("clientes-search");

const modal = document.getElementById("cliente-modal");
const modalTitle = document.getElementById("cliente-modal-title");
const form = document.getElementById("cliente-form");

const btnNuevo = document.getElementById("btn-nuevo-cliente");
const btnCancelar = document.getElementById("btn-cancelar-cliente");

let clientes = []; // caché local para búsqueda y edición

// ---------- Suscripción en tiempo real ----------
window.addEventListener("auth-ready", () => {
  const clientesQuery = query(collection(db, "clientes"), orderBy("razonSocial"));
  onSnapshot(clientesQuery, (snapshot) => {
    clientes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(clientes);
  }, (err) => {
    console.error("Error leyendo clientes:", err);
  });
}, { once: true });

// ---------- Render de la tabla ----------
function render(lista) {
  tbody.innerHTML = "";

  if (lista.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  lista.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.razonSocial || "")}</td>
      <td class="cell-rut">${escapeHtml(c.rut || "")}</td>
      <td>${escapeHtml(c.giro || "—")}</td>
      <td>${escapeHtml(c.contacto || "—")}</td>
      <td>${escapeHtml(c.comuna || "—")}</td>
      <td><span class="badge badge-${c.estado === "inactivo" ? "inactivo" : "activo"}">${c.estado === "inactivo" ? "Inactivo" : "Activo"}</span></td>
      <td class="row-actions">
        <button data-action="editar" data-id="${c.id}">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- Búsqueda ----------
searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return render(clientes);

  const filtrados = clientes.filter((c) =>
    (c.razonSocial || "").toLowerCase().includes(term) ||
    (c.rut || "").toLowerCase().includes(term)
  );
  render(filtrados);
});

// ---------- Abrir modal: nuevo ----------
btnNuevo.addEventListener("click", () => {
  form.reset();
  document.getElementById("cliente-id").value = "";
  modalTitle.textContent = "Nuevo cliente";
  modal.classList.remove("hidden");
});

// ---------- Abrir modal: editar ----------
tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action='editar']");
  if (!btn) return;

  const cliente = clientes.find((c) => c.id === btn.dataset.id);
  if (!cliente) return;

  document.getElementById("cliente-id").value = cliente.id;
  document.getElementById("cliente-razonSocial").value = cliente.razonSocial || "";
  document.getElementById("cliente-rut").value = cliente.rut || "";
  document.getElementById("cliente-giro").value = cliente.giro || "";
  document.getElementById("cliente-estado").value = cliente.estado || "activo";
  document.getElementById("cliente-contacto").value = cliente.contacto || "";
  document.getElementById("cliente-telefono").value = cliente.telefono || "";
  document.getElementById("cliente-email").value = cliente.email || "";
  document.getElementById("cliente-comuna").value = cliente.comuna || "";
  document.getElementById("cliente-region").value = cliente.region || "";
  document.getElementById("cliente-direccion").value = cliente.direccion || "";

  modalTitle.textContent = "Editar cliente";
  modal.classList.remove("hidden");
});

btnCancelar.addEventListener("click", () => modal.classList.add("hidden"));

// ---------- Guardar (crear o actualizar) ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("cliente-id").value;
  const data = {
    razonSocial: document.getElementById("cliente-razonSocial").value.trim(),
    rut: document.getElementById("cliente-rut").value.trim(),
    giro: document.getElementById("cliente-giro").value.trim(),
    estado: document.getElementById("cliente-estado").value,
    contacto: document.getElementById("cliente-contacto").value.trim(),
    telefono: document.getElementById("cliente-telefono").value.trim(),
    email: document.getElementById("cliente-email").value.trim(),
    comuna: document.getElementById("cliente-comuna").value.trim(),
    region: document.getElementById("cliente-region").value.trim(),
    direccion: document.getElementById("cliente-direccion").value.trim()
  };

  try {
    if (id) {
      await updateDoc(doc(db, "clientes", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "clientes"), data);
    }
    modal.classList.add("hidden");
  } catch (err) {
    console.error("Error guardando cliente:", err);
    alert("No se pudo guardar el cliente. Revisa la consola para más detalles.");
  }
});
