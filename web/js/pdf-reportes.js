// pdf-reportes.js — el padrón y la asistencia como PDF, para guardar o mandar
// por WhatsApp y usar de guía.
//
// No hay un formato oficial a la vista para estos dos (AGENTS.md §12.2): son
// tablas claras, numeradas y con totales, que dicen arriba «Copia de
// referencia». Solo ordenan y suman lo que ya está en el padrón y en la
// asistencia: no completan ni deducen nada. Puro: recibe los datos y devuelve
// los bytes (pdf.js).

import { aDdMmAa, formatearSoles, nombreCompleto } from './modelo.js';
import {
  filasPadron, asistenciaPorAfiliado, atencionesDelPeriodo, asistenciasDelDia, desgloseDelDia,
  recaudacionDelDiaCent, afiliadosActivos, TRAMOS_ETARIOS
} from './calculos.js';
import { anchoMm, lienzo, armarPdf } from './pdf.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const INICIAL = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const diaDeSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
const MARGEN = 14;

/** Un texto dentro de su celda: más chico hasta 5 pt y, si igual no entra, cortado con «…». */
function celda(l, texto, x, y, w, h, pt, align = 'left', negrita = false) {
  if (texto === '' || texto === null || texto === undefined) return;
  let t = String(texto);
  const libre = w - 1.6;
  let p = pt;
  while (p > 5 && anchoMm(t, p, negrita) > libre) p -= 0.25;
  if (anchoMm(t, p, negrita) > libre) {
    while (t.length > 1 && anchoMm(t + '…', p, negrita) > libre) t = t.slice(0, -1);
    t = t.trimEnd() + '…';
  }
  const a = anchoMm(t, p, negrita);
  const xt = align === 'right' ? x + w - 0.8 - a : align === 'center' ? x + (w - a) / 2 : x + 0.8;
  l.texto(t, xt, y + h / 2 + p / 2.8346 * 0.36, p, { negrita });
}

/**
 * Una tabla: fila de títulos (gris) y filas de datos alternando un fondo muy
 * claro, para seguir la fila con el dedo.
 * @returns {number} dónde termina (mm)
 */
function tabla(l, { x, y, columnas, filas, altoTitulo = 8, altoFila = 6, pt = 8, ultimaNegrita = false }) {
  const ancho = columnas.reduce((s, c) => s + c.ancho, 0);
  l.gris(0.88); l.relleno(x, y, ancho, altoTitulo);
  l.gris(0); let cx = x;
  for (const c of columnas) { celda(l, c.titulo, cx, y, c.ancho, altoTitulo, 7, c.align === 'left' ? 'left' : 'center', true); cx += c.ancho; }
  let fy = y + altoTitulo;
  filas.forEach((fila, i) => {
    if (i % 2 === 1) { l.gris(0.96); l.relleno(x, fy, ancho, altoFila); }
    l.gris(0); cx = x;
    const negrita = ultimaNegrita && i === filas.length - 1;
    columnas.forEach((c, k) => { celda(l, fila[k], cx, fy, c.ancho, altoFila, pt, c.align || 'left', negrita); cx += c.ancho; });
    fy += altoFila;
  });
  l.gris(0.55); l.grosor(0.2);
  l.caja(x, y, ancho, fy - y);
  l.linea(x, y + altoTitulo, x + ancho, y + altoTitulo);
  cx = x; for (const c of columnas.slice(0, -1)) { cx += c.ancho; l.linea(cx, y, cx, fy); }
  l.gris(0);
  return fy;
}

/** Hojas con encabezado (título, centro, periodo) y, al final, el pie con «Hoja i de n». */
function documento({ titulo, subtitulo, generado }) {
  const hojas = [];
  return {
    nueva(apaisada = false) {
      const ancho = apaisada ? 297 : 210;
      const l = lienzo(apaisada ? 210 : 297);
      l.gris(0.3);
      l.texto('COPIA DE REFERENCIA — generada con OllaConecta el ' + generado + '. No reemplaza a un formato oficial.', MARGEN, 10, 6.5, { negrita: true });
      l.gris(0);
      l.texto(titulo, MARGEN, 20, 13, { negrita: true });
      if (subtitulo) l.texto(subtitulo, MARGEN, 26.5, 8.5);
      hojas.push({ l, apaisada, ancho });
      return { l, ancho, alto: apaisada ? 210 : 297, arriba: 32 };
    },
    bytes(nombre) {
      hojas.forEach(({ l, apaisada, ancho }, i) => {
        const alto = apaisada ? 210 : 297;
        l.gris(0.4);
        const t = `Hoja ${i + 1} de ${hojas.length}`;
        l.texto(t, ancho - MARGEN - anchoMm(t, 7), alto - 7, 7);
        l.gris(0);
      });
      return armarPdf(hojas.map(({ l, apaisada }) => ({ contenido: l.ops.join('\n'), apaisada })), { titulo: nombre });
    }
  };
}

const periodoTexto = (inicio, fin) => `del ${aDdMmAa(inicio)} al ${aDdMmAa(fin)}`;

// ------------------------------------------------------------------ padrón

/**
 * Las personas activas, numeradas y ordenadas por apellido, con los días que
 * vinieron en el periodo, y al final cuántas hay por grupo de edad.
 * @param {object} padron
 * @param {{fechaRef: string, inicio: string, fin: string, centro?: string, generado: string}} op
 * @returns {Uint8Array}
 */
export function pdfDelPadron(padron, { fechaRef, inicio, fin, centro = '', generado }) {
  const filas = filasPadron(padron, fechaRef);
  const dias = new Map(asistenciaPorAfiliado(padron, inicio, fin).map((x) => [x.afiliadoId, x.dias]));
  const doc = documento({
    titulo: 'Padrón de personas',
    subtitulo: `${centro ? centro + ' · ' : ''}Activas al ${aDdMmAa(fechaRef)} · días que vinieron ${periodoTexto(inicio, fin)}`,
    generado
  });
  const columnas = [
    { titulo: 'N°', ancho: 9, align: 'right' }, { titulo: 'Apellidos y nombres', ancho: 66, align: 'left' },
    { titulo: 'Documento', ancho: 25, align: 'center' }, { titulo: 'Grupo de edad', ancho: 25, align: 'center' },
    { titulo: 'Edad', ancho: 11, align: 'center' }, { titulo: 'Tipo', ancho: 24, align: 'center' },
    { titulo: 'Días', ancho: 12, align: 'right' }
  ];
  const datos = filas.map((f) => [
    f.n, `${[f.apellidoPaterno, f.apellidoMaterno].filter(Boolean).join(' ')}, ${f.nombres}`.replace(/^, /, ''),
    `${f.tipoDocumento} ${f.numeroDocumento}`.trim(), f.grupoEtarioEtiqueta || '—', f.edad === null ? '—' : f.edad,
    f.tipoAfiliadoEtiqueta || '—', dias.get(f.afiliadoId) || 0
  ]);
  const POR_HOJA = 38;
  let { l, arriba } = doc.nueva();
  if (!datos.length) l.texto('El padrón está vacío.', MARGEN, arriba + 8, 10);
  for (let i = 0; i < datos.length; i += POR_HOJA) {
    if (i > 0) ({ l, arriba } = doc.nueva());
    const fin_ = tabla(l, { x: MARGEN, y: arriba, columnas, filas: datos.slice(i, i + POR_HOJA) });
    if (i + POR_HOJA >= datos.length) {
      const porGrupo = Object.fromEntries(TRAMOS_ETARIOS.map((t) => [t.clave, 0]));
      let social = 0;
      for (const f of filas) { if (f.grupoEtario) porGrupo[f.grupoEtario] += 1; if (f.tipoAfiliado === 'caso_social') social += 1; }
      l.texto(`Total: ${filas.length} personas`, MARGEN, fin_ + 8, 9.5, { negrita: true });
      l.texto(TRAMOS_ETARIOS.map((t) => `${t.etiqueta}: ${porGrupo[t.clave]}`).join('   ·   ') + `   ·   Ayuda social: ${social}`, MARGEN, fin_ + 14, 8.5);
    }
  }
  return doc.bytes('Padrón de personas');
}

// --------------------------------------------------------------- asistencia

const MAX_DIAS_PLANILLA = 31;

/**
 * Resumen por día (raciones por menú, sin inscribir, recaudado) y, si el
 * periodo tiene hasta 31 días con atención, la planilla: una fila por
 * persona y una columna por día (X: menú normal; A: ayuda social).
 * @param {object} padron
 * @param {{inicio: string, fin: string, centro?: string, generado: string}} op
 * @returns {Uint8Array}
 */
export function pdfDeAsistencia(padron, { inicio, fin, centro = '', generado }) {
  const dias = atencionesDelPeriodo(padron, inicio, fin).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const doc = documento({ titulo: 'Asistencia', subtitulo: `${centro ? centro + ' · ' : ''}${periodoTexto(inicio, fin)}`, generado });

  // 1. Resumen por día
  const columnas = [
    { titulo: 'Fecha', ancho: 22, align: 'center' }, { titulo: 'Día', ancho: 24, align: 'left' },
    { titulo: 'Menú normal', ancho: 25, align: 'right' }, { titulo: 'Ayuda social', ancho: 25, align: 'right' },
    { titulo: 'Sin inscribir*', ancho: 25, align: 'right' }, { titulo: 'Raciones', ancho: 25, align: 'right' },
    { titulo: 'Recaudado S/', ancho: 30, align: 'right' }
  ];
  const suma = { normal: 0, ayuda: 0, fuera: 0, total: 0, soles: 0 };
  const filas = dias.map((at) => {
    const d = desgloseDelDia(at);
    const fuera = d.sinInscribir;
    const soles = recaudacionDelDiaCent(at);
    suma.normal += d.normal; suma.ayuda += d.ayudaSocial; suma.fuera += fuera; suma.total += d.total; suma.soles += soles || 0;
    return [aDdMmAa(at.fecha), DIAS[diaDeSemana(at.fecha)], d.normal, d.ayudaSocial, fuera, d.total, soles === null ? '—' : formatearSoles(soles)];
  });
  if (filas.length) filas.push(['Total', `${dias.length} días`, suma.normal, suma.ayuda, suma.fuera, suma.total, formatearSoles(suma.soles)]);
  const POR_HOJA = 38;
  let { l, arriba } = doc.nueva();
  l.texto('Resumen por día', MARGEN, arriba + 2, 10, { negrita: true });
  if (!filas.length) l.texto('No hay días con asistencia en estas fechas.', MARGEN, arriba + 10, 9);
  for (let i = 0; i < filas.length; i += POR_HOJA) {
    if (i > 0) ({ l, arriba } = doc.nueva());
    const finTabla = tabla(l, { x: MARGEN, y: arriba + 5, columnas, filas: filas.slice(i, i + POR_HOJA), ultimaNegrita: i + POR_HOJA >= filas.length });
    l.texto('* Quienes comieron sin estar en el padrón. Ya están contados en «Menú normal» y «Ayuda social».', MARGEN, finTabla + 5, 7);
  }

  // 2. Planilla por persona (hojas apaisadas)
  if (dias.length && dias.length <= MAX_DIAS_PLANILLA) {
    const marcas = dias.map((at) => new Map(asistenciasDelDia(at).map((x) => [x.afiliadoId, x.tipoMenu])));
    const vinieron = new Set(marcas.flatMap((m) => [...m.keys()]));
    const personas = [...new Map([...afiliadosActivos(padron, fin), ...(padron.afiliados || []).filter((a) => vinieron.has(a.id))]
      .map((a) => [a.id, a])).values()]
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
    const anchoDia = Math.min(8, (297 - 2 * MARGEN - 8 - 60 - 12) / dias.length);
    const cols = [{ titulo: 'N°', ancho: 8, align: 'right' }, { titulo: 'Apellidos y nombres', ancho: 60, align: 'left' },
      ...dias.map((at) => ({ titulo: `${at.fecha.slice(8)} ${INICIAL[diaDeSemana(at.fecha)]}`, ancho: anchoDia, align: 'center' })),
      { titulo: 'Días', ancho: 12, align: 'right' }];
    const filasP = personas.map((a, i) => {
      const fila = marcas.map((m) => (m.has(a.id) ? (m.get(a.id) === 'ayuda_social' ? 'A' : 'X') : ''));
      return [i + 1, nombreCompleto(a), ...fila, fila.filter(Boolean).length];
    });
    filasP.push(['', 'Total del día', ...marcas.map((m) => m.size), marcas.reduce((s, m) => s + m.size, 0)]);
    const POR_HOJA_P = 30;
    for (let i = 0; i < filasP.length; i += POR_HOJA_P) {
      const h = doc.nueva(true);
      h.l.texto('Por persona · X: vino (menú normal) · A: vino (ayuda social)', MARGEN, h.arriba + 2, 9, { negrita: true });
      tabla(h.l, { x: MARGEN, y: h.arriba + 5, columnas: cols, filas: filasP.slice(i, i + POR_HOJA_P), altoFila: 5, pt: 7.5,
        ultimaNegrita: i + POR_HOJA_P >= filasP.length });
    }
  } else if (dias.length > MAX_DIAS_PLANILLA) {
    l.texto(`La planilla por persona sale con ${MAX_DIAS_PLANILLA} días o menos: elige fechas más cortas (por ejemplo, un mes).`, MARGEN, 286, 7.5);
  }
  return doc.bytes('Asistencia');
}
