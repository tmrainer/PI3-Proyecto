// escaneo-dni.js — parser de la cadena del código de barras del DNI.
// Función PURA: sin DOM, sin estado, sin red. Ver AGENTS.md §7.
//
// ESTADO: STUB DELIBERADO. No implementado.
//
// El DNI peruano lleva un código de barras PDF417 en el reverso. La codificación
// exacta de sus campos NO está verificada, y escribir un parser contra un
// formato supuesto produciría exactamente el tipo de dato inventado que este
// proyecto prohíbe (AGENTS.md §2). Mientras tanto esta función devuelve el
// objeto completo con todo vacío y confianza "desconocida", y la interfaz cae
// al ingreso manual.
//
// Para implementarlo: conseguir muestras reales anonimizadas (dígitos
// sustituidos), escribir PRIMERO los casos en pruebas.html, y después el parser.
// Ver AGENTS.md §12.2.

export const CAMPOS = [
  'tipoDocumento', 'numeroDocumento', 'apellidoPaterno',
  'apellidoMaterno', 'nombres', 'fechaNacimiento', 'sexo'
];

function resultadoVacio(camposNoLeidos, confianza) {
  return {
    tipoDocumento: null,
    numeroDocumento: '',
    apellidoPaterno: '',
    apellidoMaterno: '',
    nombres: '',
    fechaNacimiento: '',
    sexo: '',
    camposNoLeidos: camposNoLeidos.slice(),
    confianza
  };
}

/**
 * Parsea la cadena que entrega un lector de códigos de barras.
 * NUNCA lanza: ante cualquier entrada devuelve el objeto completo.
 * Campo que no se puede leer con certeza queda vacío y listado en camposNoLeidos.
 *
 * @param {string} cadena
 * @returns {{tipoDocumento: string|null, numeroDocumento: string,
 *            apellidoPaterno: string, apellidoMaterno: string, nombres: string,
 *            fechaNacimiento: string, sexo: string,
 *            camposNoLeidos: string[], confianza: 'alta'|'baja'|'desconocida'}}
 */
export function parsearCadenaDni(cadena) {
  // NO IMPLEMENTADO a propósito: ver la nota de cabecera.
  // La entrada se ignora por completo; ni siquiera se inspecciona, para que
  // nadie confunda este stub con un parser a medio hacer.
  void cadena;
  return resultadoVacio(CAMPOS, 'desconocida');
}

// ------------------------------------------------- en verificación (§7.5)
//
// Lo de abajo NO lo usa la inscripción todavía: solo el modo de prueba de
// pruebas.html, para comprobar con DNIs reales cómo vienen los datos. Lo que
// se lee ahí se muestra a quien escaneó su propio DNI y no se guarda.
//
// Dos fuentes:
// - La zona de lectura mecánica (MRZ) del reverso, en todos los DNI: formato
//   TD1 de la norma ICAO 9303 (parte 5), pública, con dígitos de control. La
//   lee el reconocimiento de texto del APK.
// - El código PDF417 del DNI azul (el de 1997). Su distribución de campos
//   viene de una fuente de terceros y está SIN VERIFICAR.

/** Valor de un carácter de la MRZ para el dígito de control (ICAO 9303-3 §4.9). */
function valorIcao(c) {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return -1;
}

/**
 * Dígito de control ICAO: pesos 7, 3, 1 que se repiten, suma módulo 10.
 * @param {string} texto  solo A-Z, 0-9 y «<»
 * @returns {number}  0 a 9, o -1 si hay un carácter que no vale en una MRZ
 */
export function digitoControlIcao(texto) {
  const pesos = [7, 3, 1];
  let suma = 0;
  const s = String(texto == null ? '' : texto);
  for (let i = 0; i < s.length; i += 1) {
    const v = valorIcao(s[i]);
    if (v < 0) return -1;
    suma += v * pesos[i % 3];
  }
  return suma % 10;
}

function controlOk(campo, digito) {
  return /^[0-9]$/.test(digito) && digitoControlIcao(campo) === Number(digito);
}

/** AAMMDD de la MRZ a ISO. El siglo sale de la fecha de referencia. */
function fechaMrz(aammdd, { pasado, fechaRef }) {
  if (!/^\d{6}$/.test(aammdd)) return '';
  const aa = Number(aammdd.slice(0, 2));
  const mm = Number(aammdd.slice(2, 4));
  const dd = Number(aammdd.slice(4, 6));
  const anioRef = Number(String(fechaRef).slice(0, 4));
  const siglo = Math.floor(anioRef / 100) * 100;
  let anio = siglo + aa;
  // Un nacimiento no puede ser futuro; un vencimiento rara vez pasa de 50 años.
  if (pasado && anio > anioRef) anio -= 100;
  if (!pasado && anio < anioRef - 50) anio += 100;
  const f = new Date(Date.UTC(anio, mm - 1, dd));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mm - 1 || f.getUTCDate() !== dd) return '';
  return `${anio}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * Lee las tres líneas de una MRZ TD1 (3 × 30 caracteres) según ICAO 9303-5.
 * NUNCA lanza. Los campos con control (documento, fechas) solo valen si su
 * dígito de control coincide; los nombres no tienen dígito de control.
 *
 * @param {string[]} lineas  las tres líneas, ya limpias
 * @param {string} [fechaRef]  ISO; decide el siglo de las fechas
 * @returns {{ estructura: boolean, controles: {documento: boolean,
 *   nacimiento: boolean, vencimiento: boolean, general: boolean},
 *   campos: {pais: string, numeroDocumento: string, fechaNacimiento: string,
 *   sexo: string, vencimiento: string, apellidos: string[], nombres: string} }}
 */
export function leerMrzTd1(lineas, fechaRef = new Date().toISOString().slice(0, 10)) {
  const vacio = {
    estructura: false,
    controles: { documento: false, nacimiento: false, vencimiento: false, general: false },
    campos: { pais: '', numeroDocumento: '', fechaNacimiento: '', sexo: '', vencimiento: '', apellidos: [], nombres: '' }
  };
  if (!Array.isArray(lineas) || lineas.length !== 3) return vacio;
  const [l1, l2, l3] = lineas.map((l) => String(l == null ? '' : l));
  if (![l1, l2, l3].every((l) => /^[A-Z0-9<]{30}$/.test(l)) || l1[0] !== 'I') return vacio;

  const numero = l1.slice(5, 14);
  const nacimiento = l2.slice(0, 6);
  const vence = l2.slice(8, 14);
  const controles = {
    documento: controlOk(numero, l1[14]),
    nacimiento: controlOk(nacimiento, l2[6]),
    vencimiento: controlOk(vence, l2[14]),
    general: controlOk(l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29), l2[29])
  };
  const partes = (s) => s.split('<').filter(Boolean);
  // Entre apellido y nombres va «<<». El reconocimiento a veces se come un
  // «<» (medido en un DNI azul): sin ningún «<<» antes del relleno, el primer
  // bloque es el apellido y el resto son los nombres (el DNI peruano trae un
  // solo apellido en la MRZ). El anverso lo confirma o no.
  const nombre = l3.replace(/<+$/, '');
  const [primario, ...resto] = nombre.includes('<<') ? nombre.split('<<')
    : [partes(nombre)[0] || '', partes(nombre).slice(1).join('<')];
  const sexo = l2[7] === 'M' || l2[7] === 'F' ? l2[7] : '';
  return {
    estructura: true,
    controles,
    campos: {
      pais: l1.slice(2, 5).replace(/</g, ''),
      numeroDocumento: controles.documento ? numero.replace(/</g, '') : '',
      fechaNacimiento: controles.nacimiento ? fechaMrz(nacimiento, { pasado: true, fechaRef }) : '',
      sexo,
      vencimiento: controles.vencimiento ? fechaMrz(vence, { pasado: false, fechaRef }) : '',
      apellidos: partes(primario),
      nombres: partes(resto.join('<')).join(' ')
    }
  };
}

// Lo que el reconocimiento de texto suele confundir en una MRZ. Solo se
// corrige donde la norma exige una cifra, y el dígito de control decide.
const A_CIFRA = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6' };
const CIFRAS_TD1 = [
  [14],                                             // línea 1: el número puede tener letras
  [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 29],
  []
];
// Y al revés: donde la norma solo admite letras, una cifra es una letra mal
// leída (un apellido salía «QUISP0»). La línea 3 (apellidos y nombres) es
// toda letras; en las otras, el tipo, el país, el sexo y la nacionalidad.
const A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' };
const LETRAS_TD1 = [[0, 1, 2, 3, 4], [7, 15, 16, 17], null];   // null: toda la línea
const soloLetras = (n, j) => LETRAS_TD1[n] === null || LETRAS_TD1[n].includes(j);

function limpiarLineaMrz(texto) {
  return String(texto).toUpperCase().replace(/«/g, '<<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
}

/**
 * Une en filas los pedazos que devolvió el reconocimiento de texto: los que
 * están a la misma altura, de izquierda a derecha. El reconocimiento suele
 * partir una línea de la MRZ donde hay muchos «<». Si el DNI está inclinado,
 * la altura se corrige con el ángulo de las líneas largas.
 * @param {{texto: string, arriba: number, abajo: number, izquierda: number,
 *          derecha?: number, angulo?: number}[]} fragmentos
 * @returns {string[]}  las filas, de arriba abajo
 */
export function unirFilasOcr(fragmentos) {
  if (!Array.isArray(fragmentos)) return [];
  const validos = fragmentos.filter((f) => f && typeof f.texto === 'string' &&
    Number.isFinite(f.arriba) && Number.isFinite(f.abajo) && Number.isFinite(f.izquierda));
  const angulos = validos.filter((f) => f.texto.length >= 10 && Number.isFinite(f.angulo))
    .map((f) => f.angulo).sort((a, b) => a - b);
  const pendiente = angulos.length ? Math.tan((angulos[Math.floor(angulos.length / 2)] * Math.PI) / 180) : 0;
  // Altura «enderezada» del centro de cada pedazo.
  const puestos = validos.map((f) => {
    const cx = (f.izquierda + (Number.isFinite(f.derecha) ? f.derecha : f.izquierda)) / 2;
    return { f, y: (f.arriba + f.abajo) / 2 - pendiente * cx, alto: Math.max(1, f.abajo - f.arriba) };
  }).sort((a, b) => a.y - b.y);
  const filas = [];
  for (const p of puestos) {
    const fila = filas.find((x) => Math.abs(x.y - p.y) < Math.max(x.alto, p.alto) * 0.6);
    if (fila) fila.partes.push(p.f);
    else filas.push({ y: p.y, alto: p.alto, partes: [p.f] });
  }
  return filas.sort((a, b) => a.y - b.y)
    .map((x) => x.partes.sort((a, b) => a.izquierda - b.izquierda).map((p) => p.texto).join(''));
}

// El reconocimiento se come «<» seguidos. Solo se reponen donde la norma pone
// relleno: al final de las líneas 1 y 3, y en la línea 2 entre la
// nacionalidad y el último dígito de control. Si se repuso mal, algún dígito
// de control deja de cuadrar y la lectura se descarta.
function ajustarLineaTd1(l, n) {
  if (n === 1) {
    if (l.length === 30) return l;
    if (l.length < 19) return null;
    return l.slice(0, 18) + '<'.repeat(11) + l[l.length - 1];
  }
  if (l.length < (n === 0 ? 15 : 3)) return null;
  return l.length >= 30 ? l.slice(0, 30) : l + '<'.repeat(30 - l.length);
}

/**
 * Busca una MRZ TD1 en el texto que devolvió el reconocimiento de texto, y
 * solo la da por buena si pasan TODOS sus dígitos de control. NUNCA lanza.
 * @param {string[]} lineasOcr  filas, de arriba abajo (ver unirFilasOcr)
 * @param {string} [fechaRef]
 * @returns {?(ReturnType<typeof leerMrzTd1> & {lineas: string[]})}  null si no hay una MRZ segura
 */
export function buscarMrzTd1(lineasOcr, fechaRef) {
  if (!Array.isArray(lineasOcr)) return null;
  const limpias = lineasOcr.map(limpiarLineaMrz).filter((l) => l.length >= 3);
  for (let i = 0; i + 2 < limpias.length; i += 1) {
    if (!limpias[i].startsWith('I')) continue;
    const tres = limpias.slice(i, i + 3).map((l, n) => {
      // Primero las cifras (para que la línea 2 tenga su largo real), después el relleno.
      const conCifras = [...l].map((c, j) => (CIFRAS_TD1[n].includes(j) && A_CIFRA[c]) || c).join('');
      const ajustada = ajustarLineaTd1(conCifras, n);
      if (ajustada === null) return null;
      const cifras = n === 1 ? [...ajustada].map((c, j) => (CIFRAS_TD1[1].includes(j) && A_CIFRA[c]) || c).join('') : ajustada;
      return [...cifras].map((c, j) => (soloLetras(n, j) && A_LETRA[c]) || c).join('');
    });
    if (tres.includes(null)) continue;
    const r = leerMrzTd1(tres, fechaRef);
    // Las líneas van solo en memoria, para la plantilla anónima del modo de prueba.
    if (r.estructura && Object.values(r.controles).every(Boolean)) return { ...r, lineas: tres };
  }
  return null;
}

// ------------------------------------------------ el anverso, para tildes y ñ
//
// La MRZ no lleva tildes ni ñ (la norma solo admite A-Z), los nombres no
// tienen dígito de control y en el DNI peruano trae solo el primer apellido.
// El anverso sí trae los nombres como son. Se cruzan: una fila del anverso
// vale solo si, quitándole tildes y ñ, es IGUAL a lo de la MRZ. Si difiere en
// una letra que el reconocimiento suele confundir, no se elige: se ofrecen
// las dos y decide la persona (§7.1).

/** Mayúsculas, sin tildes, ñ como N, solo letras y un espacio entre palabras. */
export function normalizarLetras(texto) {
  return String(texto == null ? '' : texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z]+/g, ' ').trim();
}

/** La fila del anverso tal como está impresa: letras (con tildes y ñ) y espacios. */
function textoImpreso(texto) {
  return String(texto == null ? '' : texto).normalize('NFC').toUpperCase()
    .replace(/[^\p{L} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

const CONFUSIBLES = ['BS8E', 'O0DQU', 'I1LJT', 'NMH', 'CG', 'VY', 'KX', 'PR', 'FE'];
function confusibles(a, b) {
  return CONFUSIBLES.some((g) => g.includes(a) && g.includes(b));
}

/** ¿Dos textos normalizados difieren solo en 1 o 2 letras que se suelen confundir? */
function casiIguales(a, b) {
  if (a.length !== b.length || a === b) return false;
  let distintas = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] === b[i]) continue;
    if (!confusibles(a[i], b[i])) return false;
    distintas += 1;
  }
  return distintas <= 2;
}

function cruzar(valorMrz, filas) {
  if (!valorMrz) return { valor: '', estado: 'no-leido' };
  const igual = filas.find((f) => f.normal === valorMrz);
  if (igual) return { valor: igual.impreso, estado: 'confirmado' };
  const parecidas = filas.filter((f) => casiIguales(f.normal, valorMrz));
  if (parecidas.length === 1) {
    return { valor: '', estado: 'dudoso', opciones: [parecidas[0].impreso, valorMrz] };
  }
  return { valor: valorMrz, estado: 'sin-confirmar' };
}

// Rótulos del anverso que no son nombres. Se quitan palabra por palabra:
// «FECHA DE EMISIÓN», «ESTADO CIVIL», «SEXO», «UBIGEO»…
const OTRAS_PALABRAS = new Set(['FECHA', 'EMISION', 'CADUCIDAD', 'NACIMIENTO', 'VENCIMIENTO', 'INSCRIPCION',
  'SEXO', 'UBIGEO', 'ESTADO', 'CIVIL', 'DNI', 'REPUBLICA', 'PERU', 'DOCUMENTO', 'NACIONAL', 'IDENTIDAD']);
function sinOtrosRotulos(impreso) {
  const palabras = textoImpreso(impreso).split(' ').filter(Boolean);
  const quedan = palabras.filter((w, j) => {
    const n = normalizarLetras(w);
    if (OTRAS_PALABRAS.has(n)) return false;
    // «DE»/«DEL» entre dos palabras de un rótulo («FECHA DE EMISIÓN»).
    return !((n === 'DE' || n === 'DEL') && OTRAS_PALABRAS.has(normalizarLetras(palabras[j - 1] || '')));
  });
  const impresoLimpio = quedan.join(' ');
  return { impreso: impresoLimpio, normal: normalizarLetras(impresoLimpio) };
}

/**
 * Cruza los nombres de la MRZ con las filas leídas del anverso. NUNCA lanza.
 * Estados por campo: «confirmado» (anverso igual a la MRZ: se usa como está
 * impreso, con tildes y ñ), «dudoso» (difieren en una letra confundible: hay
 * que elegir entre `opciones`), «sin-confirmar» (solo la MRZ, o el segundo
 * apellido, que la MRZ no trae: hay que mirarlo) y «no-leido».
 *
 * @param {{apellidos: string[], nombres: string}} camposMrz  de leerMrzTd1
 * @param {string[]} filasAnverso  de unirFilasOcr
 * @returns {?{apellidoPaterno: object, apellidoMaterno: object, nombres: object}}
 *   null si el anverso no parece ser del mismo DNI (todavía no se leyó bien)
 */
export function combinarMrzYAnverso(camposMrz, filasAnverso) {
  if (!camposMrz || !Array.isArray(filasAnverso)) return null;
  const filas = filasAnverso.map((t) => ({ impreso: textoImpreso(t), normal: normalizarLetras(t) }))
    .filter((f) => f.normal);
  let paterno = cruzar(normalizarLetras((camposMrz.apellidos || []).join(' ')), filas);
  let nombres = cruzar(normalizarLetras(camposMrz.nombres), filas);

  // Por rótulo: el valor va en la misma fila, después del rótulo, o en la
  // siguiente que no sea otro rótulo. En el DNI azul, la columna de al lado
  // («Fecha de Emisión»…) cae casi a la misma altura y se mete entre el
  // rótulo y su valor: esos rótulos se quitan.
  const ROTULO = /PRIMER ?APELLIDO|SEGUNDO ?APELLIDO|PRE ?NOMBRES|NOMBRES/;
  const porRotulo = (re) => {
    const i = filas.findIndex((f) => re.test(f.normal));
    if (i < 0) return null;
    const enLaFila = sinOtrosRotulos(filas[i].impreso.replace(/^.*?(NOMBRES|APELLIDO)\s*/u, ''));
    if (enLaFila.normal && !ROTULO.test(enLaFila.normal)) return enLaFila;
    for (const f of filas.slice(i + 1)) {
      if (ROTULO.test(f.normal)) return null;
      const limpia = sinOtrosRotulos(f.impreso);
      if (limpia.normal) return limpia;
    }
    return null;
  };
  // Las letras de la MRZ sin ningún separador: un «<» perdido o de más no
  // cambia nada. Lo del rótulo vale si coincide ahí, letra por letra.
  // El reconocimiento también lee un «<» como «K» (visto en un DNI azul:
  // «AAAAAA<<» salió «AAAAAAA<»). Si no coincide tal cual, se compara sin las K.
  const letras = normalizarLetras([...(camposMrz.apellidos || []), camposMrz.nombres].join(' ')).replace(/ /g, '');
  const sinEspacios = (f) => f.normal.replace(/ /g, '');
  const sinK = (t) => t.replace(/K/g, '');
  const empieza = (v) => letras.startsWith(v) || sinK(letras).startsWith(sinK(v));
  const termina = (v) => letras.length > v.length && (letras.endsWith(v) || sinK(letras).endsWith(sinK(v)));
  const primero = porRotulo(/PRIMER ?APELLIDO/);
  if (paterno.estado !== 'confirmado' && primero && sinK(sinEspacios(primero)) && empieza(sinEspacios(primero))) {
    paterno = { valor: primero.impreso, estado: 'confirmado' };
  }
  const pre = porRotulo(/PRE ?NOMBRES/);
  if (nombres.estado !== 'confirmado' && pre && sinK(sinEspacios(pre)) && termina(sinEspacios(pre))) {
    nombres = { valor: pre.impreso, estado: 'confirmado' };
  }
  // Sin ninguna fila que coincida, no es este DNI o no se leyó todavía.
  if (paterno.estado !== 'confirmado' && nombres.estado !== 'confirmado' &&
    paterno.estado !== 'dudoso' && nombres.estado !== 'dudoso') return null;

  // El segundo apellido solo está en el anverso.
  let materno = { valor: '', estado: 'no-leido' };
  const segundo = porRotulo(/SEGUNDO ?APELLIDO/);
  if (segundo) materno = { valor: segundo.impreso, estado: 'sin-confirmar' };
  return { apellidoPaterno: paterno, apellidoMaterno: materno, nombres };
}

/**
 * Campos del PDF417 del DNI azul según la distribución publicada por un
 * tercero (SIN VERIFICAR: ver §7.5). Solo para el modo de prueba.
 * @param {string} cadena
 * @returns {{ largo: number, campos: {numeroDocumento: string, apellidoPaterno: string,
 *   apellidoMaterno: string, nombres: string, sexo: string, vencimiento: string} }}
 */
export function leerPdf417DniAzul(cadena) {
  const s = typeof cadena === 'string' ? cadena : '';
  const tramo = (a, b) => s.slice(a, b).replace(/\s+/g, ' ').trim();
  const numero = tramo(2, 10);
  const sexo = { 1: 'M', 2: 'F' }[s[125]] || '';
  const v = tramo(448, 456);
  return {
    largo: s.length,
    campos: {
      numeroDocumento: /^\d{8}$/.test(numero) ? numero : '',
      apellidoPaterno: tramo(10, 50),
      apellidoMaterno: tramo(50, 90),
      nombres: tramo(90, 125),
      sexo,
      vencimiento: /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : ''
    }
  };
}

/**
 * La forma de una cadena sin su contenido: cada letra pasa a «A», cada cifra
 * a «9», lo que no se puede imprimir (la huella del PDF417, por ejemplo) a
 * «·»; se conservan espacios, «<» y signos. Así se puede compartir cómo viene
 * un DNI sin compartir de quién es.
 * @param {string} cadena
 * @returns {string}
 */
export function plantillaAnonima(cadena) {
  const s = typeof cadena === 'string' ? cadena : '';
  let r = '';
  for (const c of s) {
    if (/\p{L}/u.test(c)) r += 'A';
    else if (/[0-9]/.test(c)) r += '9';
    else if (c === ' ' || c === '<' || /[!-/:-@[-`{-~]/.test(c)) r += c;
    else r += '·';
  }
  return r;
}

/**
 * ¿Puede este navegador leer códigos PDF417 con la cámara?
 * BarcodeDetector es una API NATIVA del navegador, no una librería: no viola
 * la regla de cero dependencias (AGENTS.md §3). Soporte desigual, así que si
 * no está, el botón de cámara simplemente no se muestra.
 */
export async function soportaCamaraPdf417() {
  try {
    if (!('BarcodeDetector' in globalThis)) return false;
    const formatos = await globalThis.BarcodeDetector.getSupportedFormats();
    return Array.isArray(formatos) && formatos.includes('pdf417');
  } catch (e) {
    return false;
  }
}

/**
 * Reconoce una ráfaga de teclas como escaneo de lector HID (el lector se
 * comporta como teclado). Útil para la vía recomendada, que no necesita
 * ninguna decodificación en JavaScript.
 * Devuelve un detector con .procesarTecla(evento) => cadena|null
 */
export function detectorLectorHid({ msEntreTeclas = 35, minimoCaracteres = 20 } = {}) {
  let buffer = '';
  let ultima = 0;
  return {
    procesarTecla(evento) {
      const ahora = Date.now();
      if (ahora - ultima > msEntreTeclas) buffer = '';
      ultima = ahora;
      if (evento.key === 'Enter') {
        const cadena = buffer;
        buffer = '';
        return cadena.length >= minimoCaracteres ? cadena : null;
      }
      if (evento.key && evento.key.length === 1) buffer += evento.key;
      return null;
    },
    reiniciar() { buffer = ''; ultima = 0; }
  };
}
