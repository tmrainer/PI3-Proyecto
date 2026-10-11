// ui.js — ayudas compartidas de interfaz. Enlace DOM <-> modelo.
// Ver AGENTS.md §3. Ninguna lógica de cálculo ni de validación vive aquí.

import {
  CLAVES, leer, guardar, borrarTodo, descargarJson, avisosAlmacenamiento, hoyIso
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
  flecha: 'm9 18 6-6-6-6'
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
export function bannerAlerta(alerta, { mostrarEnlace = true } = {}) {
  if (!alerta) return null;
  const nivel = alerta.nivel || 'lejana';
  const caja = crearElemento('div', { clase: `banner-alerta ${nivel}`, role: 'status' });

  if (!alerta.configurado) {
    caja.append(
      icono('reloj', { tam: 17, clase: 'icono banner-icono' }),
      crearElemento('span', { clase: 'banner-texto', texto: alerta.mensaje }),
      mostrarEnlace ? crearElemento('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Configurar entregas' }) : null
    );
    return caja;
  }

  const cuenta = alerta.diasRestantes < 0
    ? `${Math.abs(alerta.diasRestantes)} día(s) de atraso`
    : alerta.diasRestantes === 0 ? 'hoy' : `faltan ${alerta.diasRestantes} día(s)`;

  caja.append(
    icono(nivel === 'vencida' ? 'aviso' : 'reloj', { tam: 17, clase: 'icono banner-icono' }),
    crearElemento('span', { clase: 'banner-titulo', texto: TEXTO_NIVEL[nivel] + ':' }),
    crearElemento('span', { clase: 'banner-cuenta', texto: cuenta }),
    crearElemento('span', { clase: 'banner-texto', texto: alerta.mensaje }),
    mostrarEnlace ? crearElemento('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Ver entregas' }) : null
  );
  return caja;
}

// --------------------------------------------------- aviso de privacidad (§9)

export function bloquePrivacidad() {
  const estadoProteccion = crearElemento('p', { clase: 'dato-fuerte', texto: textoProteccion() });
  // El permiso del navegador llega después del primer pintado: se relee al abrir.
  return crearElemento('details', {
    clase: 'privacidad',
    ontoggle: () => { estadoProteccion.textContent = textoProteccion(); }
  }, [
    crearElemento('summary', { texto: 'Dónde se guardan estos datos' }),
    crearElemento('div', { clase: 'privacidad-cuerpo' }, [
      crearElemento('p', {
        texto: 'Todo lo que escribes se guarda únicamente en este navegador y en ' +
          'este dispositivo. No se envía a ningún servidor: la aplicación funciona ' +
          'sin internet y no tiene a dónde mandar nada.'
      }),
      crearElemento('p', {
        texto: 'Eso también significa que se pierde si borras los datos de ' +
          'navegación, si usas una ventana de incógnito o si abres la página en ' +
          'otro equipo. Exporta un respaldo cada cierto tiempo.'
      }),
      estadoProteccion,
      crearElemento('p', {
        texto: 'El archivo de respaldo contiene nombres, números de documento y el ' +
          'registro de asistencia de personas reales. Guárdalo en tu teléfono o en ' +
          'tu Drive; no lo mandes por WhatsApp ni por correo sin cifrar.'
      })
    ])
  ]);
}

/** Qué tan protegidos están los datos contra el borrado automático del navegador. */
function textoProteccion() {
  if (almacenPersistente === true) {
    return 'Este navegador marcó tus datos como protegidos: no los borrará solo para hacer espacio.';
  }
  if (esAppInstalada()) {
    return 'Usas la aplicación instalada. Igual conviene exportar un respaldo cada cierto tiempo.';
  }
  return 'Instala la aplicación en tu pantalla de inicio (menú del navegador → «Instalar» o ' +
    '«Agregar a pantalla de inicio»). Así el teléfono no borra tus datos cuando pasa un ' +
    'tiempo sin abrirla.';
}

// -------------------------------------------------- barra de datos (respaldos)

export function barraDatos({ alImportar, alBorrar }) {
  const entrada = crearElemento('input', {
    type: 'file', accept: 'application/json', clase: 'oculto-visual', id: 'importar-archivo'
  });
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files && entrada.files[0];
    if (!archivo) return;
    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);
      alImportar(datos);
    } catch (e) {
      alert('No se pudo leer el archivo. ¿Es un respaldo exportado por esta misma aplicación?');
    }
    entrada.value = '';
  });

  return crearElemento('div', { clase: 'barra-datos' }, [
    crearElemento('button', {
      type: 'button', clase: 'boton secundario',
      onclick: () => exportarTodo(), texto: 'Exportar respaldo'
    }),
    crearElemento('label', { clase: 'boton secundario', for: 'importar-archivo', texto: 'Importar respaldo' }),
    entrada,
    crearElemento('button', {
      type: 'button', clase: 'boton peligro',
      texto: 'Borrar todo',
      onclick: () => {
        const confirmado = confirm(
          'Se borrarán de este navegador: la rendición en curso, el padrón de ' +
          'personas afiliadas, el registro de raciones y asistencia, y el ' +
          'calendario de entregas.\n\n' +
          'Esto no se puede deshacer. ¿Exportaste un respaldo?\n\n' +
          'Aceptar para borrar todo.');
        if (!confirmado) return;
        borrarTodo();
        if (alBorrar) alBorrar();
      }
    })
  ]);
}

/**
 * Arma el respaldo y lo entrega. En el celular abre el menú del sistema para
 * guardarlo (Archivos, Drive) en vez de dejarlo perdido en Descargas; donde no
 * se puede, lo descarga. Anota la fecha para el recordatorio de respaldo.
 */
export async function exportarTodo() {
  const datos = {
    exportadoEn: new Date().toISOString(),
    aplicacion: 'rendicion-b1',
    rendiciones: leer(CLAVES.rendiciones, []),
    padron: leer(CLAVES.padron, null),
    calendario: leer(CLAVES.calendario, null),
    config: leer(CLAVES.config, null)
  };
  const nombre = `respaldo-b1-${hoyIso()}.json`;
  let entregado = false;
  if (esPantallaTactil() && typeof File !== 'undefined' && navigator.canShare) {
    const archivo = new File([JSON.stringify(datos, null, 2)], nombre, { type: 'application/json' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Respaldo del Sistema de Asistencia' });
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
  const errores = hallazgos.filter((x) => x.severidad === 'error');
  const avisos = hallazgos.filter((x) => x.severidad === 'advertencia');

  const resumen = crearElemento('p', { clase: 'panel-resumen' });
  if (hallazgos.length === 0) {
    resumen.append(crearElemento('span', { clase: 'pastilla ok' }, [
      icono('ok', { tam: 14 }), ' Sin observaciones'
    ]));
  } else {
    if (errores.length) {
      resumen.append(crearElemento('span', { clase: 'pastilla error' }, [
        icono('error', { tam: 14 }),
        ` ${errores.length} error${errores.length === 1 ? '' : 'es'}`
      ]));
    }
    if (avisos.length) {
      resumen.append(crearElemento('span', { clase: 'pastilla advertencia' }, [
        icono('aviso', { tam: 14 }),
        ` ${avisos.length} advertencia${avisos.length === 1 ? '' : 's'}`
      ]));
    }
  }
  contenedor.append(resumen);

  if (hallazgos.length === 0) return;

  // Con pocos hallazgos se ven directos; con muchos, el panel no puede comerse
  // media pantalla, así que el detalle se pliega y se abre a voluntad.
  // En el celular, siempre plegado: el panel se queda arriba y cada línea de
  // detalle es una persona menos a la vista en la lista.
  const muchos = hallazgos.length > (esAnchoCelular() ? 0 : 3);
  const lista = crearElemento('ul', { clase: 'panel-lista' });
  for (const hall of [...errores, ...avisos]) {
    const item = crearElemento('li', { clase: `panel-item ${hall.severidad}` }, [
      icono(ICONO_HALLAZGO[hall.severidad], { tam: 15, clase: 'icono panel-icono' }),
      crearElemento('span', { clase: 'panel-tipo', texto: hall.severidad === 'error' ? 'Error:' : 'Advertencia:' }),
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
  const recordatorio = recordatorioRespaldo();
  if (recordatorio) contenedor.append(recordatorio);
}

const DIAS_ENTRE_RESPALDOS = 14;

/**
 * Una línea con botón cuando hay datos y el último respaldo es viejo (o no hay
 * ninguno). En un celular los datos viven en un solo aparato: si se pierde o
 * se borra, sin respaldo no hay de dónde recuperarlos.
 */
function recordatorioRespaldo() {
  const padron = leer(CLAVES.padron, null);
  const hayDatos = (padron && Array.isArray(padron.afiliados) && padron.afiliados.length > 0) ||
    leer(CLAVES.rendiciones, []).length > 0;
  if (!hayDatos) return null;
  const ultimo = leer(CLAVES.respaldo, {}).ultimoEn;
  const dias = ultimo ? Math.round((Date.parse(hoyIso()) - Date.parse(ultimo)) / 86400000) : null;
  if (dias !== null && dias < DIAS_ENTRE_RESPALDOS) return null;
  return crearElemento('div', { clase: 'recordatorio-respaldo', id: 'recordatorio-respaldo' }, [
    crearElemento('span', {
      texto: dias === null
        ? 'Todavía no exportaste ningún respaldo de estos datos.'
        : `Tu último respaldo es de hace ${dias} días.`
    }),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto secundario', texto: 'Exportar respaldo',
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
