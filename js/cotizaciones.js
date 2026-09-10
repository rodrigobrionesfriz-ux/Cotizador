import { db } from "./firebase-config.js";
import { abrirNuevoClienteDesdeExterno } from "./clientes.js";
import { abrirNuevoItemDesdeExterno } from "./catalogo.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const IVA_TASA = 0.19;

// ---------- Elementos: lista ----------
const vistaLista = document.getElementById("cotizaciones-lista");
const vistaEditor = document.getElementById("cotizaciones-editor");
const tbody = document.getElementById("cotizaciones-tbody");
const emptyState = document.getElementById("cotizaciones-empty");
const searchInput = document.getElementById("cotizaciones-search");
const btnNueva = document.getElementById("btn-nueva-cotizacion");
const btnVolver = document.getElementById("btn-volver-lista");

// ---------- Elementos: editor ----------
const folioLabel = document.getElementById("editor-folio-label");
const selectCliente = document.getElementById("cot-cliente");
const inputObra = document.getElementById("cot-obra");
const selectObraId = document.getElementById("cot-obra-id");
const inputFecha = document.getElementById("cot-fecha");
const inputVigencia = document.getElementById("cot-vigencia");
const selectEstado = document.getElementById("cot-estado");
const motivoWrap = document.getElementById("cot-motivo-wrap");
const inputMotivo = document.getElementById("cot-motivo");
const textareaObs = document.getElementById("cot-observaciones");

const pickerItem = document.getElementById("picker-item");
const pickerCantidad = document.getElementById("picker-cantidad");
const btnAgregarItem = document.getElementById("btn-agregar-item");
const btnNuevoClienteInline = document.getElementById("btn-nuevo-cliente-inline");
const btnNuevoItemInline = document.getElementById("btn-nuevo-item-inline");
const itemsTbody = document.getElementById("cot-items-tbody");
const itemsEmpty = document.getElementById("cot-items-empty");

const inputDescuentoGlobal = document.getElementById("cot-descuento-global");
const totNeto = document.getElementById("tot-neto");
const totDescuento = document.getElementById("tot-descuento");
const totIva = document.getElementById("tot-iva");
const totTotal = document.getElementById("tot-total");
const totMargen = document.getElementById("tot-margen");

const btnCancelar = document.getElementById("btn-cancelar-cotizacion");
const btnGuardar = document.getElementById("btn-guardar-cotizacion");
const btnImprimir = document.getElementById("btn-imprimir-cotizacion");

// ---------- Estado local ----------
let cotizaciones = [];
let clientesActivos = [];
let catalogoActivo = [];
let editandoId = null;
let editandoFolio = null;
let lineaItems = []; // filas del editor: { itemId, codigo, descripcion, unidad, cantidad, precio, costo, descuentoItem }
let empresaInfo = {}; // datos de la empresa emisora, para el encabezado de impresión

const formatoCLP = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0
});

// Folio correlativo único en formato F-000001
function formatoFolio(n) {
  return n || n === 0 ? "F-" + String(n).padStart(6, "0") : "—";
}

// Fecha ISO (YYYY-MM-DD) a formato chileno DD-MM-YYYY
function formatoFecha(iso) {
  if (!iso) return "";
  const partes = String(iso).split("-");
  return partes.length === 3 ? `${partes[2]}-${partes[1]}-${partes[0]}` : iso;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ESTADO_LABELS = {
  borrador: "Borrador", enviada: "Enviada", en_revision: "En revisión",
  aceptada: "Aceptada", no_aceptada: "No aceptada", vencida: "Vencida", anulada: "Anulada"
};

// Selector de estado reutilizable (listado de cotizaciones)
function selectEstadoHtml(id, estadoActual) {
  const opciones = Object.entries(ESTADO_LABELS)
    .map(([v, l]) => `<option value="${v}"${v === estadoActual ? " selected" : ""}>${l}</option>`)
    .join("");
  return `<select class="estado-select" data-estado-id="${id}" title="Cambiar estado">${opciones}</select>`;
}

// ================= SUSCRIPCIONES =================

window.addEventListener("auth-ready", () => {
  onSnapshot(query(collection(db, "cotizaciones"), orderBy("folio", "desc")), (snap) => {
    cotizaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderLista(cotizaciones);
  }, (err) => console.error("Error leyendo cotizaciones:", err));

  onSnapshot(collection(db, "clientes"), (snap) => {
    clientesActivos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.estado !== "inactivo");
  }, (err) => console.error("Error leyendo clientes:", err));

  onSnapshot(collection(db, "catalogo"), (snap) => {
    catalogoActivo = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((it) => it.estado !== "inactivo");
  }, (err) => console.error("Error leyendo catálogo:", err));

  onSnapshot(doc(db, "configuracion", "empresa"), (snap) => {
    empresaInfo = snap.exists() ? snap.data() : {};
  }, (err) => console.error("Error leyendo datos de empresa (cotizaciones):", err));
}, { once: true });

// ---------- Combobox buscable reutilizable (cliente e ítem) ----------
function crearCombobox({ searchInputId, hiddenInputId, dropdownId, obtenerOpciones, renderEtiqueta }) {
  const searchEl = document.getElementById(searchInputId);
  const hiddenEl = document.getElementById(hiddenInputId);
  const dropdownEl = document.getElementById(dropdownId);

  function mostrar(filtro) {
    const opciones = obtenerOpciones().filter((o) => renderEtiqueta(o).toLowerCase().includes(filtro.toLowerCase()));
    dropdownEl.innerHTML = opciones.length
      ? opciones.slice(0, 60).map((o) => `<div class="combo-option" data-id="${o.id}">${escapeHtml(renderEtiqueta(o))}</div>`).join("")
      : '<div class="combo-empty">Sin resultados</div>';
    dropdownEl.classList.remove("hidden");
  }

  searchEl.addEventListener("focus", () => mostrar(searchEl.value));
  searchEl.addEventListener("input", () => {
    hiddenEl.value = "";
    mostrar(searchEl.value);
  });
  dropdownEl.addEventListener("click", (e) => {
    const opt = e.target.closest(".combo-option");
    if (!opt) return;
    const item = obtenerOpciones().find((o) => o.id === opt.dataset.id);
    if (item) {
      hiddenEl.value = item.id;
      searchEl.value = renderEtiqueta(item);
    }
    dropdownEl.classList.add("hidden");
  });
  document.addEventListener("click", (e) => {
    if (e.target !== searchEl && !dropdownEl.contains(e.target)) dropdownEl.classList.add("hidden");
  });

  return {
    setSeleccion(item) {
      hiddenEl.value = item ? item.id : "";
      searchEl.value = item ? renderEtiqueta(item) : "";
      dropdownEl.classList.add("hidden");
    }
  };
}

const comboCliente = crearCombobox({
  searchInputId: "cot-cliente-search",
  hiddenInputId: "cot-cliente",
  dropdownId: "cot-cliente-dropdown",
  obtenerOpciones: () => clientesActivos,
  renderEtiqueta: (c) => `${c.razonSocial}${c.rut ? " — " + c.rut : ""}`
});

const comboItem = crearCombobox({
  searchInputId: "picker-item-search",
  hiddenInputId: "picker-item",
  dropdownId: "picker-item-dropdown",
  obtenerOpciones: () => catalogoActivo,
  renderEtiqueta: (it) => `${it.codigo} — ${it.descripcion}`
});

// ---------- Creación rápida de cliente/ítem desde la cotización ----------
let esperandoNuevoCliente = false;
let esperandoNuevoItem = false;

btnNuevoClienteInline.addEventListener("click", () => {
  esperandoNuevoCliente = true;
  abrirNuevoClienteDesdeExterno();
});

btnNuevoItemInline.addEventListener("click", () => {
  esperandoNuevoItem = true;
  abrirNuevoItemDesdeExterno();
});

window.addEventListener("cliente-guardado", (e) => {
  if (!esperandoNuevoCliente || !e.detail.esNuevo) return;
  esperandoNuevoCliente = false;
  comboCliente.setSeleccion({ id: e.detail.id, razonSocial: e.detail.razonSocial, rut: e.detail.rut });
});

window.addEventListener("item-guardado", (e) => {
  if (!esperandoNuevoItem || !e.detail.esNuevo) return;
  esperandoNuevoItem = false;
  lineaItems.push({
    itemId: e.detail.id,
    codigo: e.detail.codigo,
    descripcion: e.detail.descripcion,
    unidad: e.detail.unidad,
    cantidad: 1,
    precio: e.detail.precio || 0,
    costo: e.detail.costo || 0,
    descuentoItem: 0
  });
  renderItems();
});

let obrasDisponibles = [];
window.addEventListener("obras-actualizadas", (e) => {
  obrasDisponibles = (e.detail || []).filter((o) => o.estado !== "cerrada");
  const seleccionada = selectObraId.value;
  selectObraId.innerHTML = '<option value="">— Sin obra —</option>' +
    obrasDisponibles.map((o) => `<option value="${o.id}">${escapeHtml(o.codigo)} — ${escapeHtml(o.nombre)}</option>`).join("");
  if (seleccionada) selectObraId.value = seleccionada;
});

// ================= LISTA =================

function renderLista(lista) {
  tbody.innerHTML = "";
  if (lista.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  lista.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-mono">${c.folio ? formatoFolio(c.folio) : "—"}</td>
      <td>${escapeHtml(c.clienteNombre || "—")}</td>
      <td>${escapeHtml(c.fecha || "—")}</td>
      <td>${escapeHtml(c.fechaVigencia || "—")}</td>
      <td class="col-num cell-mono">${formatoCLP.format(c.total || 0)}</td>
      <td><span class="badge badge-${c.estado || "borrador"}">${ESTADO_LABELS[c.estado] || c.estado}</span></td>
      <td class="row-actions row-actions-estado">
        ${selectEstadoHtml(c.id, c.estado || "borrador")}
        <button data-id="${c.id}">Abrir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

searchInput.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return renderLista(cotizaciones);
  renderLista(cotizaciones.filter((c) =>
    String(c.folio || "").includes(term) ||
    (c.clienteNombre || "").toLowerCase().includes(term)
  ));
});

tbody.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const cot = cotizaciones.find((c) => c.id === btn.dataset.id);
  if (cot) abrirEditor(cot);
});

// Cambio de estado inline desde el listado
tbody.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-estado-id]");
  if (!sel) return;
  actualizarEstadoCotizacion(sel.dataset.estadoId, sel.value);
});

// Actualiza el estado de una cotización (usado por el listado y por el Resumen).
export async function actualizarEstadoCotizacion(id, nuevoEstado) {
  try {
    await updateDoc(doc(db, "cotizaciones", id), {
      estado: nuevoEstado,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Error cambiando el estado de la cotización:", err);
    alert("No se pudo cambiar el estado. Revisa la consola para más detalles.");
  }
}

// Abre una cotización en el editor desde otro módulo (p. ej. las tarjetas del Resumen).
export function abrirCotizacionPorId(id) {
  const cot = cotizaciones.find((c) => c.id === id);
  if (!cot) return;
  const navBtn = document.querySelector('.nav-item[data-view="cotizaciones"]');
  if (navBtn) navBtn.click(); // cambia a la vista de Cotizaciones
  abrirEditor(cot);
}

// ================= NAVEGACIÓN LISTA <-> EDITOR =================

btnNueva.addEventListener("click", () => abrirEditor(null));
btnVolver.addEventListener("click", cerrarEditor);
btnCancelar.addEventListener("click", cerrarEditor);

function cerrarEditor() {
  vistaEditor.classList.add("hidden");
  vistaLista.classList.remove("hidden");
}

function abrirEditor(cot) {
  lineaItems = [];
  editandoId = null;
  editandoFolio = null;

  if (cot) {
    editandoId = cot.id;
    editandoFolio = cot.folio;
    folioLabel.textContent = `Cotización ${formatoFolio(cot.folio)}`;
    const clienteExistente = clientesActivos.find((c) => c.id === cot.clienteId);
    comboCliente.setSeleccion(clienteExistente || (cot.clienteId ? { id: cot.clienteId, razonSocial: cot.clienteNombre, rut: cot.clienteRut } : null));
    inputObra.value = cot.obraReferencia || "";
    selectObraId.value = cot.obraId || "";
    inputFecha.value = cot.fecha || "";
    inputVigencia.value = cot.vigenciaDias || 15;
    selectEstado.value = cot.estado || "borrador";
    inputMotivo.value = cot.motivoNoAceptacion || "";
    textareaObs.value = cot.observaciones || "";
    inputDescuentoGlobal.value = cot.descuentoGlobal || 0;
    lineaItems = (cot.items || []).map((it) => ({ ...it }));
  } else {
    folioLabel.textContent = "Nueva cotización (folio se asigna al guardar)";
    comboCliente.setSeleccion(null);
    inputObra.value = "";
    selectObraId.value = "";
    inputFecha.value = new Date().toISOString().slice(0, 10);
    inputVigencia.value = 15;
    selectEstado.value = "borrador";
    inputMotivo.value = "";
    textareaObs.value = "";
    inputDescuentoGlobal.value = 0;
  }

  actualizarVisibilidadMotivo();
  renderItems();
  vistaLista.classList.add("hidden");
  vistaEditor.classList.remove("hidden");
}

selectEstado.addEventListener("change", actualizarVisibilidadMotivo);
function actualizarVisibilidadMotivo() {
  motivoWrap.classList.toggle("hidden", selectEstado.value !== "no_aceptada");
}

// ================= ÍTEMS DEL EDITOR =================

btnAgregarItem.addEventListener("click", () => {
  const itemId = pickerItem.value;
  const cantidad = Number(pickerCantidad.value) || 1;
  if (!itemId) return;

  const item = catalogoActivo.find((it) => it.id === itemId);
  if (!item) return;

  lineaItems.push({
    itemId: item.id,
    codigo: item.codigo,
    descripcion: item.descripcion,
    unidad: item.unidad,
    cantidad,
    precio: item.precio || 0,
    costo: item.costo || 0,
    descuentoItem: 0
  });

  comboItem.setSeleccion(null);
  pickerCantidad.value = 1;
  renderItems();
});

function renderItems() {
  itemsTbody.innerHTML = "";

  if (lineaItems.length === 0) {
    itemsEmpty.classList.remove("hidden");
  } else {
    itemsEmpty.classList.add("hidden");
  }

  lineaItems.forEach((linea, idx) => {
    const subtotal = linea.cantidad * linea.precio * (1 - (linea.descuentoItem || 0) / 100);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="cell-mono">${escapeHtml(linea.codigo)}</td>
      <td>${escapeHtml(linea.descripcion)}</td>
      <td>${escapeHtml(linea.unidad || "—")}</td>
      <td class="col-num"><input type="number" class="row-qty-input" min="0" step="1" value="${linea.cantidad}" data-idx="${idx}" data-field="cantidad"></td>
      <td class="col-num"><input type="number" class="row-price-input" min="0" step="1" value="${linea.precio}" data-idx="${idx}" data-field="precio"></td>
      <td class="col-num"><input type="number" class="row-cost-input" min="0" step="1" value="${linea.costo || 0}" data-idx="${idx}" data-field="costo"></td>
      <td class="col-num"><input type="number" class="row-disc-input" min="0" max="100" step="1" value="${linea.descuentoItem || 0}" data-idx="${idx}" data-field="descuentoItem"></td>
      <td class="col-num cell-mono">${formatoCLP.format(subtotal)}</td>
      <td><button class="remove-row-btn" data-idx="${idx}" title="Quitar">×</button></td>
    `;
    itemsTbody.appendChild(tr);
  });

  recalcularTotales();
}

itemsTbody.addEventListener("input", (e) => {
  const input = e.target.closest("input[data-idx]");
  if (!input) return;
  const idx = Number(input.dataset.idx);
  const field = input.dataset.field;
  lineaItems[idx][field] = Number(input.value) || 0;
  recalcularSoloTotales(idx);
});

// Recalcula solo la celda de subtotal de la fila y los totales, sin re-renderizar toda la tabla (evita perder el foco)
function recalcularSoloTotales(idx) {
  const linea = lineaItems[idx];
  const subtotal = linea.cantidad * linea.precio * (1 - (linea.descuentoItem || 0) / 100);
  const row = itemsTbody.children[idx];
  if (row) row.children[7].textContent = formatoCLP.format(subtotal);
  recalcularTotales();
}

itemsTbody.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-row-btn");
  if (!btn) return;
  lineaItems.splice(Number(btn.dataset.idx), 1);
  renderItems();
});

inputDescuentoGlobal.addEventListener("input", recalcularTotales);

function calcularTotales() {
  const neto = lineaItems.reduce((sum, l) => sum + l.cantidad * l.precio * (1 - (l.descuentoItem || 0) / 100), 0);
  const costoTotal = lineaItems.reduce((sum, l) => sum + l.cantidad * l.costo, 0);
  const descuentoGlobalPct = Number(inputDescuentoGlobal.value) || 0;
  const descuentoGlobalMonto = neto * (descuentoGlobalPct / 100);
  const baseIva = neto - descuentoGlobalMonto;
  const iva = baseIva * IVA_TASA;
  const total = baseIva + iva;
  const margenMonto = baseIva - costoTotal;
  const margenPct = baseIva > 0 ? (margenMonto / baseIva) * 100 : 0;

  return { neto, costoTotal, descuentoGlobalPct, descuentoGlobalMonto, baseIva, iva, total, margenMonto, margenPct };
}

function recalcularTotales() {
  const t = calcularTotales();
  totNeto.textContent = formatoCLP.format(t.neto);
  totDescuento.textContent = formatoCLP.format(t.descuentoGlobalMonto);
  totIva.textContent = formatoCLP.format(t.iva);
  totTotal.textContent = formatoCLP.format(t.total);
  totMargen.textContent = `${formatoCLP.format(t.margenMonto)} (${t.margenPct.toFixed(1)}%)`;
}

// ================= GUARDAR =================

btnGuardar.addEventListener("click", async () => {
  if (!selectCliente.value) {
    alert("Selecciona un cliente antes de guardar.");
    return;
  }
  if (lineaItems.length === 0) {
    alert("Agrega al menos un ítem antes de guardar.");
    return;
  }

  const cliente = clientesActivos.find((c) => c.id === selectCliente.value);
  const obraSel = obrasDisponibles.find((o) => o.id === selectObraId.value);
  const t = calcularTotales();
  const fecha = inputFecha.value || new Date().toISOString().slice(0, 10);
  const vigenciaDias = Number(inputVigencia.value) || 15;
  const fechaVigencia = sumarDias(fecha, vigenciaDias);

  const data = {
    clienteId: selectCliente.value,
    clienteNombre: cliente ? cliente.razonSocial : "",
    clienteRut: cliente ? cliente.rut : "",
    obraReferencia: inputObra.value.trim(),
    obraId: selectObraId.value || null,
    obraNombre: obraSel ? obraSel.nombre : "",
    fecha,
    vigenciaDias,
    fechaVigencia,
    items: lineaItems,
    descuentoGlobal: t.descuentoGlobalPct,
    neto: t.neto,
    descuentoGlobalMonto: t.descuentoGlobalMonto,
    baseIva: t.baseIva,
    iva: t.iva,
    total: t.total,
    costoTotal: t.costoTotal,
    margenMonto: t.margenMonto,
    margenPorcentaje: t.margenPct,
    estado: selectEstado.value,
    motivoNoAceptacion: selectEstado.value === "no_aceptada" ? inputMotivo.value.trim() : "",
    observaciones: textareaObs.value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    if (editandoId) {
      await updateDoc(doc(db, "cotizaciones", editandoId), data);
    } else {
      data.folio = await obtenerSiguienteFolio();
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "cotizaciones"), data);
    }
    cerrarEditor();
  } catch (err) {
    console.error("Error guardando cotización:", err);
    alert("No se pudo guardar la cotización. Revisa la consola para más detalles.");
  }
});

function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Folio correlativo, asignado atómicamente con una transacción sobre un contador
async function obtenerSiguienteFolio() {
  const contadorRef = doc(db, "contadores", "cotizaciones");
  const nuevoFolio = await runTransaction(db, async (tx) => {
    const snap = await tx.get(contadorRef);
    const actual = snap.exists() ? (snap.data().ultimoFolio || 0) : 0;
    const siguiente = actual + 1;
    tx.set(contadorRef, { ultimoFolio: siguiente });
    return siguiente;
  });
  return nuevoFolio;
}

// ================= IMPRESIÓN / PDF DE LA COTIZACIÓN =================

btnImprimir.addEventListener("click", imprimirCotizacion);

function imprimirCotizacion() {
  if (!selectCliente.value) { alert("Selecciona un cliente antes de imprimir."); return; }
  if (lineaItems.length === 0) { alert("Agrega al menos un ítem antes de imprimir."); return; }

  const cliente = clientesActivos.find((c) => c.id === selectCliente.value) || {};
  const obraSel = obrasDisponibles.find((o) => o.id === selectObraId.value);
  const t = calcularTotales();

  const fecha = inputFecha.value || new Date().toISOString().slice(0, 10);
  const vigenciaDias = Number(inputVigencia.value) || 15;
  const fechaVigencia = sumarDias(fecha, vigenciaDias);
  const folioTexto = editandoFolio ? formatoFolio(editandoFolio) : "BORRADOR (sin folio)";

  const filasItems = lineaItems.map((it) => {
    const totalNeto = it.cantidad * it.precio * (1 - (it.descuentoItem || 0) / 100);
    return `
      <tr>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE;">${escapeHtml(it.codigo || "")}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE;">${escapeHtml(it.descripcion || "")}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE; text-align:center;">${escapeHtml(it.unidad || "—")}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE; text-align:right;">${it.cantidad}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE; text-align:right;">${formatoCLP.format(it.precio)}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #EEE; text-align:right;">${formatoCLP.format(totalNeto)}</td>
      </tr>`;
  }).join("");

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
    obraSel ? `<strong>Obra:</strong> ${escapeHtml(obraSel.nombre)}` : "",
    inputObra.value.trim() ? `<strong>Referencia:</strong> ${escapeHtml(inputObra.value.trim())}` : ""
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const printArea = document.getElementById("cotizacion-print-area");
  // Limpia el área de proforma para que nunca se impriman ambas a la vez.
  const proformaArea = document.getElementById("proforma-print-area");
  if (proformaArea) proformaArea.innerHTML = "";

  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; color:#1a1a1a; padding: 24px; max-width: 800px; margin: 0 auto;">

      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1F2A38; padding-bottom:14px; margin-bottom:18px;">
        <div>
          ${empresaInfo.logoBase64 ? `<img src="${empresaInfo.logoBase64}" style="max-height:64px; margin-bottom:8px;">` : ""}
          <div style="font-weight:bold; font-size:15px;">${escapeHtml(empresaInfo.nombre || "Empresa no configurada")}</div>
          ${empresaInfo.rut ? `<div style="font-size:12px; color:#555;">RUT: ${escapeHtml(empresaInfo.rut)}</div>` : ""}
          ${empresaInfo.giro ? `<div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.giro)}</div>` : ""}
          ${empresaInfo.direccion ? `<div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.direccion)}</div>` : ""}
          <div style="font-size:12px; color:#555;">${escapeHtml(empresaInfo.telefono || "")}${empresaInfo.email ? " · " + escapeHtml(empresaInfo.email) : ""}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px; font-weight:bold; letter-spacing:0.04em; color:#1F2A38;">COTIZACIÓN</div>
          <div style="font-size:15px; font-weight:bold; color:#1D4ED8; margin-top:2px;">${folioTexto}</div>
          <div style="font-size:12px; color:#555; margin-top:4px;">Fecha: ${formatoFecha(fecha)}</div>
        </div>
      </div>

      <div style="background:#F4F5F7; border:1px solid #E2E5EA; border-radius:4px; padding:12px 14px; margin-bottom:18px; font-size:12.5px; line-height:1.6;">
        <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">${escapeHtml(cliente.razonSocial || "")}</div>
        ${datosCliente ? `<div style="color:#444;">${datosCliente}</div>` : ""}
        ${obraTexto ? `<div style="color:#444; margin-top:4px;">${obraTexto}</div>` : ""}
      </div>

      <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
        <thead>
          <tr style="background:#1F2A38; color:#fff; text-align:left;">
            <th style="padding:7px 8px;">Código</th>
            <th style="padding:7px 8px;">Descripción</th>
            <th style="padding:7px 8px; text-align:center;">UM</th>
            <th style="padding:7px 8px; text-align:right;">Cant.</th>
            <th style="padding:7px 8px; text-align:right;">Precio unit.</th>
            <th style="padding:7px 8px; text-align:right;">Total neto</th>
          </tr>
        </thead>
        <tbody>${filasItems}</tbody>
      </table>

      <div style="display:flex; justify-content:flex-end;">
        <table style="font-size:13px; width:280px;">
          <tr><td style="padding:3px 0;">Neto</td><td style="text-align:right;">${formatoCLP.format(t.neto)}</td></tr>
          ${t.descuentoGlobalMonto > 0 ? `<tr><td style="padding:3px 0;">Descuento (${t.descuentoGlobalPct}%)</td><td style="text-align:right;">- ${formatoCLP.format(t.descuentoGlobalMonto)}</td></tr>` : ""}
          <tr><td style="padding:3px 0;">IVA (19%)</td><td style="text-align:right;">${formatoCLP.format(t.iva)}</td></tr>
          <tr style="font-weight:bold; border-top:1px solid #1F2A38;"><td style="padding:6px 0;">Total</td><td style="text-align:right;">${formatoCLP.format(t.total)}</td></tr>
        </table>
      </div>

      ${textareaObs.value.trim() ? `<div style="margin-top:18px; font-size:12px;"><strong>Observaciones:</strong><br>${escapeHtml(textareaObs.value.trim())}</div>` : ""}

      <div style="margin-top:26px; font-size:12px; color:#333; border-top:1px solid #E2E5EA; padding-top:12px;">
        Cotización válida por ${vigenciaDias} días, hasta el ${formatoFecha(fechaVigencia)}. Precios expresados en pesos chilenos (CLP). Valores netos, IVA incluido en el total.
      </div>

    </div>
  `;

  window.print();
}
