import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { abrirCotizacionPorId } from "./cotizaciones.js";

// ================= RESUMEN (antes "Dashboard") =================
// Suscripción en tiempo real a las cotizaciones para alimentar las tarjetas.
// Cada tarjeta es clicable y abre un detalle (columnas según la métrica) con
// las cotizaciones que la componen. El botón "Abrir" lleva cada una al editor.

const elActivas = document.getElementById("stat-activas");
const elPendientes = document.getElementById("stat-pendientes");
const elAceptadasMes = document.getElementById("stat-aceptadas-mes");
const elPorCobrar = document.getElementById("stat-por-cobrar");
const elMargen = document.getElementById("stat-margen");

const modalDetalle = document.getElementById("resumen-detalle-modal");
const detalleTitle = document.getElementById("resumen-detalle-title");
const detalleSub = document.getElementById("resumen-detalle-sub");
const detalleTabla = document.getElementById("resumen-detalle-tabla");
const detalleEmpty = document.getElementById("resumen-detalle-empty");
const btnCerrarDetalle = document.getElementById("btn-cerrar-resumen-detalle");

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});

const ESTADO_LABELS = {
  borrador: "Borrador", enviada: "Enviada", en_revision: "En revisión",
  aceptada: "Aceptada", no_aceptada: "No aceptada", vencida: "Vencida", anulada: "Anulada"
};

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatoFolio(n) {
  return n || n === 0 ? "F-" + String(n).padStart(6, "0") : "—";
}

function formatoFecha(iso) {
  if (!iso) return "—";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

function mesActualISO() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

// ---------- Cálculo de margen por cotización (con respaldo si faltan campos) ----------
function baseNetaCot(c) {
  if (c.baseIva != null) return c.baseIva;
  return (c.neto || 0) - (c.descuentoGlobalMonto || 0);
}
function margenMontoCot(c) {
  if (c.margenMonto != null) return c.margenMonto;
  return baseNetaCot(c) - (c.costoTotal || 0);
}
function margenPctCot(c) {
  if (c.margenPorcentaje != null) return c.margenPorcentaje;
  const base = baseNetaCot(c);
  return base > 0 ? (margenMontoCot(c) / base) * 100 : 0;
}

// ---------- Columnas del detalle ----------
const COL_ABRIR = { th: "", cell: (c) => `<button data-abrir-id="${c.id}">Abrir</button>`, accion: true };

const COLS_ESTANDAR = [
  { th: "Folio", cell: (c) => `<span class="cell-mono">${formatoFolio(c.folio)}</span>` },
  { th: "Cliente", cell: (c) => escapeHtml(c.clienteNombre || "—") },
  { th: "Fecha", cell: (c) => formatoFecha(c.fecha) },
  { th: "Estado", cell: (c) => `<span class="badge badge-${c.estado || "borrador"}">${ESTADO_LABELS[c.estado] || c.estado}</span>` },
  { th: "Total", num: true, cell: (c) => `<span class="cell-mono">${formatoCLP.format(c.total || 0)}</span>` },
  COL_ABRIR
];

const COLS_MARGEN = [
  { th: "Folio", cell: (c) => `<span class="cell-mono">${formatoFolio(c.folio)}</span>` },
  { th: "Cliente", cell: (c) => escapeHtml(c.clienteNombre || "—") },
  { th: "Estado", cell: (c) => `<span class="badge badge-${c.estado || "borrador"}">${ESTADO_LABELS[c.estado] || c.estado}</span>` },
  { th: "Neto", num: true, cell: (c) => `<span class="cell-mono">${formatoCLP.format(baseNetaCot(c))}</span>` },
  { th: "Costo", num: true, cell: (c) => `<span class="cell-mono">${formatoCLP.format(c.costoTotal || 0)}</span>` },
  { th: "Margen $", num: true, cell: (c) => `<span class="cell-mono">${formatoCLP.format(margenMontoCot(c))}</span>` },
  { th: "Margen %", num: true, cell: (c) => `<span class="cell-mono">${margenPctCot(c).toFixed(1)}%</span>` },
  COL_ABRIR
];

// ---------- Métricas: mismo filtro alimenta la tarjeta y el detalle ----------
const ESTADOS_ACTIVOS = ["borrador", "enviada", "en_revision"];
const ESTADOS_PENDIENTES = ["enviada", "en_revision"];

const METRICAS = {
  activas: {
    titulo: "Cotizaciones activas",
    sub: "En proceso: borrador, enviada o en revisión.",
    filtro: (c) => ESTADOS_ACTIVOS.includes(c.estado),
    columnas: COLS_ESTANDAR
  },
  pendientes: {
    titulo: "Pendientes de respuesta",
    sub: "Enviadas al cliente, esperando su respuesta.",
    filtro: (c) => ESTADOS_PENDIENTES.includes(c.estado),
    columnas: COLS_ESTANDAR
  },
  aceptadasMes: {
    titulo: "Aceptadas del mes",
    sub: "Aceptadas con fecha dentro del mes actual.",
    filtro: (c) => c.estado === "aceptada" && String(c.fecha || "").slice(0, 7) === mesActualISO(),
    columnas: COLS_ESTANDAR
  },
  porCobrar: {
    titulo: "Por cobrar",
    sub: "Aceptadas cuya factura aún no está pagada.",
    dinero: true,
    filtro: (c) => c.estado === "aceptada" && (!c.factura || c.factura.estadoPago !== "pagada"),
    columnas: COLS_ESTANDAR
  },
  margen: {
    titulo: "Margen aceptadas",
    sub: "Utilidad estimada (neto menos costo) de las cotizaciones aceptadas.",
    dinero: true,
    filtro: (c) => c.estado === "aceptada",
    valor: (lista) => lista.reduce((s, c) => s + margenMontoCot(c), 0),
    columnas: COLS_MARGEN
  }
};

const TARJETAS = [
  { clave: "activas", el: elActivas },
  { clave: "pendientes", el: elPendientes },
  { clave: "aceptadasMes", el: elAceptadasMes },
  { clave: "porCobrar", el: elPorCobrar },
  { clave: "margen", el: elMargen }
];

let cotsCache = [];
let metricaAbierta = null;

function valorTarjeta(clave, cots) {
  const m = METRICAS[clave];
  const lista = cots.filter(m.filtro);
  if (m.dinero) {
    const v = m.valor ? m.valor(lista) : lista.reduce((s, c) => s + (c.total || 0), 0);
    return formatoCLP.format(v);
  }
  return lista.length;
}

function actualizarResumen(cots) {
  TARJETAS.forEach(({ clave, el }) => {
    if (el) el.textContent = valorTarjeta(clave, cots);
  });
  if (modalDetalle && !modalDetalle.classList.contains("hidden") && metricaAbierta) {
    renderDetalle(metricaAbierta);
  }
}

// ---------- Detalle en modal ----------
function renderDetalle(claveMetrica) {
  const meta = METRICAS[claveMetrica];
  if (!meta) return;
  metricaAbierta = claveMetrica;

  const lista = cotsCache
    .filter(meta.filtro)
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));

  detalleTitle.textContent = meta.titulo;

  if (meta.columnas === COLS_MARGEN) {
    const totalMargen = lista.reduce((s, c) => s + margenMontoCot(c), 0);
    const totalNeto = lista.reduce((s, c) => s + baseNetaCot(c), 0);
    const pct = totalNeto > 0 ? (totalMargen / totalNeto) * 100 : 0;
    detalleSub.textContent = `${meta.sub} ${lista.length} cotización(es). Margen total ${formatoCLP.format(totalMargen)} (${pct.toFixed(1)}%).`;
  } else {
    const totalDinero = lista.reduce((s, c) => s + (c.total || 0), 0);
    detalleSub.textContent = meta.dinero
      ? `${meta.sub} ${lista.length} cotización(es), total ${formatoCLP.format(totalDinero)}.`
      : `${meta.sub} ${lista.length} cotización(es).`;
  }

  if (lista.length === 0) {
    detalleTabla.innerHTML = "";
    detalleEmpty.classList.remove("hidden");
  } else {
    detalleEmpty.classList.add("hidden");
    const cols = meta.columnas;
    const thead = `<thead><tr>${cols.map((col) =>
      `<th class="${col.num ? "col-num" : ""}${col.accion ? " row-actions" : ""}">${col.th}</th>`
    ).join("")}</tr></thead>`;
    const tbody = `<tbody>${lista.map((c) =>
      `<tr>${cols.map((col) =>
        `<td class="${col.num ? "col-num cell-mono" : ""}${col.accion ? " row-actions" : ""}">${col.cell(c)}</td>`
      ).join("")}</tr>`
    ).join("")}</tbody>`;
    detalleTabla.innerHTML = `<table class="data-table">${thead}${tbody}</table>`;
  }

  modalDetalle.classList.remove("hidden");
}

function cerrarDetalle() {
  modalDetalle.classList.add("hidden");
  metricaAbierta = null;
}

// Click en una tarjeta -> abre el detalle de esa métrica
document.querySelectorAll(".stat-card-clickable").forEach((card) => {
  card.addEventListener("click", () => renderDetalle(card.dataset.metrica));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      renderDetalle(card.dataset.metrica);
    }
  });
});

// Click en "Abrir" dentro del detalle -> abre la cotización en su editor
detalleTabla.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-abrir-id]");
  if (!btn) return;
  cerrarDetalle();
  abrirCotizacionPorId(btn.dataset.abrirId);
});

btnCerrarDetalle.addEventListener("click", cerrarDetalle);
modalDetalle.addEventListener("click", (e) => {
  if (e.target === modalDetalle) cerrarDetalle();
});

// ---------- Suscripción en tiempo real ----------
window.addEventListener("auth-ready", () => {
  onSnapshot(collection(db, "cotizaciones"), (snap) => {
    cotsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarResumen(cotsCache);
  }, (err) => console.error("Error leyendo resumen:", err));
}, { once: true });
