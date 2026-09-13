import { db } from "./firebase-config.js";
import { docE } from "./tenant.js";
import {
  doc,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= UTILIDADES COMPARTIDAS (Inventario / OC) =================
// Modal genérico, toast, formato y folios correlativos. Reutilizado por los
// módulos de productos, movimientos, proveedores, centros de costo y OC.

export function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const _clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
export function fmtMon(n) { return _clp.format(Math.round(Number(n) || 0)); }
export function fmtNum(n, d = 2) {
  return new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n) || 0);
}
export function fmtFecha(iso) {
  if (!iso) return "-";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

// ---------- Modal genérico ----------
export function showModal(title, bodyHTML, footerHTML, wide) {
  const m = document.getElementById("gen-modal");
  if (!m) return;
  document.getElementById("gen-modal-title").innerHTML = title || "";
  document.getElementById("gen-modal-body").innerHTML = bodyHTML || "";
  document.getElementById("gen-modal-footer").innerHTML = footerHTML ||
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cerrar</button>`;
  document.getElementById("gen-modal-box").classList.toggle("modal-wide", !!wide);
  m.classList.remove("hidden");
}
export function closeGenModal() {
  const m = document.getElementById("gen-modal");
  if (m) m.classList.add("hidden");
}
window.closeGenModal = closeGenModal;

export function confirmDialog(title, msg, onConfirm, confirmText, danger) {
  showModal(title,
    `<p style="font-size:14px;line-height:1.5">${escapeHtml(msg)}</p>`,
    `<button class="btn btn-ghost" onclick="closeGenModal()">Cancelar</button>
     <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="gen-confirm-btn">${escapeHtml(confirmText || "Confirmar")}</button>`);
  const b = document.getElementById("gen-confirm-btn");
  if (b) b.addEventListener("click", async () => { try { await onConfirm(); } catch (e) { console.error(e); } });
}

// ---------- Toast ----------
export function toast(titulo, msg, tipo) {
  let c = document.getElementById("toast-cont");
  if (!c) { c = document.createElement("div"); c.id = "toast-cont"; c.className = "toast-cont"; document.body.appendChild(c); }
  const t = document.createElement("div");
  t.className = "toast toast-" + (tipo || "info");
  t.innerHTML = `<strong>${escapeHtml(titulo || "")}</strong>${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ""}`;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 3200);
}

// ---------- Folio correlativo (contadores/{key} -> ultimoFolio) ----------
export async function nextFolio(key, prefix, pad = 5) {
  const ref = docE("contadores", key);
  const n = await runTransaction(db, async (tx) => {
    const s = await tx.get(ref);
    const actual = s.exists() ? (s.data().ultimoFolio || 0) : 0;
    const sig = actual + 1;
    tx.set(ref, { ultimoFolio: sig }, { merge: true });
    return sig;
  });
  return prefix + String(n).padStart(pad, "0");
}

// ---------- Buscador dinámico de productos (autocompletado por código o descripción) ----------
// Lista flotante fija en <body> para que nunca quede oculta bajo tablas con overflow.
let acCurrent = { onSelect: null, onCreate: null, inputEl: null };

function acEl() {
  let el = document.getElementById("inv-ac");
  if (!el) {
    el = document.createElement("div");
    el.id = "inv-ac";
    el.className = "inv-ac";
    el.style.display = "none";
    document.body.appendChild(el);
    el.addEventListener("mousedown", (e) => {
      const it = e.target.closest("[data-cod]");
      const cr = e.target.closest("[data-create]");
      if (it) { e.preventDefault(); hideAC(); if (acCurrent.onSelect) acCurrent.onSelect(it.getAttribute("data-cod")); }
      else if (cr) { e.preventDefault(); hideAC(); if (acCurrent.onCreate) acCurrent.onCreate(acCurrent.inputEl ? acCurrent.inputEl.value.trim() : ""); }
    });
    window.addEventListener("resize", hideAC);
    window.addEventListener("scroll", hideAC, true);
  }
  return el;
}
export function hideAC(e) {
  if (e && e.target && e.target.id === "inv-ac") return;
  const el = document.getElementById("inv-ac");
  if (el) el.style.display = "none";
}

// getItems: función que retorna la lista de productos vigente.
// onSelect(codigoInterno). opts.onCreate(textoTecleado) opcional.
export function attachProductoSearch(inputId, getItems, onSelect, opts) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  opts = opts || {};
  const run = () => {
    const list = acEl();
    acCurrent = { onSelect, onCreate: opts.onCreate, inputEl: inp };
    const q = (inp.value || "").trim().toLowerCase();
    const items = (getItems() || []).filter((p) => p.activo !== false);
    let res;
    if (q) {
      res = items.filter((p) => ((p.codigoInterno || "") + " " + (p.descripcion || "") + " " + (p.codigoEAN || "") + " " + (p.grupo || "")).toLowerCase().includes(q)).slice(0, 15);
    } else {
      res = items.slice(0, 15);
    }
    let html = res.map((p) =>
      `<div class="inv-ac-item" data-cod="${escapeHtml(p.codigoInterno)}"><strong>${escapeHtml(p.descripcion || "")}</strong>` +
      `<div class="inv-ac-sub">${escapeHtml(p.codigoInterno || "")}${p.codigoEAN ? " · " + escapeHtml(p.codigoEAN) : ""}${p.grupo ? " · " + escapeHtml(p.grupo) : ""} · ${escapeHtml(p.unidadMedida || "")}${p.aplicaIVA === false ? " · EXENTO" : ""}</div></div>`
    ).join("");
    if (opts.onCreate && q) {
      html += `<div class="inv-ac-item inv-ac-create" data-create="1"><strong>➕ Crear «${escapeHtml(inp.value.trim())}»</strong><div class="inv-ac-sub">${res.length ? "¿No es ninguno? " : "Sin coincidencias. "}Nuevo producto en el inventario</div></div>`;
    }
    if (!html) { list.style.display = "none"; return; }
    list.innerHTML = html;
    const r = inp.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 16);
    list.style.width = w + "px";
    list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    const abajo = window.innerHeight - r.bottom;
    if (abajo < 200 && r.top > 240) { list.style.top = "auto"; list.style.bottom = (window.innerHeight - r.top + 2) + "px"; }
    else { list.style.bottom = "auto"; list.style.top = (r.bottom + 2) + "px"; }
    list.style.display = "block";
  };
  inp.addEventListener("input", run);
  inp.addEventListener("focus", run);
  inp.addEventListener("blur", () => setTimeout(hideAC, 200));
}

// ---------- Datos de la empresa (para membretes de impresión) ----------
let _empresa = {};
export function getEmpresa() { return _empresa; }
window.addEventListener("empresa-ready", () => {
  onSnapshot(docE("configuracion", "empresa"), (snap) => {
    _empresa = snap.exists() ? snap.data() : {};
  }, (err) => console.error("Error leyendo empresa (inv):", err));
}, { once: true });
