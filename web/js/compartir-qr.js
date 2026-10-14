// compartir-qr.js — pasar el padrón, la asistencia de uno o varios días o las
// entregas de un teléfono a otro con códigos QR, sin internet ni servidor.
//
// Funciones PURAS (sin DOM ni estado), salvo que comprimir usa
// CompressionStream, del propio navegador: nada sale del teléfono.
//
// Quien recibe NUNCA guarda a ciegas: primero se compara lo recibido con lo
// que ya hay (compararPadron, compararAsistencia, compararEntregas) y la
// interfaz muestra qué se agrega, qué es igual y qué no coincide. Lo que no
// coincide queda como está salvo que la persona elija lo recibido; las
// aplicar...() solo hacen lo elegido y devuelven objetos nuevos.
//
// Formato de cada QR (modo alfanumérico, el más compacto con letras):
//   «P3» · tipo (P padrón, A asistencia, E entregas) · id del envío (4)
//   · parte (2 cifras) · total (2 cifras) · trozo · «:» de cierre
// El contenido es JSON comprimido (deflate) y escrito en base45 (RFC 9285),
// que usa justo las letras que el QR guarda en modo alfanumérico. El «:» del
// final protege los espacios del trozo si un lector recorta el texto. El id
// une las partes de un mismo envío: dos envíos no se mezclan.
// También se leen los QR de antes (solo cifras, lista-qr.js).

import { asistenciasDelDia, afiliadosActivos, sinInscribirDelDia, TRAMOS_ETARIOS } from './calculos.js';
import { nombreCompleto, normalizarNombre, nuevaAtencion, nuevaEntrega, nuevoAfiliado } from './modelo.js';
import { decodificarParteQr } from './lista-qr.js';

const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const LETRA = { padron: 'P', asistencia: 'A', entregas: 'E' };
const TIPO = { P: 'padron', A: 'asistencia', E: 'entregas' };
const POR_PARTE = 700;          // ~QR versión 14 (nivel L): lo lee bien una cámara modesta desde otra pantalla
const MAX_PARTES = 99;

// ------------------------------------------------------------------ base45

export function aBase45(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      s += ALFABETO[n % 45] + ALFABETO[Math.floor(n / 45) % 45] + ALFABETO[Math.floor(n / 2025)];
    } else {
      s += ALFABETO[bytes[i] % 45] + ALFABETO[Math.floor(bytes[i] / 45)];
    }
  }
  return s;
}

/** null si el texto no es base45 válido. */
export function deBase45(texto) {
  if (texto.length % 3 === 1) return null;
  const salida = [];
  for (let i = 0; i < texto.length; i += 3) {
    const v = [...texto.slice(i, i + 3)].map((c) => ALFABETO.indexOf(c));
    if (v.some((x) => x < 0)) return null;
    if (v.length === 3) {
      const n = v[0] + v[1] * 45 + v[2] * 2025;
      if (n > 65535) return null;
      salida.push(n >> 8, n & 255);
    } else {
      const n = v[0] + v[1] * 45;
      if (n > 255) return null;
      salida.push(n);
    }
  }
  return new Uint8Array(salida);
}

async function pasarPor(flujo, bytes) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(flujo)).arrayBuffer());
}

// ------------------------------------------------------- partes del envío

function idCorto() {
  const v = new Uint8Array(4);
  if (globalThis.crypto && crypto.getRandomValues) crypto.getRandomValues(v);
  else for (let i = 0; i < 4; i += 1) v[i] = Math.floor(Math.random() * 256);
  return [...v].map((x) => ALFABETO[x % 36]).join('');
}

const dos = (n) => String(n).padStart(2, '0');

/**
 * El texto de cada QR de un envío.
 * @param {'padron'|'asistencia'|'entregas'} tipo
 * @param {object} paquete  de paqueteDelPadron / paqueteDeAsistencia / paqueteDeEntregas
 * @returns {Promise<string[]>}  [] si no cabe en 99 códigos
 */
export async function codificarParaQr(tipo, paquete) {
  const json = new TextEncoder().encode(JSON.stringify(paquete));
  let texto = 'J' + aBase45(json);
  if (typeof CompressionStream !== 'undefined') {
    const z = await pasarPor(new CompressionStream('deflate-raw'), json);
    if (z.length < json.length) texto = 'Z' + aBase45(z);
  }
  const total = Math.ceil(texto.length / POR_PARTE);
  if (total > MAX_PARTES) return [];
  const id = idCorto();
  return Array.from({ length: total }, (_, i) =>
    'P3' + LETRA[tipo] + id + dos(i + 1) + dos(total) + texto.slice(i * POR_PARTE, (i + 1) * POR_PARTE) + ':');
}

/**
 * Lee un QR. NUNCA lanza: si no es de esta app, null.
 * @returns {?{tipo: string, id: string, parte: number, total: number, trozo?: string, viejo?: object}}
 */
export function leerParteQr(texto) {
  if (typeof texto !== 'string') return null;
  const viejo = decodificarParteQr(texto);
  if (viejo) {
    return { tipo: 'asistencia', id: `81${viejo.fecha}${viejo.total}`, parte: viejo.parte, total: viejo.total, viejo };
  }
  const m = /^P3([PAE])([0-9A-Z]{4})(\d{2})(\d{2})([0-9A-Z $%*+\-./:]*):$/.exec(texto);
  if (!m) return null;
  const parte = Number(m[3]);
  const total = Number(m[4]);
  if (!parte || !total || parte > total) return null;
  return { tipo: TIPO[m[1]], id: m[1] + m[2], parte, total, trozo: m[5] };
}

/**
 * Junta todas las partes de un envío y devuelve el paquete, ya revisado.
 * @param {object[]} partes  resultados de leerParteQr, todas del mismo id
 * @returns {Promise<?object>}  null si falta algo o no tiene la forma esperada
 */
export async function juntarPartesQr(partes) {
  try {
    const orden = [...partes].sort((a, b) => a.parte - b.parte);
    if (!orden.length || orden.length !== orden[0].total || orden.some((p, i) => p.parte !== i + 1)) return null;
    if (orden[0].viejo) {
      const marcas = orden.flatMap((p) => p.viejo.marcas).map((m) => (m.menu === 'ayuda_social' ? [m.dni, 1] : [m.dni]));
      return revisarPaquete('asistencia', { t: 'A', v: 1, d: [[orden[0].viejo.fecha, null, null, marcas]] });
    }
    const texto = orden.map((p) => p.trozo).join('');
    const bytes = deBase45(texto.slice(1));
    if (!bytes) return null;
    let json = bytes;
    if (texto[0] === 'Z') json = await pasarPor(new DecompressionStream('deflate-raw'), bytes);
    else if (texto[0] !== 'J') return null;
    return revisarPaquete(orden[0].tipo, JSON.parse(new TextDecoder().decode(json)));
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------- qué lleva cada envío

const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const esTexto = (s) => typeof s === 'string' && s.length <= 200;
const esPrecio = (n) => n === null || (Number.isInteger(n) && n >= 0);
const docDe = (a) => String((a && a.numeroDocumento) || '').trim().toUpperCase();

/** Lo que vino por QR, con la forma esperada; si no, null. Nunca se guarda algo raro. */
function revisarPaquete(tipo, p) {
  if (!p || p.v !== 1 || p.t !== LETRA[tipo]) return null;
  if (tipo === 'padron') {
    if (!Array.isArray(p.p) || !p.p.every((f) => Array.isArray(f) && f.length === 13 &&
      f.every((x, i) => (i === 9 ? x === 0 || x === 1 : esTexto(x))))) return null;
  } else if (tipo === 'asistencia') {
    const esCuenta = (n) => Number.isInteger(n) && n >= 0 && n < 10000;
    if (!Array.isArray(p.d) || !p.d.every((d) => Array.isArray(d) && (d.length === 4 ||
      (d.length === 5 && Array.isArray(d[4]) && d[4].length === 2 && d[4].every(esCuenta))) && esFecha(d[0]) &&
      esPrecio(d[1]) && esPrecio(d[2]) && Array.isArray(d[3]) &&
      d[3].every((m) => Array.isArray(m) && esTexto(m[0]) && m[0] && (m.length === 1 || (m.length === 2 && m[1] === 1)))))
      return null;
  } else if (tipo === 'entregas') {
    if (!Array.isArray(p.c) || p.c.length !== 3 || !esTexto(p.c[0]) || !(p.c[1] === '' || esFecha(p.c[1])) ||
      !Array.isArray(p.c[2]) || !p.c[2].every((n) => Number.isInteger(n) && n >= 0 && n < 400)) return null;
    if (!Array.isArray(p.e) || !p.e.every((e) => Array.isArray(e) && e.length === 3 && esFecha(e[0]) &&
      esTexto(e[1]) && esTexto(e[2]))) return null;
  }
  return { tipo, ...p };
}

/** Todas las personas del padrón, con lo necesario para inscribirlas en otro teléfono (sin notas). */
export function paqueteDelPadron(padron) {
  return {
    t: 'P', v: 1,
    p: ((padron && padron.afiliados) || []).map((a) => [
      a.apellidoPaterno || '', a.apellidoMaterno || '', a.nombres || '', docDe(a), a.tipoDocumento || 'dni',
      a.fechaNacimiento || '', a.grupoEtarioManual || '', a.sexo || '', a.tipoAfiliado || '',
      a.activo === false ? 0 : 1, a.altaEn || '', a.bajaEn || '', a.motivoBaja || ''
    ].map((x) => (typeof x === 'string' ? x.slice(0, 200) : x)))
  };
}

// Lo que no es un valor de la app se descarta, no se guarda tal cual: un tipo
// desconocido queda vacío y la persona aparece en «Les faltan datos».
const unoDe = (v, permitidos, si) => (permitidos.includes(v) ? v : si);
const fechaO = (v) => (esFecha(v) ? v : '');

function personaDeFila(f) {
  return {
    apellidoPaterno: f[0], apellidoMaterno: f[1], nombres: f[2], numeroDocumento: f[3],
    tipoDocumento: unoDe(f[4], ['dni', 'ce'], 'dni'),
    fechaNacimiento: fechaO(f[5]), grupoEtarioManual: unoDe(f[6], TRAMOS_ETARIOS.map((t) => t.clave), null),
    sexo: unoDe(f[7], ['F', 'M'], ''), tipoAfiliado: unoDe(f[8], ['habitual', 'caso_social'], ''),
    activo: f[9] === 1, altaEn: fechaO(f[10]), bajaEn: fechaO(f[11]), motivoBaja: f[12]
  };
}

/**
 * La asistencia de los días pedidos. Cada persona va por su documento: los
 * dos teléfonos pueden tener el padrón cargado por separado.
 * @returns {{paquete: object, personas: number, sinDocumento: number}}
 */
export function paqueteDeAsistencia(padron, fechas) {
  const porId = new Map(((padron && padron.afiliados) || []).map((a) => [a.id, a]));
  const atenciones = (padron && padron.atenciones) || [];
  let personas = 0;
  let sinDocumento = 0;
  const d = [];
  for (const fecha of fechas) {
    const at = atenciones.find((o) => o.fecha === fecha);
    if (!at) continue;
    const marcas = [];
    for (const x of asistenciasDelDia(at)) {
      const doc = docDe(porId.get(x.afiliadoId));
      if (!doc) { sinDocumento += 1; continue; }
      marcas.push(x.tipoMenu === 'ayuda_social' ? [doc, 1] : [doc]);
    }
    personas += marcas.length;
    const precio = (n) => (Number.isInteger(n) ? n : null);
    const dia = [fecha, precio(at.precioMenuNormalCent), precio(at.precioMenuAyudaSocialCent), marcas];
    // Quienes comieron sin estar en el padrón, por menú. Solo si hay: así un
    // día sin ellos se lee igual en un teléfono con la versión anterior.
    const fuera = sinInscribirDelDia(at);
    if (fuera.total) dia.push([fuera.normal, fuera.ayudaSocial]);
    d.push(dia);
  }
  return { paquete: { t: 'A', v: 1, d }, personas, sinDocumento };
}

/** Cada cuánto se entrega, la fecha base, los avisos y lo anotado de cada entrega. */
export function paqueteDeEntregas(calendario) {
  const c = calendario || {};
  return {
    t: 'E', v: 1,
    c: [c.periodicidad || '', esFecha(c.fechaLimiteBase) ? c.fechaLimiteBase : '',
      Array.isArray(c.diasDeAviso) ? c.diasDeAviso.filter((n) => Number.isInteger(n)) : []],
    e: (c.entregas || []).filter((e) => esFecha(e.fechaLimite))
      .map((e) => [e.fechaLimite, e.estado || 'pendiente', String(e.nota || '').slice(0, 200)])
  };
}

// --------------------------------------------------------------- padrón

export const CAMPOS_PERSONA = [
  ['apellidoPaterno', 'Apellido paterno'], ['apellidoMaterno', 'Apellido materno'], ['nombres', 'Nombres'],
  ['tipoDocumento', 'Tipo de documento'], ['fechaNacimiento', 'Fecha de nacimiento'],
  ['grupoEtarioManual', 'Grupo de edad'], ['sexo', 'Sexo'], ['tipoAfiliado', 'Tipo'],
  ['activo', 'Activa en la olla'], ['bajaEn', 'Fecha de baja'], ['motivoBaja', 'Motivo de baja']
];

const valorCampo = (p, k) => (k === 'activo' ? p.activo !== false : String(p[k] ?? '').trim());
const vacio = (v) => v === '' || v === null || v === undefined;
const claveNombre = (p) => normalizarNombre(nombreCompleto(p));

/**
 * Compara el padrón recibido con el de este teléfono, persona por persona,
 * por el número de documento.
 * @returns {{nuevas: object[], dudosas: {recibida: object, mia: object}[],
 *   distintas: {mia: object, recibida: object, campos: object[], nombreDistinto: boolean, soloCompleta: boolean}[],
 *   iguales: number, soloAqui: number}}
 *   dudosas: no está su documento aquí, pero sí alguien con el mismo nombre y
 *   otro documento (¿un DNI mal escrito?). nombreDistinto: mismo documento y
 *   otro nombre (¿dos personas cruzadas?). soloCompleta: solo llena lo que aquí
 *   estaba vacío.
 */
export function compararPadron(padron, paquete) {
  const mias = (padron && padron.afiliados) || [];
  const porDoc = new Map();
  const porNombre = new Map();
  for (const a of mias) {
    if (docDe(a) && !porDoc.has(docDe(a))) porDoc.set(docDe(a), a);
    if (!porNombre.has(claveNombre(a))) porNombre.set(claveNombre(a), a);
  }
  const r = { nuevas: [], dudosas: [], distintas: [], iguales: 0, soloAqui: 0 };
  const tocadas = new Set();
  const vistas = new Set();
  for (const fila of paquete.p) {
    const recibida = personaDeFila(fila);
    const doc = docDe(recibida);
    const clave = doc || `nombre:${claveNombre(recibida)}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const mia = doc ? porDoc.get(doc) : porNombre.get(claveNombre(recibida));
    if (!mia) {
      const tocaya = porNombre.get(claveNombre(recibida));
      if (doc && tocaya && docDe(tocaya) && docDe(tocaya) !== doc) r.dudosas.push({ recibida, mia: tocaya });
      else r.nuevas.push(recibida);
      continue;
    }
    tocadas.add(mia);
    const campos = CAMPOS_PERSONA
      .filter(([k]) => !(vacio(valorCampo(recibida, k)) && k !== 'activo') && valorCampo(mia, k) !== valorCampo(recibida, k))
      .map(([campo, etiqueta]) => ({ campo, etiqueta, mio: mia[campo], recibido: recibida[campo] }));
    if (!campos.length) { r.iguales += 1; continue; }
    r.distintas.push({
      mia, recibida, campos,
      nombreDistinto: claveNombre(mia) !== claveNombre(recibida),
      soloCompleta: campos.every((c) => c.campo !== 'activo' && vacio(valorCampo(mia, c.campo)))
    });
  }
  r.soloAqui = mias.filter((a) => !tocadas.has(a)).length;
  return r;
}

/**
 * Aplica lo elegido. No cambia `padron`: devuelve uno nuevo.
 * @param {{agregar: object[], usarRecibida: object[]}} eleccion
 *   agregar: personas de nuevas/dudosas; usarRecibida: entradas de distintas
 */
export function aplicarPadron(padron, eleccion) {
  const cambios = new Map(eleccion.usarRecibida.map((d) => [d.mia, d]));
  const afiliados = padron.afiliados.map((a) => {
    const d = cambios.get(a);
    if (!d) return a;
    const nuevo = { ...a };
    for (const c of d.campos) nuevo[c.campo] = d.recibida[c.campo];
    return nuevo;
  });
  for (const p of eleccion.agregar) {
    afiliados.push({ ...nuevoAfiliado(), ...p, altaEn: p.altaEn || nuevoAfiliado().altaEn, origenDato: 'qr' });
  }
  return { ...padron, afiliados };
}

// ----------------------------------------------------------- asistencia

/**
 * Compara día por día. Solo se pueden sumar personas que están en este
 * padrón (por su documento) y activas ese día.
 * @returns {{fecha: string, existe: boolean, agregar: {afiliado: object, tipoMenu: string}[],
 *   menuDistinto: {afiliado: object, mio: string, recibido: string}[], yaEstaban: number,
 *   desconocidos: number, inactivos: number, soloAqui: number,
 *   precios: {normal: ?number, ayuda: ?number}, preciosDistintos: ?{mio: object, recibido: object},
 *   fuera: {normal: number, ayudaSocial: number, total: number}, fueraDistinto: ?{mio: object, recibido: object}}[]}
 *   fuera: los que comieron sin estar en el padrón, según el otro teléfono.
 *   No se suman a los de aquí: pueden ser las mismas personas contadas dos veces.
 */
export function compararAsistencia(padron, paquete) {
  const afiliados = (padron && padron.afiliados) || [];
  const porDoc = new Map();
  for (const a of afiliados) if (docDe(a) && !porDoc.has(docDe(a))) porDoc.set(docDe(a), a);
  return paquete.d.map(([fecha, normal, ayuda, marcas, cuenta]) => {
    const at = ((padron && padron.atenciones) || []).find((o) => o.fecha === fecha);
    const activos = new Set(afiliadosActivos(padron, fecha).map((a) => a.id));
    const ya = new Map(at ? asistenciasDelDia(at).map((x) => [x.afiliadoId, x.tipoMenu]) : []);
    const dia = {
      fecha, existe: !!at, agregar: [], menuDistinto: [], yaEstaban: 0, desconocidos: 0, inactivos: 0, soloAqui: 0,
      precios: { normal, ayuda }, preciosDistintos: null,
      fuera: sinInscribirDelDia({ sinInscribir: cuenta ? { normal: cuenta[0], ayudaSocial: cuenta[1] } : null }),
      fueraDistinto: null
    };
    const vistos = new Set();
    const coinciden = new Set();
    for (const [doc, social] of marcas) {
      const clave = String(doc).trim().toUpperCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      const tipoMenu = social === 1 ? 'ayuda_social' : 'normal';
      const p = porDoc.get(clave);
      if (!p) dia.desconocidos += 1;
      else if (ya.has(p.id)) {
        coinciden.add(p.id);
        if (ya.get(p.id) === tipoMenu) dia.yaEstaban += 1;
        else dia.menuDistinto.push({ afiliado: p, mio: ya.get(p.id), recibido: tipoMenu });
      } else if (!activos.has(p.id)) dia.inactivos += 1;
      else dia.agregar.push({ afiliado: p, tipoMenu });
    }
    dia.soloAqui = [...ya.keys()].filter((id) => !coinciden.has(id)).length;
    if (at && (normal !== null || ayuda !== null)) {
      const mio = { normal: at.precioMenuNormalCent ?? null, ayuda: at.precioMenuAyudaSocialCent ?? null };
      if ((normal !== null && normal !== mio.normal) || (ayuda !== null && ayuda !== mio.ayuda)) {
        dia.preciosDistintos = { mio, recibido: { normal, ayuda } };
      }
    }
    const mioFuera = sinInscribirDelDia(at);
    if (at && (mioFuera.normal !== dia.fuera.normal || mioFuera.ayudaSocial !== dia.fuera.ayudaSocial) && dia.fuera.total) {
      dia.fueraDistinto = { mio: mioFuera, recibido: dia.fuera };
    }
    return dia;
  });
}

/**
 * @param {{dias: Set<string>, menuRecibido: Set<string>, preciosRecibidos: Set<string>, fueraRecibido?: Set<string>}} eleccion
 *   dias: fechas a sumar; menuRecibido: «fecha|afiliadoId» donde se usa el menú recibido;
 *   fueraRecibido: fechas donde se usa la cuenta recibida de quienes no están en el padrón
 * @param {?{precioMenuNormalCent: ?number, precioMenuAyudaSocialCent: ?number}} preciosPorDefecto
 *   para un día que aquí no existía y llega sin precio
 */
export function aplicarAsistencia(padron, comparacion, eleccion, preciosPorDefecto) {
  const atenciones = padron.atenciones.slice();
  for (const dia of comparacion) {
    if (!eleccion.dias.has(dia.fecha)) continue;
    const i = atenciones.findIndex((o) => o.fecha === dia.fecha);
    let at;
    if (i >= 0) at = { ...atenciones[i], asistencias: asistenciasDelDia(atenciones[i]).map((x) => ({ ...x })) };
    else {
      const recibidos = dia.precios.normal !== null || dia.precios.ayuda !== null;
      at = nuevaAtencion(recibidos
        ? { precioMenuNormalCent: dia.precios.normal, precioMenuAyudaSocialCent: dia.precios.ayuda }
        : preciosPorDefecto);
      at.fecha = dia.fecha;
    }
    const cambiaMenu = dia.menuDistinto.filter((m) => eleccion.menuRecibido.has(`${dia.fecha}|${m.afiliado.id}`));
    const tocaPrecios = dia.preciosDistintos && eleccion.preciosRecibidos.has(dia.fecha);
    // Día nuevo aquí: va la cuenta recibida. Día que ya estaba: solo si se eligió.
    const tocaFuera = dia.fuera.total > 0 &&
      (i < 0 || (dia.fueraDistinto && eleccion.fueraRecibido && eleccion.fueraRecibido.has(dia.fecha)));
    if (i >= 0 && !dia.agregar.length && !cambiaMenu.length && !tocaPrecios && !tocaFuera) continue;
    for (const m of cambiaMenu) {
      const x = at.asistencias.find((y) => y.afiliadoId === m.afiliado.id);
      if (x) x.tipoMenu = m.recibido;
    }
    for (const a of dia.agregar) at.asistencias.push({ afiliadoId: a.afiliado.id, tipoMenu: a.tipoMenu });
    if (tocaPrecios) {
      if (dia.precios.normal !== null) at.precioMenuNormalCent = dia.precios.normal;
      if (dia.precios.ayuda !== null) at.precioMenuAyudaSocialCent = dia.precios.ayuda;
      at.precioTomadoDeConfig = false;
    }
    if (tocaFuera) at.sinInscribir = { normal: dia.fuera.normal, ayudaSocial: dia.fuera.ayudaSocial };
    at.legado = null;
    if (i >= 0) atenciones[i] = at;
    else atenciones.push(at);
  }
  return { ...padron, atenciones };
}

// ------------------------------------------------------------- entregas

const CAMPOS_ENTREGAS = [
  ['periodicidad', 'Cada cuánto se entrega'], ['fechaLimiteBase', 'Una fecha de entrega'], ['diasDeAviso', 'Días de aviso']
];

/**
 * @returns {{config: {campo: string, etiqueta: string, mio: *, recibido: *}[],
 *   nuevas: {fechaLimite: string, estado: string, nota: string}[],
 *   distintas: {fechaLimite: string, mio: object, recibido: object}[], iguales: number}}
 */
export function compararEntregas(calendario, paquete) {
  const mio = calendario || {};
  // Una periodicidad desconocida no se ofrece; un estado desconocido llega como pendiente.
  const recibido = {
    periodicidad: unoDe(paquete.c[0], ['semanal', 'quincenal', 'mensual'], ''),
    fechaLimiteBase: paquete.c[1], diasDeAviso: paquete.c[2]
  };
  const texto = (v) => (Array.isArray(v) ? v.join(',') : String(v ?? ''));
  const config = CAMPOS_ENTREGAS
    .filter(([k]) => texto(recibido[k]) !== '' && texto(mio[k]) !== texto(recibido[k]))
    .map(([campo, etiqueta]) => ({ campo, etiqueta, mio: mio[campo], recibido: recibido[campo] }));
  const r = { config, nuevas: [], distintas: [], iguales: 0 };
  const mias = new Map((mio.entregas || []).map((e) => [e.fechaLimite, e]));
  for (const [fechaLimite, estadoRecibido, nota] of paquete.e) {
    const estado = unoDe(estadoRecibido, ['pendiente', 'entregada', 'observada', 'conforme'], 'pendiente');
    const e = mias.get(fechaLimite);
    if (!e) r.nuevas.push({ fechaLimite, estado, nota });
    else if ((e.estado || 'pendiente') === estado && String(e.nota || '') === nota) r.iguales += 1;
    else r.distintas.push({ fechaLimite, mio: e, recibido: { estado, nota } });
  }
  return r;
}

/**
 * @param {{config: Set<string>, nuevas: Set<string>, distintas: Set<string>}} eleccion
 *   campos y fechas donde se usa lo recibido
 */
export function aplicarEntregas(calendario, comparacion, eleccion) {
  const nuevo = { ...calendario, entregas: (calendario.entregas || []).map((e) => ({ ...e })) };
  for (const c of comparacion.config) {
    if (eleccion.config.has(c.campo)) nuevo[c.campo] = Array.isArray(c.recibido) ? [...c.recibido] : c.recibido;
  }
  for (const n of comparacion.nuevas) {
    if (!eleccion.nuevas.has(n.fechaLimite)) continue;
    nuevo.entregas.push({ ...nuevaEntrega(n.fechaLimite), estado: n.estado, nota: n.nota });
  }
  for (const d of comparacion.distintas) {
    if (!eleccion.distintas.has(d.fechaLimite)) continue;
    const e = nuevo.entregas.find((x) => x.fechaLimite === d.fechaLimite);
    if (e) { e.estado = d.recibido.estado; e.nota = d.recibido.nota; }
  }
  return nuevo;
}
