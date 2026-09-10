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

const tbody = document.getElementById("catalogo-tbody");
const emptyState = document.getElementById("catalogo-empty");
const searchInput = document.getElementById("catalogo-search");

const modal = document.getElementById("item-modal");
const modalTitle = document.getElementById("item-modal-title");
const form = document.getElementById("item-form");

const btnNuevo = document.getElementById("btn-nuevo-item");
const btnCancelar = document.getElementById("btn-cancelar-item");

const CATEGORIAS = {
  material: "Material",
  equipo: "Equipo",
  mano_obra: "Mano de obra",
  servicio: "Servicio"
};

let items = []; // caché local para búsqueda y edición

// ---------- Suscripción en tiempo real ----------
window.addEventListener("auth-ready", () => {
  const itemsQuery = query(collection(db, "catalogo"), orderBy("codigo"));
  onSnapshot(itemsQuery, (snapshot) => {
    items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(items);
  }, (err) => {
    console.error("Error leyendo catálogo:", err);
  });
}, { once: true });

// ---------- Formato ----------
const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- Render de la tabla ----------
function render(lista) {
  tbody.innerHTML = "";

  if (lista.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  lista.forEach((it) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-mono">${escapeHtml(it.codigo || "")}</td>
      <td>${escapeHtml(it.descripcion || "")}</td>
      <td>${CATEGORIAS[it.categoria] || "—"}</td>
      <td>${escapeHtml(it.unidad || "—")}</td>
      <td class="col-num cell-mono">${formatoCLP.format(it.costo || 0)}</td>
      <td class="col-num cell-mono">${formatoCLP.format(it.precio || 0)}</td>
      <td><span class="badge badge-${it.estado === "inactivo" ? "inactivo" : "activo"}">${it.estado === "inactivo" ? "Inactivo" : "Activo"}</span></td>
      <td class="row-actions">
        <button data-action="editar" data-id="${it.id}">Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Búsqueda ----------
searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return render(items);

  const filtrados = items.filter((it) =>
    (it.codigo || "").toLowerCase().includes(term) ||
    (it.descripcion || "").toLowerCase().includes(term)
  );
  render(filtrados);
});

// ---------- Abrir modal: nuevo ----------
btnNuevo.addEventListener("click", () => {
  form.reset();
  document.getElementById("item-id").value = "";
  document.getElementById("item-afectoIva").checked = true;
  modalTitle.textContent = "Nuevo ítem";
  modal.classList.remove("hidden");
});

// ---------- Abrir modal: editar ----------
tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action='editar']");
  if (!btn) return;

  const item = items.find((it) => it.id === btn.dataset.id);
  if (!item) return;

  document.getElementById("item-id").value = item.id;
  document.getElementById("item-codigo").value = item.codigo || "";
  document.getElementById("item-categoria").value = item.categoria || "material";
  document.getElementById("item-descripcion").value = item.descripcion || "";
  document.getElementById("item-unidad").value = item.unidad || "UN";
  document.getElementById("item-proveedor").value = item.proveedor || "";
  document.getElementById("item-costo").value = item.costo ?? "";
  document.getElementById("item-precio").value = item.precio ?? "";
  document.getElementById("item-afectoIva").checked = item.afectoIva !== false;
  document.getElementById("item-estado").value = item.estado || "activo";

  modalTitle.textContent = "Editar ítem";
  modal.classList.remove("hidden");
});

btnCancelar.addEventListener("click", () => modal.classList.add("hidden"));

// ---------- Guardar (crear o actualizar) ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("item-id").value;
  const data = {
    codigo: document.getElementById("item-codigo").value.trim(),
    categoria: document.getElementById("item-categoria").value,
    descripcion: document.getElementById("item-descripcion").value.trim(),
    unidad: document.getElementById("item-unidad").value,
    proveedor: document.getElementById("item-proveedor").value.trim(),
    costo: Number(document.getElementById("item-costo").value) || 0,
    precio: Number(document.getElementById("item-precio").value) || 0,
    afectoIva: document.getElementById("item-afectoIva").checked,
    estado: document.getElementById("item-estado").value
  };

  try {
    if (id) {
      await updateDoc(doc(db, "catalogo", id), data);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "catalogo"), data);
    }
    modal.classList.add("hidden");
  } catch (err) {
    console.error("Error guardando ítem:", err);
    alert("No se pudo guardar el ítem. Revisa la consola para más detalles.");
  }
});
