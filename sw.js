// sw.js — que la aplicación abra sin internet.
//
// Solo guarda los archivos de la propia aplicación (HTML, CSS, JS, iconos) en
// el Cache Storage del navegador. Los DATOS no pasan por aquí: siguen en
// localStorage (AGENTS.md §3). No habla con ningún otro dominio.
//
// Estrategia: primero la red, con un tope de espera; si no hay red o tarda,
// lo guardado. Con conexión siempre se usa la versión publicada (no hay que
// acordarse de subir un número de versión para que llegue una corrección), y
// sin conexión la app abre igual con la última copia que vio.

const CACHE = 'pi3-app-v1';
const ESPERA_RED_MS = 3000;

const ARCHIVOS = [
  './', './index.html', './padron.html', './formato-b1.html', './calendario.html',
  './estilos.css', './manifest.webmanifest',
  './icono.svg', './icono-maskable.svg', './icono-180.png', './icono-192.png',
  './icono-512.png', './icono-maskable-512.png',
  './js/alertas.js', './js/calculos.js', './js/escaneo-dni.js', './js/estado.js',
  './js/importar.js', './js/modelo.js', './js/pagina-asistencia.js',
  './js/pagina-b1.js', './js/pagina-calendario.js', './js/pagina-padron.js',
  './js/sugerencias.js', './js/ui-asistencia.js', './js/ui-escaneo.js',
  './js/ui-importar.js', './js/ui.js', './js/ui-personas.js', './js/ui-reportes.js',
  './js/validaciones.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function conTope(promesa, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('la red tarda')), ms);
    promesa.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); mal(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const red = fetch(req).then((resp) => {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(req, copia));
    }
    return resp;
  });
  // Si gana la copia guardada, la respuesta de la red igual se guarda al llegar.
  e.waitUntil(red.catch(() => {}));

  e.respondWith(conTope(red, ESPERA_RED_MS).catch(async () => {
    const guardada = await caches.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    return red;   // sin copia: que el navegador muestre su propio error
  }));
});
