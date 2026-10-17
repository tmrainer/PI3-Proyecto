// xlsx.js — leer y escribir archivos de Excel (.xlsx) sin librerías.
//
// Leer: la primera hoja, para importar un padrón (leerXlsx).
// Escribir: los reportes que se exportan (armarXlsx; los arma excel-reportes.js).
//
// Antes había que abrir el Excel y «Guardar como» CSV: justo el paso donde se
// traba quien tiene poca costumbre con la computadora. Un .xlsx es un ZIP con
// XML adentro; el navegador ya trae lo necesario para abrirlo
// (DecompressionStream y DOMParser), así que no se agrega ninguna dependencia
// ni se manda nada a ningún lado.
//
// Devuelve el texto de la hoja separado por tabuladores, igual que lo que se
// pega desde Excel: de ahí en adelante, la importación es la misma de siempre.
// No lee el Excel antiguo (.xls), que es otro formato.

const firma = (v, i) => v.getUint32(i, true);

/** Las entradas del ZIP: nombre -> { metodo, inicio, largo }. */
function indiceZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (firma(v, i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('no es un archivo .xlsx');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const entradas = new Map();
  const decodificar = new TextDecoder();
  for (let n = 0; n < total; n += 1) {
    if (firma(v, p) !== 0x02014b50) throw new Error('el archivo está dañado');
    const metodo = v.getUint16(p + 10, true);
    const largo = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const largoExtra = v.getUint16(p + 30, true);
    const largoComentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nombre = decodificar.decode(bytes.subarray(p + 46, p + 46 + largoNombre));
    // Los datos empiezan después de la cabecera local, que tiene su propio largo de extra.
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    entradas.set(nombre, { metodo, inicio, largo });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

async function leerEntrada(bytes, entradas, nombre) {
  const e = entradas.get(nombre);
  if (!e) return null;
  const crudo = bytes.subarray(e.inicio, e.inicio + e.largo);
  if (e.metodo === 0) return new TextDecoder().decode(crudo);
  if (e.metodo !== 8) throw new Error('compresión no soportada');
  const flujo = new Blob([crudo]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(flujo).text();
}

const xml = (texto) => new DOMParser().parseFromString(texto, 'application/xml');
// Los XML de Excel usan espacios de nombres: se busca por nombre local.
const hijos = (nodo, nombre) => [...nodo.getElementsByTagNameNS('*', nombre)];

/** Fechas: los formatos de número de Excel que muestran días, meses o años. */
function estilosDeFecha(texto) {
  const fechas = new Set();
  if (!texto) return fechas;
  const doc = xml(texto);
  const propios = new Map(hijos(doc, 'numFmt').map((f) => [f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '']));
  const xfs = hijos(doc, 'cellXfs')[0];
  if (!xfs) return fechas;
  hijos(xfs, 'xf').forEach((xf, i) => {
    const id = Number(xf.getAttribute('numFmtId'));
    const codigo = propios.get(String(id));
    const esFecha = (id >= 14 && id <= 22) || (id >= 45 && id <= 47) ||
      (codigo !== undefined && /[dmy]/i.test(codigo.replace(/"[^"]*"|\[[^\]]*\]/g, '')));
    if (esFecha) fechas.add(i);
  });
  return fechas;
}

/** Número de serie de Excel -> 'AAAA-MM-DD'. */
function serieAFecha(serie, desde1904) {
  const dias = Math.floor(serie) + (desde1904 ? 1462 : 0);
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 86400000);
  return d.toISOString().slice(0, 10);
}

/** «B12» -> 1 (columnas desde 0). */
function columna(ref) {
  let n = 0;
  for (const c of String(ref).replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function celdaTsv(valor) {
  const t = String(valor).replace(/[\t\r\n]+/g, ' ').trim();
  return t.includes('"') ? `"${t.replace(/"/g, '""')}"` : t;
}

/**
 * La primera hoja de un .xlsx como texto separado por tabuladores.
 * @param {ArrayBuffer} buffer  el archivo
 * @returns {Promise<string>}
 */
export async function leerXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const entradas = indiceZip(bytes);

  const libro = xml(await leerEntrada(bytes, entradas, 'xl/workbook.xml') || '<x/>');
  const primera = hijos(libro, 'sheet')[0];
  if (!primera) throw new Error('el libro no tiene hojas');
  const desde1904 = (hijos(libro, 'workbookPr')[0] || { getAttribute: () => null }).getAttribute('date1904');
  const rid = primera.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ||
    primera.getAttribute('r:id');
  let ruta = 'xl/worksheets/sheet1.xml';
  const rels = await leerEntrada(bytes, entradas, 'xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    const rel = hijos(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) {
      const destino = rel.getAttribute('Target');
      ruta = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino.replace(/^\.\//, '');
    }
  }

  const compartidas = [];
  const textos = await leerEntrada(bytes, entradas, 'xl/sharedStrings.xml');
  if (textos) {
    for (const si of hijos(xml(textos), 'si')) {
      compartidas.push(hijos(si, 't').map((t) => t.textContent).join(''));
    }
  }
  const fechas = estilosDeFecha(await leerEntrada(bytes, entradas, 'xl/styles.xml'));

  const hoja = await leerEntrada(bytes, entradas, ruta);
  if (!hoja) throw new Error('no se encontró la primera hoja');
  // Las filas vacías se dejan como líneas vacías: así el número de fila que
  // muestra la revisión es el mismo que se ve en Excel.
  const filas = [];
  for (const fila of hijos(xml(hoja), 'row')) {
    const r = Number(fila.getAttribute('r'));
    while (Number.isInteger(r) && filas.length < r - 1) filas.push('');
    const celdas = [];
    for (const c of hijos(fila, 'c')) {
      const tipo = c.getAttribute('t');
      const v = hijos(c, 'v')[0];
      let valor = '';
      if (tipo === 's') valor = compartidas[Number(v && v.textContent)] || '';
      else if (tipo === 'inlineStr') valor = hijos(c, 't').map((t) => t.textContent).join('');
      else if (v) {
        valor = v.textContent;
        const estilo = Number(c.getAttribute('s') || 0);
        if (tipo === 'd') valor = valor.slice(0, 10);          // fecha ISO guardada como tal
        else if ((!tipo || tipo === 'n') && fechas.has(estilo) && Number.isFinite(Number(valor))) {
          valor = serieAFecha(Number(valor), desde1904 === '1' || desde1904 === 'true');
        }
      }
      const i = c.getAttribute('r') ? columna(c.getAttribute('r')) : celdas.length;
      while (celdas.length < i) celdas.push('');
      celdas[i] = celdaTsv(valor);
    }
    filas.push(celdas.join('\t'));
  }
  return filas.join('\n').replace(/\n+$/, '');
}

/** ¿Empieza como un ZIP (y por lo tanto, quizás un .xlsx)? */
export function pareceXlsx(buffer) {
  const b = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
}

// ------------------------------------------------------------------ escribir
//
// Lo mínimo que Excel, Google Sheets y WPS (el del celular) abren sin quejarse:
// texto en la propia celda (sin tabla de textos compartidos), negrita y
// soles con dos decimales. El ZIP va sin comprimir: un reporte pesa pocos KB y
// así no hace falta nada asíncrono.

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP sin compresión: [{nombre, bytes}] -> bytes. */
function armarZip(archivos) {
  const cod = new TextEncoder();
  const partes = [];
  const central = [];
  let desplazamiento = 0;
  for (const { nombre, bytes } of archivos) {
    const n = cod.encode(nombre);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    // Firma, versión 2.0, nombres en UTF-8, sin compresión, fecha 01-01-1980.
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 33, 2],
      [14, crc, 4], [18, bytes.length, 4], [22, bytes.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([i, v, t]) => (t === 4 ? local.setUint32(i, v, true) : local.setUint16(i, v, true)));
    const cabecera = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 33, 2],
      [16, crc, 4], [20, bytes.length, 4], [24, bytes.length, 4], [28, n.length, 2], [30, 0, 2], [32, 0, 2],
      [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, desplazamiento, 4]]
      .forEach(([i, v, t]) => (t === 4 ? cabecera.setUint32(i, v, true) : cabecera.setUint16(i, v, true)));
    partes.push(new Uint8Array(local.buffer), n, bytes);
    central.push(new Uint8Array(cabecera.buffer), n);
    desplazamiento += 30 + n.length + bytes.length;
  }
  const largoCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, archivos.length, 2], [10, archivos.length, 2],
    [12, largoCentral, 4], [16, desplazamiento, 4], [20, 0, 2]]
    .forEach(([i, v, t]) => (t === 4 ? fin.setUint32(i, v, true) : fin.setUint16(i, v, true)));
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) { salida.set(p, i); i += p.length; }
  return salida;
}

// Lo que no puede ir en un XML (caracteres de control) se quita.
const escaparXml = (t) => String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 -> A, 26 -> AA. */
function letraColumna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Estilos (cellXfs): 0 normal, 1 negrita, 2 soles (0.00), 3 soles en negrita.
const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="2" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

function celdaXml(c, ref) {
  const o = c !== null && typeof c === 'object' ? c : { v: c };
  if (o.v === null || o.v === undefined || o.v === '') return '';
  const s = (o.soles ? 2 : 0) + (o.negrita ? 1 : 0);
  const estilo = s ? ` s="${s}"` : '';
  if (typeof o.v === 'number' && Number.isFinite(o.v)) return `<c r="${ref}"${estilo}><v>${o.v}</v></c>`;
  // Todo lo demás, texto: un DNI con su 0 adelante queda como se escribió.
  return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escaparXml(o.v)}</t></is></c>`;
}

function hojaXml({ filas, anchos = [] }) {
  const cols = anchos.length
    ? `<cols>${anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>` : '';
  const cuerpo = filas.map((fila, f) => {
    const celdas = (fila || []).map((c, i) => celdaXml(c, letraColumna(i) + (f + 1))).join('');
    return celdas ? `<row r="${f + 1}">${celdas}</row>` : '';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${cuerpo}</sheetData></worksheet>`;
}

/**
 * Arma un .xlsx. Cada celda es un texto, un número, vacío (null o ''), o
 * { v, negrita?, soles? } (soles: número con dos decimales).
 * @param {{nombre: string, filas: Array<Array<*>>, anchos?: number[]}[]} hojas
 *   anchos: de cada columna, en caracteres
 * @returns {Uint8Array}
 */
export function armarXlsx(hojas) {
  const cod = new TextEncoder();
  // Excel no acepta nombres de hoja de más de 31 letras ni con []:*?/\
  const nombres = hojas.map((h, i) => String(h.nombre || `Hoja ${i + 1}`).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const archivos = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '</Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_R}"><sheets>` +
      nombres.map((n, i) => `<sheet name="${escaparXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${hojas.length + 1}" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)])
  ];
  return armarZip(archivos.map(([nombre, texto]) => ({ nombre, bytes: cod.encode(texto) })));
}
