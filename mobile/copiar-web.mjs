// copiar-web.mjs — copia la app web (la de ../web) a www/,
// que es lo que Capacitor mete dentro del APK.
//
// La lista de archivos sale de ARCHIVOS en ../web/sw.js: es la misma que el
// service worker guarda para abrir sin internet, y humo.mjs ya comprueba que
// esté completa. Así el APK nunca lleva un archivo de menos ni uno de prueba.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..', 'web');
const DESTINO = path.join(AQUI, 'www');

const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
const bloque = sw.match(/const ARCHIVOS = \[([\s\S]*?)\];/);
if (!bloque) throw new Error('No encontré ARCHIVOS en sw.js');
const archivos = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  .filter((a) => a !== './');

fs.rmSync(DESTINO, { recursive: true, force: true });
for (const a of archivos) {
  const origen = path.join(RAIZ, a);
  const copia = path.join(DESTINO, a);
  fs.mkdirSync(path.dirname(copia), { recursive: true });
  fs.copyFileSync(origen, copia);
}
console.log(`www/: ${archivos.length} archivos copiados desde la app web.`);
