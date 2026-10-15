// pdf.js — escribir un PDF a mano: texto, líneas y recuadros, con las fuentes
// estándar Helvetica y Helvetica-Bold (codificación WinAnsi, con tildes y ñ).
// Sin librerías ni red (AGENTS.md §3). Puro: devuelve los bytes.
//
// Lo usan el PDF del B-1 (pdf-b1.js) y los del padrón y la asistencia
// (pdf-reportes.js).

export const PT = 72 / 25.4; // puntos por mm

// Anchos de Helvetica (AFM estándar, milésimas de em) para medir el texto.
const ANCHOS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
  722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
  556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const ESPECIALES = { '–': 0x96, '—': 0x97, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };

/** Texto a bytes WinAnsi (Latin-1 + algunos signos); lo que no existe, «?». */
export function aWinAnsi(texto) {
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

/** Una hoja en blanco para dibujar en mm desde arriba a la izquierda. A4: 297 de alto; apaisada: 210. */
export function lienzo(altoMm = 297) {
  const ops = [];
  const x = (mm) => (mm * PT).toFixed(2);
  const y = (mm) => ((altoMm - mm) * PT).toFixed(2);
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


/**
 * Arma el archivo PDF con las hojas dibujadas.
 * @param {{contenido: string, apaisada?: boolean}[]} paginasPdf  contenido: lienzo().ops.join('\n')
 * @param {{titulo: string}} datos
 * @returns {Uint8Array}
 */
export function armarPdf(paginasPdf, { titulo }) {
  const objetos = [];
  const agregar = (cuerpo) => { objetos.push(cuerpo); return objetos.length; };
  const catalogo = agregar(null);
  const paginas = agregar(null);
  const f1 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = paginasPdf.map(({ contenido, apaisada }) => {
    const flujo = agregar(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
    const caja = apaisada ? '0 0 841.89 595.28' : '0 0 595.28 841.89';
    return agregar(`<< /Type /Page /Parent ${paginas} 0 R /MediaBox [${caja}] ` +
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
