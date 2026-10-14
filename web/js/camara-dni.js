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
const PISTA_ASISTENCIA = 'Muestra el reverso del DNI (el lado de las tres líneas con «<»). Puedes pasar uno tras otro.';
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
 *
 * modo «asistencia»: solo el reverso y solo la zona de texto (el número del
 * DNI ahí tiene dígito de control; el del código de barras está sin
 * verificar). Es continuo: tras cada DNI sigue buscando el siguiente, y
 * `alLeer` devuelve el mensaje que se muestra («Marcaste a…»).
 * @param {{ alLeer: (r: {tipo: 'pdf417', cadena: string} |
 *   {tipo: 'mrz', mrz: object, anverso: ?object}) => void,
 *           alCerrar?: () => void, modo?: 'completo' | 'asistencia',
 *           conCodigo?: boolean }} opciones  conCodigo: false deja fuera el PDF417
 * @returns {Promise<void>}
 */
export async function abrirCamaraDni({ alLeer, alCerrar = () => {}, modo = 'completo', conCodigo = true }) {
  const enAsistencia = modo === 'asistencia';
  const lectores = await lectoresDni();
  const codigo = lectores.codigo && !enAsistencia && conCodigo;
  const texto = lectores.texto;
  const video = crearElemento('video', { clase: 'camara-video', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const estado = crearElemento('p', { clase: 'camara-estado', role: 'status', 'aria-live': 'polite' });
  // Mientras la cámara abre (puede tardar un par de segundos en un teléfono
  // modesto), un círculo que gira sobre negro: se ve que algo está pasando.
  const cargando = crearElemento('div', { clase: 'camara-cargando' }, [
    crearElemento('span', { clase: 'girador', 'aria-hidden': 'true' }),
    crearElemento('span', { texto: 'Abriendo la cámara…' })
  ]);
  video.addEventListener('playing', () => { cargando.hidden = true; }, { once: true });
  const omitir = crearElemento('button', {
    type: 'button', clase: 'boton secundario', texto: 'Omitir este paso', hidden: true,
    onclick: () => entregar({ tipo: 'mrz', mrz: mrzLeida, anverso: null })
  });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'camara-titulo' }, [
    crearElemento('h2', { id: 'camara-titulo', texto: enAsistencia ? 'Pasar lista con el DNI' : 'Leer el DNI' }),
    crearElemento('p', { clase: 'camara-pista', texto: enAsistencia ? PISTA_ASISTENCIA : PISTA_REVERSO }),
    crearElemento('div', { clase: 'camara-visor' }, [
      video,
      crearElemento('div', { clase: 'camara-marco', 'aria-hidden': 'true' }),
      cargando
    ]),
    estado,
    crearElemento('div', { clase: 'acciones' }, [omitir,
      crearElemento('button', {
        type: 'button', clase: 'boton secundario', texto: enAsistencia ? 'Terminar' : 'Cancelar', onclick: () => cerrar()
      })])
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
    document.removeEventListener('visibilitychange', alOcultar);
    if (flujo) flujo.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    lienzo.width = 0;                       // suelta el último fotograma
    dialogo.close();
    dialogo.remove();
    alCerrar();
  }
  // Si se sale de la app con la cámara abierta, se cierra: Android se la
  // quita igual y el visor quedaba congelado gastando batería. Solo con la
  // cámara ya abierta, para no cerrarlo con el aviso de permiso.
  function alOcultar() { if (document.hidden && flujo) cerrar(); }
  document.addEventListener('visibilitychange', alOcultar);

  function entregar(resultado) {
    if (!abierto) return;
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* sin vibración */ } }
    cerrar();
    alLeer(resultado);
  }

  if (!codigo && !texto) {
    estado.textContent = 'Este teléfono no puede leer el DNI con la cámara. Escribe los datos a mano.';
    cargando.hidden = true;
    return;
  }
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
  } catch (e) {
    estado.textContent = 'No se pudo abrir la cámara. Revisa que la app tenga permiso para usarla.';
    cargando.hidden = true;
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
  let ultimoDni = '';
  let ultimoEn = 0;

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
    lienzo.getContext('2d', { alpha: false }).drawImage(video, (vw - ancho) / 2, (vh - alto) / 2, ancho, alto, 0, 0, lienzo.width, lienzo.height);
    // toBlob comprime el JPEG fuera del hilo principal (toDataURL lo hacía en
    // él y trababa el visor en un teléfono modesto, una vez cada 750 ms).
    return new Promise((ok, mal) => lienzo.toBlob((jpeg) => {
      if (!jpeg) return mal(new Error('sin fotograma'));
      const lectura = new FileReader();
      lectura.onload = () => ok(String(lectura.result).split(',')[1]);
      lectura.onerror = () => mal(lectura.error);
      lectura.readAsDataURL(jpeg);
    }, 'image/jpeg', 0.85));
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
          const { fragmentos } = await lector.leer({ imagen: await fotogramaDelRecuadro() });
          const filas = unirFilasOcr(fragmentos);
          if (fase === 'reverso') {
            const mrz = buscarMrzTd1(filas);
            const clave = mrz ? mrz.lineas.join('') : '';
            if (mrz && clave === anterior) {
              if (!enAsistencia) pasarAlAnverso(mrz);
              else {
                // El mismo DNI sigue frente a la cámara: no se vuelve a marcar.
                const dni = mrz.campos.numeroDocumento;
                if (dni !== ultimoDni || Date.now() - ultimoEn > 5000) {
                  if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* sin vibración */ } }
                  estado.textContent = alLeer({ tipo: 'mrz', mrz }) || '';
                }
                ultimoDni = dni;
                ultimoEn = Date.now();
                anterior = '';
              }
            } else anterior = clave;
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
