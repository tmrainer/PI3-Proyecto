// camara-qr.js — mostrar y leer los QR para pasar datos de un teléfono a
// otro (formato en compartir-qr.js).
//
// Mostrar: el QR lo arma qrcode-generator (vendor/, MIT, copiado dentro de la
// app: sin internet) y se dibuja en un lienzo. Si son varias partes, un solo
// código que cambia solo; la otra cámara las junta mientras apunta.
// Leer: con BarcodeDetector, del propio navegador (en el APK lo trae el
// WebView). Se juntan las partes de un mismo envío hasta tenerlas todas.
// Nada de esto sale del teléfono: el QR se ve en pantalla y nada más.

import { crearElemento } from './ui.js';
import { leerParteQr, juntarPartesQr } from './compartir-qr.js';
import { abrirCamaraTrasera } from './camara-trasera.js';

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
  // Nivel L: menos módulos para lo mismo, y se lee mejor desde otra pantalla
  // (no hay manchas ni roturas que corregir; cada parte se revisa al juntar).
  const qr = qrcode(0, 'L');
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
 * Muestra el QR de un envío. Si son varias partes, UN solo código que cambia
 * solo (cada CADA_MS): quien recibe solo apunta y su teléfono junta las partes
 * en cualquier orden. Nada de «1 de 3» ni botones: eso confundía. Si una
 * cámara no alcanza a leerlo al vuelo, «¿No lo lee? Ver de a uno».
 * @param {{partes: string[], titulo: string, detalle: string}} opciones
 */
export async function mostrarListaQr({ partes, titulo, detalle }) {
  const qrcode = await cargarGenerador();
  const varias = partes.length > 1;
  let deAUno = false;
  let i = 0;
  let reloj = 0;

  // Cada cuadro se dibuja una vez y después solo se alternan: en un teléfono
  // modesto, rehacer el QR cada 0,8 s gastaba procesador y batería.
  const cuadros = partes.map((parte) => {
    const c = crearElemento('canvas', { clase: 'qr-lienzo', role: 'img', 'aria-label': 'Código QR con los datos' });
    dibujarQr(qrcode, c, parte);
    return c;
  });
  const caja = crearElemento('div', { clase: 'qr-caja' }, [cuadros[0]]);
  const pista = crearElemento('p', { clase: 'camara-pista' });
  const cual = crearElemento('p', { clase: 'qr-parte', role: 'status', 'aria-live': 'polite' });
  const anterior = crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Anterior', hidden: true, onclick: () => ir(-1) });
  const siguiente = crearElemento('button', { type: 'button', clase: 'boton', texto: 'Siguiente', hidden: true, onclick: () => ir(1) });
  const deAUnoBoton = crearElemento('button', {
    type: 'button', clase: 'enlace-ir qr-de-a-uno', hidden: !varias, texto: '¿No lo lee? Ver de a uno',
    onclick: () => { deAUno = true; detener(); pintar(); deAUnoBoton.hidden = true; }
  });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'qr-titulo' }, [
    crearElemento('h2', { id: 'qr-titulo', texto: titulo }),
    pista,
    caja,
    cual,
    deAUnoBoton,
    crearElemento('div', { clase: 'acciones' }, [
      anterior, siguiente,
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Listo', onclick: () => cerrar() })
    ])
  ]);

  function pintar() {
    caja.replaceChildren(cuadros[i]);
    anterior.hidden = siguiente.hidden = !deAUno;
    if (deAUno) {
      cual.textContent = `Código ${i + 1} de ${partes.length}`;
      anterior.disabled = i === 0;
      siguiente.disabled = i === partes.length - 1;
      pista.textContent = `${detalle} Son ${partes.length} códigos: pasa al siguiente cuando el otro teléfono vibre.`;
    } else {
      cual.textContent = '';
      pista.textContent = `${detalle} Apunta la otra cámara a este código${varias ? ' y espera: cambia solo hasta que el otro teléfono vibre' : ''}.`;
    }
  }
  function ir(paso) {
    i = Math.min(partes.length - 1, Math.max(0, i + paso));
    pintar();
  }
  function detener() { clearInterval(reloj); reloj = 0; }
  // Que la pantalla no se apague mientras el otro teléfono lee: a medio
  // envío animado, quedaba incompleto.
  let cerrojo = null;
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').then((c) => { cerrojo = c; if (!dialogo.open) c.release(); }).catch(() => {});
  }
  function cerrar() {
    detener();
    if (cerrojo) cerrojo.release().catch(() => {});
    dialogo.close();
    dialogo.remove();
  }
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
  pintar();
  if (varias) reloj = setInterval(() => { i = (i + 1) % partes.length; caja.replaceChildren(cuadros[i]); }, CADA_MS);
}

// Cada cuánto cambia el código animado. El moto g23 (gama de entrada) lee un
// cuadro en ~0,4 s: así cada uno queda a la vista para dos o tres intentos.
const CADA_MS = 800;

function vibrar(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* sin vibración */ } }
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
  // Si el código viene animado (varias partes), una barra: cuánto falta.
  const avance = crearElemento('progress', { clase: 'qr-avance', max: '100', value: '0', hidden: true, 'aria-label': 'Cuánto se recibió' });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'qrl-titulo' }, [
    crearElemento('h2', { id: 'qrl-titulo', texto: 'Recibir de otro teléfono' }),
    crearElemento('p', { clase: 'camara-pista', texto: 'En el otro teléfono muestra el código y apunta la cámara a su pantalla. Antes de guardar verás qué cambia.' }),
    crearElemento('div', { clase: 'camara-visor' }, [video, cargando]),
    avance,
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
    // Sin tamaño, Android abre la cámara a 640×480: muy poco para un QR denso
    // en otra pantalla, y tardaba mucho en leerlo.
    flujo = await abrirCamaraTrasera(1280, 720);
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
            // Un toque corto por parte (lo necesita «Ver de a uno») y uno largo al final.
            vibrar(partes.size === total ? 120 : 25);
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
          avance.value = 0;
          estado.textContent = 'No se leyó bien. Sigue apuntando: se vuelve a leer.';
        } else if (total > 1) {
          const pct = Math.round((partes.size / total) * 100);
          avance.hidden = false;
          avance.value = pct;
          estado.textContent = `Recibiendo… ${pct} %. Sigue apuntando.`;
        }
      }
    } catch (e) {
      /* un fotograma que no se pudo leer: se prueba con el siguiente */
    }
    temporizador = setTimeout(buscar, 200);
  }
  buscar();
}
