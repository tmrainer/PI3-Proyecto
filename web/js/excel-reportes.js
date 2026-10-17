// excel-reportes.js — el padrón, la asistencia y el B-1 como Excel (.xlsx).
//
// Las mismas cifras que los PDF (pdf-reportes.js, pdf-b1.js), pero en celdas:
// los números son números (se pueden sumar en la hoja) y los DNI, texto (no
// pierden el 0 de adelante). Solo ordenan y suman lo que ya está guardado: no
// completan ni deducen nada (AGENTS.md §2). Puro: recibe los datos y devuelve
// los bytes (xlsx.js).

import { aDdMmAa, nombreCompleto, cuantos } from './modelo.js';
import {
  filasPadron, asistenciaPorAfiliado, atencionesDelPeriodo, asistenciasDelDia, desgloseDelDia,
  recaudacionDelDiaCent, afiliadosActivos, totales, TRAMOS_ETARIOS
} from './calculos.js';
import { armarXlsx } from './xlsx.js';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const diaDeSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
const negrita = (v) => ({ v, negrita: true });
const soles = (cent, conNegrita = false) => (Number.isFinite(cent) ? { v: cent / 100, soles: true, negrita: conNegrita } : '');
const periodoTexto = (inicio, fin) => `del ${aDdMmAa(inicio)} al ${aDdMmAa(fin)}`;

// ------------------------------------------------------------------ padrón

// Los mismos títulos que entiende la importación (importar.js): el archivo se
// puede volver a cargar en otro teléfono.
export const CABECERA_PADRON = ['N°', 'Apellido paterno', 'Apellido materno', 'Nombres', 'Tipo de documento',
  'Número de documento', 'Grupo de edad', 'Edad', 'Tipo', 'Días asistidos'];

/**
 * Hoja «Padrón»: las personas activas a `fechaRef`, numeradas y por apellido,
 * con los días que vinieron en el periodo. Hoja «Resumen»: cuántas por grupo
 * de edad (aparte, para que la primera hoja se pueda volver a importar).
 * @param {object} padron
 * @param {{fechaRef: string, inicio: string, fin: string, centro?: string}} op
 * @returns {Uint8Array}
 */
export function excelDelPadron(padron, { fechaRef, inicio, fin, centro = '' }) {
  const filas = filasPadron(padron, fechaRef);
  const dias = new Map(asistenciaPorAfiliado(padron, inicio, fin).map((x) => [x.afiliadoId, x.dias]));
  const porGrupo = Object.fromEntries(TRAMOS_ETARIOS.map((t) => [t.clave, 0]));
  let social = 0;
  let sinVenir = 0;
  for (const f of filas) {
    if (f.grupoEtario) porGrupo[f.grupoEtario] += 1;
    if (f.tipoAfiliado === 'caso_social') social += 1;
    if (!dias.get(f.afiliadoId)) sinVenir += 1;
  }
  const subtitulo = `${centro ? centro + ' · ' : ''}Activas al ${aDdMmAa(fechaRef)} · días que vinieron ${periodoTexto(inicio, fin)}`;
  return armarXlsx([
    {
      nombre: 'Padrón',
      anchos: [5, 18, 18, 22, 10, 14, 15, 6, 13, 9],
      filas: [
        [negrita('Padrón de personas')], [subtitulo], [],
        CABECERA_PADRON.map(negrita),
        ...filas.map((f) => [f.n, f.apellidoPaterno, f.apellidoMaterno, f.nombres, f.tipoDocumento, f.numeroDocumento,
          f.grupoEtarioEtiqueta, f.edad, f.tipoAfiliadoEtiqueta, dias.get(f.afiliadoId) || 0])
      ]
    },
    {
      nombre: 'Resumen',
      anchos: [34, 10],
      filas: [
        [negrita('Padrón de personas')], [subtitulo], [],
        [negrita('Total de personas activas'), negrita(filas.length)],
        ...TRAMOS_ETARIOS.map((t) => [`${t.etiqueta} (${t.detalle})`, porGrupo[t.clave]]),
        ['Ayuda social', social],
        ['No vinieron ningún día en esas fechas', sinVenir]
      ]
    }
  ]);
}

// --------------------------------------------------------------- asistencia

/**
 * Hoja «Resumen por día» (raciones por menú, sin inscribir, recaudado) y hoja
 * «Por persona» (una fila por persona y una columna por día; X: menú normal,
 * A: ayuda social). A diferencia del PDF, la planilla sale con cualquier
 * cantidad de días: la hoja no tiene ancho de papel.
 * @param {object} padron
 * @param {{inicio: string, fin: string, centro?: string}} op
 * @returns {Uint8Array}
 */
export function excelDeAsistencia(padron, { inicio, fin, centro = '' }) {
  const dias = atencionesDelPeriodo(padron, inicio, fin).slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const subtitulo = `${centro ? centro + ' · ' : ''}${periodoTexto(inicio, fin)}`;

  const suma = { normal: 0, ayuda: 0, fuera: 0, total: 0, soles: 0 };
  const filasDia = dias.map((at) => {
    const d = desgloseDelDia(at);
    const rec = recaudacionDelDiaCent(at);
    suma.normal += d.normal; suma.ayuda += d.ayudaSocial; suma.fuera += d.sinInscribir; suma.total += d.total; suma.soles += rec || 0;
    return [aDdMmAa(at.fecha), DIAS[diaDeSemana(at.fecha)], d.normal, d.ayudaSocial, d.sinInscribir, d.total,
      rec === null ? 'falta el precio' : soles(rec)];
  });
  const resumen = [
    [negrita('Asistencia')], [subtitulo], [],
    ['Fecha', 'Día', 'Menú normal', 'Ayuda social', 'Sin inscribir*', 'Raciones', 'Recaudado (S/)'].map(negrita),
    ...filasDia
  ];
  if (dias.length) {
    resumen.push([negrita('Total'), negrita(cuantos(dias.length, 'día')), negrita(suma.normal), negrita(suma.ayuda),
      negrita(suma.fuera), negrita(suma.total), soles(suma.soles, true)]);
    resumen.push([], ['* Quienes comieron sin estar en el padrón. Ya están contados en «Menú normal» y «Ayuda social».']);
  } else {
    resumen.push(['No hay días con asistencia en estas fechas.']);
  }

  const marcas = dias.map((at) => new Map(asistenciasDelDia(at).map((x) => [x.afiliadoId, x.tipoMenu])));
  const vinieron = new Set(marcas.flatMap((m) => [...m.keys()]));
  const personas = [...new Map([...afiliadosActivos(padron, fin), ...(padron.afiliados || []).filter((a) => vinieron.has(a.id))]
    .map((a) => [a.id, a])).values()]
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
  const porPersona = [
    [negrita('Asistencia por persona')], [`${subtitulo} · X: vino (menú normal) · A: vino (ayuda social)`], [],
    ['N°', 'Apellidos y nombres', 'Documento', ...dias.map((at) => `${aDdMmAa(at.fecha).slice(0, 5)} ${DIAS[diaDeSemana(at.fecha)].slice(0, 3)}`), 'Días']
      .map(negrita),
    ...personas.map((a, i) => {
      const fila = marcas.map((m) => (m.has(a.id) ? (m.get(a.id) === 'ayuda_social' ? 'A' : 'X') : ''));
      return [i + 1, nombreCompleto(a), a.numeroDocumento || '', ...fila, fila.filter(Boolean).length];
    }),
    [null, negrita('Total del día'), null, ...marcas.map((m) => negrita(m.size)), negrita(marcas.reduce((s, m) => s + m.size, 0))]
  ];

  return armarXlsx([
    { nombre: 'Resumen por día', anchos: [10, 11, 12, 12, 13, 10, 15], filas: resumen },
    { nombre: 'Por persona', anchos: [5, 34, 12, ...dias.map(() => 9), 6], filas: porPersona }
  ]);
}

// --------------------------------------------------------------------- B-1

const CANTIDAD = (e) => (e.cantidadVarios ? 'varios' : Number.isFinite(e.cantidad) ? e.cantidad : '');
const PRECIO = (e) => (e.precioUnitarioVarios ? 'varios' : soles(e.precioUnitarioCent));

/**
 * El B-1 en una hoja, en el orden del formato: encabezado, ingresos, compras
 * con sus totales y firmas. Solo lo escrito: lo que falta queda vacío.
 * @param {object} r  una rendición (modelo.js: nuevaRendicion)
 * @returns {Uint8Array}
 */
export function excelDelB1(r) {
  const t = totales(r);
  const egresos = (r.egresos || []).filter((e) => e && (e.fechaCompra || String(e.descripcion || '').trim() ||
    Number.isFinite(e.montoTotalCent)));
  const centro = r.tipoCentro === 'comedor' ? 'Comedor' : r.tipoCentro === 'olla_comun' ? 'Olla común' : '';
  const p = r.periodo || {};
  return armarXlsx([{
    nombre: 'Formato B-1',
    anchos: [26, 34, 9, 11, 14, 16, 13, 14],
    filas: [
      [negrita('FORMATO B-1 (Balance de centros de atención subsidiados)')],
      ['Programa de Complementación Alimentaria - PCA · Municipalidad Distrital de Villa María del Triunfo'],
      [],
      ['Centro de atención', centro],
      ['Nombre del centro de atención', r.nombreCentro || ''],
      ['Código de PCA N°', r.codigoPca || ''],
      ['Mes de rendición', p.etiqueta || ''],
      ['Periodo', p.inicio || p.fin ? `${aDdMmAa(p.inicio)} al ${aDdMmAa(p.fin)}` : ''],
      ['Fecha de rendición', aDdMmAa(r.fechaRendicion)],
      ['Presidente(a)', r.nombrePresidenta || ''],
      ['DNI', r.dniPresidenta || ''],
      ['Celular N°', r.celular || ''],
      [],
      [negrita('INGRESOS')],
      ['Monto del subsidio (S/)', soles(r.montoSubsidioCent)],
      ['Fecha de la asignación', aDdMmAa(r.fechaAsignacion)],
      [],
      [negrita('EGRESOS')],
      ['Fecha de la compra', 'Descripción de la compra', 'Cant.', 'Unidad', 'RUC del proveedor', 'N° de boleta',
        'Precio unitario', 'Monto total (S/)'].map(negrita),
      ...egresos.map((e) => [aDdMmAa(e.fechaCompra), e.descripcion || '', CANTIDAD(e), e.unidadMedida || '',
        e.rucProveedor || '', [e.boletaSerie, e.boletaCorrelativo].filter((x) => String(x || '').trim()).join('-'),
        PRECIO(e), soles(e.montoTotalCent)]),
      [],
      ['Gastos con el subsidio económico', null, null, null, null, null, null, soles(t.conSubsidio, true)],
      // «Registrar de corresponder»: si es cero, va vacío, como en la hoja (§6.1).
      ['Aporte del centro de atención', null, null, null, null, null, null, t.aporte ? soles(t.aporte, true) : ''],
      [negrita('Total de rendición de gastos'), null, null, null, null, null, null, soles(t.total, true)],
      [],
      [negrita('Presidente(a)'), r.nombrePresidentaFirma || '', null, null, negrita('DNI'), r.dniPresidentaFirma || ''],
      [negrita('Tesorero(a)'), r.nombreTesorera || '', null, null, negrita('DNI'), r.dniTesorera || ''],
      [],
      ['Copia de referencia generada con OllaConecta. No reemplaza al formato oficial firmado.']
    ]
  }]);
}
