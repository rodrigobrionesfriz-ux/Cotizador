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

const selectCategoria = document.getElementById("item-categoria");
const subcategoriaRow = document.getElementById("item-subcategoria-row");
const selectSubcategoria = document.getElementById("item-subcategoria");
const calcHHBox = document.getElementById("item-calc-hh");
const inputCostoMensual = document.getElementById("item-costoMensual");
const inputJhMensuales = document.getElementById("item-jhMensuales");
const inputHorasPorJornada = document.getElementById("item-horasPorJornada");
const displayCostoHH = document.getElementById("item-costoHHCalculado");
const inputCostoNeto = document.getElementById("item-costo");

const SUBCATEGORIAS = { propia: "Propia", contratista: "Contratista" };

function actualizarVisibilidadManoObra() {
  const esManoObra = selectCategoria.value === "mano_obra";
  subcategoriaRow.style.display = esManoObra ? "" : "none";
  calcHHBox.style.display = esManoObra ? "" : "none";
}
selectCategoria.addEventListener("change", actualizarVisibilidadManoObra);

function calcularCostoHH() {
  const costoMensual = Number(inputCostoMensual.value) || 0;
  const jh = Number(inputJhMensuales.value) || 0;
  const horas = Number(inputHorasPorJornada.value) || 0;
  const totalHoras = jh * horas;
  return costoMensual > 0 && totalHoras > 0 ? costoMensual / totalHoras : null;
}

function mostrarCostoHHCalculado() {
  const costoHH = calcularCostoHH();
  displayCostoHH.value = costoHH !== null ? formatoCLP.format(costoHH) : "";
}

function recalcularCostoHH() {
  const costoHH = calcularCostoHH();
  if (costoHH !== null) {
    displayCostoHH.value = formatoCLP.format(costoHH);
    inputCostoNeto.value = Math.round(costoHH);
  } else {
    displayCostoHH.value = "";
  }
}
[inputCostoMensual, inputJhMensuales, inputHorasPorJornada].forEach((el) => {
  el.addEventListener("input", recalcularCostoHH);
});

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
      <td>${CATEGORIAS[it.categoria] || "—"}${it.categoria === "mano_obra" && it.subcategoria ? ` (${SUBCATEGORIAS[it.subcategoria] || it.subcategoria})` : ""}</td>
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
export function abrirNuevoItemDesdeExterno() {
  form.reset();
  document.getElementById("item-id").value = "";
  document.getElementById("item-afectoIva").checked = true;
  modalTitle.textContent = "Nuevo ítem";
  actualizarVisibilidadManoObra();
  displayCostoHH.value = "";
  modal.classList.remove("hidden");
}

btnNuevo.addEventListener("click", abrirNuevoItemDesdeExterno);

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

  selectSubcategoria.value = item.subcategoria || "propia";
  inputCostoMensual.value = item.costoEmpresaMensual ?? "";
  inputJhMensuales.value = item.jhMensuales ?? "";
  inputHorasPorJornada.value = item.horasPorJornada ?? "";
  actualizarVisibilidadManoObra();
  mostrarCostoHHCalculado();

  modalTitle.textContent = "Editar ítem";
  modal.classList.remove("hidden");
});

btnCancelar.addEventListener("click", () => modal.classList.add("hidden"));

// ---------- Guardar (crear o actualizar) ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = document.getElementById("item-id").value;
  const esManoObra = document.getElementById("item-categoria").value === "mano_obra";
  const data = {
    codigo: document.getElementById("item-codigo").value.trim(),
    categoria: document.getElementById("item-categoria").value,
    descripcion: document.getElementById("item-descripcion").value.trim(),
    unidad: document.getElementById("item-unidad").value,
    proveedor: document.getElementById("item-proveedor").value.trim(),
    costo: Number(document.getElementById("item-costo").value) || 0,
    precio: Number(document.getElementById("item-precio").value) || 0,
    afectoIva: document.getElementById("item-afectoIva").checked,
    estado: document.getElementById("item-estado").value,
    subcategoria: esManoObra ? selectSubcategoria.value : "",
    costoEmpresaMensual: esManoObra ? (Number(inputCostoMensual.value) || 0) : 0,
    jhMensuales: esManoObra ? (Number(inputJhMensuales.value) || 0) : 0,
    horasPorJornada: esManoObra ? (Number(inputHorasPorJornada.value) || 0) : 0
  };

  try {
    if (id) {
      await updateDoc(doc(db, "catalogo", id), data);
      window.dispatchEvent(new CustomEvent("item-guardado", { detail: { id, esNuevo: false, ...data } }));
    } else {
      data.createdAt = serverTimestamp();
      const docRef = await addDoc(collection(db, "catalogo"), data);
      window.dispatchEvent(new CustomEvent("item-guardado", { detail: { id: docRef.id, esNuevo: true, ...data } }));
    }
    modal.classList.add("hidden");
  } catch (err) {
    console.error("Error guardando ítem:", err);
    alert("No se pudo guardar el ítem. Revisa la consola para más detalles.");
  }
});
