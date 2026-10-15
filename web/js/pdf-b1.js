// pdf-b1.js — el B-1 como PDF de referencia, para guardar o mandar por
// WhatsApp cuando no se puede imprimir sobre la hoja oficial.
//
// No es el formato oficial ni sirve para superponer (eso es la fase 5, AGENTS.md
// §8): dibuja los rótulos y las líneas del formato en gris y los datos en negro,
// en las mismas posiciones de plantilla-b1.js, para que se lea solo. Cada hoja
// dice arriba «Copia de referencia» y cuándo se generó.
//
// El PDF se escribe a mano (texto, líneas y recuadros con las fuentes estándar
// Helvetica, codificación WinAnsi): sin librerías, sin red. Puro: recibe las
// hojas de hojasDelB1() y devuelve los bytes.

import { PLANTILLA_B1 } from './plantilla-b1.js';

const PT = 72 / 25.4; // puntos por mm
const ALTO = 297;

// Anchos de Helvetica (AFM estándar, milésimas de em) para medir el texto.
const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
  722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
  556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const ESPECIALES = { '–': 0x96, '—': 0x97, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };

/** Texto a bytes WinAnsi (Latin-1 + algunos signos); lo que no existe, «?». */
function aWinAnsi(texto) {
  let s = '';
  for (const ch of String(texto)) {
    const c = ch.codePointAt(0);
    if (ESPECIALES[ch]) s += String.fromCharCode(ESPECIALES[ch]);
    else if (c >= 32 && c <= 255 && !(c >= 127 && c < 160)) s += ch;
    else s += '?';
  }
  return s.replace(/[\\()]/g, '\\$&');
}

/** Ancho del texto en mm a `pt` puntos (las letras con tilde, como su base). */
export function anchoMm(texto, pt, negrita = false) {
  let mil = 0;
  for (const ch of String(texto)) {
    const base = ch.normalize('NFD')[0];
    const c = base.charCodeAt(0);
    mil += c >= 32 && c <= 126 ? ANCHOS[c - 32] : 556;
  }
  return (mil / 1000) * pt * (negrita ? 1.07 : 1) / PT;
}

// ------------------------------------------------------------ dibujo en mm

function lienzo() {
  const ops = [];
  const x = (mm) => (mm * PT).toFixed(2);
  const y = (mm) => ((ALTO - mm) * PT).toFixed(2);
  return {
    ops,
    gris(g) { ops.push(`${g} g ${g} G`); },
    grosor(mm) { ops.push(`${(mm * PT).toFixed(2)} w`); },
    punteada(si) { ops.push(si ? '[0.6 1.8] 0 d' : '[] 0 d'); },
    linea(x1, y1, x2, y2) { ops.push(`${x(x1)} ${y(y1)} m ${x(x2)} ${y(y2)} l S`); },
    caja(xm, ym, w, h) { ops.push(`${x(xm)} ${y(ym + h)} ${(w * PT).toFixed(2)} ${(h * PT).toFixed(2)} re S`); },
    relleno(xm, ym, w, h) { ops.push(`${x(xm)} ${y(ym + h)} ${(w * PT).toFixed(2)} ${(h * PT).toFixed(2)} re f`); },
    // `yBase`: línea donde se apoyan las letras.
    texto(t, xm, yBase, pt, { negrita = false } = {}) {
      if (!t) return;
      ops.push(`BT /${negrita ? 'F2' : 'F1'} ${pt} Tf ${x(xm)} ${y(yBase)} Td (${aWinAnsi(t)}) Tj ET`);
    }
  };
}

/** Parte un texto en dos renglones que entren en `libre` mm a `pt`, o null. */
function enDos(texto, libre, pt) {
  const palabras = texto.split(/\s+/);
  for (let i = palabras.length - 1; i > 0; i--) {
    const a = palabras.slice(0, i).join(' ');
    const b = palabras.slice(i).join(' ');
    if (anchoMm(a, pt) <= libre && anchoMm(b, pt) <= libre) return [a, b];
  }
  return null;
}

/**
 * Un dato dentro de su caja. Lo que no entra: primero hasta 2 pt más chico en
 * un renglón, después en dos renglones, después más chico hasta 5 pt y, si
 * igual no entra, cortado con «…». Se prioriza que se lea.
 */
function datoEnCaja(l, texto, { xMm, yMm, anchoMm: w, altoMm: h, align }, ptBase) {
  if (!texto) return;
  const margen = 0.8;
  const libre = w - 2 * margen;
  // Primero, un poco más chico en un solo renglón (hasta 2 pt menos).
  let pt1 = ptBase;
  while (pt1 > ptBase - 2 && anchoMm(texto, pt1) > libre) pt1 -= 0.25;
  if (anchoMm(texto, pt1) <= libre) ptBase = pt1;
  if (anchoMm(texto, ptBase) > libre) {
    const pt2 = Math.min(ptBase - 1, (h - 0.5) / 2 * PT / 1.05);
    const dos = pt2 >= 4.4 && enDos(texto, libre, pt2);
    if (dos) {
      dos.forEach((t, i) => {
        const a = anchoMm(t, pt2);
        const xm = align === 'right' ? xMm + w - margen - a : align === 'center' ? xMm + (w - a) / 2 : xMm + margen;
        l.texto(t, xm, yMm + (i + 1) * (h - 0.4) / 2, pt2);
      });
      return;
    }
  }
  let pt = ptBase;
  while (pt > 5 && anchoMm(texto, pt) > libre) pt -= 0.25;
  let t = texto;
  while (t.length > 1 && anchoMm(t + '…', pt) > libre && anchoMm(t, pt) > libre) t = t.slice(0, -1);
  if (t !== texto) t = t.trimEnd() + '…';
  const ancho = anchoMm(t, pt);
  const xm = align === 'right' ? xMm + w - margen - ancho : align === 'center' ? xMm + (w - ancho) / 2 : xMm + margen;
  l.texto(t, xm, yMm + h - 0.7, pt);
}

// -------------------------------------------- la estructura del formato

const P = PLANTILLA_B1;
const ROTULO = 6.5; // pt

/**
 * Rótulos, líneas y recuadros del formato, en gris, sobre cualquier lienzo que
 * sepa gris/grosor/punteada/linea/caja/relleno/texto en mm: el del PDF y el de
 * la vista previa en pantalla (SVG, en pagina-vista-previa.js).
 */
export function dibujarFormato(l) {
  const e = P.egresos;
  const c = e.columnas;
  const cols = Object.values(c);
  const finFilas = e.primeraFilaYMm + e.filas * e.altoFilaMm;
  const izq = cols[0].xMm;
  const der = cols[cols.length - 1].xMm + cols[cols.length - 1].anchoMm;

  l.gris(0.45);
  // Encabezado
  l.texto('PROGRAMA DE COMPLEMENTACIÓN - PCA', 105 - anchoMm('PROGRAMA DE COMPLEMENTACIÓN - PCA', 8, true) / 2, 30, 8, { negrita: true });
  const t2 = 'FORMATO B-1 (BALANCE DE CENTROS DE ATENCIÓN SUBSIDIADOS)';
  l.texto(t2, 105 - anchoMm(t2, 8, true) / 2, 34, 8, { negrita: true });
  const t3 = 'MUNICIPALIDAD DISTRITAL DE VILLA MARÍA DEL TRIUNFO';
  l.texto(t3, 105 - anchoMm(t3, 8, true) / 2, 39.5, 8, { negrita: true });

  l.texto('CENTRO DE ATENCIÓN:', 16, 49.5, ROTULO);
  l.texto('COMEDOR', 113, 49.5, ROTULO);
  l.texto('OLLA COMÚN', 159, 49.5, ROTULO);
  l.grosor(0.35);
  const mc = P.campos.marcaComedor;
  const mo = P.campos.marcaOllaComun;
  l.caja(mc.xMm, mc.yMm, mc.anchoMm, mc.altoMm);
  l.caja(mo.xMm, mo.yMm, mo.anchoMm, mo.altoMm);

  // Como en el papel: el rótulo empieza en el margen de su columna y la línea
  // punteada sigue hasta el final del espacio del dato.
  const renglones = [
    ['NOMBRE DEL CENTRO DE ATENCIÓN:', 'nombreCentro', 16], ['CÓDIGO DE PCA N°:', 'codigoPca', 139],
    ['MES DE RENDICIÓN:', 'periodo', 16], ['FECHA DE RENDICIÓN:', 'fechaRendicion', 139],
    ['NOMBRE DE LA PRESIDENTE(A):', 'nombrePresidenta', 16], ['DNI:', 'dniPresidenta', 16], ['CELULAR N°:', 'celular', 139]
  ];
  l.grosor(0.2);
  for (const [rotulo, campo, xr] of renglones) {
    const p = P.campos[campo];
    const base = p.yMm + p.altoMm;
    l.texto(rotulo, xr, base, ROTULO);
    l.punteada(true);
    l.linea(xr + anchoMm(rotulo, ROTULO) + 0.8, base + 0.4, p.xMm + p.anchoMm, base + 0.4);
    l.punteada(false);
  }

  // Ingresos
  const ms = P.campos.montoSubsidio;
  const fa = P.campos.fechaAsignacion;
  const iTop = ms.yMm - 4.8;
  const iBot = fa.yMm + fa.altoMm + 2.6;
  const iMid = (ms.yMm + ms.altoMm + fa.yMm) / 2;
  const iDiv = fa.xMm - 1.3;
  l.grosor(0.35);
  l.caja(izq, iTop, der - izq, iBot - iTop);
  l.relleno(izq, iTop, der - izq, 4.4);
  l.gris(1);
  l.texto('INGRESOS', 105 - anchoMm('INGRESOS', 7.5, true) / 2, iTop + 3.3, 7.5, { negrita: true });
  l.gris(0.45);
  l.linea(izq, iTop + 4.4, der, iTop + 4.4);
  l.linea(izq, iMid, der, iMid);
  l.linea(iDiv, iTop + 4.4, iDiv, iBot);
  l.texto('MONTO DEL SUBSIDIO:', izq + 1, ms.yMm + ms.altoMm, ROTULO);
  l.texto('FECHA DE LA ASIGNACIÓN:', izq + 1, fa.yMm + fa.altoMm, ROTULO);
  l.texto('S/', iDiv + 1, ms.yMm + ms.altoMm, ROTULO);

  // Egresos
  const eTop = e.primeraFilaYMm - 16.9;
  const cabecera = e.primeraFilaYMm - 12.4;
  const tot = [P.campos.totalConSubsidio, P.campos.totalAporte, P.campos.totalRendicion];
  const eBot = tot[2].yMm + tot[2].altoMm;
  l.caja(izq, eTop, der - izq, eBot - eTop);
  l.relleno(izq, eTop, der - izq, 4.4);
  l.gris(1);
  l.texto('EGRESOS', 105 - anchoMm('EGRESOS', 7.5, true) / 2, eTop + 3.3, 7.5, { negrita: true });
  l.gris(0.45);
  l.linea(izq, cabecera, der, cabecera);
  for (let i = 0; i <= e.filas; i++) l.linea(izq, e.primeraFilaYMm + i * e.altoFilaMm, der, e.primeraFilaYMm + i * e.altoFilaMm);
  for (const t of tot) l.linea(izq, t.yMm + t.altoMm, der, t.yMm + t.altoMm);
  cols.slice(1).forEach((col) => l.linea(col.xMm, cabecera, col.xMm, finFilas));
  l.linea(c.precioUnitario.xMm, finFilas, c.precioUnitario.xMm, eBot);
  l.linea(c.montoTotal.xMm, finFilas, c.montoTotal.xMm, eBot);
  const titulos = {
    fechaCompra: ['FECHA DE LA', 'COMPRA'], descripcion: ['DESCRIPCIÓN DE LA COMPRA'], cantidad: ['CANT.'],
    unidadMedida: ['UNIDAD DE', 'MEDIDA (Kg,', 'L, otros)'], rucProveedor: ['RUC DEL PROVEEDOR'],
    boleta: ['N° DE LA BOLETA', '(SERIE Y', 'CORRELATIVO)'], precioUnitario: ['PRECIO', 'UNITARIO'], montoTotal: ['MONTO TOTAL (S/)']
  };
  for (const [k, lineas] of Object.entries(titulos)) {
    const col = c[k];
    const alto = lineas.length * 2.4;
    lineas.forEach((t, i) => {
      const pt = Math.min(5.5, 5.5 * (col.anchoMm - 1) / Math.max(anchoMm(t, 5.5), 0.1));
      l.texto(t, col.xMm + (col.anchoMm - anchoMm(t, pt)) / 2, cabecera + (12.4 - alto) / 2 + 2 + i * 2.4, pt);
    });
  }
  const rotTot = ['GASTOS CON EL SUBSIDIO ECONÓMICO:', 'APORTE DEL CENTRO DE ATENCIÓN (registrar de corresponder):', 'TOTAL DE RENDICIÓN DE GASTOS:'];
  tot.forEach((t, i) => l.texto(rotTot[i], izq + 1, t.yMm + t.altoMm - 0.9, ROTULO));

  // Nota
  const nota = [
    'NOTA:',
    '1) Los documentos originales quedarán en custodia en la Municipalidad Distrital de Villa María del Triunfo para ser verificados oportunamente.',
    '2) Los documentos no deben presentar borrones y/o enmendaduras, sean Acta de Asamblea, Boletas de Venta, Formato de balance; de lo',
    'contrario no serán recepcionados por el personal de la Municipalidad Distrital de Villa María del Triunfo.'
  ];
  nota.forEach((t, i) => l.texto(t, 16, 207 + i * 4, 6, { negrita: i === 0 }));

  // Firmas
  const pf = P.campos.nombrePresidentaFirma;
  const tf = P.campos.nombreTesorera;
  const pd = P.campos.dniPresidentaFirma;
  const td = P.campos.dniTesorera;
  l.grosor(0.35);
  l.linea(16, pf.yMm - 6, 73, pf.yMm - 6);
  l.linea(139, tf.yMm - 5.6, 200, tf.yMm - 5.6);
  l.texto('PRESIDENTE(A)', 44.5 - anchoMm('PRESIDENTE(A)', 6.5, true) / 2, pf.yMm - 2.6, 6.5, { negrita: true });
  l.texto('TESORERO(A)', 169.5 - anchoMm('TESORERO(A)', 6.5, true) / 2, tf.yMm - 2.2, 6.5, { negrita: true });
  l.texto('NOMBRE Y APELLIDO:', 16, pf.yMm + pf.altoMm, ROTULO);
  l.texto('DNI N°:', 16, pd.yMm + pd.altoMm, ROTULO);
  l.texto('NOMBRE Y APELLIDO:', 139, tf.yMm + tf.altoMm, ROTULO);
  l.texto('DNI N°:', 139, td.yMm + td.altoMm, ROTULO);

  // Recibido por la Municipalidad (lo llena el personal municipal)
  l.texto('Recibido por la Municipalidad Distrital de Villa María del Triunfo', 16, 265, 6.5, { negrita: true });
  l.caja(izq, 268.1, der - izq, 11);
  l.linea(izq, 273.5, der, 273.5);
  l.linea(140, 268.1, 140, 273.5);
  l.texto('Nombres y Apellidos:', izq + 1, 272.2, ROTULO);
  l.texto('DNI:', 141, 272.2, ROTULO);
  l.texto('Observaciones:', izq + 1, 277.8, ROTULO, { negrita: true });
  const dj = [
    'El presente documento tiene carácter de Declaración Jurada, de acuerdo al Art. 06 de la Ley 25035; el fraude o falsedad en la documentación',
    'o declaración determina la falta de cumplimiento de requisito y el inicio de las acciones penales correspondientes.'
  ];
  dj.forEach((t, i) => l.texto(t, 16, 284 + i * 3.6, 5.8));
}

// ------------------------------------------------------------ una hoja

function hoja(h, { generado, numero, total }) {
  const l = lienzo();
  dibujarFormato(l);
  // Aviso arriba: que nadie la confunda con el formato oficial firmado.
  l.gris(0.25);
  l.texto('COPIA DE REFERENCIA — generada con OllaConecta el ' + generado + '. No reemplaza al formato oficial firmado.', 14, 10, 7, { negrita: true });
  if (total > 1) l.texto(`Hoja ${numero} de ${total}`, 180, 10, 7, { negrita: true });

  l.gris(0);
  for (const [clave, pos] of Object.entries(P.campos)) {
    const t = h.campos[clave];
    if (!t) continue;
    const pt = clave.startsWith('marca') ? 12 : /Firma$|Tesorera$/.test(clave) ? P.letraFirmasPt : P.letraPt;
    datoEnCaja(l, t, pos, pt);
  }
  const e = P.egresos;
  h.filas.forEach((fila, i) => {
    for (const [col, pos] of Object.entries(e.columnas)) {
      datoEnCaja(l, fila[col], { ...pos, yMm: e.primeraFilaYMm + i * e.altoFilaMm, altoMm: e.altoFilaMm }, P.letraTablaPt);
    }
  });
  return l.ops.join('\n');
}

/**
 * @param {{campos: object, filas: object[]}[]} hojas  de hojasDelB1()
 * @param {{generado: string, titulo?: string}} datos  generado: «14-10-26 18:40»
 * @returns {Uint8Array}  el archivo PDF
 */
export function pdfDelB1(hojas, { generado, titulo = 'Formato B-1' }) {
  const objetos = [];
  const agregar = (cuerpo) => { objetos.push(cuerpo); return objetos.length; };
  const catalogo = agregar(null);
  const paginas = agregar(null);
  const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = hojas.map((h, i) => {
    const contenido = hoja(h, { generado, numero: i + 1, total: hojas.length });
    const flujo = agregar(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
    return agregar(`<< /Type /Page /Parent ${paginas} 0 R /MediaBox [0 0 595.28 841.89] ` +
      `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${flujo} 0 R >>`);
  });
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginas} 0 R >>`;
  objetos[paginas - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const info = agregar(`<< /Title (${aWinAnsi(titulo)}) /Producer (OllaConecta) >>`);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objetos.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
