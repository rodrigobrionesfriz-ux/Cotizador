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

const tbody = document.getElementById("obras-tbody");
const emptyState = document.getElementById("obras-empty");
const searchInput = document.getElementById("obras-search");

const modal = document.getElementById("obra-modal");
const modalTitle = document.getElementById("obra-modal-title");
const form = document.getElementById("obra-form");

const btnNueva = document.getElementById("btn-nueva-obra");
const btnCancelar = document.getElementById("btn-cancelar-obra");

let obras = [];

export function getObrasActivas() {
  return obras.filter((o) => o.estado !== "cerrada");
}

const obrasQuery = query(collection(db, "obras"), orderBy("codigo"));

onSnapshot(obrasQuery, (snap) => {
  obras = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render(obras);
  window.dispatchEvent(new CustomEvent("obras-actualizadas", { detail: obras }));
}, (err) => console.error("Error leyendo obras:", err));

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(lista) {
  tbody.innerHTML = "";
  if (lista.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  lista.forEach((o) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-mono">${escapeHtml(o.codigo || "")}</td>
      <td>${escapeHtml(o.nombre || "")}</td>
      <td>${escapeHtml(o.direccion || "—")}</td>
      <td>${escapeHtml(o.responsable || "—")}</td>
      <td>${escapeHtml(o.fechaInicio || "—")}</td>
      <td><span class="badge badge-${o.estado === "cerrada" ? "inactivo" : "activo"}">${o.estado === "cerrada" ? "Cerrada" : "Activa"}</span></td>
      <td class="row-actions"><button data-id="${o.id}">Editar</button></td>
    `;
    tbody.appendChild(tr);
  });
}

searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return render(obras);
  render(obras.filter((o) =>
    (o.codigo || "").toLowerCase().includes(term) ||
    (o.nombre || "").toLowerCase().includes(term)
  ));
});

btnNueva.addEventListener("click", () => {
  form.reset();
  document.getElementById("obra-id").value = "";
  modalTitle.textContent = "Nueva obra";
  modal.classList.remove("hidden");
});

tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const obra = obras.find((o) => o.id === btn.dataset.id);
  if (!obra) return;

  document.getElementById("obra-id").value = obra.id;
  document.getElementById("obra-codigo").value = obra.codigo || "";
  document.getElementById("obra-nombre").value = obra.nombre || "";
  document.getElementById("obra-direccion").value = obra.direccion || "";
  document.getElementById("obra-responsable").value = obra.responsable || "";
  document.getElementById("obra-fechaInicio").value = obra.fechaInicio || "";
  document.getElementById("obra-estado").value = obra.estado || "activa";

  modalTitle.textContent = "Editar obra";
  modal.classList.remove("hidden");
});

btnCancelar.addEventListener("click", () => modal.classList.add("hidden"));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("obra-id").value;
  const data = {
    codigo: document.getElementById("obra-codigo").value.trim(),
    nombre: document.getElementById("obra-nombre").value.trim(),
    direccion: document.getElementById("obra-direccion").value.trim(),
    responsable: document.getElementById("obra-responsable").value.trim(),
    fechaInicio: document.getElementById("obra-fechaInicio").value,
    estado: document.getElementById("obra-estado").value
  };

  try {
    if (id) {
      await updateDoc(doc(db, "obras", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "obras"), data);
    }
    modal.classList.add("hidden");
  } catch (err) {
    console.error("Error guardando obra:", err);
    alert("No se pudo guardar la obra. Revisa la consola para más detalles.");
  }
});
