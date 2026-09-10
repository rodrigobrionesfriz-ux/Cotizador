import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= PLANTILLA EDITABLE DE IMPRESIÓN DE COTIZACIONES =================
// La configuración se guarda en configuracion/plantillaCotizacion y la comparte
// tanto la impresión real (cotizaciones.js) como la vista previa de Configuración.

const DEFAULTS = {
  titulo: "COTIZACIÓN",
  folioPrefijo: "F-",
  folioDigitos: 6,
  colorPrincipal: "#1F2A38",
  mostrarLogo: true,
  colCodigo: true,
  colUM: true,
  colDescuento: false,
  mostrarObservaciones: true,
  textoVigencia: "Cotización válida por {dias} días, hasta el {fecha}. Precios en pesos chilenos (CLP), valores netos, IVA incluido en el total.",
  notaPie: "",
  condiciones: ""
};

let plantillaActual = { ...DEFAULTS };
let empresaActual = {};

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function multilinea(str) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}
function formatoFolioPlantilla(n, prefijo, digitos) {
  if (n == null) return "BORRADOR (sin folio)";
  const d = Math.max(1, Math.min(10, Number(digitos) || 6));
  return (prefijo || "") + String(n).padStart(d, "0");
}
function formatoFecha(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

// ---------- Constructor del documento (usado por impresión real y vista previa) ----------
export function construirHtmlCotizacion(datos, plantilla = plantillaActual, empresa = empresaActual) {
  const pl = { ...DEFAULTS, ...(plantilla || {}) };
  const emp = empresa || {};
  const color = pl.colorPrincipal || "#1F2A38";

  const cliente = datos.cliente || {};
  const folioTexto = formatoFolioPlantilla(datos.folio, pl.folioPrefijo, pl.folioDigitos);

  // Columnas del detalle según los interruptores de la plantilla
  const cols = [];
  if (pl.colCodigo) cols.push({ h: "Código", align: "left", val: (it) => escapeHtml(it.codigo || "") });
  cols.push({ h: "Descripción", align: "left", val: (it) => escapeHtml(it.descripcion || "") });
  if (pl.colUM) cols.push({ h: "UM", align: "center", val: (it) => escapeHtml(it.unidad || "—") });
  cols.push({ h: "Cant.", align: "right", val: (it) => it.cantidad });
  cols.push({ h: "Precio unit.", align: "right", val: (it) => formatoCLP.format(it.precio) });
  if (pl.colDescuento) cols.push({ h: "Desc. %", align: "right", val: (it) => `${it.descuentoItem || 0}%` });
  cols.push({ h: "Total neto", align: "right", val: (it) => formatoCLP.format(it.cantidad * it.precio * (1 - (it.descuentoItem || 0) / 100)) });

  const thead = `<tr style="background:${color}; color:#fff; text-align:left;">${
    cols.map((c) => `<th style="padding:7px 8px; text-align:${c.align};">${c.h}</th>`).join("")
  }</tr>`;

  const filas = (datos.items || []).map((it) =>
    `<tr>${cols.map((c) =>
      `<td style="padding:6px 8px; border-bottom:1px solid #EEE; text-align:${c.align};">${c.val(it)}</td>`
    ).join("")}</tr>`
  ).join("");

  const datosCliente = [
    cliente.rut ? `<strong>RUT:</strong> ${escapeHtml(cliente.rut)}` : "",
    cliente.giro ? `<strong>Giro:</strong> ${escapeHtml(cliente.giro)}` : "",
    cliente.direccion ? `<strong>Dirección:</strong> ${escapeHtml(cliente.direccion)}` : "",
    (cliente.comuna || cliente.region) ? `<strong>Comuna:</strong> ${escapeHtml([cliente.comuna, cliente.region].filter(Boolean).join(", "))}` : "",
    cliente.contacto ? `<strong>Contacto:</strong> ${escapeHtml(cliente.contacto)}` : "",
    cliente.telefono ? `<strong>Teléfono:</strong> ${escapeHtml(cliente.telefono)}` : "",
    cliente.email ? `<strong>Email:</strong> ${escapeHtml(cliente.email)}` : ""
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const obraTexto = [
    datos.obraNombre ? `<strong>Obra:</strong> ${escapeHtml(datos.obraNombre)}` : "",
    datos.obraReferencia ? `<strong>Referencia:</strong> ${escapeHtml(datos.obraReferencia)}` : ""
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const vigencia = String(pl.textoVigencia || "")
    .replace(/\{dias\}/g, datos.vigenciaDias)
    .replace(/\{fecha\}/g, formatoFecha(datos.fechaVigencia));

  return `
    <div style="font-family: Arial, sans-serif; color:#1a1a1a; padding: 24px; max-width: 800px; margin: 0 auto;">

      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid ${color}; padding-bottom:14px; margin-bottom:18px;">
        <div>
          ${pl.mostrarLogo && emp.logoBase64 ? `<img src="${emp.logoBase64}" style="max-height:64px; margin-bottom:8px;">` : ""}
          <div style="font-weight:bold; font-size:15px;">${escapeHtml(emp.nombre || "Empresa no configurada")}</div>
          ${emp.rut ? `<div style="font-size:12px; color:#555;">RUT: ${escapeHtml(emp.rut)}</div>` : ""}
          ${emp.giro ? `<div style="font-size:12px; color:#555;">${escapeHtml(emp.giro)}</div>` : ""}
          ${emp.direccion ? `<div style="font-size:12px; color:#555;">${escapeHtml(emp.direccion)}</div>` : ""}
          <div style="font-size:12px; color:#555;">${escapeHtml(emp.telefono || "")}${emp.email ? " · " + escapeHtml(emp.email) : ""}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px; font-weight:bold; letter-spacing:0.04em; color:${color};">${escapeHtml(pl.titulo || "COTIZACIÓN")}</div>
          <div style="font-size:15px; font-weight:bold; color:${color}; margin-top:2px;">${folioTexto}</div>
          <div style="font-size:12px; color:#555; margin-top:4px;">Fecha: ${formatoFecha(datos.fecha)}</div>
        </div>
      </div>

      <div style="background:#F4F5F7; border:1px solid #E2E5EA; border-radius:4px; padding:12px 14px; margin-bottom:18px; font-size:12.5px; line-height:1.6;">
        <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">${escapeHtml(cliente.razonSocial || "")}</div>
        ${datosCliente ? `<div style="color:#444;">${datosCliente}</div>` : ""}
        ${obraTexto ? `<div style="color:#444; margin-top:4px;">${obraTexto}</div>` : ""}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
        <thead>${thead}</thead>
        <tbody>${filas}</tbody>
      </table>

      <div style="display:flex; justify-content:flex-end;">
        <table style="font-size:13px; width:280px;">
          <tr><td style="padding:3px 0;">Neto</td><td style="text-align:right;">${formatoCLP.format(datos.neto || 0)}</td></tr>
          ${datos.descuentoMonto > 0 ? `<tr><td style="padding:3px 0;">Descuento (${datos.descuentoPct}%)</td><td style="text-align:right;">- ${formatoCLP.format(datos.descuentoMonto)}</td></tr>` : ""}
          <tr><td style="padding:3px 0;">IVA (19%)</td><td style="text-align:right;">${formatoCLP.format(datos.iva || 0)}</td></tr>
          <tr style="font-weight:bold; border-top:1px solid ${color};"><td style="padding:6px 0;">Total</td><td style="text-align:right;">${formatoCLP.format(datos.total || 0)}</td></tr>
        </table>
      </div>

      ${pl.mostrarObservaciones && datos.observaciones ? `<div style="margin-top:18px; font-size:12px;"><strong>Observaciones:</strong><br>${multilinea(datos.observaciones)}</div>` : ""}

      ${pl.condiciones ? `<div style="margin-top:18px; font-size:11.5px; color:#333;"><strong>Condiciones:</strong><br>${multilinea(pl.condiciones)}</div>` : ""}

      <div style="margin-top:24px; font-size:12px; color:#333; border-top:1px solid #E2E5EA; padding-top:12px;">
        ${escapeHtml(vigencia)}
        ${pl.notaPie ? `<div style="margin-top:6px; color:#666; font-size:11px;">${multilinea(pl.notaPie)}</div>` : ""}
      </div>

    </div>
  `;
}

// ================= CONFIGURACIÓN (formulario en la vista Configuración) =================

const campos = {
  titulo: "pl-titulo",
  folioPrefijo: "pl-folio-prefijo",
  folioDigitos: "pl-folio-digitos",
  colorPrincipal: "pl-color",
  mostrarLogo: "pl-mostrar-logo",
  colCodigo: "pl-col-codigo",
  colUM: "pl-col-um",
  colDescuento: "pl-col-descuento",
  mostrarObservaciones: "pl-mostrar-obs",
  textoVigencia: "pl-vigencia",
  notaPie: "pl-nota",
  condiciones: "pl-condiciones"
};

const checks = ["mostrarLogo", "colCodigo", "colUM", "colDescuento", "mostrarObservaciones"];

function llenarFormulario(p) {
  Object.entries(campos).forEach(([clave, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (checks.includes(clave)) el.checked = !!p[clave];
    else el.value = p[clave] ?? "";
  });
}

function leerFormulario() {
  const p = { ...DEFAULTS };
  Object.entries(campos).forEach(([clave, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (checks.includes(clave)) p[clave] = el.checked;
    else if (clave === "folioDigitos") p[clave] = Number(el.value) || DEFAULTS.folioDigitos;
    else p[clave] = el.value;
  });
  return p;
}

function datosDemo() {
  const items = [
    { codigo: "MAT-ELE-002", descripcion: "Cable eléctrico THHN/EVA 2,5 mm²", unidad: "M", cantidad: 120, precio: 800, descuentoItem: 0 },
    { codigo: "MAT-ELE-032", descripcion: "Tomacorriente doble con tierra", unidad: "UN", cantidad: 25, precio: 3500, descuentoItem: 0 },
    { codigo: "MO-001", descripcion: "Instalación de punto eléctrico", unidad: "UN", cantidad: 25, precio: 15000, descuentoItem: 5 }
  ];
  const neto = items.reduce((s, it) => s + it.cantidad * it.precio * (1 - (it.descuentoItem || 0) / 100), 0);
  const iva = neto * 0.19;
  return {
    folio: 123,
    cliente: {
      razonSocial: "Cliente de ejemplo Ltda.", rut: "76.543.210-9", giro: "Construcción",
      direccion: "Av. Siempre Viva 123", comuna: "Angol", region: "Araucanía",
      contacto: "Juan Pérez", telefono: "+56 9 1234 5678", email: "cliente@ejemplo.cl"
    },
    obraNombre: "Bodega norte", obraReferencia: "Ampliación galpón",
    fecha: new Date().toISOString().slice(0, 10),
    vigenciaDias: 15,
    fechaVigencia: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    items,
    neto, descuentoPct: 0, descuentoMonto: 0, iva, total: neto + iva,
    observaciones: "Ejemplo de observaciones para la vista previa."
  };
}

const btnGuardar = document.getElementById("btn-guardar-plantilla");
const btnPreview = document.getElementById("btn-preview-plantilla");
const msgGuardado = document.getElementById("plantilla-guardado-msg");

if (btnGuardar) {
  btnGuardar.addEventListener("click", async () => {
    try {
      await setDoc(doc(db, "configuracion", "plantillaCotizacion"), leerFormulario(), { merge: true });
      if (msgGuardado) {
        msgGuardado.classList.remove("hidden");
        setTimeout(() => msgGuardado.classList.add("hidden"), 3000);
      }
    } catch (err) {
      console.error("Error guardando la plantilla:", err);
      alert("No se pudo guardar el formato. Revisa la consola para más detalles.");
    }
  });
}

if (btnPreview) {
  btnPreview.addEventListener("click", () => {
    const printArea = document.getElementById("cotizacion-print-area");
    const proformaArea = document.getElementById("proforma-print-area");
    if (proformaArea) proformaArea.innerHTML = "";
    // Usa los valores actuales del formulario (permite previsualizar cambios sin guardar)
    printArea.innerHTML = construirHtmlCotizacion(datosDemo(), leerFormulario());
    window.print();
  });
}

// ---------- Suscripción en tiempo real ----------
window.addEventListener("auth-ready", () => {
  onSnapshot(doc(db, "configuracion", "empresa"), (snap) => {
    empresaActual = snap.exists() ? snap.data() : {};
  }, (err) => console.error("Error leyendo empresa (plantilla):", err));

  onSnapshot(doc(db, "configuracion", "plantillaCotizacion"), (snap) => {
    plantillaActual = { ...DEFAULTS, ...(snap.exists() ? snap.data() : {}) };
    llenarFormulario(plantillaActual);
  }, (err) => console.error("Error leyendo plantilla:", err));
}, { once: true });
