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
