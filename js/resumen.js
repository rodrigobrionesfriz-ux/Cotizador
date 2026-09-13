import { db } from "./firebase-config.js";
import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { colE } from "./tenant.js";
import { abrirCotizacionPorId, actualizarEstadoCotizacion } from "./cotizaciones.js";

// ================= RESUMEN (antes "Dashboard") =================
// Suscripción en tiempo real a las cotizaciones para alimentar las tarjetas.
// Cada tarjeta es clicable y abre un detalle (columnas según la métrica) con
// las cotizaciones que la componen. El botón "Abrir" lleva cada una al editor.

const elActivas = document.getElementById("stat-activas");
const elPendientes = document.getElementById("stat-pendientes");
const elAceptadasMes = document.getElementById("stat-aceptadas-mes");
const elPorCobrar = document.getElementById("stat-por-cobrar");
const elMargen = document.getElementById("stat-margen");

// KPI de inventario y compras
const elInvBajo = document.getElementById("stat-inv-bajo");
const elInvValor = document.getElementById("stat-inv-valor");
const elOcEmitidas = document.getElementById("stat-oc-emitidas");
const elOcMes = document.getElementById("stat-oc-mes");
let prodCache = [];
let ocCache = [];

const modalDetalle = document.getElementById("resumen-detalle-modal");
const detalleTitle = document.getElementById("resumen-detalle-title");
const detalleSub = document.getElementById("resumen-detalle-sub");
const detalleTabla = document.getElementById("resumen-detalle-tabla");
const detalleEmpty = document.getElementById("resumen-detalle-empty");
const btnCerrarDetalle = document.getElementById("btn-cerrar-resumen-detalle");

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});
function fmtNum2(n) { return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(n) || 0); }

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

function selectEstadoHtml(id, estadoActual) {
  const opciones = Object.entries(ESTADO_LABELS)
    .map(([v, l]) => `<option value="${v}"${v === estadoActual ? " selected" : ""}>${l}</option>`)
    .join("");
  return `<select class="estado-select" data-estado-id="${id}" title="Cambiar estado">${opciones}</select>`;
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
  { th: "Estado", cell: (c) => selectEstadoHtml(c.id, c.estado || "borrador") },
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

// ---------- Inventario y compras ----------
function actualizarInventario() {
  const mes = mesActualISO();
  const stockProds = prodCache.filter((p) => p.controlStock !== false);
  const bajo = stockProds.filter((p) => (Number(p.stockMinimo) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.stockMinimo) || 0)).length;
  const valor = stockProds.reduce((s, p) => s + (Number(p.stock) || 0) * (Number(p.costo) || 0), 0);
  const ocEmit = ocCache.filter((o) => o.estado !== "ANULADA").length;
  const ocMes = ocCache.filter((o) => o.estado !== "ANULADA" && String(o.fecha || "").slice(0, 7) === mes).reduce((s, o) => s + (o.total || 0), 0);
  if (elInvBajo) elInvBajo.textContent = bajo;
  if (elInvValor) elInvValor.textContent = formatoCLP.format(valor);
  if (elOcEmitidas) elOcEmitidas.textContent = ocEmit;
  if (elOcMes) elOcMes.textContent = formatoCLP.format(ocMes);
}

function mostrarTablaInv(title, sub, headers, filas) {
  metricaAbierta = null;
  detalleTitle.textContent = title;
  detalleSub.textContent = sub || "";
  if (!filas.length) { detalleTabla.innerHTML = ""; detalleEmpty.classList.remove("hidden"); }
  else {
    detalleEmpty.classList.add("hidden");
    const thead = `<thead><tr>${headers.map((h) => `<th class="${h.num ? "col-num" : ""}">${h.t}</th>`).join("")}</tr></thead>`;
    detalleTabla.innerHTML = `<table class="data-table">${thead}<tbody>${filas.join("")}</tbody></table>`;
  }
  modalDetalle.classList.remove("hidden");
}

function abrirDetalleInv(tipo) {
  const mes = mesActualISO();
  if (tipo === "bajoStock") {
    const rows = prodCache.filter((p) => p.controlStock !== false && (Number(p.stockMinimo) || 0) > 0 && (Number(p.stock) || 0) <= (Number(p.stockMinimo) || 0))
      .sort((a, b) => (a.stock || 0) - (b.stock || 0));
    const filas = rows.map((p) => `<tr><td class="cell-mono">${escapeHtml(p.codigoInterno || "")}</td><td>${escapeHtml(p.descripcion || "")}</td><td class="col-num cell-mono" style="color:var(--red);font-weight:700">${fmtNum2(p.stock || 0)}</td><td class="col-num cell-mono">${fmtNum2(p.stockMinimo || 0)}</td></tr>`);
    mostrarTablaInv("Productos bajo stock", `${rows.length} producto(s) en o bajo su mínimo.`, [{ t: "Código" }, { t: "Descripción" }, { t: "Stock", num: true }, { t: "Mínimo", num: true }], filas);
  } else if (tipo === "valor") {
    const rows = prodCache.filter((p) => p.controlStock !== false && (Number(p.stock) || 0) > 0)
      .map((p) => ({ p, valor: (Number(p.stock) || 0) * (Number(p.costo) || 0) }))
      .sort((a, b) => b.valor - a.valor);
    const total = rows.reduce((s, r) => s + r.valor, 0);
    const filas = rows.map(({ p, valor }) => `<tr><td class="cell-mono">${escapeHtml(p.codigoInterno || "")}</td><td>${escapeHtml(p.descripcion || "")}</td><td class="col-num cell-mono">${fmtNum2(p.stock || 0)}</td><td class="col-num cell-mono">${formatoCLP.format(p.costo || 0)}</td><td class="col-num cell-mono">${formatoCLP.format(valor)}</td></tr>`);
    mostrarTablaInv("Valor de inventario", `Total valorizado ${formatoCLP.format(total)} (stock × costo).`, [{ t: "Código" }, { t: "Descripción" }, { t: "Stock", num: true }, { t: "Costo", num: true }, { t: "Valor", num: true }], filas);
  } else if (tipo === "ocEmitidas" || tipo === "ocMes") {
    let rows = ocCache.filter((o) => o.estado !== "ANULADA");
    if (tipo === "ocMes") rows = rows.filter((o) => String(o.fecha || "").slice(0, 7) === mes);
    rows = rows.slice().sort((a, b) => (b.folio || "").localeCompare(a.folio || ""));
    const total = rows.reduce((s, o) => s + (o.total || 0), 0);
    const filas = rows.map((o) => `<tr><td class="cell-mono">${escapeHtml(o.folio || "")}</td><td>${escapeHtml(o.proveedorNombre || "-")}</td><td>${formatoFecha(o.fecha)}</td><td class="col-num cell-mono">${formatoCLP.format(o.total || 0)}</td></tr>`);
    mostrarTablaInv(tipo === "ocMes" ? "Comprado del mes" : "Órdenes emitidas", `${rows.length} orden(es), total ${formatoCLP.format(total)}.`, [{ t: "Folio" }, { t: "Proveedor" }, { t: "Fecha" }, { t: "Total", num: true }], filas);
  }
}

// Click en una tarjeta -> abre su detalle (inventario o cotización)
document.querySelectorAll(".stat-card-clickable").forEach((card) => {
  const run = () => { if (card.dataset.inv) abrirDetalleInv(card.dataset.inv); else renderDetalle(card.dataset.metrica); };
  card.addEventListener("click", run);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); run(); } });
});

// Click en "Abrir" dentro del detalle -> abre la cotización en su editor
detalleTabla.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-abrir-id]");
  if (!btn) return;
  cerrarDetalle();
  abrirCotizacionPorId(btn.dataset.abrirId);
});

// Cambio de estado inline dentro del detalle
detalleTabla.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-estado-id]");
  if (!sel) return;
  actualizarEstadoCotizacion(sel.dataset.estadoId, sel.value);
});

btnCerrarDetalle.addEventListener("click", cerrarDetalle);
modalDetalle.addEventListener("click", (e) => {
  if (e.target === modalDetalle) cerrarDetalle();
});

// ---------- Suscripción en tiempo real ----------
window.addEventListener("empresa-ready", () => {
  onSnapshot(colE("cotizaciones"), (snap) => {
    cotsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarResumen(cotsCache);
  }, (err) => console.error("Error leyendo resumen:", err));

  onSnapshot(colE("productos"), (snap) => {
    prodCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarInventario();
  }, (err) => console.error("Error leyendo productos (resumen):", err));

  onSnapshot(colE("ordenescompra"), (snap) => {
    ocCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarInventario();
  }, (err) => console.error("Error leyendo OC (resumen):", err));
}, { once: true });
