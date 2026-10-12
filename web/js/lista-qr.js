// lista-qr.js — pasar la asistencia de un día de un teléfono a otro con un
// código QR, sin internet ni servidor. Funciones PURAS: sin DOM ni estado.
//
// Cuando dos personas pasan lista en teléfonos distintos, una muestra un QR
// con sus marcas y la otra lo lee con la cámara: se suman las que faltaban.
// Se identifica a cada persona por su DNI (los dos teléfonos pueden tener el
// padrón cargado por separado) y el QR lleva solo cifras, que en un QR
// ocupan menos que las letras: más personas por código, más fácil de leer.
//
// Formato de cada parte (todo cifras):
//   «81» (marca y versión) · AAAAMMDD · parte (2) · total (2) · cuántas (3)
//   · por persona: DNI (8) y menú (0 normal, 1 ayuda social)
// Si no caben en un código, se parte en varios que se muestran por turnos.

const MARCA = '81';
const POR_PARTE = 80;           // ~750 cifras: un QR que lee bien una cámara modesta

/**
 * @param {{fecha: string, marcas: {dni: string, menu: string}[]}} lista
 *   solo DNIs de 8 cifras (los demás no se pueden pasar así)
 * @returns {string[]}  el texto de cada QR, en orden; [] si no hay marcas
 */
export function codificarListaQr({ fecha, marcas }) {
  const validas = (marcas || []).filter((m) => /^\d{8}$/.test(String(m.dni)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || validas.length === 0) return [];
  const partes = [];
  for (let i = 0; i < validas.length; i += POR_PARTE) partes.push(validas.slice(i, i + POR_PARTE));
  const dos = (n) => String(n).padStart(2, '0');
  return partes.map((grupo, n) => MARCA + fecha.replace(/-/g, '') + dos(n + 1) + dos(partes.length) +
    String(grupo.length).padStart(3, '0') +
    grupo.map((m) => m.dni + (m.menu === 'ayuda_social' ? '1' : '0')).join(''));
}

/**
 * Lee una parte. NUNCA lanza: si no es un QR de esta app o no cuadra, null.
 * @param {string} texto
 * @returns {?{fecha: string, parte: number, total: number, marcas: {dni: string, menu: string}[]}}
 */
export function decodificarParteQr(texto) {
  const s = typeof texto === 'string' ? texto.trim() : '';
  if (!/^\d+$/.test(s) || !s.startsWith(MARCA) || s.length < 17) return null;
  const f = s.slice(2, 10);
  const fecha = `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`;
  const parte = Number(s.slice(10, 12));
  const total = Number(s.slice(12, 14));
  const cuantas = Number(s.slice(14, 17));
  const cuerpo = s.slice(17);
  if (!parte || !total || parte > total || cuerpo.length !== cuantas * 9) return null;
  const marcas = [];
  for (let i = 0; i < cuerpo.length; i += 9) {
    const menu = cuerpo[i + 8];
    if (menu !== '0' && menu !== '1') return null;
    marcas.push({ dni: cuerpo.slice(i, i + 8), menu: menu === '1' ? 'ayuda_social' : 'normal' });
  }
  return { fecha, parte, total, marcas };
}

/**
 * Qué pasa al sumar las marcas recibidas a las de un día. No modifica nada:
 * devuelve qué agregar, para que la interfaz lo aplique (y pueda deshacerlo).
 * @param {{dni: string, menu: string}[]} recibidas
 * @param {{id: string, numeroDocumento: string}[]} personas  activas ese día
 * @param {Set<string>} yaMarcados  ids ya marcados ese día
 * @returns {{agregar: {afiliadoId: string, tipoMenu: string}[], yaEstaban: number, desconocidos: number}}
 */
export function sumarMarcasRecibidas(recibidas, personas, yaMarcados) {
  const porDni = new Map((personas || []).map((p) => [String(p.numeroDocumento || '').trim(), p]));
  const agregar = [];
  let yaEstaban = 0;
  let desconocidos = 0;
  const vistos = new Set();
  for (const m of recibidas || []) {
    if (vistos.has(m.dni)) continue;
    vistos.add(m.dni);
    const p = porDni.get(m.dni);
    if (!p) desconocidos += 1;
    else if (yaMarcados.has(p.id)) yaEstaban += 1;
    else agregar.push({ afiliadoId: p.id, tipoMenu: m.menu === 'ayuda_social' ? 'ayuda_social' : 'normal' });
  }
  return { agregar, yaEstaban, desconocidos };
}
