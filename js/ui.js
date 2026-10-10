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
 * - `html`   -> `innerHTML` (SÍ interpreta HTML: solo con texto propio, nunca
 *              con datos escritos por la usuaria)
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
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const h of [].concat(hijos)) {
    if (h === null || h === undefined) continue;
    el.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  }
  return el;
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
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  return crearElemento('details', { clase: 'privacidad' }, [
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
      crearElemento('p', {
        texto: 'El archivo de respaldo contiene nombres, números de documento y el ' +
          'registro de asistencia de personas reales. No lo compartas por WhatsApp ' +
          'ni por correo sin cifrar.'
      })
    ])
  ]);
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

export function exportarTodo() {
  const datos = {
    exportadoEn: new Date().toISOString(),
    aplicacion: 'rendicion-b1',
    rendiciones: leer(CLAVES.rendiciones, []),
    padron: leer(CLAVES.padron, null),
    calendario: leer(CLAVES.calendario, null),
    config: leer(CLAVES.config, null)
  };
  descargarJson(`respaldo-b1-${hoyIso()}.json`, datos);
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
  const muchos = hallazgos.length > 3;
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
  if (avisos.length === 0) return;
  contenedor.append(crearElemento('div', { clase: 'aviso-sistema', role: 'alert' },
    avisos.map((a) => crearElemento('p', {}, [icono('aviso', { tam: 15 }), ' ' + a]))));
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
