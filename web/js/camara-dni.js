// camara-dni.js — el visor de cámara para leer el reverso del DNI.
//
// Dos lectores, los dos sin librerías en la app web (AGENTS.md §3 y §7.2):
// - El código PDF417 (DNI azul), con BarcodeDetector, del propio navegador.
// - La zona de lectura mecánica (MRZ, todos los DNI), con el reconocimiento de
//   texto de ML Kit que trae el APK (complemento «LectorTexto», en mobile/).
//   En el navegador no está, y solo queda el código.
// Busca con los dos a la vez y entrega lo primero que lea con seguridad. La
// MRZ vale cuando dos lecturas seguidas dan lo mismo; después se pide el
// anverso, que trae tildes, ñ y el segundo apellido (escaneo-dni.js lo cruza):
// vale en cuanto paterno y nombres coinciden con la MRZ.
//
// Lo que ve la cámara solo pasa por el visor en vivo y por un lienzo que se
// reutiliza: ningún fotograma se guarda ni sale del teléfono (§7.2). Quien
// llama recibe la cadena y decide; esta pieza no guarda nada.

import { crearElemento, icono } from './ui.js';
import { buscarMrzTd1, unirFilasOcr, combinarMrzYAnverso } from './escaneo-dni.js';

const PISTA_REVERSO = 'Pon el reverso del DNI dentro del recuadro, con buena luz, y mantén el teléfono quieto.';
const PISTA_ANVERSO = 'Ahora voltea el DNI: el lado de la foto, dentro del recuadro. De ahí salen las tildes, la ñ y el segundo apellido.';

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
 * @param {{ alLeer: (r: {tipo: 'pdf417', cadena: string} |
 *   {tipo: 'mrz', mrz: object, anverso: ?object}) => void,
 *           alCerrar?: () => void }} opciones
 * @returns {Promise<void>}
 */
export async function abrirCamaraDni({ alLeer, alCerrar = () => {} }) {
  const { codigo, texto } = await lectoresDni();
  const video = crearElemento('video', { clase: 'camara-video', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const estado = crearElemento('p', { clase: 'camara-estado', role: 'status', 'aria-live': 'polite' });
  const omitir = crearElemento('button', {
    type: 'button', clase: 'boton secundario', texto: 'Omitir este paso', hidden: true,
    onclick: () => entregar({ tipo: 'mrz', mrz: mrzLeida, anverso: null })
  });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'camara-titulo' }, [
    crearElemento('h2', { id: 'camara-titulo', texto: 'Leer el DNI' }),
    crearElemento('p', { clase: 'camara-pista', texto: PISTA_REVERSO }),
    crearElemento('div', { clase: 'camara-visor' }, [video, crearElemento('div', { clase: 'camara-marco', 'aria-hidden': 'true' })]),
    estado,
    crearElemento('div', { clase: 'acciones' }, [omitir,
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Cancelar', onclick: () => cerrar() })])
  ]);
  const pista = dialogo.querySelector('.camara-pista');
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
  let fase = 'reverso';
  let mrzLeida = null;
  let anterior = '';                         // la lectura previa, para exigir dos iguales
  let lecturasAnverso = 0;

  // Solo el recuadro del DNI, y ampliado: más píxeles por letra, menos
  // confusiones (B por S, O por 0). El visor recorta el video (object-fit:
  // cover), así que se calcula qué parte del video cae dentro del recuadro.
  function fotogramaDelRecuadro() {
    const visor = video.parentElement;
    const W = visor.clientWidth;
    const H = visor.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const escala = Math.max(W / vw, H / vh);
    const ancho = Math.min(vw, (0.86 * W * 1.1) / escala);
    const alto = Math.min(vh, ancho * (54 / 85.6));
    const destino = 1600;
    lienzo.width = destino;
    lienzo.height = Math.round(destino * (alto / ancho));
    lienzo.getContext('2d').drawImage(video, (vw - ancho) / 2, (vh - alto) / 2, ancho, alto, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', 0.85).split(',')[1];
  }

  function pasarAlAnverso(mrz) {
    mrzLeida = mrz;
    fase = 'anverso';
    anterior = '';
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* sin vibración */ } }
    pista.textContent = PISTA_ANVERSO;
    estado.textContent = 'Listo el reverso. Ahora el lado de la foto…';
    omitir.hidden = false;
  }

  async function buscar() {
    if (!abierto) return;
    if (video.readyState >= 2) {
      try {
        if (detector && fase === 'reverso') {
          const hallados = await detector.detect(video);
          const pdf = hallados.find((h) => h.format === 'pdf417' && h.rawValue);
          if (pdf) return entregar({ tipo: 'pdf417', cadena: pdf.rawValue });
        }
        // El texto cuesta más: una de cada tres vueltas (en el anverso, todas).
        if (lector && (fase === 'anverso' || vuelta % 3 === 0)) {
          const { fragmentos } = await lector.leer({ imagen: fotogramaDelRecuadro() });
          const filas = unirFilasOcr(fragmentos);
          if (fase === 'reverso') {
            const mrz = buscarMrzTd1(filas);
            const clave = mrz ? mrz.lineas.join('') : '';
            if (mrz && clave === anterior) pasarAlAnverso(mrz);
            else anterior = clave;
          } else {
            const anverso = combinarMrzYAnverso(mrzLeida.campos, filas);
            const clave = anverso ? JSON.stringify(anverso) : '';
            if (anverso) {
              lecturasAnverso += 1;
              // Paterno y nombres iguales a la MRZ ya son dos fuentes de acuerdo:
              // no hace falta repetir. El segundo apellido, si no aparece en
              // unas pocas lecturas, queda para escribirlo. Con una letra
              // dudosa, sí se esperan dos lecturas iguales.
              const cruzados = anverso.apellidoPaterno.estado === 'confirmado' && anverso.nombres.estado === 'confirmado';
              const conMaterno = anverso.apellidoMaterno.estado !== 'no-leido';
              if ((cruzados && (conMaterno || lecturasAnverso >= 4)) || clave === anterior) {
                return entregar({ tipo: 'mrz', mrz: mrzLeida, anverso });
              }
            }
            anterior = clave;
          }
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
