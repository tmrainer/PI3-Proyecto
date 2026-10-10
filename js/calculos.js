// calculos.js — funciones puras. Sin DOM, sin estado, sin red.
// Ver AGENTS.md §6. Todo monto en céntimos enteros.

import { aFecha, aIso, esIso, hoyIso, MESES } from './modelo.js';

// ------------------------------------------------- §6.1 Totales del Formato B-1

export function totalRendicionGastos(rendicion) {
  const filas = (rendicion && rendicion.egresos) || [];
  let total = 0;
  for (const fila of filas) {
    if (Number.isFinite(fila.montoTotalCent)) total += fila.montoTotalCent;
  }
  return total;
}

/**
 * DECISIÓN ABIERTA: sin verificar.
 * min(subsidio, total) se dedujo de UN solo ejemplar llenado a mano, en el que
 * el total (S/ 209.85) superaba al subsidio (S/ 200.00). El tramo en que el
 * total es MENOR que el subsidio no tiene ninguna evidencia detrás.
 * No apoyarse en esta fórmula como si estuviera confirmada. Ver AGENTS.md §12.2.
 */
export function gastosConSubsidio(rendicion) {
  const subsidio = rendicion ? rendicion.montoSubsidioCent : null;
  if (!Number.isFinite(subsidio)) return null;
  return Math.min(subsidio, totalRendicionGastos(rendicion));
}

export function aporteCentroAtencion(rendicion) {
  const subsidio = rendicion ? rendicion.montoSubsidioCent : null;
  if (!Number.isFinite(subsidio)) return null;
  return Math.max(0, totalRendicionGastos(rendicion) - subsidio);
}

/**
 * Los tres renglones del pie. Si falta el subsidio, los tres quedan en null:
 * un cero donde falta un dato es un dato inventado (AGENTS.md §2).
 */
export function totales(rendicion) {
  const subsidio = rendicion ? rendicion.montoSubsidioCent : null;
  if (!Number.isFinite(subsidio)) {
    return { total: null, conSubsidio: null, aporte: null };
  }
  const total = totalRendicionGastos(rendicion);
  return {
    total,
    conSubsidio: Math.min(subsidio, total),
    aporte: Math.max(0, total - subsidio)
  };
}

export const ORIGENES_FONDO = ['subsidio', 'ayuda_social', 'aporte_propio'];

export function gastoPorOrigen(rendicion) {
  const acum = { subsidio: 0, ayuda_social: 0, aporte_propio: 0 };
  for (const fila of (rendicion && rendicion.egresos) || []) {
    if (!Number.isFinite(fila.montoTotalCent)) continue;
    const o = ORIGENES_FONDO.includes(fila.origenFondo) ? fila.origenFondo : 'subsidio';
    acum[o] += fila.montoTotalCent;
  }
  return acum;
}

/** Comprobación de fila: cantidad x precio unitario frente al monto total. */
export function descuadreFila(fila) {
  if (!fila) return null;
  if (fila.cantidadVarios || fila.precioUnitarioVarios) return null;
  if (!Number.isFinite(fila.cantidad) || !Number.isFinite(fila.precioUnitarioCent)) return null;
  if (!Number.isFinite(fila.montoTotalCent)) return null;
  const esperado = Math.round(fila.cantidad * fila.precioUnitarioCent);
  const diferencia = fila.montoTotalCent - esperado;
  if (Math.abs(diferencia) <= 1) return null;
  return { esperado, declarado: fila.montoTotalCent, diferencia };
}

// --------------------------------------------------------- §6.2 / §6.3 Padrón

export function afiliadosActivos(padron, fechaIso) {
  const ref = esIso(fechaIso) ? fechaIso : hoyIso();
  return ((padron && padron.afiliados) || []).filter((a) => {
    if (!a.activo) return false;
    if (esIso(a.altaEn) && a.altaEn > ref) return false;
    if (esIso(a.bajaEn) && a.bajaEn <= ref) return false;
    return true;
  });
}

export function edadEnFecha(fechaNacimientoIso, fechaRefIso) {
  const nac = aFecha(fechaNacimientoIso);
  const ref = aFecha(fechaRefIso);
  if (!nac || !ref) return null;
  let edad = ref.getFullYear() - nac.getFullYear();
  const cumplioEsteAno =
    ref.getMonth() > nac.getMonth() ||
    (ref.getMonth() === nac.getMonth() && ref.getDate() >= nac.getDate());
  if (!cumplioEsteAno) edad -= 1;
  return edad;
}

// Tramos de las «etapas de vida» del MINSA, Documento Técnico del Modelo de
// Cuidado Integral de Salud por Curso de Vida (RM 030-2020-MINSA):
//   Niña/niño        0 a 11 años, 11 meses y 29 días
//   Adolescente     12 a 17 años, 11 meses y 29 días
//   Adulto joven    18 a 29 años, 11 meses y 29 días
//   Adulto          30 a 59 años, 11 meses y 29 días
//   Adulto mayor    60 a más
// Aquí se usan cuatro grupos, con las mismas fronteras: «adulto» reúne al adulto
// joven y al adulto del MINSA. Si un formato municipal llegara a pedir «joven»
// aparte, se parte en 29/30 sin mover ninguna otra frontera.
export const TRAMOS_ETARIOS = [
  { clave: 'nino', etiqueta: 'Niño/a', detalle: '0 a 11 años', min: 0, max: 11 },
  { clave: 'adolescente', etiqueta: 'Adolescente', detalle: '12 a 17 años', min: 12, max: 17 },
  { clave: 'adulto', etiqueta: 'Adulto/a', detalle: '18 a 59 años', min: 18, max: 59 },
  { clave: 'adulto_mayor', etiqueta: 'Adulto/a mayor', detalle: '60 a más', min: 60, max: Infinity }
];

/** Clave del tramo etario para una edad en años. null si la edad no es válida. */
export function grupoPorEdad(edad) {
  if (!Number.isFinite(edad) || edad < 0) return null;
  const tramo = TRAMOS_ETARIOS.find((t) => edad >= t.min && edad <= t.max);
  return tramo ? tramo.clave : null;
}

/**
 * Se calcula SIEMPRE respecto a una fecha de referencia, nunca se congela al
 * alta: quien cumple 60 cambia de grupo sin que nadie tenga que acordarse.
 * Sin fecha de nacimiento ni grupo manual devuelve null — no se asume "adulto".
 */
export function grupoEtario(afiliado, fechaRefIso) {
  if (!afiliado) return null;
  if (esIso(afiliado.fechaNacimiento)) {
    return grupoPorEdad(edadEnFecha(afiliado.fechaNacimiento, fechaRefIso || hoyIso()));
  }
  return afiliado.grupoEtarioManual || null;
}

export function etiquetaGrupoEtario(clave) {
  const tramo = TRAMOS_ETARIOS.find((t) => t.clave === clave);
  return tramo ? tramo.etiqueta : 'Sin dato';
}

export const TIPOS_AFILIADO = [
  { clave: 'habitual', etiqueta: 'Habitual', menu: 'normal' },
  { clave: 'caso_social', etiqueta: 'Ayuda social', menu: 'ayuda_social' }
];

/** Menú que le corresponde por defecto a una persona, según cómo se inscribió. */
export function menuPorDefecto(afiliado) {
  const t = TIPOS_AFILIADO.find((x) => x.clave === (afiliado && afiliado.tipoAfiliado));
  return t ? t.menu : 'normal';
}

/** Conteo por grupo etario de los afiliados activos a una fecha. */
export function resumenEtario(padron, fechaRefIso) {
  const ref = esIso(fechaRefIso) ? fechaRefIso : hoyIso();
  const conteo = { nino: 0, adolescente: 0, adulto: 0, adulto_mayor: 0, sin_dato: 0 };
  for (const a of afiliadosActivos(padron, ref)) {
    const g = grupoEtario(a, ref);
    conteo[g || 'sin_dato'] += 1;
  }
  return conteo;
}

// ------------------------------------------- §6.5 Asistencia, raciones y precios
//
// Las raciones NO se escriben: se cuentan de la asistencia marcada, porque la
// comida se prepara el mismo día según quién viene. El precio sí está fijado de
// antemano y se copia a cada día nuevo. Ver AGENTS.md §6.5.

export function atencionesDelPeriodo(padron, inicioIso, finIso) {
  if (!esIso(inicioIso) || !esIso(finIso)) return [];
  return ((padron && padron.atenciones) || [])
    .filter((at) => esIso(at.fecha) && at.fecha >= inicioIso && at.fecha <= finIso);
}

/**
 * Las asistencias marcadas de un día. Es la ÚNICA puerta de lectura de
 * `atencion.asistencias`: asistio, menuDe, desgloseDelDia, asistenciaPorAfiliado
 * y validarAtencion pasan por aquí. Quienes escriben ese arreglo están en
 * ui-asistencia.js (filaToque y marcarTodos); ver ARCHITECTURE.md §b.
 *
 * Devuelve el MISMO arreglo guardado, no una copia: no mutarlo desde aquí.
 * @param {?Object} at  una atención (un día) de `padron.atenciones`
 * @returns {Array<{afiliadoId: string, tipoMenu: 'normal'|'ayuda_social'}>}
 *   vacío si `at` falta o no tiene asistencias.
 */
export function asistenciasDelDia(at) {
  return Array.isArray(at && at.asistencias) ? at.asistencias : [];
}

/**
 * ¿Está marcada esta persona en este día? Lee `at.asistencias` vía
 * asistenciasDelDia. No escribe nada.
 * @param {?Object} at  una atención (un día)
 * @param {string} afiliadoId
 * @returns {boolean}
 */
export function asistio(at, afiliadoId) {
  return asistenciasDelDia(at).some((x) => x.afiliadoId === afiliadoId);
}

/**
 * Las asistencias de un día con TODAS las personas de `activos` marcadas, para
 * el botón «Marcar a todos». Quien ya estaba marcado conserva el menú que se le
 * eligió ese día; los demás reciben el de su inscripción. No modifica `at`:
 * devuelve un arreglo nuevo para asignarlo a `at.asistencias`.
 * @param {?Object} at  una atención (un día)
 * @param {Object[]} activos  afiliados a marcar
 * @returns {Array<{afiliadoId: string, tipoMenu: 'normal'|'ayuda_social'}>}
 */
export function asistenciasConTodos(at, activos) {
  return activos.map((p) => {
    const previo = asistenciasDelDia(at).find((x) => x.afiliadoId === p.id);
    return { afiliadoId: p.id, tipoMenu: previo ? previo.tipoMenu : menuPorDefecto(p) };
  });
}

export function menuDe(at, afiliadoId) {
  const reg = asistenciasDelDia(at).find((x) => x.afiliadoId === afiliadoId);
  return reg ? reg.tipoMenu : null;
}

/**
 * Raciones de un día, por tipo de menú.
 * `origen` dice de dónde salen: contadas de la asistencia, o heredadas de un día
 * registrado con la versión anterior, que guardaba cuentas escritas a mano.
 */
export function desgloseDelDia(at) {
  const asistencias = asistenciasDelDia(at);
  if (asistencias.length === 0 && at && at.legado) {
    const n = Number.isFinite(at.legado.racionesNormales) ? at.legado.racionesNormales : 0;
    const a = Number.isFinite(at.legado.racionesAyudaSocial) ? at.legado.racionesAyudaSocial : 0;
    return { normal: n, ayudaSocial: a, total: n + a, origen: 'legado' };
  }
  const normal = asistencias.filter((x) => x.tipoMenu !== 'ayuda_social').length;
  const ayudaSocial = asistencias.filter((x) => x.tipoMenu === 'ayuda_social').length;
  return { normal, ayudaSocial, total: normal + ayudaSocial, origen: 'asistencia' };
}

export function racionesDelDia(at) {
  return desgloseDelDia(at).total;
}

/**
 * Lo recaudado en un día: raciones x precio de su menú.
 * Devuelve null si falta el precio de un tipo de menú que SÍ tuvo raciones:
 * un total a medias es peor que ningún total.
 */
export function recaudacionDelDiaCent(at) {
  if (!at) return null;
  const d = desgloseDelDia(at);
  let total = 0;
  const pares = [
    [d.normal, at.precioMenuNormalCent],
    [d.ayudaSocial, at.precioMenuAyudaSocialCent]
  ];
  for (const [raciones, precio] of pares) {
    if (raciones === 0) continue;
    if (!Number.isFinite(precio)) return null;   // falta el precio: no se estima
    total += raciones * precio;
  }
  return total;
}

export function racionesPeriodo(padron, inicioIso, finIso) {
  return atencionesDelPeriodo(padron, inicioIso, finIso)
    .reduce((acc, at) => acc + racionesDelDia(at), 0);
}

export function diasAtendidos(padron, inicioIso, finIso) {
  return atencionesDelPeriodo(padron, inicioIso, finIso)
    .filter((at) => racionesDelDia(at) > 0).length;
}

export function promedioRaciones(padron, inicioIso, finIso) {
  const dias = diasAtendidos(padron, inicioIso, finIso);
  if (dias === 0) return null;
  return racionesPeriodo(padron, inicioIso, finIso) / dias;
}

/**
 * Resumen económico de las raciones de un periodo.
 * - precioPromedioRacionCent: promedio PONDERADO por ración, no promedio de precios.
 * - diasSinPrecio: días excluidos por falta de precio. Se muestra siempre, para
 *   que nadie lea el promedio como si cubriera todo el periodo.
 */
export function resumenEconomicoRaciones(padron, inicioIso, finIso) {
  const atenciones = atencionesDelPeriodo(padron, inicioIso, finIso);
  let recaudacion = 0;
  let racionesConPrecio = 0;
  let diasSinPrecio = 0;
  let racionesNormales = 0;
  let racionesAyuda = 0;
  let diasDeLegado = 0;

  for (const at of atenciones) {
    const d = desgloseDelDia(at);
    racionesNormales += d.normal;
    racionesAyuda += d.ayudaSocial;
    if (d.origen === 'legado') diasDeLegado += 1;

    const dia = recaudacionDelDiaCent(at);
    if (dia === null) { diasSinPrecio += 1; continue; }
    recaudacion += dia;
    racionesConPrecio += d.total;
  }

  return {
    racionesTotales: racionesNormales + racionesAyuda,
    racionesNormales,
    racionesAyudaSocial: racionesAyuda,
    recaudacionCent: racionesConPrecio > 0 ? recaudacion : null,
    racionesConPrecio,
    diasSinPrecio,
    diasDeLegado,
    precioPromedioRacionCent: racionesConPrecio > 0
      ? Math.round(recaudacion / racionesConPrecio)
      : null
  };
}

export function costoPorRacionCent(rendicion, padron) {
  if (!rendicion || !rendicion.periodo) return null;
  const raciones = racionesPeriodo(padron, rendicion.periodo.inicio, rendicion.periodo.fin);
  if (!raciones) return null;
  return Math.round(totalRendicionGastos(rendicion) / raciones);
}

export function conteoAsistenciaDelDia(at) {
  const d = desgloseDelDia(at);
  return { total: d.total, normal: d.normal, ayuda_social: d.ayudaSocial, origen: d.origen };
}

/**
 * Días que asistió cada persona dentro de un periodo.
 * Devuelve [{ afiliadoId, dias, normal, ayudaSocial }] ordenado de más a menos.
 *
 * Lee `padron.atenciones` del periodo (atencionesDelPeriodo) y, de cada día,
 * `at.asistencias` (asistenciasDelDia). No escribe nada. Es el punto donde el
 * reporte del padrón y su CSV leen lo que se marcó en la pantalla de asistencia
 * (ui-reportes.js: pintarReportePadron y filasComoTexto).
 *
 * Solo aparece quien asistió al menos un día: los demás no tienen fila.
 * Los días migrados con `legado` no suman, porque no dicen quién vino.
 *
 * @param {{atenciones: Object[]}} padron  normalmente estado.padron
 * @param {string} inicioIso  'AAAA-MM-DD', incluido
 * @param {string} finIso     'AAAA-MM-DD', incluido
 * @returns {Array<{afiliadoId: string, dias: number, normal: number, ayudaSocial: number}>}
 *   vacío si alguna de las dos fechas no es válida.
 */
export function asistenciaPorAfiliado(padron, inicioIso, finIso) {
  const mapa = new Map();
  for (const at of atencionesDelPeriodo(padron, inicioIso, finIso)) {
    for (const a of asistenciasDelDia(at)) {
      if (!a || !a.afiliadoId) continue;
      const fila = mapa.get(a.afiliadoId) ||
        { afiliadoId: a.afiliadoId, dias: 0, normal: 0, ayudaSocial: 0 };
      fila.dias += 1;
      if (a.tipoMenu === 'ayuda_social') fila.ayudaSocial += 1; else fila.normal += 1;
      mapa.set(a.afiliadoId, fila);
    }
  }
  return [...mapa.values()].sort((a, b) => b.dias - a.dias);
}

/**
 * Personas activas del padrón que NO asistieron ni un día en el periodo.
 * `activasAIso` dice a qué fecha se mira quién está activo; por defecto, al
 * cierre del periodo. El reporte del padrón pasa su fechaRef, para que la lista
 * coincida con las filas de su tabla que tienen 0 días.
 */
export function afiliadosSinAsistencia(padron, inicioIso, finIso, activasAIso = finIso) {
  const conAsistencia = new Set(
    asistenciaPorAfiliado(padron, inicioIso, finIso).map((x) => x.afiliadoId));
  return afiliadosActivos(padron, activasAIso).filter((a) => !conAsistencia.has(a.id));
}

// ------------------------------------------------- §6.6 Reporte para el padrón
//
// Filas listas para copiar al formato de padrón que pide la Municipalidad.
// Solo ordena y numera datos ya ingresados: no completa ni deduce ninguno.

/**
 * Filas del reporte del padrón: personas activas a `fechaRefIso`, ordenadas por
 * apellidos y nombres, y numeradas desde 1.
 *
 * Lee `padron.afiliados` (vía afiliadosActivos). NO lee asistencias: los días
 * asistidos los agrega quien llama, con asistenciaPorAfiliado. No escribe nada.
 *
 * Edad y grupo etario se calculan a `fechaRefIso`, no se leen de lo guardado
 * (salvo `grupoEtarioManual` cuando no hay fecha de nacimiento).
 *
 * @param {{afiliados: Object[]}} padron  normalmente estado.padron
 * @param {string} [fechaRefIso]  'AAAA-MM-DD'; si no es válida, se usa hoy.
 * @returns {Array<{n: number, afiliadoId: string, apellidoPaterno: string,
 *   apellidoMaterno: string, nombres: string, tipoDocumento: string,
 *   numeroDocumento: string, grupoEtario: ?string, grupoEtarioEtiqueta: string,
 *   edad: ?number, tipoAfiliado: string, tipoAfiliadoEtiqueta: string, sexo: string}>}
 */
export function filasPadron(padron, fechaRefIso) {
  const ref = esIso(fechaRefIso) ? fechaRefIso : hoyIso();
  return afiliadosActivos(padron, ref)
    .slice()
    .sort((a, b) => {
      const an = `${a.apellidoPaterno} ${a.apellidoMaterno} ${a.nombres}`.trim();
      const bn = `${b.apellidoPaterno} ${b.apellidoMaterno} ${b.nombres}`.trim();
      return an.localeCompare(bn, 'es');
    })
    .map((a, i) => {
      const g = grupoEtario(a, ref);
      const edad = esIso(a.fechaNacimiento) ? edadEnFecha(a.fechaNacimiento, ref) : null;
      return {
        n: i + 1,
        afiliadoId: a.id,
        apellidoPaterno: a.apellidoPaterno || '',
        apellidoMaterno: a.apellidoMaterno || '',
        nombres: a.nombres || '',
        tipoDocumento: (a.tipoDocumento || '').toUpperCase(),
        numeroDocumento: a.numeroDocumento || '',
        grupoEtario: g,
        grupoEtarioEtiqueta: g ? etiquetaGrupoEtario(g) : '',
        edad,
        tipoAfiliado: a.tipoAfiliado || '',
        tipoAfiliadoEtiqueta: a.tipoAfiliado === 'caso_social' ? 'Ayuda social'
          : a.tipoAfiliado === 'habitual' ? 'Habitual' : '',
        sexo: a.sexo || ''
      };
    });
}

// ----------------------------------------------------- §4.1 Periodo propuesto
// La app PROPONE; la usuaria acepta o cambia. Nunca se aplica sola.

export function proponerPeriodo(tipo, fechaRefIso) {
  const ref = aFecha(esIso(fechaRefIso) ? fechaRefIso : hoyIso());
  if (!ref) return { tipo, inicio: '', fin: '', etiqueta: '', alternativas: [] };

  if (tipo === 'semanal') {
    const dia = ref.getDay();                 // 0 domingo … 6 sábado
    const desplazamiento = dia === 0 ? 6 : dia - 1;  // semana de lunes a domingo
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - desplazamiento);
    const fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
    return {
      tipo, inicio: aIso(inicio), fin: aIso(fin),
      etiqueta: 'Entrega semanal', alternativas: ['Entrega semanal']
    };
  }

  if (tipo === 'quincenal') {
    const primeraMitad = ref.getDate() <= 15;
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), primeraMitad ? 1 : 16);
    const fin = primeraMitad
      ? new Date(ref.getFullYear(), ref.getMonth(), 15)
      : new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return {
      tipo, inicio: aIso(inicio), fin: aIso(fin),
      etiqueta: 'Quincenal', alternativas: ['Quincenal']
    };
  }

  const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const nombreMes = MESES[ref.getMonth()];
  return {
    tipo: 'mensual', inicio: aIso(inicio), fin: aIso(fin),
    // El ejemplar llenado a mano dice "Setiembre": esa es la única evidencia
    // directa de cómo se rotula. Se ofrecen las dos y elige la usuaria.
    etiqueta: nombreMes, alternativas: [nombreMes, 'Mensual']
  };
}

export function duracionPeriodo(periodo) {
  if (!periodo || !esIso(periodo.inicio) || !esIso(periodo.fin)) return null;
  const a = aFecha(periodo.inicio);
  const b = aFecha(periodo.fin);
  return Math.round((b - a) / 86400000) + 1;
}
