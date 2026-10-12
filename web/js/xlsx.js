// xlsx.js — leer la primera hoja de un archivo de Excel (.xlsx) sin librerías.
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
