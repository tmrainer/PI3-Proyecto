// ui.js — ayudas compartidas de interfaz. Enlace DOM <-> modelo.
// Ver AGENTS.md §3. Ninguna lógica de cálculo ni de validación vive aquí.

import {
  CLAVES, leer, guardar, borrarTodo, descargarJson, avisosAlmacenamiento, hoyIso,
  cifrarRespaldo, descifrarRespaldo, esRespaldoCifrado, revisarRespaldo, restaurarRespaldo,
  usoAlmacenamiento
} from './modelo.js';

/**
 * El primer elemento que coincide con un selector CSS (querySelector).
 * No lee ni escribe datos de la aplicación: solo consulta el DOM.
 * @param {string} sel  selector CSS
 * @param {ParentNode} [raiz=document]  dónde buscar
 * @returns {?Element}  null si no hay coincidencia
 */
export const buscar = (sel, raiz = document) => raiz.querySelector(sel);

/**
 * Crea un elemento DOM con sus propiedades e hijos en una sola llamada.
 * No lo inserta en la página: lo devuelve para que quien llama lo agregue.
 * No lee ni escribe datos de la aplicación.
 *
 * Cómo se interpreta cada clave de `props`:
 * - `clase`  -> `className`
 * - `texto`  -> `textContent` (seguro: no interpreta HTML)
 * - `onX` con una función -> `addEventListener('X', fn)` (p. ej. `onclick`)
 * - cualquier otra -> atributo HTML; `true` lo pone vacío (`disabled=""`) y
 *   `null`, `undefined` o `false` lo omiten.
 *
 * @param {string} etiqueta  nombre de la etiqueta HTML ('div', 'button'…)
 * @param {Object} [props={}]
 * @param {(Node|string|null|undefined)|Array<Node|string|null|undefined>} [hijos=[]]
 *   uno o varios hijos; los textos se convierten en nodos de texto y los
 *   null/undefined se saltan, para poder escribir hijos condicionales.
 * @returns {HTMLElement}
 */
export function crearElemento(etiqueta, props = {}, hijos = []) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'clase') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const h of [].concat(hijos)) {
    if (h === null || h === undefined) continue;
    el.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return el;
}

/**
 * Chip «Etiqueta: valor», con el valor en negrita. Arma los nodos uno por uno:
 * la aplicación no usa innerHTML en ninguna parte.
 * @param {string} etiqueta
 * @param {string|number} valor
 * @returns {HTMLElement}
 */
export function chip(etiqueta, valor) {
  return crearElemento('span', { clase: 'chip' }, [`${etiqueta}: `, crearElemento('b', { texto: String(valor) })]);
}

// Iconos SVG en línea: nítidos a cualquier tamaño y en cualquier plataforma,
// a diferencia de los caracteres sueltos (✓ ✕ ▸), que cada sistema dibuja a su
// manera. Siempre acompañados de texto: nunca son el único portador del
// significado (AGENTS.md §5.9).
const TRAZOS = {
  ok: 'M20 6 9 17l-5-5',
  error: 'M18 6 6 18M6 6l12 12',
  aviso: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  reloj: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  flecha: 'm9 18 6-6-6-6',
  lapiz: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'
};

export function icono(nombre, { tam = 16, clase = 'icono' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', tam);
  svg.setAttribute('height', tam);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', clase);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', TRAZOS[nombre] || TRAZOS.aviso);
  svg.appendChild(path);
  return svg;
}

/** Campo etiquetado: la combinación que se repite en todos los formularios. */
export function campo(etiqueta, control, pista) {
  return crearElemento('div', { clase: 'campo' }, [
    crearElemento('label', { for: control.id, texto: etiqueta }),
    control,
    pista ? crearElemento('span', { clase: 'pista', texto: pista }) : null
  ]);
}

/** Lleva el foco a un campo, desplegando lo que esté plegado para llegar a él. */
export function irACampo(nombre, { antesDeBuscar } = {}) {
  let caja = document.querySelector(`[data-campo="${CSS.escape(nombre)}"]`);
  if (!caja && antesDeBuscar) {
    antesDeBuscar(nombre);
    caja = document.querySelector(`[data-campo="${CSS.escape(nombre)}"]`);
  }
  if (!caja) return;
  if (caja._desplegar) caja._desplegar(true);
  if (caja.tagName === 'DETAILS') caja.open = true;
  caja.scrollIntoView({ block: 'center' });
  const control = caja.querySelector('input, select, textarea');
  if (control && !control.disabled) {
    // Si se llega aquí desde el panel es justo para ver qué pasa con el campo.
    control.dataset.tocado = '1';
    control.focus({ preventScroll: true });
  }
}

/**
 * Marca cada campo como visitado al salir de él, y revalida. Sin esto, o se
 * regaña de entrada o no se avisa hasta el final.
 */
export function avisarAlSalirDelCampo(alRevalidar) {
  document.addEventListener('focusout', (ev) => {
    const c = ev.target;
    if (!c || !c.matches || !c.matches('input, select, textarea')) return;
    if (c.dataset.tocado === '1') return;
    c.dataset.tocado = '1';
    if (alRevalidar) alRevalidar();
  });
}

/** Marca todos los campos como visitados: para antes de entregar o imprimir. */
export function mostrarTodosLosAvisos(alRevalidar) {
  for (const c of document.querySelectorAll('input, select, textarea')) c.dataset.tocado = '1';
  if (alRevalidar) alRevalidar();
}

/** Marca los campos con hallazgos y pinta el panel. */
export function aplicarHallazgos(panel, hallazgos, alIrA) {
  pintarPanel(panel, hallazgos, { alIrA });
  for (const caja of document.querySelectorAll('[data-campo]')) {
    marcarCampo(caja, hallazgos.filter((x) => x.campo === caja.dataset.campo));
  }
}

// ------------------------------------------------------------------ navegación

// La asistencia es la raíz: es la tarea diaria, y quien abre la dirección sin
// más debe caer en ella, no en un formulario que se llena una vez al mes.
const PAGINAS = [
  { href: './', texto: 'Asistencia', clave: 'asistencia' },
  { href: './padron.html', texto: 'Padrón', clave: 'padron' },
  { href: './formato-b1.html', texto: 'Formato B-1', clave: 'b1' },
  { href: './calendario.html', texto: 'Entregas', clave: 'calendario' }
];

export function montarCabecera(claveActiva, subtitulo) {
  document.documentElement.classList.add('listo');   // ver «reservar el sitio» en estilos.css
  if (claveActiva === 'pruebas') {
    PAGINAS.push({ href: './pruebas.html', texto: 'Pruebas', clave: 'pruebas' });
  }

  // La cabecera ya está en el HTML: solo se rellena. Cuando la construía aquí
  // y la insertaba al principio, el contenido ya pintado saltaba 111 px hacia
  // abajo (Lighthouse medía un CLS de 0,258).
  const nav = buscar('.cabecera .nav');
  if (!nav) return;
  nav.textContent = '';
  for (const p of PAGINAS) {
    nav.append(crearElemento('a', {
      href: p.href,
      clase: p.clave === claveActiva ? 'nav-enlace activo' : 'nav-enlace',
      'aria-current': p.clave === claveActiva ? 'page' : null,
      texto: p.texto
    }));
  }
  if (subtitulo) {
    const sub = buscar('.cabecera-sub');
    if (sub) sub.textContent = subtitulo;
  }
  vigilarAltoFijo(document.getElementById('panel'));
  vigilarAltoFijo(nav, '--alto-nav-abajo', 'fixed');
  registrarTrabajador();
  pedirAlmacenPersistente();
}

const fijos = new Map();
let observadorFijos = null;

/**
 * Lo que se queda pegado arriba (o abajo) al desplazarse tapa el contenido que
 * pasa por debajo. Sin un margen igual a su alto, al volver con Shift+Tab el
 * campo enfocado quedaba entero debajo del panel (WCAG 2.4.11). El alto cambia
 * al abrir un detalle o al girar el celular, así que se mide en vivo; y solo
 * cuenta mientras el elemento esté de verdad pegado (en el celular, la
 * asistencia deja de pegar el panel y pega el conteo).
 * @param {?Element} el  elemento con position sticky o fixed
 * @param {string} [variable='--alto-panel']  propiedad CSS de :root a escribir
 * @param {string} [posicion='sticky']  la posición que cuenta como «pegado»
 */
export function vigilarAltoFijo(el, variable = '--alto-panel', posicion = 'sticky') {
  if (!el || typeof ResizeObserver === 'undefined') return;
  fijos.set(el, { variable, posicion });
  if (!observadorFijos) {
    observadorFijos = new ResizeObserver(() => {
      const altos = {};
      for (const [e, { variable: v, posicion: p }] of fijos) {
        if (!e.isConnected) { fijos.delete(e); continue; }
        const pegado = getComputedStyle(e).position === p;
        const alto = pegado ? Math.ceil(e.getBoundingClientRect().height) : 0;
        altos[v] = Math.max(altos[v] || 0, alto);
      }
      for (const [v, alto] of Object.entries(altos)) {
        document.documentElement.style.setProperty(v, `${alto}px`);
      }
    });
  }
  observadorFijos.observe(el);
}

/**
 * Registra sw.js, que guarda los archivos de la app para abrirla sin internet.
 * Los datos no pasan por él: siguen en localStorage.
 */
function registrarTrabajador() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* sin él, la app funciona igual con red */ });
  // La app se sirve de su copia guardada; las novedades se bajan aparte, ya
  // cargada la página, y se avisa para que se use la versión nueva al recargar.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data === 'version-nueva') avisarVersionNueva();
  });
  addEventListener('load', () => {
    navigator.serviceWorker.ready
      // En la propia máquina se revisa en cada carga: quien programa no espera 30 min.
      .then((r) => r.active && r.active.postMessage(
        /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'buscar-actualizacion-ya' : 'buscar-actualizacion'))
      .catch(() => {});
  });
}

function avisarVersionNueva() {
  const contenedor = document.getElementById('avisos-sistema');
  if (!contenedor || document.getElementById('aviso-version')) return;
  contenedor.append(crearElemento('div', { clase: 'recordatorio-respaldo', id: 'aviso-version', role: 'status' }, [
    crearElemento('span', { texto: 'Hay una versión nueva de la aplicación. Tus datos no cambian.' }),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto secundario', texto: 'Usar la versión nueva',
      onclick: () => location.reload()
    })
  ]));
}

/** null mientras no se sabe; true/false según lo que conceda el navegador. */
export let almacenPersistente = null;

/**
 * Pide al navegador que no borre los datos por su cuenta. Sin esto, Safari en
 * iPhone borra lo guardado por un sitio que no se abre en 7 días, y Android
 * puede borrarlo cuando el teléfono se queda sin espacio.
 */
async function pedirAlmacenPersistente() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    almacenPersistente = await navigator.storage.persisted() || await navigator.storage.persist();
  } catch (e) { almacenPersistente = false; }
  // La respuesta llega después del primer pintado.
  for (const el of document.querySelectorAll('.estado-proteccion')) el.textContent = textoProteccion();
}

/** ¿Abierta como app instalada (desde el ícono), y no en una pestaña? */
export function esAppInstalada() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** Celular o tablet: se decide por el dedo, no por el ancho. */
export function esPantallaTactil() {
  return matchMedia('(pointer: coarse)').matches;
}

/**
 * Mientras se pasa lista, que el celular no apague la pantalla entre una
 * persona y la siguiente. Se pide al tocar y se suelta tras `minutos` sin
 * toques, para no gastar la batería si se deja el teléfono sobre la mesa. Al
 * ocultarse la página el navegador la suelta solo; el siguiente toque la
 * vuelve a pedir. Donde no existe (Firefox, Safari viejo), no hace nada.
 * @param {number} [minutos=5]
 */
export function pantallaEncendidaMientrasSeUsa(minutos = 5) {
  if (!('wakeLock' in navigator) || !esPantallaTactil()) return;
  let cerrojo = null;
  let reloj = null;
  const soltar = () => {
    if (cerrojo) cerrojo.release().catch(() => {});
    cerrojo = null;
  };
  addEventListener('pointerdown', async () => {
    clearTimeout(reloj);
    reloj = setTimeout(soltar, minutos * 60000);
    if (cerrojo && !cerrojo.released) return;
    try {
      cerrojo = await navigator.wakeLock.request('screen');
    } catch (e) { cerrojo = null; /* sin batería o sin permiso: se sigue igual */ }
  }, { passive: true });
}

/** Ancho de celular: el mismo corte que usa estilos.css. */
export function esAnchoCelular() {
  return matchMedia('(max-width: 619px)').matches;
}

// ------------------------------------------- aviso de la próxima entrega (§6.6)

const TEXTO_NIVEL = {
  vencida: 'Entrega vencida',
  hoy: 'Se entrega hoy',
  urgente: 'Falta muy poco',
  proxima: 'Se acerca la entrega',
  lejana: 'Próxima entrega'
};

/**
 * Franja de aviso. Solo se ve con la aplicación abierta: no hay notificaciones
 * con la app cerrada y la franja lo dice (AGENTS.md §10).
 */
export function bannerAlerta(alerta, { mostrarEnlace = true, pedirConfigurar = true } = {}) {
  if (!alerta) return null;
  // «Todavía no has indicado cuándo entregas» va solo donde importa (el B-1):
  // en Asistencia y Padrón empujaba la lista hacia abajo en el celular.
  if (!alerta.configurado && !pedirConfigurar) return null;
  const nivel = alerta.nivel || 'lejana';
  const caja = crearElemento('div', { clase: `banner-alerta ${nivel}`, role: 'status' });

  if (!alerta.configurado) {
    caja.append(
      icono('reloj', { tam: 17, clase: 'icono banner-icono' }),
      crearElemento('span', { clase: 'banner-texto', texto: alerta.mensaje }),
      ...(mostrarEnlace ? [crearElemento('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Configurar entregas' })] : [])
    );
    return caja;
  }

  const dias = Math.abs(alerta.diasRestantes);
  const cuenta = alerta.diasRestantes < 0
    ? `${dias} ${dias === 1 ? 'día' : 'días'} de atraso`
    : alerta.diasRestantes === 0 ? 'hoy' : `${dias === 1 ? 'falta 1 día' : `faltan ${dias} días`}`;

  caja.append(
    icono(nivel === 'vencida' ? 'aviso' : 'reloj', { tam: 17, clase: 'icono banner-icono' }),
    crearElemento('span', { clase: 'banner-titulo', texto: TEXTO_NIVEL[nivel] + ':' }),
    crearElemento('span', { clase: 'banner-cuenta', texto: cuenta }),
    crearElemento('span', { clase: 'banner-texto', texto: alerta.mensaje }),
    ...(mostrarEnlace ? [crearElemento('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Ver entregas' })] : [])
  );
  return caja;
}

// --------------------------------------------------- aviso de privacidad (§9)

export function bloquePrivacidad() {
  // Va dentro del plegable «Copia de tus datos y privacidad»: plegarlo otra
  // vez aquí obligaba a abrir dos cosas para leer tres líneas.
  const estadoProteccion = crearElemento('p', { clase: 'dato-fuerte estado-proteccion', texto: textoProteccion() });
  return crearElemento('div', { clase: 'privacidad privacidad-cuerpo' }, [
    crearElemento('p', {
      texto: 'Tus datos se guardan solo en este equipo, no en internet. Funciona sin señal.'
    }),
    crearElemento('p', {
      texto: 'Si borras los datos del navegador o cambias de teléfono, se pierden. ' +
        'Guarda una copia cada dos semanas.'
    }),
    estadoProteccion,
    crearElemento('p', {
      texto: 'La copia tiene nombres y DNI. Si la mandas por WhatsApp o correo, ponle contraseña.'
    })
  ]);
}

/** Qué tan protegidos están los datos contra el borrado automático del navegador. */
function textoProteccion() {
  if (almacenPersistente === true || esAppInstalada()) return '';
  return 'Para que el teléfono no borre tus datos: menú del navegador → «Agregar a pantalla de inicio».';
}

// -------------------------------------------------- barra de datos (respaldos)

/**
 * Barra de respaldos: exportar, importar (con o sin contraseña) y borrar todo.
 * Importar restaura TODO lo que trae el respaldo desde cualquier página.
 * @param {{ antesDeRecargar?: () => void }} opciones  lo que la página debe
 *   hacer antes de recargarse (descartar lo pendiente, para que el pagehide no
 *   escriba encima la copia vieja)
 */
export function barraDatos({ antesDeRecargar } = {}) {
  const recargar = () => {
    if (antesDeRecargar) antesDeRecargar();
    location.reload();
  };

  function alImportar(datos) {
    const r = revisarRespaldo(datos);
    if (r.error) { alert(r.error); return; }
    if (!confirm(`La copia trae: ${r.resumen}.\n\n` +
      'Reemplazará eso mismo en este equipo. Lo demás se queda como está.\n\n¿Continuar?')) return;
    if (antesDeRecargar) antesDeRecargar();
    if (!restaurarRespaldo(datos)) {
      alert('No se pudo recuperar toda la copia: puede que el espacio esté lleno. ' +
        'Revisa qué quedó y vuelve a intentar.');
    }
    location.reload();
  }

  const entrada = crearElemento('input', {
    type: 'file', accept: 'application/json', clase: 'oculto-visual', id: 'importar-archivo'
  });
  // Un respaldo con contraseña pide la contraseña aquí mismo, antes de importar.
  const abrirCifrado = crearElemento('div', { clase: 'respaldo-clave', hidden: true });

  entrada.addEventListener('change', async () => {
    const archivo = entrada.files && entrada.files[0];
    entrada.value = '';
    if (!archivo) return;
    let datos;
    try {
      datos = JSON.parse(await archivo.text());
    } catch (e) {
      alert('No se pudo leer el archivo. Elige una copia guardada con esta aplicación.');
      return;
    }
    if (esRespaldoCifrado(datos)) pedirContrasena(datos);
    else alImportar(datos);
  });

  function pedirContrasena(sobre) {
    const clave = crearElemento('input', {
      type: 'password', id: 'clave-importar', autocomplete: 'current-password'
    });
    const msg = crearElemento('p', { clase: 'campo-error', role: 'status' });
    const abrir = async () => {
      msg.textContent = 'Abriendo…';
      try {
        const datos = await descifrarRespaldo(sobre, clave.value);
        abrirCifrado.hidden = true;
        alImportar(datos);
      } catch (e) {
        msg.textContent = 'Esa contraseña no abre la copia. Revisa mayúsculas y vuelve a intentar.';
        msg.classList.add('es-error');
        clave.focus();
      }
    };
    clave.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    abrirCifrado.textContent = '';
    abrirCifrado.append(
      crearElemento('div', { clase: 'campo' }, [
        crearElemento('label', { for: clave.id, texto: 'Esta copia tiene contraseña. Escríbela' }),
        clave
      ]),
      crearElemento('div', { clase: 'acciones' }, [
        crearElemento('button', { type: 'button', clase: 'boton', texto: 'Abrir copia', onclick: abrir }),
        crearElemento('button', {
          type: 'button', clase: 'boton secundario', texto: 'Cancelar',
          onclick: () => { abrirCifrado.hidden = true; }
        })
      ]),
      msg
    );
    abrirCifrado.hidden = false;
    clave.focus();
  }

  return crearElemento('div', {}, [
    crearElemento('div', { clase: 'barra-datos' }, [
      crearElemento('button', {
        type: 'button', clase: 'boton secundario',
        onclick: () => exportarTodo(), texto: 'Guardar una copia'
      }),
      crearElemento('label', { clase: 'boton secundario', for: 'importar-archivo', texto: 'Recuperar una copia' }),
      entrada,
      crearElemento('button', {
        type: 'button', clase: 'boton peligro',
        texto: 'Borrar todo',
        onclick: () => {
          const confirmado = confirm(
            'Se borrará de este equipo: el padrón, la asistencia, el formato B-1 ' +
            'y las entregas.\n\n' +
            'No se puede deshacer. ¿Guardaste una copia?\n\n' +
            'Aceptar para borrar todo.');
          if (!confirmado) return;
          borrarTodo();
          recargar();
        }
      })
    ]),
    abrirCifrado,
    exportarConContrasena()
  ]);
}

/** «Exportar con contraseña»: plegado, con la contraseña dos veces. */
function exportarConContrasena() {
  const c1 = crearElemento('input', { type: 'password', id: 'clave-exportar', autocomplete: 'new-password', minlength: '8' });
  const c2 = crearElemento('input', { type: 'password', id: 'clave-exportar-2', autocomplete: 'new-password' });
  const msg = crearElemento('p', { clase: 'campo-error', role: 'status' });
  const exportar = async () => {
    msg.classList.add('es-error');
    if (c1.value.length < 8) { msg.textContent = 'Usa una contraseña de 8 caracteres o más.'; c1.focus(); return; }
    if (c1.value !== c2.value) { msg.textContent = 'Las dos contraseñas no coinciden. Escríbelas otra vez.'; c2.focus(); return; }
    msg.classList.remove('es-error');
    msg.textContent = 'Preparando…';
    await exportarTodo(c1.value);
    c1.value = ''; c2.value = '';
    msg.textContent = 'Copia lista. Anota la contraseña en un lugar aparte.';
  };
  return crearElemento('details', { clase: 'respaldo-clave' }, [
    crearElemento('summary', { texto: 'Guardar una copia con contraseña' }),
    crearElemento('p', {
      clase: 'pista',
      texto: 'Sin la contraseña nadie puede abrirla, tampoco tú si la olvidas.'
    }),
    crearElemento('div', { clase: 'rejilla dos' }, [
      crearElemento('div', { clase: 'campo' }, [crearElemento('label', { for: c1.id, texto: 'Contraseña (8 o más caracteres)' }), c1]),
      crearElemento('div', { clase: 'campo' }, [crearElemento('label', { for: c2.id, texto: 'Repite la contraseña' }), c2])
    ]),
    crearElemento('div', { clase: 'acciones', style: 'margin-top:10px' }, [
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Guardar copia con contraseña', onclick: exportar })
    ]),
    msg
  ]);
}

/** El respaldo completo: todo lo que la app guarda, en un solo objeto. */
export function armarRespaldo() {
  return {
    exportadoEn: new Date().toISOString(),
    aplicacion: 'rendicion-b1',
    rendiciones: leer(CLAVES.rendiciones, []),
    padron: leer(CLAVES.padron, null),
    calendario: leer(CLAVES.calendario, null),
    config: leer(CLAVES.config, null)
  };
}

/**
 * Arma el respaldo y lo entrega. En el celular abre el menú del sistema para
 * guardarlo (Archivos, Drive) en vez de dejarlo perdido en Descargas; donde no
 * se puede, lo descarga. Con contraseña, lo cifra antes. Anota la fecha para el
 * recordatorio de respaldo.
 * @param {string} [contrasena]
 */
export async function exportarTodo(contrasena) {
  let datos = armarRespaldo();
  let nombre = `respaldo-b1-${hoyIso()}.json`;
  if (contrasena) {
    datos = await cifrarRespaldo(datos, contrasena);
    nombre = `respaldo-b1-${hoyIso()}-protegido.json`;
  }
  let entregado = false;
  if (esPantallaTactil() && typeof File !== 'undefined' && navigator.canShare) {
    const archivo = new File([JSON.stringify(datos, null, 2)], nombre, { type: 'application/json' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Copia del Sistema de Asistencia' });
        entregado = true;
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // cerró el menú: no hubo respaldo
      }
    }
  }
  if (!entregado) descargarJson(nombre, datos);
  guardar(CLAVES.respaldo, { ultimoEn: hoyIso() });
  const recordatorio = document.getElementById('recordatorio-respaldo');
  if (recordatorio) recordatorio.remove();
}

// ------------------------------------------- panel de validación compartido

const ICONO_HALLAZGO = { error: 'error', advertencia: 'aviso' };

/**
 * Pinta el panel de hallazgos. Nunca modifica datos: solo informa.
 * La severidad se comunica con icono + texto, no solo con color (AGENTS.md §5.7).
 */
export function pintarPanel(contenedor, hallazgos, { alIrA } = {}) {
  contenedor.textContent = '';
  // Un dato que todavía no se escribió no es un «error»: en un formulario
  // recién empezado, decir «12 errores» en rojo asusta y parece un regaño.
  const faltan = hallazgos.filter((x) => x.severidad === 'error' && x.falta);
  const errores = hallazgos.filter((x) => x.severidad === 'error' && !x.falta);
  const avisos = hallazgos.filter((x) => x.severidad === 'advertencia');

  // Sin nada que decir, no se dice nada: un «todo bien» permanente es ruido.
  if (hallazgos.length === 0) return;

  const resumen = crearElemento('p', { clase: 'panel-resumen' });
  if (faltan.length) {
    resumen.append(crearElemento('span', { clase: 'pastilla neutra' }, [
      icono('lapiz', { tam: 14 }),
      faltan.length === 1 ? ' Falta 1 dato' : ` Faltan ${faltan.length} datos`
    ]));
  }
  if (errores.length) {
    resumen.append(crearElemento('span', { clase: 'pastilla error' }, [
      icono('error', { tam: 14 }), ` ${errores.length} por corregir`
    ]));
  }
  if (avisos.length) {
    resumen.append(crearElemento('span', { clase: 'pastilla advertencia' }, [
      icono('aviso', { tam: 14 }), ` ${avisos.length} por revisar`
    ]));
  }
  contenedor.append(resumen);

  // Con pocos hallazgos se ven directos; con muchos, el panel no puede comerse
  // media pantalla, así que el detalle se pliega y se abre a voluntad.
  // En el celular, siempre plegado: el panel se queda arriba y cada línea de
  // detalle es una persona menos a la vista en la lista.
  const muchos = hallazgos.length > (esAnchoCelular() ? 0 : 3);
  const lista = crearElemento('ul', { clase: 'panel-lista' });
  for (const hall of [...errores, ...faltan, ...avisos]) {
    const tipo = hall.severidad !== 'error' ? 'Revisar:' : hall.falta ? 'Completar:' : 'Corregir:';
    const item = crearElemento('li', { clase: `panel-item ${hall.falta ? 'falta' : hall.severidad}` }, [
      icono(hall.falta ? 'lapiz' : ICONO_HALLAZGO[hall.severidad], { tam: 15, clase: 'icono panel-icono' }),
      crearElemento('span', { clase: 'panel-tipo', texto: tipo }),
      crearElemento('span', { clase: 'panel-mensaje', texto: ' ' + hall.mensaje })
    ]);
    if (alIrA) {
      item.append(crearElemento('button', {
        type: 'button', clase: 'enlace-ir',
        texto: 'Ir al dato',
        onclick: () => alIrA(hall.campo)
      }));
    }
    lista.append(item);
  }

  if (!muchos) { contenedor.append(lista); return; }
  contenedor.append(crearElemento('details', { clase: 'panel-detalle' }, [
    crearElemento('summary', { texto: `Ver qué falta (${hallazgos.length})` }),
    lista
  ]));
}

let contadorMensaje = 0;

/**
 * Marca o limpia un campo con problema. No toca su valor.
 *
 * El mensaje va JUNTO al campo y enlazado con aria-describedby: con el error
 * solo en el panel, un lector de pantalla anuncia «campo inválido» sin decir
 * por qué, y hay que ir a buscarlo a otra parte de la página.
 */
export function marcarCampo(elemento, hallazgos) {
  if (!elemento) return;
  const propios = hallazgos || [];
  const error = propios.some((x) => x.severidad === 'error');

  const control = elemento.matches('input, select, textarea')
    ? elemento
    : elemento.querySelector('input, select, textarea');

  // El rojo tampoco se enciende antes de tiempo: un campo vacío que nadie ha
  // visitado todavía no es un campo mal puesto.
  const tocado = !control || control.dataset.tocado === '1';
  elemento.classList.toggle('con-error', error && tocado);
  elemento.classList.toggle('con-aviso', !error && propios.length > 0 && tocado);

  if (!control) return;
  control.setAttribute('aria-invalid', error && tocado ? 'true' : 'false');

  // El mensaje en línea cuelga del contenedor del campo, no del control.
  const caja = elemento.matches('.campo') ? elemento : control.closest('.campo');
  if (!caja) return;

  // Un formulario recién abierto no está «mal»: está vacío. El mensaje en
  // línea solo aparece en los campos por los que ya se pasó. El panel de
  // arriba sigue listando todo, para repasar antes de entregar.
  let msg = caja.querySelector(':scope > .campo-error');
  if (propios.length === 0 || !tocado) {
    if (msg) {
      control.removeAttribute('aria-describedby');
      msg.remove();
    }
    return;
  }
  if (!msg) {
    contadorMensaje += 1;
    msg = crearElemento('p', { clase: 'campo-error', id: `msg-campo-${contadorMensaje}` });
    caja.append(msg);
  }
  msg.textContent = propios[0].mensaje;
  msg.classList.toggle('es-error', error);
  control.setAttribute('aria-describedby', msg.id);
}

// ---------------------------------------------- sugerencias (AGENTS.md §2)

/**
 * Muestra una propuesta FUERA del campo. No la escribe: solo deja un botón.
 * Al aceptarla, el campo queda marcado como "propuesto" hasta que se edite.
 */
export function cajaSugerencia(propuesta, alAceptar) {
  if (!propuesta) return null;
  return crearElemento('p', { clase: 'sugerencia' }, [
    crearElemento('span', { clase: 'sugerencia-etiqueta', texto: 'Sugerencia' }),
    crearElemento('span', { clase: 'sugerencia-valor', texto: String(propuesta.valor) }),
    crearElemento('span', { clase: 'sugerencia-proc', texto: propuesta.procedencia }),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto',
      texto: 'Usar este dato',
      onclick: () => alAceptar(propuesta.valor)
    })
  ]);
}

// ------------------------------------------------------- avisos del navegador

export function pintarAvisosAlmacenamiento(contenedor) {
  const avisos = avisosAlmacenamiento();
  contenedor.textContent = '';
  if (avisos.length > 0) {
    contenedor.append(crearElemento('div', { clase: 'aviso-sistema', role: 'alert' },
      avisos.map((a) => crearElemento('p', {}, [icono('aviso', { tam: 15 }), ' ' + a]))));
  }
  const espacio = avisoEspacio();
  if (espacio) contenedor.append(espacio);
  const recordatorio = recordatorioRespaldo();
  if (recordatorio) contenedor.append(recordatorio);
}

/**
 * Dice si lo último quedó guardado. Si falló (almacenamiento lleno o
 * bloqueado), lo dice dónde se ve y no solo abajo: antes la app seguía
 * mostrando «Guardado» aunque nada se hubiera escrito.
 * @param {boolean} ok
 */
export function mostrarGuardado(ok) {
  const estado = document.getElementById('estado-guardado');
  if (estado) {
    estado.textContent = ok
      ? 'Guardado en este equipo.'
      : 'NO SE GUARDÓ lo último. Guarda una copia ahora.';
    estado.classList.toggle('es-error', !ok);
  }
  const previo = document.getElementById('aviso-no-guarda');
  if (ok) { if (previo) previo.remove(); return; }
  if (previo) return;
  const contenedor = document.getElementById('avisos-sistema');
  if (!contenedor) return;
  contenedor.prepend(crearElemento('div', { clase: 'aviso-sistema', id: 'aviso-no-guarda', role: 'alert' }, [
    crearElemento('p', {}, [icono('aviso', { tam: 15 }),
      ' No se pudo guardar: el espacio está lleno o bloqueado. Lo que escribas ahora ' +
      'se perderá al cerrar. Guarda una copia antes de cerrar la página.']),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto secundario', texto: 'Guardar una copia',
      onclick: () => exportarTodo()
    })
  ]));
}

const UMBRAL_ESPACIO = 0.7;

/** Antes de que se llene, no cuando ya no se puede guardar. */
function avisoEspacio() {
  const { fraccion } = usoAlmacenamiento();
  if (fraccion < UMBRAL_ESPACIO) return null;
  return crearElemento('div', { clase: 'aviso-sistema', role: 'alert' }, [
    crearElemento('p', {}, [icono('aviso', { tam: 15 }),
      ` El espacio de la aplicación va al ${Math.round(fraccion * 100)} %. Cuando se ` +
      'llene, no podrá guardar. Guarda una copia y avisa a quien mantiene la aplicación.'])
  ]);
}

const DIAS_ENTRE_RESPALDOS = 14;

// Sin abrir el padrón entero (con años de asistencia, leerlo de nuevo solo para
// esto demoraba la apertura): guardar() escribe JSON.stringify, que deja
// «"afiliados":[]» exacto cuando no hay nadie.
function hayDatosGuardados() {
  try {
    const padron = localStorage.getItem(CLAVES.padron);
    const rendiciones = localStorage.getItem(CLAVES.rendiciones);
    return (padron !== null && !padron.includes('"afiliados":[]')) ||
      (rendiciones !== null && rendiciones !== '[]');
  } catch (e) {
    return false;
  }
}

/**
 * Una línea con botón cuando hay datos y el último respaldo es viejo (o no hay
 * ninguno). En un celular los datos viven en un solo aparato: si se pierde o
 * se borra, sin respaldo no hay de dónde recuperarlos.
 */
function recordatorioRespaldo() {
  if (!hayDatosGuardados()) return null;
  const ultimo = leer(CLAVES.respaldo, {}).ultimoEn;
  const dias = ultimo ? Math.round((Date.parse(hoyIso()) - Date.parse(ultimo)) / 86400000) : null;
  if (dias !== null && dias < DIAS_ENTRE_RESPALDOS) return null;
  return crearElemento('div', { clase: 'recordatorio-respaldo', id: 'recordatorio-respaldo' }, [
    crearElemento('span', {
      texto: dias === null
        ? 'Todavía no guardaste una copia de tus datos.'
        : `Tu última copia es de hace ${dias} días.`
    }),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto secundario', texto: 'Guardar una copia',
      onclick: () => exportarTodo()
    })
  ]);
}

export { leer, guardar, CLAVES };

// ----------------------------------------- repintar sin perder lo abierto

/**
 * Repinta con `pintar()` conservando lo que la persona tenía en pantalla: las
 * fichas desplegadas y los <details> abiertos (los que tienen id «ficha-…»), el
 * campo con el foco y su cursor, y el desplazamiento. Para los repintados que
 * ella no pidió, como cuando otra pestaña guarda (estado.vigilarPestanas): sin
 * esto, la ficha que estaba editando se le cerraría a mitad de escribir.
 * @param {() => void} pintar
 */
export function repintarConservandoVista(pintar) {
  const abiertas = [...document.querySelectorAll('[id^="ficha-"]')]
    .filter((el) => el.open || el.querySelector(':scope > [aria-expanded="true"]'))
    .map((el) => el.id);
  const activo = document.activeElement;
  let foco = null;
  if (activo && activo.id) {
    foco = { id: activo.id, ini: null, fin: null };
    try { foco.ini = activo.selectionStart; foco.fin = activo.selectionEnd; } catch (e) { /* sin cursor */ }
  }
  const desplazamiento = window.scrollY;

  pintar();

  for (const id of abiertas) {
    const el = document.getElementById(id);
    if (!el) continue;                       // ya no existe en la otra versión
    if (el.tagName === 'DETAILS') el.open = true;
    else if (typeof el._desplegar === 'function') el._desplegar(true);
  }
  if (foco) {
    const el = document.getElementById(foco.id);
    if (el) {
      el.focus({ preventScroll: true });
      if (foco.ini !== null && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(foco.ini, foco.fin); } catch (e) { /* tipo sin cursor */ }
      }
    }
  }
  window.scrollTo(0, desplazamiento);
}
