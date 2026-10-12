// camara-qr.js — mostrar y leer los QR con la lista de un día (lista-qr.js).
//
// Mostrar: el QR lo arma qrcode-generator (vendor/, MIT, copiado dentro de la
// app: sin internet) y se dibuja en un lienzo. Si son varias partes, se
// turnan solas cada 2,5 s: quien lee solo tiene que apuntar.
// Leer: con BarcodeDetector, del propio navegador (en el APK lo trae el
// WebView). Se juntan las partes hasta tenerlas todas.
// Nada de esto sale del teléfono: el QR se ve en pantalla y nada más.

import qrcode from '../vendor/qrcode-generator.js';
import { crearElemento } from './ui.js';
import { decodificarParteQr } from './lista-qr.js';

/** ¿Puede este teléfono leer QR con la cámara? */
export async function puedeLeerQr() {
  try {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && 'BarcodeDetector' in window &&
      (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code');
  } catch (e) {
    return false;
  }
}

function dibujarQr(lienzo, texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto, 'Numeric');
  qr.make();
  const n = qr.getModuleCount();
  const borde = 4;                                  // el margen blanco que pide la norma
  const tam = Math.max(4, Math.floor(720 / (n + 2 * borde)));
  lienzo.width = lienzo.height = (n + 2 * borde) * tam;
  const g = lienzo.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, lienzo.width, lienzo.height);
  g.fillStyle = '#000';
  for (let f = 0; f < n; f += 1) {
    for (let c = 0; c < n; c += 1) if (qr.isDark(f, c)) g.fillRect((c + borde) * tam, (f + borde) * tam, tam, tam);
  }
}

/**
 * Muestra el o los QR de una lista.
 * @param {{partes: string[], titulo: string, detalle: string}} opciones
 */
export function mostrarListaQr({ partes, titulo, detalle }) {
  const lienzo = crearElemento('canvas', { clase: 'qr-lienzo', role: 'img', 'aria-label': 'Código QR con la lista' });
  const cual = crearElemento('p', { clase: 'qr-parte', role: 'status', 'aria-live': 'polite' });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'qr-titulo' }, [
    crearElemento('h2', { id: 'qr-titulo', texto: titulo }),
    crearElemento('p', { clase: 'camara-pista', texto: detalle }),
    crearElemento('div', { clase: 'qr-caja' }, [lienzo]),
    cual,
    crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Listo', onclick: () => cerrar() })
  ]);
  let i = 0;
  let reloj = 0;
  function pintar() {
    dibujarQr(lienzo, partes[i]);
    cual.textContent = partes.length > 1 ? `Código ${i + 1} de ${partes.length} (cambian solos)` : '';
  }
  function cerrar() {
    clearInterval(reloj);
    dialogo.close();
    dialogo.remove();
  }
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
  pintar();
  if (partes.length > 1) reloj = setInterval(() => { i = (i + 1) % partes.length; pintar(); }, 2500);
}

/**
 * Abre la cámara y lee los QR de una lista hasta tener todas sus partes.
 * @param {{alRecibir: (lista: {fecha: string, marcas: object[]}) => void}} opciones
 */
export async function leerListaQr({ alRecibir }) {
  const video = crearElemento('video', { clase: 'camara-video', playsinline: '', muted: '', autoplay: '' });
  video.muted = true;
  const cargando = crearElemento('div', { clase: 'camara-cargando' }, [
    crearElemento('span', { clase: 'girador', 'aria-hidden': 'true' }),
    crearElemento('span', { texto: 'Abriendo la cámara…' })
  ]);
  video.addEventListener('playing', () => { cargando.hidden = true; }, { once: true });
  const estado = crearElemento('p', { clase: 'camara-estado', role: 'status', 'aria-live': 'polite' });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'qrl-titulo' }, [
    crearElemento('h2', { id: 'qrl-titulo', texto: 'Recibir la lista de otro teléfono' }),
    crearElemento('p', { clase: 'camara-pista', texto: 'En el otro teléfono toca «Pasar mi lista por QR» y apunta la cámara a su pantalla.' }),
    crearElemento('div', { clase: 'camara-visor' }, [video, cargando]),
    estado,
    crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Cancelar', onclick: () => cerrar() })
  ]);
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();

  let flujo = null;
  let abierto = true;
  let temporizador = 0;
  const partes = new Map();
  let fecha = '';
  let total = 0;

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    clearTimeout(temporizador);
    if (flujo) flujo.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    dialogo.close();
    dialogo.remove();
  }

  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  } catch (e) {
    cargando.hidden = true;
    estado.textContent = 'No se pudo abrir la cámara. Revisa que la app tenga permiso para usarla.';
    return;
  }
  if (!abierto) { flujo.getTracks().forEach((t) => t.stop()); return; }
  video.srcObject = flujo;
  try { await video.play(); } catch (e) { /* se reintenta en el bucle */ }
  estado.textContent = 'Buscando el código…';
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

  async function buscar() {
    if (!abierto) return;
    try {
      if (video.readyState >= 2) {
        for (const h of await detector.detect(video)) {
          const p = decodificarParteQr(h.rawValue);
          if (!p) continue;
          // Otra lista (otro día): se empieza de nuevo con esa.
          if (p.fecha !== fecha || p.total !== total) { partes.clear(); fecha = p.fecha; total = p.total; }
          if (!partes.has(p.parte)) {
            partes.set(p.parte, p.marcas);
            if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* sin vibración */ } }
          }
        }
        if (total && partes.size === total) {
          const marcas = [...partes.keys()].sort((a, b) => a - b).flatMap((k) => partes.get(k));
          cerrar();
          alRecibir({ fecha, marcas });
          return;
        }
        if (total > 1) estado.textContent = `Leídos ${partes.size} de ${total} códigos…`;
      }
    } catch (e) {
      /* un fotograma que no se pudo leer: se prueba con el siguiente */
    }
    temporizador = setTimeout(buscar, 200);
  }
  buscar();
}
