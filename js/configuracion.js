import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ================= DATOS DE LA EMPRESA =================

const logoInput = document.getElementById("empresa-logo-input");
const logoPreview = document.getElementById("logo-preview");
const logoPreviewEmpty = document.getElementById("logo-preview-empty");
const btnGuardarEmpresa = document.getElementById("btn-guardar-empresa");
const empresaGuardadoMsg = document.getElementById("empresa-guardado-msg");

const camposEmpresa = ["nombre", "rut", "giro", "telefono", "email", "direccion"];
let logoBase64Actual = "";

async function cargarEmpresa() {
  let snap;
  try {
    snap = await getDoc(doc(db, "configuracion", "empresa"));
  } catch (err) {
    console.error("Error leyendo datos de empresa:", err);
    return;
  }
  if (!snap.exists()) return;
  const data = snap.data();

  camposEmpresa.forEach((campo) => {
    const el = document.getElementById(`empresa-${campo}`);
    if (el) el.value = data[campo] || "";
  });

  if (data.logoBase64) {
    logoBase64Actual = data.logoBase64;
    mostrarPreview(data.logoBase64);
  }
}

// Mantiene el nombre y logo del login y del sidebar sincronizados con lo guardado
// en Configuración. Se ejecuta sin esperar el login (requiere que la regla de
// Firestore permita lectura pública de /configuracion/empresa).
const sidebarBrandSub = document.getElementById("sidebar-brand-sub");
const sidebarBrandMark = document.getElementById("brand-mark");
const loginSub = document.getElementById("login-sub");
const loginMark = document.getElementById("login-mark");

onSnapshot(doc(db, "configuracion", "empresa"), (snap) => {
  const data = snap.exists() ? snap.data() : {};

  // Sin nombre configurado, el login y el sidebar muestran "Empresa no configurada".
  const nombreMarca = (data.nombre || "").trim() || "Empresa no configurada";
  if (sidebarBrandSub) sidebarBrandSub.textContent = nombreMarca;
  if (loginSub) loginSub.textContent = nombreMarca.toUpperCase();

  if (data.logoBase64) {
    const logoHtml = `<img src="${data.logoBase64}" style="width:100%;height:100%;object-fit:contain;border-radius:6px;">`;
    if (sidebarBrandMark) sidebarBrandMark.innerHTML = logoHtml;
    if (loginMark) loginMark.innerHTML = `<img src="${data.logoBase64}" style="max-width:70px;max-height:70px;object-fit:contain;">`;
  }
}, (err) => {
  // Antes de habilitar la lectura pública del documento en las reglas de Firestore,
  // esto fallará mientras no haya sesión iniciada. No es un error visible para el usuario.
  console.error("Error leyendo datos de empresa (branding):", err);
});

window.addEventListener("auth-ready", () => {
  cargarEmpresa();
}, { once: true });

function mostrarPreview(dataUrl) {
  logoPreview.src = dataUrl;
  logoPreview.classList.remove("hidden");
  logoPreviewEmpty.classList.add("hidden");
}

// Redimensiona la imagen a un ancho máximo antes de convertirla a base64,
// para mantener el documento de Firestore liviano.
function redimensionarImagen(file, maxAncho = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxAncho / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png", 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

logoInput.addEventListener("change", async () => {
  const file = logoInput.files[0];
  if (!file) return;
  try {
    logoBase64Actual = await redimensionarImagen(file);
    mostrarPreview(logoBase64Actual);
  } catch (err) {
    console.error("Error procesando logo:", err);
    alert("No se pudo procesar la imagen del logo.");
  }
});

btnGuardarEmpresa.addEventListener("click", async () => {
  const data = { logoBase64: logoBase64Actual };
  camposEmpresa.forEach((campo) => {
    const el = document.getElementById(`empresa-${campo}`);
    data[campo] = el ? el.value.trim() : "";
  });

  try {
    await setDoc(doc(db, "configuracion", "empresa"), data, { merge: true });
    empresaGuardadoMsg.classList.remove("hidden");
    setTimeout(() => empresaGuardadoMsg.classList.add("hidden"), 3000);
  } catch (err) {
    console.error("Error guardando datos de empresa:", err);
    alert("No se pudieron guardar los datos de la empresa.");
  }
});

// ---------- Plantillas descargables ----------

document.getElementById("btn-plantilla-clientes").addEventListener("click", () => {
  const datos = [
    ["RUT", "Razón Social", "Giro", "Contacto", "Teléfono", "Email", "Comuna", "Región", "Dirección", "Estado"],
    ["76.123.456-7", "Ejemplo Ltda.", "Servicios de construcción", "Juan Pérez", "+56 9 1234 5678", "contacto@ejemplo.cl", "Angol", "Araucanía", "Calle Falsa 123", "Activo"]
  ];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Clientes");

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["Instrucciones"],
    ["Estado acepta: Activo o Inactivo (si se deja vacío, se importa como Activo)."],
    ["No borres la fila de encabezados. Puedes borrar la fila de ejemplo antes de subir el archivo."]
  ]);
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");

  XLSX.writeFile(libro, "plantilla_clientes.xlsx");
});

document.getElementById("btn-plantilla-catalogo").addEventListener("click", () => {
  const datos = [
    ["Código", "Descripción", "Categoría", "Subcategoría (solo Mano de obra)", "Unidad", "Proveedor", "Costo", "Precio", "Afecto IVA", "Estado"],
    ["MAT-001", "Cable eléctrico 2.5mm", "Material", "", "M", "Proveedor Ejemplo", "500", "800", "Sí", "Activo"],
    ["MO-001", "Instalación eléctrica residencial", "Mano de obra", "Propia", "HH", "", "5000", "8000", "Sí", "Activo"],
    ["MO-002", "Cuadrilla contratista", "Mano de obra", "Contratista", "HH", "Contratista Ejemplo", "6000", "9500", "Sí", "Activo"]
  ];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Catálogo");

  const instrucciones = XLSX.utils.aoa_to_sheet([
    ["Instrucciones"],
    ["Categoría acepta: Material, Equipo, Mano de obra, Servicio."],
    ["Subcategoría solo aplica si Categoría es Mano de obra. Acepta: Propia o Contratista."],
    ["Afecto IVA acepta: Sí o No (si se deja vacío, se importa como Sí)."],
    ["Estado acepta: Activo o Inactivo (si se deja vacío, se importa como Activo)."],
    ["No borres la fila de encabezados. Puedes borrar las filas de ejemplo antes de subir el archivo."]
  ]);
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");

  XLSX.writeFile(libro, "plantilla_catalogo.xlsx");
});

// ---------- Importación desde Excel ----------

function normalizarTexto(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function construirMapaColumnas(filaEjemplo, sinonimos) {
  const claves = Object.keys(filaEjemplo);
  const mapa = {};
  Object.entries(sinonimos).forEach(([campo, opciones]) => {
    const encontrada = claves.find((k) => opciones.includes(normalizarTexto(k)));
    if (encontrada) mapa[campo] = encontrada;
  });
  return mapa;
}

function leerArchivoExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(primeraHoja, { defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function guardarEnLotes(coleccion, documentos) {
  const TAMANO_LOTE = 400;
  for (let i = 0; i < documentos.length; i += TAMANO_LOTE) {
    const lote = writeBatch(db);
    documentos.slice(i, i + TAMANO_LOTE).forEach((docData) => {
      const ref = doc(collection(db, coleccion));
      lote.set(ref, docData);
    });
    await lote.commit();
  }
}

// ---------- Importar Clientes ----------

const SINONIMOS_CLIENTES = {
  rut: ["rut"],
  razonSocial: ["razonsocial", "nombre", "cliente", "razon"],
  giro: ["giro"],
  contacto: ["contacto"],
  telefono: ["telefono", "fono", "celular"],
  email: ["email", "correo"],
  comuna: ["comuna"],
  region: ["region"],
  direccion: ["direccion", "domicilio"],
  estado: ["estado"]
};

document.getElementById("btn-import-clientes").addEventListener("click", async () => {
  const fileInput = document.getElementById("import-clientes-file");
  const log = document.getElementById("import-clientes-log");
  const file = fileInput.files[0];
  if (!file) { log.textContent = "Selecciona un archivo primero."; return; }

  log.textContent = "Leyendo archivo…";
  try {
    const filas = await leerArchivoExcel(file);
    if (filas.length === 0) { log.textContent = "El archivo no tiene filas."; return; }

    const mapa = construirMapaColumnas(filas[0], SINONIMOS_CLIENTES);
    if (!mapa.razonSocial) {
      log.textContent = "No se encontró una columna de Razón Social / Nombre. Revisa los encabezados del archivo.";
      return;
    }

    let importados = 0, omitidos = 0;
    const documentos = [];

    filas.forEach((fila) => {
      const razonSocial = String(fila[mapa.razonSocial] || "").trim();
      if (!razonSocial) { omitidos++; return; }

      const estadoTexto = normalizarTexto(mapa.estado ? fila[mapa.estado] : "");
      documentos.push({
        razonSocial,
        rut: mapa.rut ? String(fila[mapa.rut] || "").trim() : "",
        giro: mapa.giro ? String(fila[mapa.giro] || "").trim() : "",
        contacto: mapa.contacto ? String(fila[mapa.contacto] || "").trim() : "",
        telefono: mapa.telefono ? String(fila[mapa.telefono] || "").trim() : "",
        email: mapa.email ? String(fila[mapa.email] || "").trim() : "",
        comuna: mapa.comuna ? String(fila[mapa.comuna] || "").trim() : "",
        region: mapa.region ? String(fila[mapa.region] || "").trim() : "",
        direccion: mapa.direccion ? String(fila[mapa.direccion] || "").trim() : "",
        estado: estadoTexto.includes("inactiv") ? "inactivo" : "activo"
      });
      importados++;
    });

    log.textContent = `Importando ${importados} clientes…`;
    await guardarEnLotes("clientes", documentos);
    log.textContent = `Listo: ${importados} clientes importados. ${omitidos > 0 ? omitidos + " filas omitidas (sin razón social)." : ""}`;
    fileInput.value = "";
  } catch (err) {
    console.error("Error importando clientes:", err);
    log.textContent = "Ocurrió un error leyendo el archivo. Revisa que sea un .xlsx, .xls o .csv válido.";
  }
});

// ---------- Importar Catálogo ----------

const SINONIMOS_CATALOGO = {
  codigo: ["codigo", "cod"],
  descripcion: ["descripcion", "desc", "detalle"],
  categoria: ["categoria"],
  subcategoria: ["subcategoria", "tipomanoobra", "tipo"],
  unidad: ["unidad", "um", "medida"],
  proveedor: ["proveedor"],
  costo: ["costo", "costoneto", "costounitario"],
  precio: ["precio", "precioventa", "precioneto", "preciounitario"],
  afectoIva: ["afectoiva", "iva"],
  estado: ["estado"]
};

function mapearSubcategoria(texto) {
  const t = normalizarTexto(texto);
  return t.includes("contratista") ? "contratista" : "propia";
}

function mapearCategoria(texto) {
  const t = normalizarTexto(texto);
  if (t.includes("equipo")) return "equipo";
  if (t.includes("mano")) return "mano_obra";
  if (t.includes("servicio")) return "servicio";
  return "material";
}

function mapearAfectoIva(texto) {
  const t = normalizarTexto(texto);
  if (t === "" ) return true;
  return !(t.includes("no") || t === "0" || t === "n");
}

document.getElementById("btn-import-catalogo").addEventListener("click", async () => {
  const fileInput = document.getElementById("import-catalogo-file");
  const log = document.getElementById("import-catalogo-log");
  const file = fileInput.files[0];
  if (!file) { log.textContent = "Selecciona un archivo primero."; return; }

  log.textContent = "Leyendo archivo…";
  try {
    const filas = await leerArchivoExcel(file);
    if (filas.length === 0) { log.textContent = "El archivo no tiene filas."; return; }

    const mapa = construirMapaColumnas(filas[0], SINONIMOS_CATALOGO);
    if (!mapa.codigo || !mapa.descripcion) {
      log.textContent = "No se encontraron las columnas de Código y/o Descripción. Revisa los encabezados del archivo.";
      return;
    }

    let importados = 0, omitidos = 0;
    const documentos = [];

    filas.forEach((fila) => {
      const codigo = String(fila[mapa.codigo] || "").trim();
      const descripcion = String(fila[mapa.descripcion] || "").trim();
      if (!codigo || !descripcion) { omitidos++; return; }

      const estadoTexto = normalizarTexto(mapa.estado ? fila[mapa.estado] : "");
      const categoria = mapearCategoria(mapa.categoria ? fila[mapa.categoria] : "");
      documentos.push({
        codigo,
        descripcion,
        categoria,
        subcategoria: categoria === "mano_obra" ? mapearSubcategoria(mapa.subcategoria ? fila[mapa.subcategoria] : "") : "",
        unidad: mapa.unidad ? String(fila[mapa.unidad] || "UN").trim() : "UN",
        proveedor: mapa.proveedor ? String(fila[mapa.proveedor] || "").trim() : "",
        costo: mapa.costo ? Number(fila[mapa.costo]) || 0 : 0,
        precio: mapa.precio ? Number(fila[mapa.precio]) || 0 : 0,
        afectoIva: mapearAfectoIva(mapa.afectoIva ? fila[mapa.afectoIva] : ""),
        estado: estadoTexto.includes("inactiv") ? "inactivo" : "activo"
      });
      importados++;
    });

    log.textContent = `Importando ${importados} ítems…`;
    await guardarEnLotes("catalogo", documentos);
    log.textContent = `Listo: ${importados} ítems importados. ${omitidos > 0 ? omitidos + " filas omitidas (sin código o descripción)." : ""}`;
    fileInput.value = "";
  } catch (err) {
    console.error("Error importando catálogo:", err);
    log.textContent = "Ocurrió un error leyendo el archivo. Revisa que sea un .xlsx, .xls o .csv válido.";
  }
});
