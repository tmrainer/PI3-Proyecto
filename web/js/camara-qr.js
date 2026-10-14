// camara-qr.js — mostrar y leer los QR para pasar datos de un teléfono a
// otro (formato en compartir-qr.js).
//
// Mostrar: el QR lo arma qrcode-generator (vendor/, MIT, copiado dentro de la
// app: sin internet) y se dibuja en un lienzo. Si son varias partes, se
// turnan solas cada 2 s (se pueden pausar): quien lee solo tiene que apuntar.
// Leer: con BarcodeDetector, del propio navegador (en el APK lo trae el
// WebView). Se juntan las partes de un mismo envío hasta tenerlas todas.
// Nada de esto sale del teléfono: el QR se ve en pantalla y nada más.

import { crearElemento } from './ui.js';
import { leerParteQr, juntarPartesQr } from './compartir-qr.js';

/** ¿Puede este teléfono leer QR con la cámara? */
export async function puedeLeerQr() {
  try {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && 'BarcodeDetector' in window &&
      (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code');
  } catch (e) {
    return false;
  }
}

// La librería pesa 50 KB: se carga recién al mostrar un QR, no cada vez que
// abre Asistencia.
let generador = null;
const cargarGenerador = () => generador || (generador = import('../vendor/qrcode-generator.js').then((m) => m.default));

function dibujarQr(qrcode, lienzo, texto) {
  const qr = qrcode(0, 'M');
  // Solo cifras (QR de antes) o el alfabeto de base45: los modos más compactos.
  qr.addData(texto, /^\d+$/.test(texto) ? 'Numeric' : 'Alphanumeric');
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
 * Muestra el o los QR de un envío.
 * @param {{partes: string[], titulo: string, detalle: string}} opciones
 */
export async function mostrarListaQr({ partes, titulo, detalle }) {
  const qrcode = await cargarGenerador();
  const lienzo = crearElemento('canvas', { clase: 'qr-lienzo', role: 'img', 'aria-label': 'Código QR con los datos' });
  const cual = crearElemento('p', { clase: 'qr-parte', role: 'status', 'aria-live': 'polite' });
  const pausa = crearElemento('button', {
    type: 'button', clase: 'boton secundario', texto: 'Pausar', hidden: partes.length < 2,
    onclick: () => { reloj ? detener() : seguir(); }
  });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'qr-titulo' }, [
    crearElemento('h2', { id: 'qr-titulo', texto: titulo }),
    crearElemento('p', { clase: 'camara-pista', texto: detalle }),
    crearElemento('div', { clase: 'qr-caja' }, [lienzo]),
    cual,
    crearElemento('div', { clase: 'acciones' }, [
      pausa,
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Listo', onclick: () => cerrar() })
    ])
  ]);
  let i = 0;
  let reloj = 0;
  function pintar() {
    dibujarQr(qrcode, lienzo, partes[i]);
    cual.textContent = partes.length > 1
      ? `Código ${i + 1} de ${partes.length}${reloj ? ' (cambian solos)' : ' (en pausa)'}` : '';
  }
  function seguir() {
    reloj = setInterval(() => { i = (i + 1) % partes.length; pintar(); }, 2000);
    pausa.textContent = 'Pausar';
    pintar();
  }
  function detener() {
    clearInterval(reloj);
    reloj = 0;
    pausa.textContent = 'Seguir';
    pintar();
  }
  function cerrar() {
    clearInterval(reloj);
    dialogo.close();
    dialogo.remove();
  }
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
  if (partes.length > 1) seguir();
  else pintar();
}

/**
 * Abre la cámara y lee los QR de un envío hasta tener todas sus partes.
 * @param {{alRecibir: (paquete: object) => void}} opciones  paquete ya
 *   revisado (compartir-qr.js), con `tipo`: 'padron' | 'asistencia' | 'entregas'
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
    crearElemento('h2', { id: 'qrl-titulo', texto: 'Recibir de otro teléfono' }),
    crearElemento('p', { clase: 'camara-pista', texto: 'En el otro teléfono muestra el código y apunta la cámara a su pantalla. Antes de guardar verás qué cambia.' }),
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
  let envio = '';
  let total = 0;
  let juntando = false;

  function cerrar() {
    if (!abierto) return;
    abierto = false;
    clearTimeout(temporizador);
    document.removeEventListener('visibilitychange', alOcultar);
    if (flujo) flujo.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    dialogo.close();
    dialogo.remove();
  }
  // Si se sale de la app con la cámara abierta, se cierra: Android se la
  // quita igual y el visor quedaba congelado gastando batería. Solo con la
  // cámara ya abierta, para no cerrarlo con el aviso de permiso.
  function alOcultar() { if (document.hidden && flujo) cerrar(); }
  document.addEventListener('visibilitychange', alOcultar);

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
          const p = leerParteQr(h.rawValue);
          if (!p) continue;
          // Otro envío: se empieza de nuevo con ese.
          if (p.id !== envio || p.total !== total) { partes.clear(); envio = p.id; total = p.total; }
          if (!partes.has(p.parte)) {
            partes.set(p.parte, p);
            if (navigator.vibrate) { try { navigator.vibrate(40); } catch (e) { /* sin vibración */ } }
          }
        }
        if (total && partes.size === total && !juntando) {
          juntando = true;
          const paquete = await juntarPartesQr([...partes.values()]);
          juntando = false;
          if (paquete) {
            cerrar();
            alRecibir(paquete);
            return;
          }
          partes.clear();
          total = 0;
          estado.textContent = 'El código no se pudo leer bien. Vuelve a mostrarlo desde el principio.';
        } else if (total > 1) estado.textContent = `Leídos ${partes.size} de ${total} códigos…`;
      }
    } catch (e) {
      /* un fotograma que no se pudo leer: se prueba con el siguiente */
    }
    temporizador = setTimeout(buscar, 200);
  }
  buscar();
}
