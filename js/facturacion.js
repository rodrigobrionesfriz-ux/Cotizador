import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const tbody = document.getElementById("facturacion-tbody");
const emptyState = document.getElementById("facturacion-empty");
const searchInput = document.getElementById("facturacion-search");

const facturaModal = document.getElementById("factura-modal");
const facturaForm = document.getElementById("factura-form");
const btnCancelarFactura = document.getElementById("btn-cancelar-factura");

let cotizacionesAceptadas = [];
let empresaInfo = {};

const formatoCLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.addEventListener("auth-ready", () => {
  onSnapshot(doc(db, "configuracion", "empresa"), (snap) => {
    empresaInfo = snap.exists() ? snap.data() : {};
  }, (err) => console.error("Error leyendo datos de empresa:", err));

  const q = query(collection(db, "cotizaciones"), where("estado", "==", "aceptada"));
  onSnapshot(q, (snap) => {
    cotizacionesAceptadas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render(cotizacionesAceptadas);
  }, (err) => console.error("Error leyendo cotizaciones aceptadas:", err));
}, { once: true });

function render(lista) {
  tbody.innerHTML = "";
  if (lista.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  lista.forEach((c) => {
    const tr = document.createElement("tr");
    const proformaCell = c.proformaFolio
      ? `<button class="link-btn" data-action="ver-proforma" data-id="${c.id}">N° ${c.proformaFolio}</button>`
      : `<button class="btn btn-ghost btn-small" data-action="generar-proforma" data-id="${c.id}">Generar</button>`;

    const facturaCell = c.factura && c.factura.folio
      ? `<span class="badge badge-${c.factura.estadoPago === "pagada" ? "aceptada" : "enviada"}">${escapeHtml(c.factura.tipo || "Factura")} N° ${escapeHtml(c.factura.folio)} — ${c.factura.estadoPago === "pagada" ? "Pagada" : "Pendiente"}</span>`
      : `<button class="btn btn-ghost btn-small" data-action="registrar-factura" data-id="${c.id}">Registrar</button>`;

    tr.innerHTML = `
      <td class="cell-mono">${c.folio ?? "—"}</td>
      <td>${escapeHtml(c.clienteNombre || "—")}</td>
      <td class="col-num cell-mono">${formatoCLP.format(c.total || 0)}</td>
      <td>${proformaCell}</td>
      <td>${facturaCell}</td>
      <td class="row-actions"></td>
    `;
    tbody.appendChild(tr);
  });
}

searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return render(cotizacionesAceptadas);
  render(cotizacionesAceptadas.filter((c) =>
    String(c.folio || "").includes(term) ||
    (c.clienteNombre || "").toLowerCase().includes(term)
  ));
});

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const cot = cotizacionesAceptadas.find((c) => c.id === btn.dataset.id);
  if (!cot) return;

  if (btn.dataset.action === "generar-proforma") await generarProforma(cot);
  if (btn.dataset.action === "ver-proforma") imprimirProforma(cot);
  if (btn.dataset.action === "registrar-factura") abrirModalFactura(cot);
});

// ================= PROFORMA =================

async function generarProforma(cot) {
  const contadorRef = doc(db, "contadores", "proformas");
  const folio = await runTransaction(db, async (tx) => {
    const snap = await tx.get(contadorRef);
    const actual = snap.exists() ? (snap.data().ultimoFolio || 0) : 0;
    const siguiente = actual + 1;
    tx.set(contadorRef, { ultimoFolio: siguiente });
    return siguiente;
  });

  const hoy = new Date().toISOString().slice(0, 10);
  await updateDoc(doc(db, "cotizaciones", cot.id), {
    proformaFolio: folio,
    proformaFecha: hoy
  });

  imprimirProforma({ ...cot, proformaFolio: folio, proformaFecha: hoy });
}

function imprimirProforma(cot) {
  const printArea = document.getElementById("proforma-print-area");

  const filasItems = (cot.items || []).map((it) => `
    <tr>
      <td>${escapeHtml(it.codigo)}</td>
      <td>${escapeHtml(it.descripcion)}</td>
      <td style="text-align:right">${it.cantidad}</td>
      <td>${escapeHtml(it.unidad || "")}</td>
      <td style="text-align:right">${formatoCLP.format(it.precio)}</td>
      <td style="text-align:right">${it.descuentoItem || 0}%</td>
      <td style="text-align:right">${formatoCLP.format(it.cantidad * it.precio * (1 - (it.descuentoItem || 0) / 100))}</td>
    </tr>
  `).join("");

  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; color:#1a1a1a; padding: 20px; max-width: 800px; margin: 0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1F2A38; padding-bottom:14px; margin-bottom:20px;">
        <div>
          ${empresaInfo.logoBase64 ? `<img src="${empresaInfo.logoBase64}" style="max-height:60px; margin-bottom:8px;">` : ""}
          <div style="font-weight:bold; font-size:15px;">${escapeHtml(empresaInfo.nombre || "")}</div>
          <div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.rut || "")}</div>
          <div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.direccion || "")}</div>
          <div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.telefono || "")} ${empresaInfo.email ? "· " + escapeHtml(empresaInfo.email) : ""}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px; font-weight:bold;">PROFORMA</div>
          <div style="font-size:13px;">N° ${cot.proformaFolio}</div>
          <div style="font-size:12px; color:#555;">Fecha: ${cot.proformaFecha}</div>
          <div style="font-size:12px; color:#555;">Cotización asociada: N° ${cot.folio}</div>
        </div>
      </div>

      <div style="margin-bottom:16px; font-size:13px;">
        <strong>Cliente:</strong> ${escapeHtml(cot.clienteNombre)} — ${escapeHtml(cot.clienteRut || "")}<br>
        ${cot.obraNombre ? `<strong>Obra:</strong> ${escapeHtml(cot.obraNombre)}<br>` : ""}
        ${cot.obraReferencia ? `<strong>Referencia:</strong> ${escapeHtml(cot.obraReferencia)}<br>` : ""}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:1px solid #ccc; text-align:left;">
            <th style="padding:6px 4px;">Código</th>
            <th style="padding:6px 4px;">Descripción</th>
            <th style="padding:6px 4px; text-align:right;">Cant.</th>
            <th style="padding:6px 4px;">Unidad</th>
            <th style="padding:6px 4px; text-align:right;">Precio</th>
            <th style="padding:6px 4px; text-align:right;">Desc.</th>
            <th style="padding:6px 4px; text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filasItems}</tbody>
      </table>

      <div style="display:flex; justify-content:flex-end;">
        <table style="font-size:13px; width:260px;">
          <tr><td style="padding:3px 0;">Neto</td><td style="text-align:right;">${formatoCLP.format(cot.neto)}</td></tr>
          <tr><td style="padding:3px 0;">Descuento</td><td style="text-align:right;">${formatoCLP.format(cot.descuentoGlobalMonto)}</td></tr>
          <tr><td style="padding:3px 0;">IVA (19%)</td><td style="text-align:right;">${formatoCLP.format(cot.iva)}</td></tr>
          <tr style="font-weight:bold; border-top:1px solid #ccc;"><td style="padding:6px 0;">Total</td><td style="text-align:right;">${formatoCLP.format(cot.total)}</td></tr>
        </table>
      </div>

      ${cot.observaciones ? `<div style="margin-top:20px; font-size:12px;"><strong>Observaciones:</strong><br>${escapeHtml(cot.observaciones)}</div>` : ""}

      <div style="margin-top:30px; font-size:11px; color:#777; border-top:1px solid #eee; padding-top:10px;">
        Documento de uso interno para solicitar la emisión de la factura o boleta correspondiente. No es un documento tributario válido ante el SII.
      </div>
    </div>
  `;

  window.print();
}

// ================= REGISTRO DE FACTURA =================

function abrirModalFactura(cot) {
  document.getElementById("factura-cotizacion-id").value = cot.id;
  document.getElementById("factura-tipo").value = (cot.factura && cot.factura.tipo) || "factura";
  document.getElementById("factura-folio").value = (cot.factura && cot.factura.folio) || "";
  document.getElementById("factura-fecha").value = (cot.factura && cot.factura.fecha) || new Date().toISOString().slice(0, 10);
  document.getElementById("factura-estadoPago").value = (cot.factura && cot.factura.estadoPago) || "pendiente";
  document.getElementById("factura-neto").value = (cot.factura && cot.factura.neto) ?? Math.round(cot.baseIva || 0);
  document.getElementById("factura-iva").value = (cot.factura && cot.factura.iva) ?? Math.round(cot.iva || 0);
  document.getElementById("factura-total").value = (cot.factura && cot.factura.total) ?? Math.round(cot.total || 0);
  facturaModal.classList.remove("hidden");
}

btnCancelarFactura.addEventListener("click", () => facturaModal.classList.add("hidden"));

facturaForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("factura-cotizacion-id").value;

  const factura = {
    tipo: document.getElementById("factura-tipo").value,
    folio: document.getElementById("factura-folio").value.trim(),
    fecha: document.getElementById("factura-fecha").value,
    estadoPago: document.getElementById("factura-estadoPago").value,
    neto: Number(document.getElementById("factura-neto").value) || 0,
    iva: Number(document.getElementById("factura-iva").value) || 0,
    total: Number(document.getElementById("factura-total").value) || 0,
    registradaEl: serverTimestamp()
  };

  try {
    await updateDoc(doc(db, "cotizaciones", id), { factura });
    facturaModal.classList.add("hidden");
  } catch (err) {
    console.error("Error registrando factura:", err);
    alert("No se pudo registrar la factura. Revisa la consola para más detalles.");
  }
});
