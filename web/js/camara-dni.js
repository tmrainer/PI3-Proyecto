// camara-dni.js — el visor de cámara para leer el reverso del DNI.
//
// Dos lectores, los dos sin librerías en la app web (AGENTS.md §3 y §7.2):
// - El código PDF417 (DNI azul), con BarcodeDetector, del propio navegador.
// - La zona de lectura mecánica (MRZ, todos los DNI), con el reconocimiento de
//   texto de ML Kit que trae el APK (complemento «LectorTexto», en mobile/).
//   En el navegador no está, y solo queda el código.
// Busca con los dos a la vez y entrega lo primero que lea con seguridad.
//
// Lo que ve la cámara solo pasa por el visor en vivo y por un lienzo que se
// reutiliza: ningún fotograma se guarda ni sale del teléfono (§7.2). Quien
// llama recibe la cadena y decide; esta pieza no guarda nada.

import { crearElemento, icono } from './ui.js';
import { buscarMrzTd1, unirFilasOcr } from './escaneo-dni.js';

function lectorDeTexto() {
  const C = window.Capacitor;
  return C && C.isPluginAvailable && C.isPluginAvailable('LectorTexto') ? C.Plugins.LectorTexto : null;
}

/** ¿Hay con qué leer el DNI? { codigo, texto } */
export async function lectoresDni() {
  let codigo = false;
  try {
    codigo = 'BarcodeDetector' in window &&
      (await window.BarcodeDetector.getSupportedFormats()).includes('pdf417');
  } catch (e) { codigo = false; }
  const camara = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  return { codigo: camara && codigo, texto: camara && !!lectorDeTexto() };
}

/**
 * Abre el visor y busca el DNI.
 * @param {{ alLeer: (r: {tipo: 'pdf417', cadena: string} | {tipo: 'mrz', mrz: object}) => void,
 *           alCerrar?: () => void }} opciones
 * @returns {Promise<void>}
 */
export async function abrirCamaraDni({ alLeer, alCerrar = () => {} }) {
  const { codigo, texto } = await lectoresDni();
  const video = crearElemento('video', { clase: 'camara-video', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const estado = crearElemento('p', { clase: 'camara-estado', role: 'status', 'aria-live': 'polite' });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'camara-titulo' }, [
    crearElemento('h2', { id: 'camara-titulo', texto: 'Leer el DNI' }),
    crearElemento('p', {
      clase: 'camara-pista',
      texto: 'Pon el reverso del DNI dentro del recuadro, con buena luz, y mantén el teléfono quieto.'
    }),
    crearElemento('div', { clase: 'camara-visor' }, [video, crearElemento('div', { clase: 'camara-marco', 'aria-hidden': 'true' })]),
    estado,
    crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Cancelar', onclick: () => cerrar() })
  ]);
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();

  let flujo = null;
  let abierto = true;
  let temporizador = 0;
  const lienzo = document.createElement('canvas');

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    clearTimeout(temporizador);
    if (flujo) flujo.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    lienzo.width = 0;                       // suelta el último fotograma
    dialogo.close();
    dialogo.remove();
    alCerrar();
  }

  function entregar(resultado) {
    if (!abierto) return;
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* sin vibración */ } }
    cerrar();
    alLeer(resultado);
  }

  if (!codigo && !texto) {
    estado.textContent = 'Este teléfono no puede leer el DNI con la cámara. Escribe los datos a mano.';
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
  } catch (e) {
    estado.textContent = 'No se pudo abrir la cámara. Revisa que la app tenga permiso para usarla.';
    return;
  }
  if (!abierto) { flujo.getTracks().forEach((t) => t.stop()); return; }
  video.srcObject = flujo;
  try { await video.play(); } catch (e) { /* autoplay: se reintenta en el bucle */ }
  estado.textContent = 'Buscando…';

  const detector = codigo ? new window.BarcodeDetector({ formats: ['pdf417'] }) : null;
  const lector = texto ? lectorDeTexto() : null;
  let vuelta = 0;

  async function buscar() {
    if (!abierto) return;
    if (video.readyState >= 2) {
      try {
        if (detector) {
          const hallados = await detector.detect(video);
          const pdf = hallados.find((h) => h.format === 'pdf417' && h.rawValue);
          if (pdf) return entregar({ tipo: 'pdf417', cadena: pdf.rawValue });
        }
        // El texto cuesta más: una de cada tres vueltas.
        if (lector && vuelta % 3 === 0) {
          const ancho = Math.min(1600, video.videoWidth);
          const alto = Math.round(video.videoHeight * (ancho / video.videoWidth));
          lienzo.width = ancho;
          lienzo.height = alto;
          lienzo.getContext('2d').drawImage(video, 0, 0, ancho, alto);
          const imagen = lienzo.toDataURL('image/jpeg', 0.85).split(',')[1];
          const { fragmentos } = await lector.leer({ imagen });
          const mrz = buscarMrzTd1(unirFilasOcr(fragmentos));
          if (mrz) return entregar({ tipo: 'mrz', mrz });
        }
      } catch (e) {
        /* un fotograma que no se pudo leer: se prueba con el siguiente */
      }
    }
    vuelta += 1;
    temporizador = setTimeout(buscar, 250);
  }
  buscar();
}

/** Ícono para los botones que abren el visor. */
export function iconoCamara() {
  return icono('camara', { tam: 22 });
}
