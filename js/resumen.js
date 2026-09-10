import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { abrirCotizacionPorId } from "./cotizaciones.js";

// ================= RESUMEN (antes "Dashboard") =================
// Suscripción en tiempo real a las cotizaciones para alimentar las tarjetas
// de indicadores. Cada tarjeta es clicable y abre un detalle con las
// cotizaciones que la componen.

const elActivas = document.getElementById("stat-activas");
const elPendientes = document.getElementById("stat-pendientes");
const elAceptadasMes = document.getElementById("stat-aceptadas-mes");
const elPorCobrar = document.getElementById("stat-por-cobrar");

// Modal de detalle
const modalDetalle = document.getElementById("resumen-detalle-modal");
const detalleTitle = document.getElementById("resumen-detalle-title");
const detalleSub = document.getElementById("resumen-detalle-sub");
const detalleTbody = document.getElementById("resumen-detalle-tbody");
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

// Cada métrica define su título, su filtro y si muestra un total en dinero.
// El mismo filtro alimenta la tarjeta y el detalle, así siempre coinciden.
const ESTADOS_ACTIVOS = ["borrador", "enviada", "en_revision"];
const ESTADOS_PENDIENTES = ["enviada", "en_revision"];

const METRICAS = {
  activas: {
    titulo: "Cotizaciones activas",
    sub: "En proceso: borrador, enviada o en revisión.",
    filtro: (c) => ESTADOS_ACTIVOS.includes(c.estado)
  },
  pendientes: {
    titulo: "Pendientes de respuesta",
    sub: "Enviadas al cliente, esperando su respuesta.",
    filtro: (c) => ESTADOS_PENDIENTES.includes(c.estado)
  },
  aceptadasMes: {
    titulo: "Aceptadas del mes",
    sub: "Aceptadas con fecha dentro del mes actual.",
    filtro: (c) => c.estado === "aceptada" && String(c.fecha || "").slice(0, 7) === mesActualISO()
  },
  porCobrar: {
    titulo: "Por cobrar",
    sub: "Aceptadas cuya factura aún no está pagada.",
    dinero: true,
    filtro: (c) => c.estado === "aceptada" && (!c.factura || c.factura.estadoPago !== "pagada")
  }
};

let cotsCache = [];

function actualizarResumen(cots) {
  if (elActivas) elActivas.textContent = cots.filter(METRICAS.activas.filtro).length;
  if (elPendientes) elPendientes.textContent = cots.filter(METRICAS.pendientes.filtro).length;
  if (elAceptadasMes) elAceptadasMes.textContent = cots.filter(METRICAS.aceptadasMes.filtro).length;
  if (elPorCobrar) {
    const total = cots.filter(METRICAS.porCobrar.filtro).reduce((s, c) => s + (c.total || 0), 0);
    elPorCobrar.textContent = formatoCLP.format(total);
  }
  // Si el detalle está abierto, lo refrescamos con los datos nuevos.
  if (modalDetalle && !modalDetalle.classList.contains("hidden") && metricaAbierta) {
    renderDetalle(metricaAbierta);
  }
}

// ---------- Detalle en modal ----------
let metricaAbierta = null;

function renderDetalle(claveMetrica) {
  const meta = METRICAS[claveMetrica];
  if (!meta) return;
  metricaAbierta = claveMetrica;

  const lista = cotsCache
    .filter(meta.filtro)
    .sort((a, b) => (b.folio || 0) - (a.folio || 0));

  detalleTitle.textContent = meta.titulo;
  const totalDinero = lista.reduce((s, c) => s + (c.total || 0), 0);
  detalleSub.textContent = meta.dinero
    ? `${meta.sub} ${lista.length} cotización(es), total ${formatoCLP.format(totalDinero)}.`
    : `${meta.sub} ${lista.length} cotización(es).`;

  detalleTbody.innerHTML = "";
  if (lista.length === 0) {
    detalleEmpty.classList.remove("hidden");
  } else {
    detalleEmpty.classList.add("hidden");
    lista.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="cell-mono">${formatoFolio(c.folio)}</td>
        <td>${escapeHtml(c.clienteNombre || "—")}</td>
        <td>${formatoFecha(c.fecha)}</td>
        <td><span class="badge badge-${c.estado || "borrador"}">${ESTADO_LABELS[c.estado] || c.estado}</span></td>
        <td class="col-num cell-mono">${formatoCLP.format(c.total || 0)}</td>
        <td class="row-actions"><button data-abrir-id="${c.id}">Abrir</button></td>
      `;
      detalleTbody.appendChild(tr);
    });
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
detalleTbody.addEventListener("click", (e) => {
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
