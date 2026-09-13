// ================= SERVICE WORKER · Cotizador PWA =================
// Cachea el "app shell" (HTML/CSS/JS/íconos de este origen) para que la app
// abra offline y se pueda instalar en PC y móvil. Las peticiones a Firebase y
// a CDNs externos van siempre a la red (no se interceptan). Sube CACHE_VERSION
// cuando cambien los archivos para forzar la actualización.

const CACHE_VERSION = "cotizador-v3";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./js/admin.js",
  "./js/app.js",
  "./js/auth.js",
  "./js/bodegas.js",
  "./js/catalogo.js",
  "./js/centros-costo.js",
  "./js/clientes.js",
  "./js/configuracion.js",
  "./js/cotizaciones.js",
  "./js/facturacion.js",
  "./js/firebase-config.js",
  "./js/inv-helpers.js",
  "./js/movimientos.js",
  "./js/obras.js",
  "./js/ordenes-compra.js",
  "./js/plantilla-editor.js",
  "./js/plantilla.js",
  "./js/productos.js",
  "./js/proveedores.js",
  "./js/resumen.js",
  "./js/tenant.js",
  "./js/ui.js"
];

// Instalar: precachear el shell (tolerante a fallos individuales).
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

// Activar: borrar caches viejos.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Fetch: solo interceptamos GET del mismo origen. Todo lo demás (Firebase,
// gstatic, fuentes, CDNs) pasa directo a la red.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones (abrir la app): red primero, con respaldo al index cacheado.
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_VERSION);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Recursos del shell: cache primero, y en segundo plano actualiza (stale-while-revalidate).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
