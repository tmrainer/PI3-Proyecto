// modelo.js — forma de los datos, dinero, fechas y persistencia.
// Ver AGENTS.md §4. Sin DOM, sin red.

export const CLAVES = {
  rendiciones: 'b1.rendiciones.v1',
  padron: 'b1.padron.v1',
  insumos: 'b1.insumos.v1',       // reservada: catálogo de insumos (fase 6, AGENTS.md §4.3); hoy nada la usa
  calendario: 'b1.calendario.v1',
  config: 'b1.config.v1',
  respaldo: 'b1.respaldo.v1'     // { ultimoEn: 'AAAA-MM-DD' }: cuándo se exportó el último respaldo
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

/**
 * «1 persona», «3 personas»: el plural de verdad, no «persona(s)», que se lee
 * mal en voz alta y cuesta a quien lee despacio.
 * @param {number} n
 * @param {string} uno  la palabra en singular
 * @param {string} [varios]  el plural, si no es singular + «s»
 */
export function cuantos(n, uno, varios = uno + 's') {
  return `${n} ${n === 1 ? uno : varios}`;
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
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** «Sábado 11 de octubre»: la fecha como se dice. Solo para mostrar. */
export function fechaLarga(iso) {
  if (!esIso(iso)) return '';
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS_SEMANA[new Date(a, m - 1, d).getDay()]} ${d} de ${MESES_LARGOS[m - 1]}`;
}

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

/**
 * Orden alfabético en castellano (la ñ va después de la n), para listas de
 * nombres: `lista.sort((a, b) => ORDEN_NOMBRES.compare(x, y))`. Armado una
 * vez, es varias veces más rápido que localeCompare en cada comparación.
 */
export const ORDEN_NOMBRES = new Intl.Collator('es');

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

// ------------------------------------- asistencia compacta en localStorage

// Guardada como lista de marcas, la asistencia de 150 personas llenaba el
// límite de Safari (~5 MB) en unos dos años, y con 300 en uno. Por eso cada día
// se guarda como CASILLAS: una por persona, en el orden de padron.afiliados que
// va en la MISMA clave guardada, 6 personas por carácter:
//   marcas: { vino: 'texto', social: 'texto', fuera: [...] }
// vino marca a quién vino; social, a quién comió menú de ayuda social; fuera
// (rara vez) guarda tal cual las marcas de alguien que ya no está en el
// padrón. 300 personas ocupan 50 caracteres por día, no ~4.800.
//
// Es SOLO el formato en localStorage: en memoria, en los cálculos y en los
// respaldos exportados la forma sigue siendo asistencias: [{ afiliadoId,
// tipoMenu }], en el orden del padrón. leer() y guardar() traducen solos;
// leer() entiende también los dos formatos anteriores.

const MENUS = new Set(['normal', 'ayuda_social']);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Posiciones [0, 3, 7…] -> texto de casillas. */
function aCasillas(posiciones) {
  const grupos = [];
  for (const i of posiciones) {
    const g = Math.floor(i / 6);
    while (grupos.length <= g) grupos.push(0);
    grupos[g] |= 1 << (i % 6);
  }
  return grupos.map((n) => B64[n]).join('');
}

/** Texto de casillas -> posiciones marcadas, de menor a mayor. */
function deCasillas(texto) {
  const posiciones = [];
  for (let g = 0; g < texto.length; g += 1) {
    const n = B64.indexOf(texto[g]);
    for (let b = 0; b < 6; b += 1) if (n & (1 << b)) posiciones.push(g * 6 + b);
  }
  return posiciones;
}

// Formato anterior (solo hubo copias de desarrollo): un UUID iba como «~» y
// sus 16 bytes en base64url. Se sigue leyendo; ya no se escribe.
function idLargo(id) {
  if (typeof id !== 'string' || id[0] !== '~' || id.length !== 23) return id;
  let hex = '';
  let acumulado = 0;
  let bits = 0;
  for (const c of id.slice(1)) {
    acumulado = (acumulado << 6) | B64.indexOf(c);
    bits += 6;
    while (bits >= 4 && hex.length < 32) {
      bits -= 4;
      hex += ((acumulado >> bits) & 15).toString(16);
    }
    acumulado &= (1 << bits) - 1;
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Padrón tal como se guarda: la asistencia de cada día, en casillas. */
export function empacarPadron(padron) {
  if (!padron || !Array.isArray(padron.atenciones) || !Array.isArray(padron.afiliados)) return padron;
  const posicion = new Map();
  padron.afiliados.forEach((a, i) => { if (a && !posicion.has(a.id)) posicion.set(a.id, i); });
  return {
    ...padron,
    atenciones: padron.atenciones.map((at) => {
      const lista = at && at.asistencias;
      // Lo que no tiene la forma de siempre se guarda tal cual: nunca se pierde un dato.
      if (!Array.isArray(lista) || !lista.every((x) => x && typeof x.afiliadoId === 'string' &&
        MENUS.has(x.tipoMenu) && Object.keys(x).length === 2)) return at;
      if (new Set(lista.map((x) => x.afiliadoId)).size !== lista.length) return at;
      const vino = [];
      const social = [];
      const fuera = [];
      for (const x of lista) {
        const i = posicion.get(x.afiliadoId);
        if (i === undefined) { fuera.push(x); continue; }
        vino.push(i);
        if (x.tipoMenu === 'ayuda_social') social.push(i);
      }
      const { asistencias, ...resto } = at;
      const marcas = { vino: aCasillas(vino) };
      if (social.length) marcas.social = aCasillas(social);
      if (fuera.length) marcas.fuera = fuera;
      return { ...resto, marcas };
    })
  };
}

/** El camino de vuelta de empacarPadron(). Lo que ya viene sin empacar, pasa igual. */
export function desempacarPadron(padron) {
  if (!padron || !Array.isArray(padron.atenciones)) return padron;
  const afiliados = Array.isArray(padron.afiliados) ? padron.afiliados : [];
  return {
    ...padron,
    atenciones: padron.atenciones.map((at) => {
      const m = at && at.marcas;
      if (!m) return at;
      const { marcas, ...resto } = at;
      if (typeof m.vino === 'string') {
        const social = new Set(deCasillas(m.social || ''));
        const asistencias = deCasillas(m.vino)
          .filter((i) => afiliados[i])
          .map((i) => ({ afiliadoId: afiliados[i].id, tipoMenu: social.has(i) ? 'ayuda_social' : 'normal' }));
        return { ...resto, asistencias: asistencias.concat(Array.isArray(m.fuera) ? m.fuera : []) };
      }
      if (Array.isArray(m.ids)) {
        const social = new Set(m.social || []);
        return {
          ...resto,
          asistencias: m.ids.map((id) => ({
            afiliadoId: idLargo(id), tipoMenu: social.has(id) ? 'ayuda_social' : 'normal'
          }))
        };
      }
      return at;
    })
  };
}

// Safari da ~5 MB por sitio y cuenta 2 bytes por carácter: ~2,5 millones de
// caracteres. Chrome da algo más. Se mide contra lo más chico.
const LIMITE_CARACTERES = 2500000;

/**
 * Cuánto ocupa la app en localStorage: sus claves (b1.*) y sus valores.
 * @returns {{ caracteres: number, fraccion: number }}  fraccion de 0 a 1 (o más)
 */
export function usoAlmacenamiento() {
  let caracteres = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('b1.')) caracteres += k.length + (localStorage.getItem(k) || '').length;
    }
  } catch (e) { /* bloqueado: ya lo avisa leer() */ }
  return { caracteres, fraccion: caracteres / LIMITE_CARACTERES };
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
    return clave === CLAVES.padron ? desempacarPadron(valor) : valor;
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
    const texto = JSON.stringify(clave === CLAVES.padron ? empacarPadron(valor) : valor);
    // Si no cambió nada, no se escribe: es más rápido y no despierta a las
    // otras pestañas (evento storage) por gusto.
    if (localStorage.getItem(clave) !== texto) localStorage.setItem(clave, texto);
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

// ------------------------------------------------------ restaurar un respaldo

/**
 * Revisa un respaldo antes de restaurarlo: qué trae y si tiene la forma que
 * espera la aplicación. No escribe nada.
 *
 * Solo cuentan las partes que el archivo trae de verdad: si no trae el
 * calendario, el de este dispositivo se queda como está.
 * @param {*} datos  el objeto leído del .json (ya descifrado)
 * @returns {{ error: ?string, partes: string[], resumen: string }}
 */
export function revisarRespaldo(datos) {
  const sinNada = { partes: [], resumen: '' };
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return { error: 'El archivo no es un respaldo de esta aplicación.', ...sinNada };
  }
  const partes = [];
  const textos = [];
  const errores = [];
  if (datos.padron !== undefined && datos.padron !== null) {
    if (typeof datos.padron !== 'object' || !Array.isArray(datos.padron.afiliados)) {
      errores.push('el padrón no tiene la lista de personas');
    } else {
      partes.push('padron');
      const n = datos.padron.afiliados.length;
      const dias = Array.isArray(datos.padron.atenciones) ? datos.padron.atenciones.length : 0;
      textos.push(`${cuantos(n, 'persona')} en el padrón y ${cuantos(dias, 'día')} de asistencia`);
    }
  }
  if (datos.rendiciones !== undefined && datos.rendiciones !== null) {
    if (!Array.isArray(datos.rendiciones)) errores.push('las rendiciones no son una lista');
    else if (datos.rendiciones.length) {
      partes.push('rendiciones');
      textos.push(cuantos(datos.rendiciones.length, 'Formato B-1', 'Formatos B-1'));
    }
  }
  if (datos.calendario !== undefined && datos.calendario !== null) {
    if (typeof datos.calendario !== 'object' || Array.isArray(datos.calendario)) errores.push('el calendario está dañado');
    else { partes.push('calendario'); textos.push('el calendario de entregas'); }
  }
  if (datos.config !== undefined && datos.config !== null) {
    if (typeof datos.config !== 'object' || Array.isArray(datos.config)) errores.push('la configuración está dañada');
    else { partes.push('config'); textos.push('los precios del menú y datos del centro'); }
  }
  if (errores.length) {
    return { error: `El respaldo está dañado: ${errores.join('; ')}. No se cambió nada.`, ...sinNada };
  }
  if (!partes.length) {
    return { error: 'El archivo no trae datos para restaurar. No se cambió nada.', ...sinNada };
  }
  return { error: null, partes, resumen: textos.join(', ') };
}

/**
 * Escribe en este dispositivo TODAS las partes que trae el respaldo (padrón,
 * rendiciones, calendario y config), sea cual sea la página desde donde se
 * importe. Antes, cada página restauraba solo lo suyo y el resto se perdía sin
 * aviso. Si una escritura falla, lo dice: devuelve false.
 * @param {Object} datos  respaldo ya revisado con revisarRespaldo()
 * @returns {boolean}
 */
export function restaurarRespaldo(datos) {
  const { error, partes } = revisarRespaldo(datos);
  if (error) return false;
  let ok = true;
  if (partes.includes('padron')) ok = guardar(CLAVES.padron, migrarPadron(datos.padron)) && ok;
  if (partes.includes('rendiciones')) ok = guardar(CLAVES.rendiciones, datos.rendiciones) && ok;
  if (partes.includes('calendario')) ok = guardar(CLAVES.calendario, datos.calendario) && ok;
  if (partes.includes('config')) ok = guardar(CLAVES.config, datos.config) && ok;
  return ok;
}

// --------------------------------------------------- respaldo con contraseña

// El respaldo lleva nombres, documentos y asistencia de personas reales. Con
// contraseña se cifra con AES-GCM (Web Crypto del navegador: sin librerías) y
// una clave derivada con PBKDF2. Sin la contraseña no hay forma de abrirlo:
// tampoco para quien la olvidó.

const ITERACIONES_PBKDF2 = 310000;   // recomendación OWASP para PBKDF2-SHA256

// Por partes: pasar un respaldo de 1 MB de una vez a fromCharCode(...) supera
// el máximo de argumentos y revienta.
function aBase64(bytes) {
  const b = new Uint8Array(bytes);
  let texto = '';
  for (let i = 0; i < b.length; i += 0x8000) texto += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(texto);
}
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function claveDesdeContrasena(contrasena, sal, iteraciones) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/**
 * Cifra un respaldo. Devuelve el «sobre» que se guarda como .json: dice cómo
 * se cifró (para poder abrirlo) pero no deja ver nada de adentro.
 * @param {Object} datos  el respaldo completo
 * @param {string} contrasena
 * @returns {Promise<Object>}
 */
export async function cifrarRespaldo(datos, contrasena) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await claveDesdeContrasena(contrasena, sal, ITERACIONES_PBKDF2);
  const cifrado = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, clave, new TextEncoder().encode(JSON.stringify(datos)));
  return {
    aplicacion: 'rendicion-b1',
    cifrado: {
      algoritmo: 'AES-GCM', derivacion: 'PBKDF2-SHA256',
      iteraciones: ITERACIONES_PBKDF2, sal: aBase64(sal), iv: aBase64(iv)
    },
    datos: aBase64(cifrado)
  };
}

/** ¿Es un respaldo cifrado por cifrarRespaldo()? */
export function esRespaldoCifrado(objeto) {
  return !!(objeto && objeto.cifrado && typeof objeto.datos === 'string');
}

/**
 * Abre un respaldo cifrado. Con la contraseña equivocada (o el archivo
 * alterado) AES-GCM no descifra: lanza un error, nunca devuelve basura.
 * @param {Object} sobre
 * @param {string} contrasena
 * @returns {Promise<Object>}
 */
export async function descifrarRespaldo(sobre, contrasena) {
  const c = sobre.cifrado;
  const clave = await claveDesdeContrasena(contrasena, deBase64(c.sal), c.iteraciones);
  const plano = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deBase64(c.iv) }, clave, deBase64(sobre.datos));
  return JSON.parse(new TextDecoder().decode(plano));
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
