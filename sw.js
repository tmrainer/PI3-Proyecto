// sw.js — que la aplicación abra sin internet.
//
// Solo guarda los archivos de la propia aplicación (HTML, CSS, JS, iconos) en
// el Cache Storage del navegador. Los DATOS no pasan por aquí: siguen en
// localStorage (AGENTS.md §3). No habla con ningún otro dominio.
//
// Estrategia: la app se sirve SIEMPRE de una copia completa y coherente de
// todos sus archivos, al instante y con o sin señal. Pedir a la red archivo
// por archivo, con mala señal, podía mezclar un HTML nuevo con un JS viejo, y
// un import que no existe deja la página en blanco.
//
// Las novedades llegan en segundo plano: cuando una página lo pide, se
// revalidan todos los archivos (con ETag, lo que no cambió no se descarga) y,
// solo si llegaron TODOS y alguno cambió, se arma una copia nueva entera y se
// reemplaza la vieja de una vez. La página avisa que hay versión nueva.

const PREFIJO = 'pi3-app-';
const MINUTOS_ENTRE_REVISIONES = 30;

// Al agregar un archivo a la app, va aquí también (humo.mjs lo comprueba).
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

let ultimaRevision = 0;

/** Baja todos los archivos. Si falta uno, falla entero: nunca una copia a medias. */
async function bajarTodo(modo) {
  return Promise.all(ARCHIVOS.map(async (url) => {
    const resp = await fetch(url, { cache: modo });
    if (!resp.ok) throw new Error(`${url}: ${resp.status}`);
    return [url, resp];
  }));
}

async function guardarCopia(pares) {
  const nombre = PREFIJO + Date.now();
  const cache = await caches.open(nombre);
  await Promise.all(pares.map(([url, resp]) => cache.put(url, resp)));
  // Recién con la copia nueva completa se borran las viejas.
  const claves = await caches.keys();
  await Promise.all(claves.filter((k) => k.startsWith(PREFIJO) && k !== nombre).map((k) => caches.delete(k)));
}

async function copiaActual() {
  const claves = (await caches.keys()).filter((k) => k.startsWith(PREFIJO)).sort();
  return claves.length ? caches.open(claves[claves.length - 1]) : null;
}

self.addEventListener('install', (e) => {
  e.waitUntil(bajarTodo('reload').then(guardarCopia).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await copiaActual();
    const guardada = cache && await cache.match(req, { ignoreSearch: true });
    return guardada || fetch(req);    // lo que no es de la app (p. ej. pruebas.html) va a la red
  })());
});

/** ¿Hay versión nueva? Si la hay y llegó completa, reemplaza la copia y avisa. */
async function revisar(forzar) {
  if (!forzar && Date.now() - ultimaRevision < MINUTOS_ENTRE_REVISIONES * 60000) return;
  ultimaRevision = Date.now();
  const cache = await copiaActual();
  let nuevos;
  try {
    nuevos = await bajarTodo('no-cache');
  } catch (e) {
    return;                               // sin señal o a medias: se queda la copia actual
  }
  let cambio = !cache;
  if (cache) {
    for (const [url, resp] of nuevos) {
      const vieja = await cache.match(url);
      if (!vieja || await vieja.text() !== await resp.clone().text()) { cambio = true; break; }
    }
  }
  if (!cambio) return;
  await guardarCopia(nuevos);
  for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage('version-nueva');
}

self.addEventListener('message', (e) => {
  if (e.data === 'buscar-actualizacion') e.waitUntil(revisar(false));
  if (e.data === 'buscar-actualizacion-ya') e.waitUntil(revisar(true));   // humo.mjs
});
