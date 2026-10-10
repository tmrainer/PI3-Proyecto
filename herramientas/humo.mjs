// humo.mjs — prueba de humo de la aplicación en un Chromium sin ventana.
//
// Abre las cinco páginas, con el almacenamiento vacío y con un padrón de
// prueba, y falla si hay errores de consola o si lo que se ve no cuadra con los
// datos. También comprueba lo que las aserciones de pruebas.html no alcanzan:
// que no se pierda el último toque al salir de la página, y que dos pestañas
// abiertas no se pisen los datos.
//
// Sin dependencias: Node 22 o más (fetch y WebSocket propios) y un Chromium.
//
//   node herramientas/humo.mjs
//   CHROME=/ruta/a/chrome node herramientas/humo.mjs
//   node herramientas/humo.mjs /otra/copia/del/proyecto
//
// Usa un perfil temporal: no lee ni toca los datos de tu navegador. Los
// nombres y documentos son ficticios.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const PAGINAS = ['index', 'padron', 'formato-b1', 'calendario', 'pruebas'];

// ------------------------------------------------------------ padrón de prueba

function hoyLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const persona = (id, apellido, dni) => ({
  id, apellidoPaterno: apellido, apellidoMaterno: '', nombres: 'Prueba',
  numeroDocumento: dni, tipoDocumento: 'dni', fechaNacimiento: '1990-01-01',
  grupoEtarioManual: null, sexo: '', tipoAfiliado: 'habitual', activo: true,
  altaEn: '2020-01-01', bajaEn: '', motivoBaja: '', origenDato: 'manual',
  verificadoPor: '', nota: ''
});

// Tres personas; hoy vino solo la primera.
const PADRON = {
  version: 3,
  afiliados: [
    persona('alfa0001', 'Alfa', '00000001'),
    persona('beta0002', 'Beta', '00000002'),
    persona('gama0003', 'Gama', '00000003')
  ],
  atenciones: [{
    id: 'dia00001', fecha: hoyLocal(),
    asistencias: [{ afiliadoId: 'alfa0001', tipoMenu: 'normal' }],
    precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100,
    precioTomadoDeConfig: true, legado: null, nota: ''
  }]
};

// ---------------------------------------------------------- servidor estático

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json'
};

// /__sembrar deja el almacenamiento vacío, o con el padrón de prueba si se pide
// ?padron=1. Vive solo aquí: no es un archivo del proyecto.
const SEMBRAR = `<!doctype html><meta charset="utf-8"><script>
localStorage.clear();
if (new URLSearchParams(location.search).get('padron')) {
  localStorage.setItem('b1.padron.v1', ${JSON.stringify(JSON.stringify(PADRON))});
}
document.title = 'sembrado';
</script>`;

function servir() {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__sembrar') {
      res.writeHead(200, { 'content-type': TIPOS['.html'] });
      return res.end(SEMBRAR);
    }
    const archivo = path.join(RAIZ, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    fs.createReadStream(archivo).pipe(res);
  });
  return new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(servidor)));
}

// ------------------------------------------------------------------- Chromium

function buscarChromium() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).sort().reverse()) {
      for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome']) {
        const p = path.join(cache, dir, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  for (const nombre of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    try { return execFileSync('which', [nombre], { encoding: 'utf8' }).trim(); } catch { /* sigue */ }
  }
  throw new Error('No encontré Chromium. Indica la ruta con CHROME=/ruta/a/chrome.');
}

function lanzar(ejecutable) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'humo-pi3-'));
  const proc = spawn(ejecutable, [
    '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=0', `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return new Promise((ok, mal) => {
    let salida = '';
    proc.stderr.on('data', (d) => {
      salida += d;
      const m = salida.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) ok({ proc, perfil, ws: m[1] });
    });
    proc.on('exit', (c) => mal(new Error(`Chromium terminó (${c}):\n${salida}`)));
  });
}

// ------------------------------------------------------------ cliente CDP

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pendientes = new Map();
    this.oyentes = new Set();
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pendientes.has(msg.id)) {
        const { ok, mal } = this.pendientes.get(msg.id);
        this.pendientes.delete(msg.id);
        msg.error ? mal(new Error(msg.error.message)) : ok(msg.result);
      } else {
        for (const f of this.oyentes) f(msg);
      }
    };
  }
  abierto() { return new Promise((ok) => { this.ws.onopen = ok; }); }
  enviar(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((ok, mal) => this.pendientes.set(id, { ok, mal }));
  }
  esperar(filtro, ms = 10000) {
    return new Promise((ok, mal) => {
      const t = setTimeout(() => { this.oyentes.delete(f); mal(new Error('tiempo agotado')); }, ms);
      const f = (msg) => { if (filtro(msg)) { clearTimeout(t); this.oyentes.delete(f); ok(msg); } };
      this.oyentes.add(f);
    });
  }
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Una pestaña: navegar, evaluar JS y juntar los errores de consola. */
async function pestana(cdp) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  const errores = [];
  cdp.oyentes.add((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
      errores.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errores.push((d.exception && d.exception.description) || d.text);
    }
  });
  await cdp.enviar('Runtime.enable', {}, sessionId);
  await cdp.enviar('Page.enable', {}, sessionId);
  const p = {
    errores,
    async ir(url) {
      const cargada = cdp.esperar((m) => m.sessionId === sessionId && m.method === 'Page.loadEventFired');
      await cdp.enviar('Page.navigate', { url }, sessionId);
      await cargada;
      await pausa(150);   // lo asíncrono del arranque (p. ej. el estado del escaneo)
    },
    async eval(expr) {
      const r = await cdp.enviar('Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    cerrar: () => cdp.enviar('Target.closeTarget', { targetId })
  };
  return p;
}

// --------------------------------------------------------------- las pruebas

const resultados = [];
function comprobar(nombre, condicion, detalle = '') {
  resultados.push({ nombre, ok: !!condicion, detalle });
}

const TEXTO = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.textContent || '').replace(/\\s+/g, ' ').trim()`;
const PADRON_GUARDADO = `JSON.parse(localStorage.getItem('b1.padron.v1'))`;
const IDS_HOY = `${PADRON_GUARDADO}.atenciones.find((a) => a.fecha === '${hoyLocal()}').asistencias.map((x) => x.afiliadoId).sort()`;
const TOCAR = (apellido) => `[...document.querySelectorAll('#hoy .toque-nombre')]
  .find((b) => b.textContent.includes(${JSON.stringify(apellido)})).click()`;
const ESCRIBIR = (sel, valor) => `(() => { const el = document.querySelector(${JSON.stringify(sel)});
  el.value = ${JSON.stringify(valor)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`;

async function correr(base, cdp) {
  // 1. Cada página, sin datos y con datos: carga sin errores.
  for (const sembrado of [false, true]) {
    for (const nombre of PAGINAS) {
      const p = await pestana(cdp);
      await p.ir(`${base}/__sembrar${sembrado ? '?padron=1' : ''}`);
      await p.ir(`${base}/${nombre}.html`);
      comprobar(`${nombre}.html ${sembrado ? 'con padrón' : 'vacía'}: sin errores de consola`,
        p.errores.length === 0, p.errores.join(' | '));
      if (nombre === 'pruebas') {
        const r = await p.eval(TEXTO('#resumen'));
        comprobar('pruebas.html: todas las aserciones pasan', /✓ (\d+) de \1 pasan/.test(r), r);
      }
      if (sembrado && nombre === 'index') {
        const r = await p.eval(TEXTO('.hoy-cuenta'));
        comprobar('asistencia de hoy: «1 de 3»', r === '1 de 3', r);
      }
      if (sembrado && nombre === 'padron') {
        const filas = await p.eval(`document.querySelectorAll('#reporte-padron tbody tr').length`);
        const aus = await p.eval(TEXTO('#reporte-padron .asistencia-resumen'));
        comprobar('reporte del padrón: 3 filas', filas === 3, String(filas));
        comprobar('reporte: los ausentes son las 2 filas con 0 días', aus.startsWith('2 persona(s)'), aus);
        // Sin permiso de portapapeles (como aquí) aparece el texto para copiar a mano.
        await p.eval(`document.querySelector('#copiar-padron').click()`);
        await pausa(200);
        const tsv = await p.eval(`document.querySelector('#reporte-padron textarea')?.value || ''`);
        comprobar('reporte: «Copiar» da las 3 filas separadas por tabulador',
          tsv.split('\n').length === 4 && tsv.startsWith('N°\tApellido paterno'), JSON.stringify(tsv.slice(0, 60)));
      }
      await p.cerrar();
    }
  }

  // 2. Marcar a alguien y salir enseguida, antes de los 400 ms: no se pierde.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/index.html`);
    await p.eval(TOCAR('Beta'));
    await p.ir('about:blank');                 // dispara pagehide de inmediato
    await p.ir(`${base}/index.html`);
    const r = await p.eval(TEXTO('.hoy-cuenta'));
    comprobar('salir justo después de marcar: el toque queda guardado', r === '2 de 3', r);
    await p.cerrar();
  }

  // 3. Dos pestañas: la asistencia marcada en una no la borra la otra.
  {
    const a = await pestana(cdp);
    await a.ir(`${base}/__sembrar?padron=1`);
    const b = await pestana(cdp);
    await b.ir(`${base}/padron.html`);        // abierta ANTES de marcar en a
    await a.ir(`${base}/index.html`);
    await a.eval(TOCAR('Gama'));
    await pausa(700);
    await b.eval(`document.querySelector('#ficha-alfa0001 .persona-fila').click()`);
    await b.eval(ESCRIBIR('[id^="a-nombres-alfa0001"]', 'Editada'));
    await pausa(700);
    const ids = await a.eval(IDS_HOY);
    const nombre = await a.eval(`${PADRON_GUARDADO}.afiliados[0].nombres`);
    comprobar('dos pestañas: la asistencia marcada en la otra sigue',
      JSON.stringify(ids) === JSON.stringify(['alfa0001', 'gama0003']), JSON.stringify(ids));
    comprobar('dos pestañas: la edición del padrón también se guardó', nombre === 'Editada', nombre);
    comprobar('dos pestañas: sin errores de consola',
      a.errores.length + b.errores.length === 0, [...a.errores, ...b.errores].join(' | '));
    await a.cerrar();
    await b.cerrar();
  }

  // 3b. La recarga por otra pestaña no cierra la ficha que se está editando.
  {
    const a = await pestana(cdp);
    await a.ir(`${base}/__sembrar?padron=1`);
    const b = await pestana(cdp);
    await b.ir(`${base}/padron.html`);
    await b.eval(`document.querySelector('#ficha-alfa0001 .persona-fila').click()`);
    await b.eval(`(() => { const el = document.querySelector('[id^="a-nombres-alfa0001"]');
      el.focus(); el.setSelectionRange(2, 2); })()`);
    await a.ir(`${base}/index.html`);
    await a.eval(TOCAR('Beta'));
    await pausa(700);                          // b recibe el storage y repinta
    const vista = await b.eval(`({
      abierta: document.querySelector('#ficha-alfa0001 .persona-fila').getAttribute('aria-expanded'),
      foco: document.activeElement.id, cursor: document.activeElement.selectionStart,
      dias: document.querySelector('#reporte-padron tbody tr:nth-child(2) td:last-child').textContent })`);
    comprobar('otra pestaña guarda: la ficha abierta sigue abierta', vista.abierta === 'true', JSON.stringify(vista));
    comprobar('otra pestaña guarda: el foco y el cursor siguen donde estaban',
      vista.foco.startsWith('a-nombres-alfa0001') && vista.cursor === 2, JSON.stringify(vista));
    comprobar('otra pestaña guarda: el reporte muestra lo nuevo', vista.dias === '1', JSON.stringify(vista));
    await a.cerrar();
    await b.cerrar();
  }

  // 4. El B-1 abierto en otra pestaña no devuelve el precio del menú al viejo.
  {
    const a = await pestana(cdp);
    await a.ir(`${base}/__sembrar?padron=1`);
    const b = await pestana(cdp);
    await b.ir(`${base}/formato-b1.html`);    // abierta ANTES de cambiar el precio
    await a.ir(`${base}/index.html`);
    await a.eval(ESCRIBIR('#precioNormal', '4.50'));
    await pausa(700);
    await b.eval(ESCRIBIR('#nombreCentro', 'Comedor de prueba'));
    await pausa(700);
    const precio = await a.eval(`JSON.parse(localStorage.getItem('b1.config.v1')).precioMenuNormalCent`);
    comprobar('B-1 en otra pestaña: el precio nuevo del menú se conserva', precio === 450, String(precio));
    await a.cerrar();
    await b.cerrar();
  }

  // 5. Dos pestañas del B-1: lo escrito en una no lo borra la otra.
  {
    const a = await pestana(cdp);
    await a.ir(`${base}/__sembrar`);
    await a.ir(`${base}/formato-b1.html`);
    const b = await pestana(cdp);
    await b.ir(`${base}/formato-b1.html`);
    await a.eval(ESCRIBIR('#nombreCentro', 'Comedor Uno'));
    await pausa(1200);                         // b recibe el storage y se recarga
    const enB = await b.eval(`document.querySelector('#nombreCentro').value`);
    await b.eval(ESCRIBIR('#codigoPca', '123'));
    await pausa(700);
    const r = await b.eval(`JSON.parse(localStorage.getItem('b1.rendiciones.v1'))[0]`);
    comprobar('dos pestañas del B-1: la otra se pone al día', enB === 'Comedor Uno', enB);
    comprobar('dos pestañas del B-1: no se pisan',
      r.nombreCentro === 'Comedor Uno' && r.codigoPca === '123', JSON.stringify([r.nombreCentro, r.codigoPca]));
    comprobar('dos pestañas del B-1: sin errores de consola',
      a.errores.length + b.errores.length === 0, [...a.errores, ...b.errores].join(' | '));
    await a.cerrar();
    await b.cerrar();
  }

  // 6. B-1: escribir y salir enseguida, antes de los 400 ms: no se pierde.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/formato-b1.html`);
    await p.eval(ESCRIBIR('#nombreCentro', 'Comedor Dos'));
    await p.ir('about:blank');
    await p.ir(`${base}/formato-b1.html`);
    const v = await p.eval(`document.querySelector('#nombreCentro').value`);
    comprobar('B-1: salir justo después de escribir no lo pierde', v === 'Comedor Dos', v);
    await p.cerrar();
  }
}

// ---------------------------------------------------------------------- main

const servidor = await servir();
const base = `http://127.0.0.1:${servidor.address().port}`;
const chrome = await lanzar(buscarChromium());
let fallo = false;
try {
  const cdp = new Cdp(chrome.ws);
  await cdp.abierto();
  await correr(base, cdp);
} catch (e) {
  fallo = true;
  console.error('La prueba se interrumpió:', e.message);
} finally {
  chrome.proc.kill();
  servidor.close();
  fs.rmSync(chrome.perfil, { recursive: true, force: true });
}

for (const r of resultados) {
  console.log(`${r.ok ? '✓' : '✕'} ${r.nombre}${r.ok || !r.detalle ? '' : `\n    ${r.detalle}`}`);
}
const fallan = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallan} de ${resultados.length} pasan`);
process.exit(fallo || fallan ? 1 : 0);
