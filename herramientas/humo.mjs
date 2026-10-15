// humo.mjs — prueba de humo de la aplicación en un Chromium sin ventana.
//
// Abre las cinco páginas, con el almacenamiento vacío y con un padrón de
// prueba, y falla si hay errores de consola o si lo que se ve no cuadra con los
// datos. También comprueba lo que las aserciones de pruebas.html no alcanzan:
// que no se pierda el último toque al salir de la página, que dos pestañas
// abiertas no se pisen los datos, que en un celular la lista se vea al abrir
// y que, apagado el servidor, el service worker abra la aplicación igual.
//
// Sin dependencias: Node 22 o más (fetch y WebSocket propios) y un Chromium.
//
//   node herramientas/humo.mjs
//   CHROME=/ruta/a/chrome node herramientas/humo.mjs
//   node herramientas/humo.mjs /otra/copia/de/web
//
// Usa un perfil temporal: no lee ni toca los datos de tu navegador. Los
// nombres y documentos son ficticios.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web'));
const PAGINAS = ['index', 'asistencia', 'padron', 'formato-b1', 'calendario', 'ajustes', 'datos', 'vista-previa', 'probar-dni', 'pruebas'];

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
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.png': 'image/png'
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

// Lo que se agrega al final de estilos.css: simula publicar una versión nueva.
let versionCss = '';

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
    if (url.pathname === '/estilos.css' && versionCss) return res.end(fs.readFileSync(archivo, 'utf8') + versionCss);
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
    // Lo que bloquea la política de contenido (CSP) no pasa por la consola de JS.
    if (msg.method === 'Log.entryAdded' && /Content Security Policy/.test(msg.params.entry.text)) {
      errores.push(msg.params.entry.text);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errores.push((d.exception && d.exception.description) || d.text);
    }
  });
  await cdp.enviar('Runtime.enable', {}, sessionId);
  await cdp.enviar('Log.enable', {}, sessionId);
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
    // Lo que hace una persona: trae la pestaña al frente y entonces la toca. En
    // Chrome completo una pestaña de fondo queda «hidden» y sus temporizadores
    // se frenan (un setTimeout de 400 ms tarda más de un segundo).
    async actuar(expr) {
      await cdp.enviar('Page.bringToFront', {}, sessionId);
      return p.eval(expr);
    },
    cdp: (method, params = {}) => cdp.enviar(method, params, sessionId),
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
// Leído con leer() de la app: en localStorage la asistencia va compacta.
const PADRON_GUARDADO = `(await import('./js/modelo.js')).leer('b1.padron.v1', null)`;
const IDS_HOY = `(async () => (${PADRON_GUARDADO}).atenciones.find((a) => a.fecha === '${hoyLocal()}').asistencias.map((x) => x.afiliadoId).sort())()`;
const TOCAR = (apellido) => `[...document.querySelectorAll('#hoy .toque-nombre')]
  .find((b) => b.textContent.includes(${JSON.stringify(apellido)})).click()`;
const ESCRIBIR = (sel, valor) => `(() => { const el = document.querySelector(${JSON.stringify(sel)});
  el.value = ${JSON.stringify(valor)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`;

// 0. La lista del service worker coincide con los archivos de la app. Un
// archivo que falte ahí no abre sin internet; uno que ya no exista hace fallar
// la instalación entera, sin que nadie se entere.
// El menú de abajo está escrito en el HTML de cada página (para que no
// parpadee al cambiar de pantalla): las cinco copias tienen que ser iguales y
// marcar su propia página.
function revisarMenuEscrito() {
  const paginas = { index: './', asistencia: './asistencia.html', padron: './padron.html',
    'formato-b1': './formato-b1.html', calendario: './calendario.html' };
  const mal = [];
  for (const [nombre, propia] of Object.entries(paginas)) {
    const html = fs.readFileSync(path.join(RAIZ, nombre + '.html'), 'utf8');
    const enlaces = [...html.matchAll(/<a href="([^"]+)" class="nav-enlace( activo)?"/g)];
    const hrefs = enlaces.map((m) => m[1]).join(',');
    const activos = enlaces.filter((m) => m[2]).map((m) => m[1]);
    if (hrefs !== Object.values(paginas).join(',') || activos.join() !== propia) mal.push(nombre);
  }
  comprobar('el menú escrito en cada página está completo y marca la suya', mal.length === 0, mal.join(' '));
}

function revisarListaDelServiceWorker() {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const bloque = sw.match(/const ARCHIVOS = \[([\s\S]*?)\];/)[1];
  const lista = [...bloque.matchAll(/'([^']+)'/g)].map((m) => m[1])
    .filter((f) => f !== './').map((f) => f.replace(/^\.\//, ''));
  const soloPruebas = new Set(['js/casos-prueba.js', 'js/pagina-pruebas.js']);
  const esperados = new Set(['estilos.css', 'manifest.webmanifest']);
  for (const f of fs.readdirSync(path.join(RAIZ, 'js'))) {
    if (f.endsWith('.js') && !soloPruebas.has(`js/${f}`)) esperados.add(`js/${f}`);
  }
  for (const pagina of PAGINAS.filter((x) => x !== 'pruebas')) {
    esperados.add(`${pagina}.html`);
    const html = fs.readFileSync(path.join(RAIZ, `${pagina}.html`), 'utf8');
    for (const m of html.matchAll(/(?:href|src)="\.\/([^"#?]+)"/g)) {
      if (!m[1].endsWith('/')) esperados.add(m[1]);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons) esperados.add(i.src.replace(/^\.\//, ''));
  const faltan = [...esperados].filter((f) => !lista.includes(f));
  const noExisten = lista.filter((f) => !fs.existsSync(path.join(RAIZ, f)));
  comprobar('sw.js: su lista tiene todos los archivos de la app', faltan.length === 0, 'faltan: ' + faltan.join(', '));
  comprobar('sw.js: todo lo de su lista existe', noExisten.length === 0, 'no existen: ' + noExisten.join(', '));
}

async function correr(base, cdp) {
  revisarListaDelServiceWorker();
  revisarMenuEscrito();
  // 1. Cada página, sin datos y con datos: carga sin errores.
  for (const sembrado of [false, true]) {
    for (const nombre of PAGINAS) {
      const p = await pestana(cdp);
      await p.ir(`${base}/__sembrar${sembrado ? '?padron=1' : ''}`);
      await p.ir(`${base}/${nombre}.html`);
      comprobar(`${nombre}.html ${sembrado ? 'con padrón' : 'vacía'}: sin errores de consola`,
        p.errores.length === 0, p.errores.join(' | '));
      if (nombre === 'pruebas') {
        // Espera a que terminen todas (en CI la máquina es más lenta): hasta 20 s.
        let r = '';
        for (let k = 0; k < 40; k++) {
          r = await p.eval(TEXTO('#resumen'));
          if (/\d+ de \d+/.test(r)) break;
          await pausa(500);
        }
        comprobar('pruebas.html: todas las aserciones pasan', /✓ (\d+) de \1 pasan/.test(r), r);
      }
      if (sembrado && nombre === 'asistencia') {
        const r = await p.eval(TEXTO('.hoy-cuenta'));
        comprobar('asistencia de hoy: «1 de 3»', r === '1 de 3', r);
      }
      if (sembrado && nombre === 'padron') {
        const filas = await p.eval(`document.querySelectorAll('#reporte-padron tbody tr').length`);
        const aus = await p.eval(TEXTO('#reporte-padron .asistencia-resumen'));
        comprobar('reporte del padrón: 3 filas', filas === 3, String(filas));
        comprobar('reporte: los ausentes son las 2 filas con 0 días', aus.startsWith('2 personas no vinieron'), aus);
        // Sin permiso de portapapeles (como aquí) aparece el texto para copiar a mano.
        await p.actuar(`document.querySelector('#copiar-padron').click()`);
        await pausa(200);
        const tsv = await p.eval(`document.querySelector('#reporte-padron textarea')?.value || ''`);
        comprobar('reporte: «Copiar» da las 3 filas separadas por tabulador',
          tsv.split('\n').length === 4 && tsv.startsWith('N°\tApellido paterno'), JSON.stringify(tsv.slice(0, 60)));
      }
      await p.cerrar();
    }
  }

  // 1b. La política de contenido está puesta: un script en línea no corre.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/asistencia.html`);
    const r = await p.eval(`new Promise((ok) => {
      document.addEventListener('securitypolicyviolation', (e) => ok(e.effectiveDirective), { once: true });
      const s = document.createElement('script');
      s.textContent = 'window.__inyectado = 1';
      document.head.append(s);
      setTimeout(() => ok(window.__inyectado ? 'corrió' : 'sin aviso'), 500);
    })`);
    comprobar('CSP: un script en línea no corre', r === 'script-src-elem', r);
    await pausa(200);
    // Y la prueba se entera: así una violación en las páginas cuenta como error.
    comprobar('CSP: la prueba de humo detecta las violaciones',
      p.errores.some((e) => /Content Security Policy/.test(e)), p.errores.join(' | ') || 'nada');
    await p.cerrar();
  }

  // 1c. Un error en la página no la deja en blanco: aparece el aviso.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/asistencia.html`);
    const antes = await p.eval(`!!document.querySelector('#avisos-sistema [role="alert"]')`);
    await p.eval(`setTimeout(() => { throw new Error('error de prueba'); }); 1`);
    await pausa(200);
    const r = await p.eval(TEXTO('#avisos-sistema [role="alert"]'));
    comprobar('error en la página: aparece el aviso con el detalle',
      !antes && r.includes('Algo falló') && r.includes('error de prueba'), r.slice(0, 80));
    await p.cerrar();
  }

  // 1d. Respaldo con contraseña: no deja ver nada adentro, la contraseña
  // equivocada no lo abre y la correcta lo importa por la interfaz.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/padron.html`);
    const r1 = await p.eval(`(async () => {
      const m = await import('./js/modelo.js');
      const ui = await import('./js/ui.js');
      const sobre = await m.cifrarRespaldo(ui.armarRespaldo(), 'clave de prueba');
      const texto = JSON.stringify(sobre);
      let malaFalla = false;
      try { await m.descifrarRespaldo(sobre, 'otra clave'); } catch (e) { malaFalla = true; }
      const vuelta = await m.descifrarRespaldo(sobre, 'clave de prueba');
      sessionStorage.setItem('sobre', texto);
      localStorage.setItem('b1.padron.v1', JSON.stringify({ version: 3, afiliados: [], atenciones: [] }));
      return { oculto: !texto.includes('Alfa') && !texto.includes('00000001'), malaFalla,
        vuelta: vuelta.padron.afiliados.length };
    })()`);
    comprobar('respaldo con contraseña: cifrado, y la equivocada no lo abre',
      r1.oculto && r1.malaFalla && r1.vuelta === 3, JSON.stringify(r1));

    await p.ir(`${base}/datos.html`);      // ya con el padrón vacío
    const ABRIR_CON = (clave) => `(async () => {
      document.getElementById('clave-importar').value = ${JSON.stringify(clave)};
      [...document.querySelectorAll('.respaldo-clave button')].find((b) => b.textContent === 'Abrir copia').click();
      await new Promise((ok) => setTimeout(ok, 1500));
      return (document.querySelector('.respaldo-clave .campo-error') || {}).textContent || '';
    })()`;
    const mala = await p.actuar(`(async () => {
      window.confirm = () => true;
      const dt = new DataTransfer();
      dt.items.add(new File([sessionStorage.getItem('sobre')], 'respaldo.json', { type: 'application/json' }));
      const entrada = document.getElementById('importar-archivo');
      entrada.files = dt.files;
      entrada.dispatchEvent(new Event('change'));
      await new Promise((ok) => setTimeout(ok, 300));
      return 1;
    })()`).then(() => p.eval(ABRIR_CON('clave mala')));
    await p.eval(ABRIR_CON('clave de prueba')).catch(() => {});   // recarga la página
    await pausa(800);
    const n = await p.eval(`JSON.parse(localStorage.getItem('b1.padron.v1')).afiliados.length`);
    comprobar('respaldo con contraseña: se importa por la interfaz',
      /no abre/.test(mala) && n === 3, JSON.stringify({ mala, n }));
    await p.cerrar();
  }

  // 1e. Recuperar una copia (en Tus datos) restaura TODO lo que trae el
  // respaldo: padrón, calendario y B-1.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    await p.eval(`(async () => {
      const ui = await import('./js/ui.js');
      const r = ui.armarRespaldo();
      r.calendario = { periodicidad: 'quincenal', fechaLimiteBase: '2026-10-15', diasAviso: [3], entregas: [] };
      r.rendiciones = [{ nombreCentro: 'Comedor del respaldo', egresos: [] }];
      sessionStorage.setItem('respaldo', JSON.stringify(r));
      localStorage.clear();
      return 1;
    })()`);
    await p.ir(`${base}/datos.html`);
    await p.actuar(`(async () => {
      window.confirm = () => true;
      const dt = new DataTransfer();
      dt.items.add(new File([sessionStorage.getItem('respaldo')], 'r.json', { type: 'application/json' }));
      const entrada = document.getElementById('importar-archivo');
      entrada.files = dt.files;
      entrada.dispatchEvent(new Event('change'));
      return 1;
    })()`);
    await pausa(1000);
    const r = await p.eval(`({
      personas: JSON.parse(localStorage.getItem('b1.padron.v1')).afiliados.length,
      calendario: (JSON.parse(localStorage.getItem('b1.calendario.v1')) || {}).periodicidad,
      centro: ((JSON.parse(localStorage.getItem('b1.rendiciones.v1')) || [])[0] || {}).nombreCentro
    })`);
    comprobar('recuperar una copia en Ajustes restaura padrón, calendario y B-1',
      r.personas === 3 && r.calendario === 'quincenal' && r.centro === 'Comedor del respaldo', JSON.stringify(r));
    await p.cerrar();
  }

  // 1f. Con el espacio al 70 % o más, se avisa antes de que no se pueda guardar.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.eval(`localStorage.setItem('b1.relleno', 'x'.repeat(1800000)); 1`);
    await p.ir(`${base}/asistencia.html`);
    const r = await p.eval(TEXTO('#avisos-sistema'));
    comprobar('espacio casi lleno: se avisa', /va al 7\d %/.test(r), r.slice(0, 120));
    await p.eval(`localStorage.removeItem('b1.relleno'); 1`);
    await p.cerrar();
  }

  // 1g. Si el navegador no deja guardar, la app no dice «Guardado»: lo avisa.
  for (const [pagina, accion] of [
    ['asistencia', TOCAR('Beta')],
    ['formato-b1', ESCRIBIR('#nombreCentro', 'Comedor sin espacio')],
    ['calendario', `(() => { const s = document.querySelector('#periodicidad'); s.value = 'semanal';
      s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`]
  ]) {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/${pagina}.html`);
    await p.eval(`Storage.prototype.setItem = function () {
      throw new DOMException('lleno', 'QuotaExceededError'); }; 1`);
    await p.actuar(accion);
    await pausa(700);
    const r = await p.eval(`({ estado: ${TEXTO('#estado-guardado')}, aviso: !!document.getElementById('aviso-no-guarda') })`);
    comprobar(`${pagina}.html: si no se puede guardar, lo avisa`,
      r.aviso && /NO SE GUARDÓ/.test(r.estado), JSON.stringify(r));
    await p.cerrar();
  }

  // 1h. Un padrón en Excel (.xlsx) se lee directo, sin convertirlo a CSV:
  // con títulos arriba, textos compartidos, una celda en línea y una fecha
  // guardada como número de serie, comprimido como lo guarda Excel.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/padron.html`);
    const r = await p.actuar(`(async () => {
      const cod = new TextEncoder();
      const desinflar = async (texto) => new Uint8Array(await new Response(
        new Blob([cod.encode(texto)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
      const archivos = {
        'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Padrón" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/hoja.xml" Type="x"/></Relationships>',
        'xl/sharedStrings.xml': '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>PADRÓN 2026</t></si><si><t>Apellido paterno</t></si><si><t>Nombres</t></si><si><t>DNI</t></si><si><t>Fecha de nacimiento</t></si><si><t>Tipo</t></si><si><r><t>Qui</t></r><r><t>spe</t></r></si><si><t>Habitual</t></si></sst>',
        'xl/styles.xml': '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
        'xl/worksheets/hoja.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="C3" t="s"><v>3</v></c><c r="D3" t="s"><v>4</v></c><c r="E3" t="s"><v>5</v></c></row>' +
          '<row r="4"><c r="A4" t="s"><v>6</v></c><c r="B4" t="inlineStr"><is><t>Rosa "Chabuca"</t></is></c><c r="C4"><v>40123456</v></c><c r="D4" s="1" t="n"><v>32874</v></c><c r="E4" t="s"><v>7</v></c></row>' +
          '</sheetData></worksheet>'
      };
      // ZIP mínimo: el libro guardado sin comprimir y lo demás con deflate.
      const partes = []; const centro = []; let pos = 0;
      for (const [nombre, texto] of Object.entries(archivos)) {
        const n = cod.encode(nombre);
        const comprimir = nombre !== 'xl/workbook.xml';
        const datos = comprimir ? await desinflar(texto) : cod.encode(texto);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); local.setUint16(8, comprimir ? 8 : 0, true);
        local.setUint32(18, datos.length, true); local.setUint16(26, n.length, true);
        const c = new DataView(new ArrayBuffer(46));
        c.setUint32(0, 0x02014b50, true); c.setUint16(10, comprimir ? 8 : 0, true);
        c.setUint32(20, datos.length, true); c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
        partes.push(new Uint8Array(local.buffer), n, datos);
        centro.push(new Uint8Array(c.buffer), n);
        pos += 30 + n.length + datos.length;
      }
      const largoCentro = centro.reduce((t, x) => t + x.length, 0);
      const fin = new DataView(new ArrayBuffer(22));
      fin.setUint32(0, 0x06054b50, true); fin.setUint16(10, Object.keys(archivos).length, true);
      fin.setUint32(12, largoCentro, true); fin.setUint32(16, pos, true);
      const archivo = new File([...partes, ...centro, new Uint8Array(fin.buffer)], 'padron.xlsx');
      const dt = new DataTransfer(); dt.items.add(archivo);
      const entrada = document.getElementById('archivoPadron');
      entrada.files = dt.files; entrada.dispatchEvent(new Event('change'));
      for (let i = 0; i < 40 && !document.querySelector('#vista-importacion .imp-lista'); i++) await new Promise((o) => setTimeout(o, 50));
      return { texto: document.getElementById('pegarPadron').value,
        vista: document.getElementById('vista-importacion').innerText.replace(/\\s+/g, ' ') };
    })()`);
    comprobar('Excel (.xlsx): se lee directo, con título arriba, textos y fecha',
      r.texto.startsWith('PADRÓN 2026\n\n') && r.texto.includes('40123456\t1990-01-01\tHabitual') &&
      /Se agregarán: 1/.test(r.vista) && /Quispe Rosa "Chabuca" Se agrega Fila 4 · DNI 40123456 · Adulto\/a · Habitual/.test(r.vista),
      JSON.stringify(r).slice(0, 300));
    comprobar('Excel (.xlsx): sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 1i. Lo que no aporta no se muestra: sin «null» en Entregas, sin panel vacío.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/calendario.html`);
    const entregas = await p.eval(`document.body.innerText`);
    comprobar('Entregas: no aparece «null» ni el aviso de configurar entregas',
      !/\bnull\b/.test(entregas) && !/Todavía no has indicado/.test(entregas), entregas.slice(0, 160));
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/padron.html`);
    const panel = await p.eval(`getComputedStyle(document.getElementById('panel')).display`);
    comprobar('Padrón vacío: sin nada que revisar, el panel no ocupa lugar', panel === 'none', panel);
    await p.cerrar();
  }

  // 1j. DNI sin el 0 de adelante (Excel lo quita): vuelve a tener 8 cifras al
  // importar, y la tarjeta lo dice.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/padron.html`);
    const vista = await p.actuar(`(async () => {
      const area = document.getElementById('pegarPadron');
      area.value = 'Apellido paterno\\tNombres\\tDNI\\tGrupo de edad\\tTipo\\nQuispe\\tRosa\\t4567891\\tAdulto\\tHabitual';
      document.getElementById('revisar-importacion').click();
      return document.getElementById('vista-importacion').innerText.replace(/\\s+/g, ' ');
    })()`);
    comprobar('importar: un DNI de 7 cifras vuelve con su 0 y se avisa',
      /DNI con el 0 agregado: 1/.test(vista) && /DNI 04567891/.test(vista) && /se agregó el 0/.test(vista), vista.slice(0, 220));
    await p.cerrar();
  }

  // 1k. Ajustes: se llega desde el menú ⋮; la letra, el modo y el botón 🔊
  // se eligen ahí y valen en las otras páginas desde el primer cuadro.
  // Instalar: cuando el navegador lo permite, la app ofrece su propio botón.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    const menu = await p.eval(`(document.querySelector('.cabecera-menu').click(),
      [...document.querySelectorAll('.menu-opciones button')].map((b) => b.textContent.trim()))`);
    comprobar('menú ⋮: leer, ayuda, Tus datos y Ajustes',
      menu.join('|') === 'Leer esta pantalla en voz alta|¿Cómo se usa?|Tus datos|Ajustes', menu.join('|'));
    await p.ir(`${base}/datos.html`);
    const datos = await p.eval(`({ copia: !!document.querySelector('#barra-datos .boton'),
      borrarAparte: !document.querySelector('#barra-datos .peligro') && !!document.querySelector('#borrar-todo .peligro'),
      ultima: document.getElementById('ultima-copia').textContent,
      lugares: document.querySelectorAll('#lugares .lugar').length })`);
    comprobar('tus datos: dónde se guardan, copia y «Borrar todo» aparte al final',
      datos.copia && datos.borrarAparte && /Todavía no guardaste/.test(datos.ultima) && datos.lugares >= 2, JSON.stringify(datos));
    await p.ir(`${base}/ajustes.html#copia`);
    await pausa(400);
    const desvio = await p.eval('location.pathname + location.hash');
    comprobar('ajustes: #copia lleva a Tus datos', desvio.endsWith('/datos.html#copia'), desvio);
    await p.ir(`${base}/ajustes.html`);
    const ajustes = await p.actuar(`(() => {
      document.getElementById('letra-grande').click();
      document.getElementById('tema-oscuro').click();
      document.getElementById('voz-boton').click();
      return { sinCopia: !document.getElementById('barra-datos') && !document.getElementById('borrar-todo'),
        enlace: document.getElementById('enlace-datos').getAttribute('href') };
    })()`);
    comprobar('ajustes: sin la copia, con el paso a Tus datos',
      ajustes.sinCopia && ajustes.enlace === './datos.html', JSON.stringify(ajustes));
    // Cada cosa en su lugar: en cada página, primero el trabajo, después lo
    // que se configura, los reportes y al final traer datos.
    const titulos = async (pagina) => {
      await p.ir(`${base}/${pagina}`);
      return p.eval(`[...document.querySelectorAll('main h2')].map((h) => h.textContent.trim()).join('|')`);
    };
    const ordenes = {
      'datos.html': 'Copia de tus datos|Qué va en la copia|Pasar a otro teléfono|Traer un padrón de Excel|Dónde se guardan|Borrar todo',
      'asistencia.html': 'Asistencia de hoy|Otros días|Precio del menú|Resumen por fechas',
      'padron.html': 'Inscribir a una persona|Personas afiliadas|Reporte para el padrón|Cargar un padrón desde Excel',
      'calendario.html': 'Próximas entregas|Cada cuánto entregas',
      'ajustes.html': 'Quién usa este teléfono|Aspecto|Leer en voz alta|Acerca de'
    };
    for (const [pagina, esperado] of Object.entries(ordenes)) {
      const visto = (await titulos(pagina)).replace(/Asistencia de hoy.*?\|/, 'Asistencia de hoy|');
      comprobar(`orden de ${pagina}`, visto === esperado, visto);
    }
    await p.ir(`${base}/index.html`);
    const mas = await p.eval(`[...document.querySelectorAll('.mas-opciones .enlace-titulo')].map((e) => e.textContent).join('|')`);
    comprobar('Inicio: «Más» con Tus datos, Ajustes y ¿Cómo se usa?', mas === 'Tus datos|Ajustes|¿Cómo se usa?', mas);
    await p.ir(`${base}/padron.html`);
    const letra = await p.eval(`({ clase: document.documentElement.classList.contains('letra-grande'),
      base: getComputedStyle(document.documentElement).fontSize,
      tema: document.documentElement.dataset.tema,
      fondo: getComputedStyle(document.body).backgroundColor,
      voz: getComputedStyle(document.querySelector('.cabecera-voz')).display })`);
    comprobar('ajustes: letra grande, modo oscuro y 🔊 valen en otra página',
      letra.clase && letra.base === '18px' && letra.tema === 'oscuro' && letra.fondo === 'rgb(16, 23, 18)' && letra.voz === 'grid',
      JSON.stringify(letra));
    const oferta = await p.actuar(`(async () => {
      let pedido = 0;
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { pedido += 1; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      dispatchEvent(e);
      const franja = !!document.getElementById('oferta-instalar');
      document.querySelector('#oferta-instalar .boton').click();
      await new Promise((o) => setTimeout(o, 50));
      return { franja, pedido, sigue: !!document.getElementById('oferta-instalar') };
    })()`);
    comprobar('instalar: aparece «Instalar» y abre el pedido del navegador',
      oferta.franja && oferta.pedido === 1 && !oferta.sigue, JSON.stringify(oferta));
    await p.actuar(`['pi3.letra', 'pi3.tema', 'pi3.voz.boton'].forEach((c) => localStorage.removeItem(c))`);
    comprobar('ajustes / instalar: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 1l. Quienes comen sin estar inscritos: el contador suma raciones y se guarda.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    await p.actuar(`(() => { const b = [...document.querySelectorAll('#hoy .sin-inscribir button')];
      b[1].click(); b[1].click(); b[3].click(); })()`);
    await pausa(600);
    const cuenta = await p.eval(TEXTO('#hoy .hoy-detalle'));
    const guardado = await p.eval(`(async () => (${PADRON_GUARDADO}).atenciones.find((a) => a.fecha === '${hoyLocal()}').sinInscribir)()`);
    comprobar('sin inscribir: el contador suma y se guarda',
      /\+3 sin inscribir/.test(cuenta) && guardado && guardado.normal === 2 && guardado.ayudaSocial === 1,
      cuenta + ' ' + JSON.stringify(guardado));
    comprobar('sin inscribir: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 1m. B-1: empezar el mes siguiente guarda el anterior, que se puede abrir; y
  // Entregas dice cómo va el B-1.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/formato-b1.html`);
    await p.actuar(ESCRIBIR('#nombreCentro', 'Olla de Prueba'));
    await p.actuar(ESCRIBIR('#periodoEtiqueta', 'Septiembre'));
    await pausa(600);
    await p.actuar(`window.confirm = () => true; [...document.querySelectorAll('#meses-b1 button')]
      .find((b) => /mes siguiente/.test(b.textContent)).click()`);
    await pausa(1500);
    const nuevo = await p.eval(`({ centro: document.getElementById('nombreCentro').value,
      meses: [...document.querySelectorAll('.mes-item')].map((x) => x.innerText.replace(/\\s+/g, ' ')),
      cuantos: JSON.parse(localStorage.getItem('b1.rendiciones.v1')).length })`);
    comprobar('B-1: empezar el mes siguiente deja el anterior en «Meses anteriores»',
      nuevo.centro === '' && nuevo.cuantos === 2 && /Septiembre/.test(nuevo.meses.join()), JSON.stringify(nuevo));
    await p.actuar(`document.querySelector('.mes-item a').click()`);
    await pausa(1500);
    const viejo = await p.eval(`({ centro: document.getElementById('nombreCentro').value,
      aviso: (document.querySelector('#avisos-sistema').innerText || '') })`);
    comprobar('B-1: un mes anterior se abre con sus datos y lo dice',
      viejo.centro === 'Olla de Prueba' && /mes anterior: Septiembre/.test(viejo.aviso), JSON.stringify(viejo));
    await p.ir(`${base}/calendario.html`);
    const estadoB1 = await p.eval(TEXTO('#estado-b1'));
    comprobar('Entregas: dice cuánto le falta al B-1 del mes', /Al Formato B-1 le faltan \d+ datos/.test(estadoB1), estadoB1);
    comprobar('B-1 por meses: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 1n. El diseño de app: Inicio con tareas y primer uso; «Deshacer»; botón
  // flotante; B-1 por pasos; cuenta regresiva en Entregas.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/index.html`);
    const inicio = await p.eval(`({ tareas: document.querySelectorAll('.tarea').length,
      bienvenida: !!document.querySelector('dialog#bienvenida[open]'),
      menu: [...document.querySelectorAll('.nav-enlace')].map((a) => a.textContent).join(',') })`);
    comprobar('Inicio: cuatro tareas, menú con Inicio y primer uso la primera vez',
      inicio.tareas === 4 && inicio.bienvenida && inicio.menu === 'Inicio,Asistencia,Padrón,B-1,Entregas', JSON.stringify(inicio));
    await p.actuar(`[...document.querySelectorAll('#bienvenida button')].find((b) => b.textContent === 'Saltar').click()`);
    await p.ir(`${base}/index.html`);
    comprobar('primer uso: con «Saltar» no vuelve a aparecer', !(await p.eval(`!!document.querySelector('dialog#bienvenida')`)), '');

    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    const deshacer = await p.actuar(`(async () => {
      const cuenta = () => document.querySelector('.hoy-cuenta').textContent;
      const antes = cuenta();
      [...document.querySelectorAll('#hoy .toque-nombre')].find((b) => /Beta/.test(b.textContent)).click();
      const marcado = cuenta();
      const aviso = document.querySelector('#aviso-abajo').innerText;
      document.querySelector('#aviso-abajo button').click();
      return { antes, marcado, aviso, despues: cuenta() };
    })()`);
    comprobar('asistencia: tocar avisa «Marcaste a …» y «Deshacer» lo revierte',
      deshacer.antes === '1 de 3' && deshacer.marcado === '2 de 3' && /Marcaste a/.test(deshacer.aviso) && deshacer.despues === '1 de 3',
      JSON.stringify(deshacer));

    await p.ir(`${base}/padron.html`);
    const fab = await p.actuar(`(() => { document.querySelector('.fab').click();
      return { abierto: document.getElementById('bloque-alta').open, foco: document.activeElement.id }; })()`);
    comprobar('padrón: «+ Inscribir» abre el formulario y pone el cursor', fab.abierto && fab.foco === 'altaPaterno', JSON.stringify(fab));

    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/formato-b1.html`);
    const pasos = await p.actuar(`(() => {
      const visibles = () => [...document.querySelectorAll('[data-paso]')].filter((s) => s.offsetParent !== null).map((s) => s.dataset.paso);
      const siguiente = () => [...document.querySelectorAll('#pie-pasos button')].find((b) => /Siguiente/.test(b.textContent)).click();
      const r = { inicio: visibles(), texto: document.querySelector('.pasos-texto').textContent };
      // Vacío: no pasa, dice qué falta y lleva el cursor al primer dato.
      siguiente();
      r.vacio = visibles();
      r.aviso = !document.getElementById('aviso-pasos').hidden && /Para seguir/.test(document.getElementById('aviso-pasos').textContent);
      r.foco = document.activeElement && document.activeElement.id;
      // Con el paso 1 completo, sí.
      document.querySelector('input[name="tipoCentro"][value="olla_comun"]').click();
      const poner = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      poner('nombreCentro', 'Centro de prueba'); poner('codigoPca', '0123'); poner('nombrePresidenta', 'Nombre Ficticio');
      poner('dniPresidenta', '00000001'); poner('celular', '900000000');
      siguiente();
      r.siguiente = visibles();
      document.querySelector('#panel .enlace-ir')?.click();
      r.alDato = visibles();
      return r;
    })()`);
    comprobar('B-1 por pasos: con datos faltantes no avanza y dice qué falta; completo, «Siguiente» avanza',
      pasos.inicio.join() === '1' && /Paso 1 de 6/.test(pasos.texto) && pasos.vacio.join() === '1' && pasos.aviso &&
      pasos.siguiente.join() === '2' && pasos.alDato.length === 1, JSON.stringify(pasos));

    await p.eval(`(() => {
      const iso = (d) => \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
      const base = new Date(); base.setDate(base.getDate() + 5);
      const antes = new Date(base); antes.setMonth(antes.getMonth() - 1);
      localStorage.setItem('b1.calendario.v1', JSON.stringify({ periodicidad: 'mensual', fechaLimiteBase: iso(base),
        diasDeAviso: [3], entregas: [{ fechaLimite: iso(antes), estado: 'entregada' }] }));
      return 1; })()`);
    await p.ir(`${base}/calendario.html`);
    const reloj = await p.eval(TEXTO('#cuenta-regresiva'));
    comprobar('Entregas: cuenta regresiva arriba', /^5 días ?Faltan 5 días para entregar el B-1/.test(reloj), reloj);
    comprobar('diseño de app: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 2. Marcar a alguien y salir enseguida, antes de los 400 ms: no se pierde.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    await p.actuar(TOCAR('Beta'));
    await p.ir('about:blank');                 // dispara pagehide de inmediato
    await p.ir(`${base}/asistencia.html`);
    const r = await p.eval(TEXTO('.hoy-cuenta'));
    comprobar('salir justo después de marcar: el toque queda guardado', r === '2 de 3', r);
    const crudo = await p.eval(`localStorage.getItem('b1.padron.v1')`);
    comprobar('la asistencia se guarda compacta', crudo.includes('"vino"') && !crudo.includes('afiliadoId'),
      crudo.slice(0, 120));
    await p.cerrar();
  }

  // 2b. Filtrar reutiliza las filas: marcar con «los que faltan» puesto y
  // quitar el filtro deja la fila marcada, no una copia vieja.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar?padron=1`);
    await p.ir(`${base}/asistencia.html`);
    const FALTAN = `[...document.querySelectorAll('#hoy button')].find((b) => /falta|vinieron todos/.test(b.textContent)).click()`;
    await p.actuar(FALTAN);
    await p.actuar(TOCAR('Gama'));
    const conFiltro = await p.eval(`document.querySelectorAll('#hoy .toque:not([hidden])').length`);
    await p.actuar(FALTAN);
    const r = await p.eval(`(() => {
      const b = [...document.querySelectorAll('#hoy .toque-nombre')].find((x) => x.textContent.includes('Gama'));
      return { filas: document.querySelectorAll('#hoy .toque:not([hidden])').length, gama: b && b.getAttribute('aria-pressed') };
    })()`);
    comprobar('filtrar y volver: la fila marcada sigue marcada',
      conFiltro === 1 && r.filas === 3 && r.gama === 'true', JSON.stringify({ conFiltro, ...r }));
    await p.cerrar();
  }

  // 3. Dos pestañas: la asistencia marcada en una no la borra la otra.
  {
    const a = await pestana(cdp);
    await a.ir(`${base}/__sembrar?padron=1`);
    const b = await pestana(cdp);
    await b.ir(`${base}/padron.html`);        // abierta ANTES de marcar en a
    await a.ir(`${base}/asistencia.html`);
    await a.actuar(TOCAR('Gama'));
    await pausa(700);
    await b.actuar(`document.querySelector('#ficha-alfa0001 .persona-fila').click()`);
    await b.actuar(ESCRIBIR('[id^="a-nombres-alfa0001"]', 'Editada'));
    await pausa(700);
    const ids = await a.eval(IDS_HOY);
    const nombre = await a.eval(`(async () => (${PADRON_GUARDADO}).afiliados[0].nombres)()`);
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
    await b.actuar(`document.querySelector('#ficha-alfa0001 .persona-fila').click()`);
    await b.actuar(`(() => { const el = document.querySelector('[id^="a-nombres-alfa0001"]');
      el.focus(); el.setSelectionRange(2, 2); })()`);
    await a.ir(`${base}/asistencia.html`);
    await a.actuar(TOCAR('Beta'));
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
    await a.ir(`${base}/asistencia.html`);
    await a.actuar(ESCRIBIR('#precioNormal', '4.50'));
    await pausa(700);
    await b.actuar(ESCRIBIR('#nombreCentro', 'Comedor de prueba'));
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
    await a.actuar(ESCRIBIR('#nombreCentro', 'Comedor Uno'));
    await pausa(1200);                         // b recibe el storage y se recarga
    const enB = await b.eval(`document.querySelector('#nombreCentro').value`);
    await b.actuar(ESCRIBIR('#codigoPca', '123'));
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
    await p.actuar(ESCRIBIR('#nombreCentro', 'Comedor Dos'));
    await p.ir('about:blank');
    await p.ir(`${base}/formato-b1.html`);
    const v = await p.eval(`document.querySelector('#nombreCentro').value`);
    comprobar('B-1: salir justo después de escribir no lo pierde', v === 'Comedor Dos', v);
    await p.cerrar();
  }

  // 6b. Entregas: lo mismo (antes no guardaba lo pendiente al salir).
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.ir(`${base}/calendario.html`);
    await p.actuar(`(() => { const s = document.querySelector('#periodicidad'); s.value = 'semanal';
      s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await p.ir('about:blank');
    await p.ir(`${base}/calendario.html`);
    const v = await p.eval(`document.querySelector('#periodicidad').value`);
    comprobar('Entregas: salir justo después de cambiar no lo pierde', v === 'semanal', v);
    await p.cerrar();
  }

  // 6c. Un año de uso de una olla grande (300 personas, 365 días): cabe con
  // holgura, abre rápido y un toque no se demora. Antes de las casillas y del
  // índice de validación, esto llenaba el espacio y cada toque tardaba
  // segundos en un celular modesto. Los límites son holgados (aquí no se
  // frena la CPU): saltan si vuelve un recorrido de todos contra todos.
  {
    const p = await pestana(cdp);
    await p.ir(`${base}/__sembrar`);
    await p.eval(`(async () => {
      const m = await import('./js/modelo.js');
      const id = (n) => 'f0000000-0000-4000-8000-' + String(n).padStart(12, '0');
      const afiliados = Array.from({ length: 300 }, (_, i) => ({
        id: id(i), apellidoPaterno: i === 0 ? 'Huamán' : 'Prueba' + i, apellidoMaterno: '', nombres: 'Persona',
        numeroDocumento: String(10000000 + i), tipoDocumento: 'dni', fechaNacimiento: '1990-01-01',
        grupoEtarioManual: null, sexo: '', tipoAfiliado: i % 5 ? 'habitual' : 'caso_social',
        activo: true, altaEn: '2020-01-01', bajaEn: '', motivoBaja: '', origenDato: 'manual',
        verificadoPor: '', nota: '' }));
      const atenciones = Array.from({ length: 365 }, (_, d) => ({
        id: id(100000 + d), fecha: new Date(Date.now() - (d + 1) * 864e5).toISOString().slice(0, 10),
        asistencias: afiliados.filter((_, i) => (i * 7 + d) % 10 < 7).map((a) => ({
          afiliadoId: a.id, tipoMenu: a.tipoAfiliado === 'caso_social' ? 'ayuda_social' : 'normal' })),
        precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100, precioTomadoDeConfig: true,
        legado: null, nota: '' }));
      m.guardar('b1.padron.v1', { version: 3, afiliados, atenciones });
    })()`);
    const uso = await p.eval(`import('./js/modelo.js').then((m) => m.usoAlmacenamiento().fraccion)`);
    comprobar('un año de 300 personas ocupa menos del 20 % del espacio', uso < 0.2, `${Math.round(uso * 100)} %`);
    await p.ir(`${base}/asistencia.html`);
    const abrir = await p.eval(`Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)`);
    comprobar('con un año de datos, Asistencia abre en menos de 0,8 s', abrir < 800, `${abrir} ms`);
    const toque = await p.actuar(`(async () => {
      const t = performance.now();
      document.querySelectorAll('#hoy .toque-nombre')[10].click();
      const alInstante = performance.now() - t;
      await new Promise((o) => setTimeout(o, 0));
      await new Promise((o) => setTimeout(o, 0));
      return [Math.round(alInstante), Math.round(performance.now() - t)];
    })()`);
    comprobar('con un año de datos, un toque marca al instante y todo se pone al día rápido',
      toque[0] < 50 && toque[1] < 200, `${toque[0]} ms / ${toque[1]} ms`);
    // Se escribe como se habla: sin tildes, en mayúsculas, o el DNI.
    const halla = await p.eval(`(() => {
      const i = document.getElementById('hoy-buscar');
      const ver = (q) => {
        i.value = q; i.dispatchEvent(new Event('input'));
        return [...document.querySelectorAll('#hoy .toque:not([hidden]) .toque-nombre')].map((b) => b.textContent);
      };
      const r = { sinTilde: ver('HUAMAN'), dni: ver('10000007'), nada: ver('zzz').length };
      ver('');
      return r;
    })()`);
    comprobar('buscar en la lista de hoy: sin tildes y por DNI',
      halla.sinTilde.length === 1 && halla.sinTilde[0].includes('Huamán') &&
      halla.dni.length === 1 && halla.dni[0].includes('Prueba7') && halla.nada === 0, JSON.stringify(halla));
    await p.ir(`${base}/padron.html`);
    const padron = await p.eval(`Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)`);
    comprobar('con un año de datos, Padrón abre en menos de 0,8 s', padron < 800, `${padron} ms`);
    comprobar('con un año de datos, sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }

  // 7. En un celular (360×740, táctil): el menú va abajo, nada se desborda a
  // lo ancho y la lista de asistencia se ve sin desplazarse.
  {
    const p = await pestana(cdp);
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.ir(`${base}/__sembrar?padron=1`);
    const desbordan = [];
    for (const nombre of ['index', 'asistencia', 'padron', 'formato-b1', 'calendario']) {
      await p.ir(`${base}/${nombre}.html`);
      if (await p.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)) desbordan.push(nombre);
    }
    comprobar('celular: ninguna página se desborda a lo ancho', desbordan.length === 0, desbordan.join(' '));
    await p.ir(`${base}/asistencia.html`);
    const r = await p.eval(`(() => {
      const nav = document.querySelector('.nav').getBoundingClientRect();
      const fila = document.querySelector('#hoy .toque').getBoundingClientRect();
      return { navAbajo: Math.round(nav.bottom) === innerHeight, filaVisible: fila.bottom <= nav.top };
    })()`);
    comprobar('celular: el menú queda abajo', r.navAbajo, JSON.stringify(r));
    comprobar('celular: la primera persona se ve al abrir', r.filaVisible, JSON.stringify(r));
    // Con una lista larga, lo que se toca al pie de la pantalla tiene que ser
    // el menú, no una fila dibujada encima (pasó con content-visibility).
    await p.eval(`import('./js/modelo.js').then((m) => m.guardar('b1.padron.v1', { version: 3, atenciones: [],
      afiliados: Array.from({ length: 40 }, (_, i) => ({ id: 'f0000000-0000-4000-8000-' + String(i).padStart(12, '0'),
        apellidoPaterno: 'Prueba' + i, apellidoMaterno: '', nombres: 'Persona', numeroDocumento: String(20000000 + i),
        tipoDocumento: 'dni', fechaNacimiento: '1990-01-01', grupoEtarioManual: null, sexo: '', tipoAfiliado: 'habitual',
        activo: true, altaEn: '2020-01-01', bajaEn: '', motivoBaja: '', origenDato: 'manual', verificadoPor: '', nota: '' })) }))`);
    const tapados = [];
    for (const nombre of ['asistencia', 'padron']) {
      await p.ir(`${base}/${nombre}.html`);
      if (!await p.eval(`!!document.elementFromPoint(innerWidth / 2, innerHeight - 20).closest('.nav')`)) tapados.push(nombre);
    }
    comprobar('celular: con una lista larga, el menú de abajo queda encima', tapados.length === 0, tapados.join(' '));
    comprobar('celular: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
    await p.cerrar();
  }
}

// 8. Sin servidor: con el service worker ya instalado, la aplicación abre igual.
// Va al final y aparte porque apaga el servidor.
async function sinServidor(base, cdp, servidor) {
  const p = await pestana(cdp);
  await p.ir(`${base}/__sembrar?padron=1`);
  await p.ir(`${base}/asistencia.html`);
  const listo = await p.eval(`navigator.serviceWorker.ready.then((r) => !!r.active)`);
  await p.ir(`${base}/asistencia.html`);           // ahora la controla el service worker
  const controla = await p.eval(`!!navigator.serviceWorker.controller`);
  comprobar('service worker: instalado y a cargo de la página', listo && controla, JSON.stringify({ listo, controla }));

  // Se publica una versión nueva: la app sigue con su copia hasta tenerla
  // entera, avisa, y al recargar usa la nueva.
  versionCss = '\n/* versión nueva de humo */\n';
  const aviso = await p.eval(`new Promise((ok) => {
    navigator.serviceWorker.addEventListener('message', (e) => ok(e.data));
    navigator.serviceWorker.controller.postMessage('buscar-actualizacion-ya');
    setTimeout(() => ok('sin aviso'), 8000);
  })`);
  await pausa(300);
  const visible = await p.eval(`!!document.getElementById('aviso-version')`);
  await p.ir(`${base}/asistencia.html`);
  const css = await p.eval(`fetch('./estilos.css').then((r) => r.text())`);
  comprobar('versión nueva: avisa y se usa al recargar',
    aviso === 'version-nueva' && visible && css.includes('versión nueva de humo'),
    JSON.stringify({ aviso, visible, nueva: css.includes('versión nueva de humo') }));

  servidor.closeAllConnections();
  await new Promise((ok) => servidor.close(ok));
  const fallan = [];
  for (const nombre of ['index', 'asistencia', 'padron', 'formato-b1', 'calendario']) {
    await p.ir(`${base}/${nombre}.html`);
    const ok = await p.eval(`document.querySelectorAll('.nav-enlace').length === 5`);
    if (!ok) fallan.push(nombre);
  }
  await p.ir(`${base}/asistencia.html`);
  const personas = await p.eval(`document.querySelectorAll('#hoy .toque:not([hidden])').length`);
  comprobar('sin servidor: las cinco páginas abren', fallan.length === 0, fallan.join(' '));
  comprobar('sin servidor: la asistencia muestra el padrón', personas === 3, String(personas));
  comprobar('sin servidor: sin errores de consola', p.errores.length === 0, p.errores.join(' | '));
  await p.cerrar();
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
  await sinServidor(base, cdp, servidor);
} catch (e) {
  fallo = true;
  console.error('La prueba se interrumpió:', e.message);
} finally {
  // Esperar a que Chrome termine antes de borrar su perfil: si no, sigue
  // escribiendo en él y el borrado falla (ENOTEMPTY). Limpiar es secundario:
  // un fallo aquí no debe tapar los resultados.
  const salio = new Promise((ok) => chrome.proc.once('exit', ok));
  chrome.proc.kill();
  await Promise.race([salio, pausa(5000)]);
  if (servidor.listening) servidor.close();
  try {
    fs.rmSync(chrome.perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (e) {
    console.error(`Aviso: no se pudo borrar el perfil temporal ${chrome.perfil}: ${e.code}`);
  }
}

for (const r of resultados) {
  console.log(`${r.ok ? '✓' : '✕'} ${r.nombre}${r.ok || !r.detalle ? '' : `\n    ${r.detalle}`}`);
}
const fallan = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallan} de ${resultados.length} pasan`);
process.exit(fallo || fallan ? 1 : 0);
