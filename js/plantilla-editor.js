import { docE } from "./tenant.js";
import {
  setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= EDITOR VISUAL DE LA PLANTILLA DE COTIZACIÓN =================
// Lienzo tamaño hoja (A4 a 96dpi) con bloques que se arrastran y redimensionan.
// El layout (posición + estilo de cada bloque) se guarda en configuracion/plantillaCotizacion
// y lo usa la impresión real. Los mismos bloques renderizan su contenido con datos reales.

const PAGE_W = 794;   // A4 ancho aprox. a 96dpi
const PAGE_H = 1123;  // A4 alto aprox. a 96dpi
const GRID = 2;

const FUENTES = [
  ["Arial, sans-serif", "Arial"],
  ["Helvetica, Arial, sans-serif", "Helvetica"],
  ["Verdana, sans-serif", "Verdana"],
  ["'Trebuchet MS', sans-serif", "Trebuchet MS"],
  ["Georgia, serif", "Georgia"],
  ["'Times New Roman', serif", "Times New Roman"],
  ["'Courier New', monospace", "Courier New"]
];

// Bloques disponibles: uno por tipo (salvo "texto", que admite varios)
const TIPOS = {
  logo: "Logo",
  empresa: "Datos de la empresa",
  titulo: "Título",
  folio: "Folio",
  fecha: "Fecha",
  cliente: "Ficha del cliente",
  items: "Tabla de ítems",
  totales: "Totales (neto/IVA/total)",
  observaciones: "Observaciones",
  condiciones: "Condiciones",
  vigencia: "Vigencia / nota al pie",
  texto: "Texto libre"
};

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function multilinea(str) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}
function formatoFecha(iso) {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}
function formatoFolio(n, prefijo, digitos) {
  if (n == null) return "BORRADOR (sin folio)";
  const d = Math.max(1, Math.min(10, Number(digitos) || 6));
  return (prefijo || "") + String(n).padStart(d, "0");
}

// ---------- Layout por defecto ----------
export function defaultLayout() {
  const B = (id, tipo, x, y, w, h, estilo = {}, contenido) => ({ id, tipo, x, y, w, h, estilo, contenido });
  return {
    pageW: PAGE_W, pageH: PAGE_H,
    blocks: [
      B("b_logo", "logo", 24, 24, 130, 64, {}),
      B("b_empresa", "empresa", 24, 96, 320, 84, { fontSize: 12 }),
      B("b_titulo", "titulo", 500, 24, 270, 34, { fontSize: 22, bold: true, align: "right" }),
      B("b_folio", "folio", 500, 60, 270, 22, { fontSize: 15, bold: true, align: "right" }),
      B("b_fecha", "fecha", 500, 84, 270, 18, { fontSize: 12, align: "right", color: "#555555" }),
      B("b_cliente", "cliente", 24, 196, 746, 74, { fontSize: 12 }),
      B("b_items", "items", 24, 284, 746, 240, { fontSize: 12 }),
      B("b_totales", "totales", 514, 540, 256, 110, { fontSize: 13 }),
      B("b_obs", "observaciones", 24, 540, 470, 90, { fontSize: 12 }),
      B("b_cond", "condiciones", 24, 660, 746, 80, { fontSize: 11 }),
      B("b_vig", "vigencia", 24, 1040, 746, 60, { fontSize: 12, color: "#333333" })
    ]
  };
}

// ---------- Datos de ejemplo para el editor / vista previa ----------
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
    items, neto, descuentoPct: 0, descuentoMonto: 0, iva, total: neto + iva,
    observaciones: "Ejemplo de observaciones para la vista previa."
  };
}

// ---------- Contenido de cada bloque (compartido por editor e impresión) ----------
function contenidoBloque(b, datos, plantilla, empresa) {
  const pl = plantilla || {};
  const emp = empresa || {};
  const color = pl.colorPrincipal || "#1F2A38";
  const cliente = datos.cliente || {};

  switch (b.tipo) {
    case "logo":
      return emp.logoBase64
        ? `<img src="${emp.logoBase64}" style="max-width:100%; max-height:100%; object-fit:contain;">`
        : `<div style="border:1px dashed #bbb; color:#999; text-align:center; padding:14px 4px; font-size:11px;">LOGO</div>`;

    case "empresa":
      return `
        <div style="font-weight:bold; font-size:1.15em;">${escapeHtml(emp.nombre || "Empresa no configurada")}</div>
        ${emp.rut ? `<div>RUT: ${escapeHtml(emp.rut)}</div>` : ""}
        ${emp.giro ? `<div>${escapeHtml(emp.giro)}</div>` : ""}
        ${emp.direccion ? `<div>${escapeHtml(emp.direccion)}</div>` : ""}
        ${(emp.telefono || emp.email) ? `<div>${escapeHtml(emp.telefono || "")}${emp.email ? " · " + escapeHtml(emp.email) : ""}</div>` : ""}`;

    case "titulo":
      return `<div style="color:${color};">${escapeHtml(pl.titulo || "COTIZACIÓN")}</div>`;

    case "folio":
      return `<div style="color:${color};">${formatoFolio(datos.folio, pl.folioPrefijo, pl.folioDigitos)}</div>`;

    case "fecha":
      return `Fecha: ${formatoFecha(datos.fecha)}`;

    case "cliente": {
      const detalle = [
        cliente.rut ? `<strong>RUT:</strong> ${escapeHtml(cliente.rut)}` : "",
        cliente.giro ? `<strong>Giro:</strong> ${escapeHtml(cliente.giro)}` : "",
        cliente.direccion ? `<strong>Dirección:</strong> ${escapeHtml(cliente.direccion)}` : "",
        (cliente.comuna || cliente.region) ? `<strong>Comuna:</strong> ${escapeHtml([cliente.comuna, cliente.region].filter(Boolean).join(", "))}` : "",
        cliente.contacto ? `<strong>Contacto:</strong> ${escapeHtml(cliente.contacto)}` : "",
        cliente.telefono ? `<strong>Tel:</strong> ${escapeHtml(cliente.telefono)}` : "",
        cliente.email ? `<strong>Email:</strong> ${escapeHtml(cliente.email)}` : ""
      ].filter(Boolean).join(" &nbsp;·&nbsp; ");
      const obra = [
        datos.obraNombre ? `<strong>Obra:</strong> ${escapeHtml(datos.obraNombre)}` : "",
        datos.obraReferencia ? `<strong>Referencia:</strong> ${escapeHtml(datos.obraReferencia)}` : ""
      ].filter(Boolean).join(" &nbsp;·&nbsp; ");
      return `
        <div style="background:#F4F5F7; border:1px solid #E2E5EA; border-radius:4px; padding:10px 12px; line-height:1.5;">
          <div style="font-weight:bold;">${escapeHtml(cliente.razonSocial || "")}</div>
          ${detalle ? `<div>${detalle}</div>` : ""}
          ${obra ? `<div style="margin-top:3px;">${obra}</div>` : ""}
        </div>`;
    }

    case "items": {
      const cols = [];
      if (pl.colCodigo !== false) cols.push({ h: "Código", a: "left", v: (it) => escapeHtml(it.codigo || "") });
      cols.push({ h: "Descripción", a: "left", v: (it) => escapeHtml(it.descripcion || "") });
      if (pl.colUM !== false) cols.push({ h: "UM", a: "center", v: (it) => escapeHtml(it.unidad || "—") });
      cols.push({ h: "Cant.", a: "right", v: (it) => it.cantidad });
      cols.push({ h: "Precio unit.", a: "right", v: (it) => formatoCLP.format(it.precio) });
      if (pl.colDescuento) cols.push({ h: "Desc. %", a: "right", v: (it) => `${it.descuentoItem || 0}%` });
      cols.push({ h: "Total neto", a: "right", v: (it) => formatoCLP.format(it.cantidad * it.precio * (1 - (it.descuentoItem || 0) / 100)) });
      const thead = `<tr style="background:${color}; color:#fff;">${cols.map((c) => `<th style="padding:6px 8px; text-align:${c.a};">${c.h}</th>`).join("")}</tr>`;
      const filas = (datos.items || []).map((it) =>
        `<tr>${cols.map((c) => `<td style="padding:5px 8px; border-bottom:1px solid #EEE; text-align:${c.a};">${c.v(it)}</td>`).join("")}</tr>`
      ).join("");
      return `<table style="width:100%; border-collapse:collapse; font-size:inherit;"><thead>${thead}</thead><tbody>${filas}</tbody></table>`;
    }

    case "totales":
      return `
        <table style="width:100%; font-size:inherit;">
          <tr><td style="padding:2px 0;">Neto</td><td style="text-align:right;">${formatoCLP.format(datos.neto || 0)}</td></tr>
          ${datos.descuentoMonto > 0 ? `<tr><td style="padding:2px 0;">Descuento (${datos.descuentoPct}%)</td><td style="text-align:right;">- ${formatoCLP.format(datos.descuentoMonto)}</td></tr>` : ""}
          <tr><td style="padding:2px 0;">IVA (19%)</td><td style="text-align:right;">${formatoCLP.format(datos.iva || 0)}</td></tr>
          <tr style="font-weight:bold; border-top:1px solid ${color};"><td style="padding:5px 0;">Total</td><td style="text-align:right;">${formatoCLP.format(datos.total || 0)}</td></tr>
        </table>`;

    case "observaciones":
      return datos.observaciones ? `<strong>Observaciones:</strong><br>${multilinea(datos.observaciones)}` : `<span style="color:#aaa;">(Observaciones de la cotización)</span>`;

    case "condiciones":
      return pl.condiciones ? `<strong>Condiciones:</strong><br>${multilinea(pl.condiciones)}` : `<span style="color:#aaa;">(Condiciones / términos)</span>`;

    case "vigencia": {
      const vig = String(pl.textoVigencia || "Cotización válida por {dias} días, hasta el {fecha}.")
        .replace(/\{dias\}/g, datos.vigenciaDias).replace(/\{fecha\}/g, formatoFecha(datos.fechaVigencia));
      return `${escapeHtml(vig)}${pl.notaPie ? `<div style="margin-top:4px; color:#666; font-size:0.9em;">${multilinea(pl.notaPie)}</div>` : ""}`;
    }

    case "texto":
      return multilinea(b.contenido || "Texto libre");

    default:
      return "";
  }
}

function estiloBloque(b, extra = "") {
  const e = b.estilo || {};
  return [
    "position:absolute",
    `left:${b.x}px`, `top:${b.y}px`, `width:${b.w}px`,
    b.tipo !== "items" && b.h ? `min-height:${b.h}px` : "",
    `font-family:${e.fontFamily || "Arial, sans-serif"}`,
    `font-size:${e.fontSize || 12}px`,
    `color:${e.color || "#1a1a1a"}`,
    `text-align:${e.align || "left"}`,
    `font-weight:${e.bold ? "bold" : "normal"}`,
    `font-style:${e.italic ? "italic" : "normal"}`,
    "line-height:1.4",
    extra
  ].filter(Boolean).join(";");
}

// ---------- Render para impresión (usado por plantilla.js) ----------
export function renderLayoutHtml(datos, plantilla, empresa) {
  const L = (plantilla && plantilla.layout && Array.isArray(plantilla.layout.blocks) && plantilla.layout.blocks.length)
    ? plantilla.layout : defaultLayout();
  const inner = (L.blocks || []).map((b) =>
    `<div style="${estiloBloque(b)}">${contenidoBloque(b, datos, plantilla, empresa)}</div>`
  ).join("");
  return `<div style="position:relative; width:${L.pageW || PAGE_W}px; min-height:${L.pageH || PAGE_H}px; margin:0 auto; background:#fff;">${inner}</div>`;
}

// ================= UI DEL EDITOR =================

let estado = { config: {}, empresa: {}, layout: null, selId: null, built: false };
let backdrop;

function nuevoId() { return "b_" + Math.random().toString(36).slice(2, 8); }

function construirModal() {
  backdrop = document.createElement("div");
  backdrop.id = "pl-editor-backdrop";
  backdrop.className = "pl-editor-backdrop hidden";
  backdrop.innerHTML = `
    <div class="pl-editor">
      <div class="pl-editor-bar">
        <strong>Editor visual de la plantilla</strong>
        <div class="pl-editor-bar-actions">
          <button type="button" class="btn btn-ghost btn-small" id="pl-ed-preview">Vista previa</button>
          <button type="button" class="btn btn-ghost btn-small" id="pl-ed-reset">Restablecer</button>
          <button type="button" class="btn btn-primary btn-small" id="pl-ed-save">Guardar</button>
          <button type="button" class="btn btn-ghost btn-small" id="pl-ed-close">Cerrar</button>
        </div>
      </div>
      <div class="pl-editor-body">
        <div class="pl-editor-side">
          <div class="pl-side-title">Agregar bloque</div>
          <div id="pl-palette" class="pl-palette"></div>
          <div class="pl-side-title">Propiedades</div>
          <div id="pl-props" class="pl-props"><p class="muted">Selecciona un bloque en el lienzo.</p></div>
          <p class="muted pl-help">Arrastra para mover. Usa la esquina para redimensionar. La hoja es tamaño A4.</p>
        </div>
        <div class="pl-canvas-wrap">
          <div id="pl-canvas" class="pl-canvas"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  // Paleta
  const palette = backdrop.querySelector("#pl-palette");
  palette.innerHTML = Object.entries(TIPOS).map(([t, l]) =>
    `<button type="button" class="pl-add" data-tipo="${t}">+ ${l}</button>`).join("");
  palette.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tipo]");
    if (btn) agregarBloque(btn.dataset.tipo);
  });

  backdrop.querySelector("#pl-ed-close").addEventListener("click", cerrar);
  backdrop.querySelector("#pl-ed-save").addEventListener("click", guardar);
  backdrop.querySelector("#pl-ed-reset").addEventListener("click", () => {
    if (confirm("¿Restablecer el diseño por defecto? Perderás los cambios no guardados.")) {
      estado.layout = defaultLayout(); estado.selId = null; render();
    }
  });
  backdrop.querySelector("#pl-ed-preview").addEventListener("click", vistaPrevia);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cerrar(); });

  estado.built = true;
}

export function abrirEditorPlantilla(config, empresa) {
  if (!estado.built) construirModal();
  estado.config = config || {};
  estado.empresa = empresa || {};
  const base = (config && config.layout && Array.isArray(config.layout.blocks) && config.layout.blocks.length)
    ? config.layout : defaultLayout();
  estado.layout = JSON.parse(JSON.stringify(base)); // copia editable
  estado.selId = null;
  render();
  backdrop.classList.remove("hidden");
}

function cerrar() { if (backdrop) backdrop.classList.add("hidden"); }

function agregarBloque(tipo) {
  if (tipo !== "texto" && estado.layout.blocks.some((b) => b.tipo === tipo)) {
    alert("Ese bloque ya existe en la hoja. Solo se permite uno (excepto Texto libre).");
    return;
  }
  const b = {
    id: nuevoId(), tipo, x: 40, y: 40, w: tipo === "items" ? 700 : 240, h: tipo === "items" ? 200 : 60,
    estilo: { fontSize: 12 }, contenido: tipo === "texto" ? "Texto libre" : ""
  };
  estado.layout.blocks.push(b);
  estado.selId = b.id;
  render();
}

const demo = datosDemo();

function render() {
  const canvas = backdrop.querySelector("#pl-canvas");
  const L = estado.layout;
  canvas.style.width = (L.pageW || PAGE_W) + "px";
  canvas.style.height = (L.pageH || PAGE_H) + "px";
  canvas.innerHTML = "";

  L.blocks.forEach((b) => {
    const el = document.createElement("div");
    el.className = "pl-block" + (b.id === estado.selId ? " selected" : "");
    el.dataset.id = b.id;
    el.setAttribute("style", estiloBloque(b, "cursor:move; box-sizing:border-box;"));
    el.innerHTML =
      `<div class="pl-block-label">${TIPOS[b.tipo] || b.tipo}</div>` +
      `<div class="pl-block-content">${contenidoBloque(b, demo, estado.config, estado.empresa)}</div>` +
      `<div class="pl-resize"></div>`;
    canvas.appendChild(el);
    hacerInteractivo(el, b);
  });

  renderProps();
}

function hacerInteractivo(el, b) {
  el.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("pl-resize")) return; // lo maneja el resize
    estado.selId = b.id;
    marcarSeleccion();
    renderProps();
    const sx = e.clientX, sy = e.clientY, ox = b.x, oy = b.y;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      b.x = Math.max(0, Math.min(estado.layout.pageW - 20, ox + (ev.clientX - sx)));
      b.y = Math.max(0, Math.min(estado.layout.pageH - 20, oy + (ev.clientY - sy)));
      el.style.left = Math.round(b.x / GRID) * GRID + "px";
      el.style.top = Math.round(b.y / GRID) * GRID + "px";
    };
    const up = (ev) => {
      b.x = Math.round(b.x / GRID) * GRID; b.y = Math.round(b.y / GRID) * GRID;
      el.releasePointerCapture(e.pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      renderProps();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });

  const handle = el.querySelector(".pl-resize");
  handle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    estado.selId = b.id; marcarSeleccion(); renderProps();
    const sx = e.clientX, sy = e.clientY, ow = b.w, oh = b.h || 40;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => {
      b.w = Math.max(40, Math.min(estado.layout.pageW - b.x, ow + (ev.clientX - sx)));
      b.h = Math.max(20, oh + (ev.clientY - sy));
      el.style.width = b.w + "px";
      if (b.tipo !== "items") el.style.minHeight = b.h + "px";
    };
    const up = () => {
      b.w = Math.round(b.w / GRID) * GRID; b.h = Math.round(b.h / GRID) * GRID;
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      renderProps();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}

function marcarSeleccion() {
  backdrop.querySelectorAll(".pl-block").forEach((el) =>
    el.classList.toggle("selected", el.dataset.id === estado.selId));
}

function bloqueSel() {
  return estado.layout.blocks.find((b) => b.id === estado.selId);
}

function renderProps() {
  const cont = backdrop.querySelector("#pl-props");
  const b = bloqueSel();
  if (!b) { cont.innerHTML = `<p class="muted">Selecciona un bloque en el lienzo.</p>`; return; }
  const e = b.estilo || (b.estilo = {});
  const fuentesOpts = FUENTES.map(([v, l]) => `<option value="${v}"${(e.fontFamily || "Arial, sans-serif") === v ? " selected" : ""}>${l}</option>`).join("");
  cont.innerHTML = `
    <div class="pl-prop-name">${TIPOS[b.tipo] || b.tipo}</div>
    ${b.tipo === "texto" ? `<label class="pl-prop">Contenido<textarea id="pp-contenido" rows="3">${escapeHtml(b.contenido || "")}</textarea></label>` : ""}
    <label class="pl-prop">Fuente<select id="pp-font">${fuentesOpts}</select></label>
    <div class="pl-prop-row">
      <label class="pl-prop">Tamaño<input type="number" id="pp-size" min="7" max="48" value="${e.fontSize || 12}"></label>
      <label class="pl-prop">Color<input type="color" id="pp-color" value="${e.color || "#1a1a1a"}"></label>
    </div>
    <label class="pl-prop">Alineación
      <select id="pp-align">
        <option value="left"${(e.align || "left") === "left" ? " selected" : ""}>Izquierda</option>
        <option value="center"${e.align === "center" ? " selected" : ""}>Centro</option>
        <option value="right"${e.align === "right" ? " selected" : ""}>Derecha</option>
      </select>
    </label>
    <div class="pl-prop-row">
      <label class="pl-prop-check"><input type="checkbox" id="pp-bold" ${e.bold ? "checked" : ""}> Negrita</label>
      <label class="pl-prop-check"><input type="checkbox" id="pp-italic" ${e.italic ? "checked" : ""}> Cursiva</label>
    </div>
    <div class="pl-prop-row">
      <label class="pl-prop">X<input type="number" id="pp-x" value="${b.x}"></label>
      <label class="pl-prop">Y<input type="number" id="pp-y" value="${b.y}"></label>
    </div>
    <div class="pl-prop-row">
      <label class="pl-prop">Ancho<input type="number" id="pp-w" value="${b.w}"></label>
      <label class="pl-prop">Alto<input type="number" id="pp-h" value="${b.h || 40}"></label>
    </div>
    <button type="button" class="btn btn-ghost btn-small pl-del" id="pp-del">Eliminar bloque</button>
  `;

  const upd = () => aplicarBloque(b);
  const on = (id, ev, fn) => { const el = cont.querySelector(id); if (el) el.addEventListener(ev, fn); };

  on("#pp-contenido", "input", (ev) => { b.contenido = ev.target.value; backdropContent(b); });
  on("#pp-font", "change", (ev) => { e.fontFamily = ev.target.value; upd(); });
  on("#pp-size", "input", (ev) => { e.fontSize = Number(ev.target.value) || 12; upd(); });
  on("#pp-color", "input", (ev) => { e.color = ev.target.value; upd(); });
  on("#pp-align", "change", (ev) => { e.align = ev.target.value; upd(); });
  on("#pp-bold", "change", (ev) => { e.bold = ev.target.checked; upd(); });
  on("#pp-italic", "change", (ev) => { e.italic = ev.target.checked; upd(); });
  on("#pp-x", "input", (ev) => { b.x = Number(ev.target.value) || 0; upd(); });
  on("#pp-y", "input", (ev) => { b.y = Number(ev.target.value) || 0; upd(); });
  on("#pp-w", "input", (ev) => { b.w = Number(ev.target.value) || 40; upd(); });
  on("#pp-h", "input", (ev) => { b.h = Number(ev.target.value) || 40; upd(); });
  on("#pp-del", "click", () => {
    estado.layout.blocks = estado.layout.blocks.filter((x) => x.id !== b.id);
    estado.selId = null; render();
  });
}

// Actualiza solo el contenido de un bloque (para el textarea, sin perder foco)
function backdropContent(b) {
  const el = backdrop.querySelector(`.pl-block[data-id="${b.id}"] .pl-block-content`);
  if (el) el.innerHTML = contenidoBloque(b, demo, estado.config, estado.empresa);
}

// Aplica estilo/posición/tamaño de un bloque a su elemento, sin rehacer el lienzo
function aplicarBloque(b) {
  const el = backdrop.querySelector(`.pl-block[data-id="${b.id}"]`);
  if (!el) { render(); return; }
  el.setAttribute("style", estiloBloque(b, "cursor:move; box-sizing:border-box;"));
  const cont = el.querySelector(".pl-block-content");
  if (cont) cont.innerHTML = contenidoBloque(b, demo, estado.config, estado.empresa);
}

// Normaliza el layout para Firestore: garantiza campos definidos y elimina undefined
function layoutLimpio() {
  const L = estado.layout || defaultLayout();
  const blocks = (L.blocks || []).map((b) => ({
    id: b.id,
    tipo: b.tipo,
    x: Math.round(b.x) || 0,
    y: Math.round(b.y) || 0,
    w: Math.round(b.w) || 40,
    h: Math.round(b.h) || 40,
    estilo: {
      fontFamily: b.estilo?.fontFamily || "Arial, sans-serif",
      fontSize: Number(b.estilo?.fontSize) || 12,
      color: b.estilo?.color || "#1a1a1a",
      align: b.estilo?.align || "left",
      bold: !!b.estilo?.bold,
      italic: !!b.estilo?.italic
    },
    contenido: b.contenido || ""
  }));
  return { pageW: L.pageW || PAGE_W, pageH: L.pageH || PAGE_H, blocks };
}

async function guardar() {
  try {
    await setDoc(docE("configuracion", "plantillaCotizacion"),
      { usarLayout: true, layout: layoutLimpio() }, { merge: true });
    const btn = backdrop.querySelector("#pl-ed-save");
    const prev = btn.textContent;
    btn.textContent = "Guardado ✓";
    setTimeout(() => (btn.textContent = prev), 1800);
  } catch (err) {
    console.error("Error guardando el layout de la plantilla:", err);
    alert("No se pudo guardar el diseño. Revisa la consola para más detalles.");
  }
}

function vistaPrevia() {
  const printArea = document.getElementById("cotizacion-print-area");
  const proformaArea = document.getElementById("proforma-print-area");
  if (proformaArea) proformaArea.innerHTML = "";
  const plantillaPreview = { ...estado.config, layout: estado.layout };
  printArea.innerHTML = renderLayoutHtml(demo, plantillaPreview, estado.empresa);
  window.print();
}
