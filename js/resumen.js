import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= RESUMEN (antes "Dashboard") =================
// Suscripción en tiempo real a las cotizaciones para alimentar las tarjetas
// de indicadores. Cualquier cambio en Firestore se refleja al instante.

const elActivas = document.getElementById("stat-activas");
const elPendientes = document.getElementById("stat-pendientes");
const elAceptadasMes = document.getElementById("stat-aceptadas-mes");
const elPorCobrar = document.getElementById("stat-por-cobrar");

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});

// Cotizaciones "vivas" (en proceso, aún no cerradas)
const ESTADOS_ACTIVOS = ["borrador", "enviada", "en_revision"];
// Enviadas al cliente y esperando su respuesta
const ESTADOS_PENDIENTES = ["enviada", "en_revision"];

function mesActualISO() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

function actualizarResumen(cots) {
  const mes = mesActualISO();

  const activas = cots.filter((c) => ESTADOS_ACTIVOS.includes(c.estado)).length;
  const pendientes = cots.filter((c) => ESTADOS_PENDIENTES.includes(c.estado)).length;
  const aceptadasMes = cots.filter(
    (c) => c.estado === "aceptada" && String(c.fecha || "").slice(0, 7) === mes
  ).length;

  // Por cobrar: total de cotizaciones aceptadas cuya factura aún no está pagada
  // (incluye aceptadas sin factura registrada todavía).
  const porCobrar = cots
    .filter((c) => c.estado === "aceptada" && (!c.factura || c.factura.estadoPago !== "pagada"))
    .reduce((suma, c) => suma + (c.total || 0), 0);

  if (elActivas) elActivas.textContent = activas;
  if (elPendientes) elPendientes.textContent = pendientes;
  if (elAceptadasMes) elAceptadasMes.textContent = aceptadasMes;
  if (elPorCobrar) elPorCobrar.textContent = formatoCLP.format(porCobrar);
}

window.addEventListener("auth-ready", () => {
  onSnapshot(collection(db, "cotizaciones"), (snap) => {
    const cots = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarResumen(cots);
  }, (err) => console.error("Error leyendo resumen:", err));
}, { once: true });
