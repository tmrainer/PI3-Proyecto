// modelo.js — forma de los datos, dinero, fechas y persistencia.
// Ver AGENTS.md §4. Sin DOM, sin red.

export const CLAVES = {
  rendiciones: 'b1.rendiciones.v1',
  padron: 'b1.padron.v1',
  insumos: 'b1.insumos.v1',       // reservada: catálogo de insumos (fase 6, AGENTS.md §4.3); hoy nada la usa
  calendario: 'b1.calendario.v1',
  config: 'b1.config.v1'
};

export const VERSION_ESQUEMA = 1;
export const VERSION_PADRON = 3;      // v3: raciones derivadas de la asistencia
export const VERSION_CALENDARIO = 1;

// ---------------------------------------------------------------- utilidades

export function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Respaldo sin dependencias para navegadores sin randomUUID.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// --------------------------------------------------------------------- dinero
// Todo monto vive como ENTERO de céntimos. Nunca se usa coma flotante.

/**
 * Convierte texto escrito por la usuaria a céntimos enteros.
 * Devuelve null si está vacío o no es un monto válido. Nunca adivina.
 */
export function aCentimos(texto) {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).trim().replace(/\s/g, '').replace(',', '.');
  if (limpio === '') return null;
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  const [entera, decimal = ''] = limpio.split('.');
  const dec = (decimal + '00').slice(0, 2);
  return Number(entera) * 100 + Number(dec);
}

/** Céntimos a texto "209.85". Devuelve '' si es null: lo vacío se muestra vacío. */
export function formatearSoles(centimos) {
  if (centimos === null || centimos === undefined || !Number.isFinite(centimos)) return '';
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centimos));
  return signo + Math.floor(abs / 100) + '.' + pad2(abs % 100);
}

/** Cantidad numérica libre (puede llevar decimales). null si no es válida. */
export function aNumero(texto) {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).trim().replace(',', '.');
  if (limpio === '') return null;
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

// --------------------------------------------------------------------- fechas

/**
 * Fecha de hoy en hora LOCAL, como 'AAAA-MM-DD'. No usa toISOString(), que
 * daría la fecha UTC (en Lima, ya "mañana" después de las 19:00).
 * Es la fecha por defecto de casi todo: el día de atención nuevo, el alta, y
 * la referencia de edad cuando no se pasa otra. No lee ni escribe datos guardados.
 * @returns {string}
 */
export function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ISO 'AAAA-MM-DD' a Date local (evita el corrimiento UTC de new Date(iso)). */
export function aFecha(iso) {
  if (!esIso(iso)) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return Number.isNaN(f.getTime()) ? null : f;
}

export function aIso(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  return `${fecha.getFullYear()}-${pad2(fecha.getMonth() + 1)}-${pad2(fecha.getDate())}`;
}

/**
 * ¿Tiene `valor` la FORMA 'AAAA-MM-DD'? Solo revisa el formato: '2024-02-31'
 * pasa. Para saber si la fecha existe, usar aFecha(), que devuelve null si no.
 * Se usa como guarda antes de comparar fechas como texto. No lee ni escribe datos.
 * @param {*} valor
 * @returns {boolean}
 */
export function esIso(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/** 'AAAA-MM-DD' a 'DD-MM-AA', como se escribe en el papel. */
export function aDdMmAa(iso) {
  if (!esIso(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}-${m}-${a.slice(2)}`;
}

export function diasEntre(isoA, isoB) {
  const a = aFecha(isoA);
  const b = aFecha(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ------------------------------------------------------------ constructores

export function nuevoEgreso() {
  return {
    id: uuid(),
    fechaCompra: '',
    descripcion: '',
    insumoId: null,
    cantidad: null,
    cantidadVarios: false,
    unidadMedida: '',
    rucProveedor: '',
    proveedorNombre: '',
    boletaSerie: '',
    boletaCorrelativo: '',
    precioUnitarioCent: null,
    precioUnitarioVarios: false,
    montoTotalCent: null,
    origenFondo: 'subsidio'
  };
}

export function nuevaRendicion() {
  return {
    version: VERSION_ESQUEMA,
    id: uuid(),
    actualizadoEn: new Date().toISOString(),
    tipoCentro: '',
    nombreCentro: '',
    codigoPca: '',
    periodo: { tipo: 'mensual', inicio: '', fin: '', etiqueta: '' },
    fechaRendicion: '',
    nombrePresidenta: '',
    dniPresidenta: '',
    celular: '',
    montoSubsidioCent: null,
    fechaAsignacion: '',
    egresos: [nuevoEgreso()],
    nombrePresidentaFirma: '',
    dniPresidentaFirma: '',
    nombreTesorera: '',
    dniTesorera: ''
  };
}

export function nuevoAfiliado() {
  return {
    id: uuid(),
    apellidoPaterno: '',
    apellidoMaterno: '',
    nombres: '',
    numeroDocumento: '',       // OBLIGATORIO (AGENTS.md §5.5)
    tipoDocumento: 'dni',      // 'dni' | 'ce'
    fechaNacimiento: '',       // opcional: la vía rápida es el grupo etario
    grupoEtarioManual: null,   // OBLIGATORIO si no hay fecha de nacimiento
    sexo: '',
    tipoAfiliado: '',          // OBLIGATORIO: 'habitual' | 'caso_social'
    activo: true,
    altaEn: hoyIso(),
    bajaEn: '',
    motivoBaja: '',
    origenDato: 'manual',
    verificadoPor: '',
    nota: ''
  };
}

/**
 * Un día de atención. Las raciones NO se escriben: salen de contar la asistencia
 * (AGENTS.md §6.5). La comida se prepara el mismo día según quién viene.
 *
 * Los precios son una COPIA del precio configurado al crear el día, para que el
 * histórico no cambie si mañana sube el menú. Editables por si ese día fue otro.
 *
 * Solo construye el objeto: NO lo agrega a `padron.atenciones` ni lo guarda.
 * Quien llama decide cuándo (ver asegurarHoyGuardado en ui-asistencia.js).
 * La fecha sale de hoyIso(); quien necesita otro día la sobrescribe.
 *
 * @param {{precioMenuNormalCent: ?number, precioMenuAyudaSocialCent: ?number}|null} precios
 *   normalmente preciosActuales() de estado.js; null deja los precios vacíos.
 * @returns {{id: string, fecha: string, asistencias: Array<{afiliadoId: string, tipoMenu: string}>,
 *   precioMenuNormalCent: ?number, precioMenuAyudaSocialCent: ?number,
 *   precioTomadoDeConfig: boolean, legado: ?Object, nota: string}}
 */
export function nuevaAtencion(precios) {
  return {
    id: uuid(),
    fecha: hoyIso(),
    asistencias: [],            // [{ afiliadoId, tipoMenu: 'normal'|'ayuda_social' }]
    precioMenuNormalCent: precios ? precios.precioMenuNormalCent : null,
    precioMenuAyudaSocialCent: precios ? precios.precioMenuAyudaSocialCent : null,
    precioTomadoDeConfig: !!precios,
    legado: null,               // solo en días migrados desde la v2
    nota: ''
  };
}

export function padronVacio() {
  return { version: VERSION_PADRON, afiliados: [], atenciones: [] };
}

export function calendarioVacio() {
  return {
    version: VERSION_CALENDARIO,
    periodicidad: 'mensual',      // 'semanal' | 'quincenal' | 'mensual'
    fechaLimiteBase: '',          // una fecha de entrega que la usuaria conoce
    diasDeAviso: [7, 3, 1],
    entregas: []                  // [{ id, fechaLimite, estado, nota }]
  };
}

export function nuevaEntrega(fechaLimite) {
  return { id: uuid(), fechaLimite: fechaLimite || '', estado: 'pendiente', nota: '' };
}

export function configVacia() {
  return {
    version: VERSION_ESQUEMA,
    calibracion: { offsetXmm: 0, offsetYmm: 0 },
    ultimoCentro: null,
    // Precio del menú, que el centro ya tiene fijado. Se copia a cada día nuevo.
    precioMenuNormalCent: null,
    precioMenuAyudaSocialCent: null
  };
}

/**
 * Migración del padrón a la v3. No inventa datos.
 *
 * - v1 -> v2: racionesServidas/racionesCasoSocial se separaban en dos cuentas.
 * - v2 -> v3: las raciones ya no se escriben, se cuentan de la asistencia. Los
 *   días que traían cuentas escritas a mano y no tienen asistencia marcada
 *   conservan esas cifras en `legado`, porque no hay forma de reconstruir quién
 *   vino aquel día sin inventárselo. Siguen sumando, y la interfaz dice de dónde
 *   salen. Ver AGENTS.md §4.2.
 */
export function migrarPadron(datos) {
  if (!datos || typeof datos !== 'object') return padronVacio();
  const salida = {
    version: VERSION_PADRON,
    afiliados: Array.isArray(datos.afiliados) ? datos.afiliados : [],
    atenciones: []
  };

  for (const a of salida.afiliados) {
    if (a.tipoAfiliado === undefined || a.tipoAfiliado === null) a.tipoAfiliado = '';
    if (a.tipoDocumento === 'sin_documento') a.tipoDocumento = 'dni';
  }

  for (const at of Array.isArray(datos.atenciones) ? datos.atenciones : []) {
    if (!at || typeof at !== 'object') continue;
    const base = nuevaAtencion(null);
    base.id = at.id || uuid();
    base.fecha = at.fecha || '';
    base.nota = at.nota || '';
    base.asistencias = Array.isArray(at.asistencias) ? at.asistencias : [];
    base.precioMenuNormalCent = Number.isFinite(at.precioMenuNormalCent) ? at.precioMenuNormalCent : null;
    base.precioMenuAyudaSocialCent = Number.isFinite(at.precioMenuAyudaSocialCent) ? at.precioMenuAyudaSocialCent : null;
    base.precioTomadoDeConfig = false;

    if (at.legado) {
      base.legado = at.legado;
    } else if (base.asistencias.length === 0) {
      // Cuentas escritas a mano en v1 o v2.
      const total = Number.isFinite(at.racionesServidas) ? at.racionesServidas : null;
      const social = Number.isFinite(at.racionesCasoSocial) ? at.racionesCasoSocial : null;
      const normalesV2 = Number.isFinite(at.racionesNormales) ? at.racionesNormales : null;
      const socialV2 = Number.isFinite(at.racionesAyudaSocial) ? at.racionesAyudaSocial : null;

      const normales = normalesV2 !== null ? normalesV2
        : (total === null ? null : (social === null ? total : total - social));
      const ayuda = socialV2 !== null ? socialV2 : social;

      if (normales !== null || ayuda !== null) {
        base.legado = { racionesNormales: normales || 0, racionesAyudaSocial: ayuda || 0 };
      }
    }
    salida.atenciones.push(base);
  }
  return salida;
}

/** Nombre completo para mostrar y ordenar. No inventa nada: solo une lo que hay. */
export function nombreCompleto(afiliado) {
  return [afiliado.apellidoPaterno, afiliado.apellidoMaterno, afiliado.nombres]
    .map((p) => (p || '').trim())
    .filter(Boolean)
    .join(' ');
}

/** Normaliza para comparar duplicados: sin tildes, sin dobles espacios, minúsculas. */
export function normalizarNombre(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// --------------------------------------------------------------- persistencia
// Toda lectura tolera ausencia y corrupción. Ante duda se arranca vacío y se
// avisa; nunca se borra en silencio lo que había. Ver AGENTS.md §4.6.

const avisos = [];

export function avisosAlmacenamiento() {
  return avisos.slice();
}

export function leer(clave, porDefecto) {
  let crudo = null;
  try {
    crudo = localStorage.getItem(clave);
  } catch (e) {
    avisos.push(`No se pudo leer el almacenamiento del navegador (${clave}). ` +
      'Si estás en modo incógnito o con los datos de sitio bloqueados, nada se guardará.');
    return porDefecto;
  }
  if (crudo === null) return porDefecto;
  try {
    const valor = JSON.parse(crudo);
    if (valor === null || typeof valor !== 'object') throw new Error('forma inesperada');
    return valor;
  } catch (e) {
    // Se conserva lo ilegible por si se puede recuperar a mano.
    try {
      localStorage.setItem(clave + '.respaldo', crudo);
    } catch (e2) { /* sin espacio: se sigue igual */ }
    avisos.push(`Los datos guardados en "${clave}" no se pudieron leer y se ` +
      `conservaron aparte en "${clave}.respaldo". Se empezó con los datos vacíos.`);
    return porDefecto;
  }
}

export function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    avisos.push(`No se pudo guardar en "${clave}". Puede que el almacenamiento ` +
      'esté lleno o bloqueado. Exporta un respaldo antes de cerrar.');
    return false;
  }
}

export function borrarTodo() {
  let ok = true;
  for (const clave of Object.values(CLAVES)) {
    try {
      localStorage.removeItem(clave);
      localStorage.removeItem(clave + '.respaldo');
    } catch (e) { ok = false; }
  }
  return ok;
}

/** Descarga local de texto plano (CSV, TSV). No sube nada a ninguna parte. */
export function descargarTexto(nombreArchivo, texto, tipo = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + texto], { type: tipo });   // BOM: tildes en Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga local de un objeto como .json. No sube nada a ninguna parte. */
export function descargarJson(nombreArchivo, datos) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
