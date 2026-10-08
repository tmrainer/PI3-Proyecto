// ui.js — ayudas compartidas de interfaz. Enlace DOM <-> modelo.
// Ver AGENTS.md §3. Ninguna lógica de cálculo ni de validación vive aquí.

import {
  CLAVES, leer, guardar, borrarTodo, descargarJson, avisosAlmacenamiento, hoyIso
} from './modelo.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function crear(etiqueta, props = {}, hijos = []) {
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
  return crear('div', { clase: 'campo' }, [
    crear('label', { for: control.id, texto: etiqueta }),
    control,
    pista ? crear('span', { clase: 'pista', texto: pista }) : null
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
  if (control && !control.disabled) control.focus({ preventScroll: true });
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
  const nav = crear('nav', { clase: 'nav', 'aria-label': 'Secciones' },
    PAGINAS.map((p) => crear('a', {
      href: p.href,
      clase: p.clave === claveActiva ? 'nav-enlace activo' : 'nav-enlace',
      'aria-current': p.clave === claveActiva ? 'page' : null,
      texto: p.texto
    })));
  if (claveActiva === 'pruebas') {
    PAGINAS.push({ href: './pruebas.html', texto: 'Pruebas', clave: 'pruebas' });
  }
  const cab = crear('header', { clase: 'cabecera' }, [
    crear('div', { clase: 'cabecera-titulo' }, [
      crear('h1', { texto: 'Sistema de Asistencia' }),
      crear('p', { clase: 'cabecera-sub', texto: subtitulo })
    ]),
    nav
  ]);
  document.body.prepend(cab);
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
  const caja = crear('div', { clase: `banner-alerta ${nivel}`, role: 'status' });

  if (!alerta.configurado) {
    caja.append(
      icono('reloj', { tam: 17, clase: 'icono banner-icono' }),
      crear('span', { clase: 'banner-texto', texto: alerta.mensaje }),
      mostrarEnlace ? crear('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Configurar entregas' }) : null
    );
    return caja;
  }

  const cuenta = alerta.diasRestantes < 0
    ? `${Math.abs(alerta.diasRestantes)} día(s) de atraso`
    : alerta.diasRestantes === 0 ? 'hoy' : `faltan ${alerta.diasRestantes} día(s)`;

  caja.append(
    icono(nivel === 'vencida' ? 'aviso' : 'reloj', { tam: 17, clase: 'icono banner-icono' }),
    crear('span', { clase: 'banner-titulo', texto: TEXTO_NIVEL[nivel] + ':' }),
    crear('span', { clase: 'banner-cuenta', texto: cuenta }),
    crear('span', { clase: 'banner-texto', texto: alerta.mensaje }),
    mostrarEnlace ? crear('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Ver entregas' }) : null
  );
  return caja;
}

// --------------------------------------------------- aviso de privacidad (§9)

export function bloquePrivacidad() {
  return crear('details', { clase: 'privacidad' }, [
    crear('summary', { texto: 'Dónde se guardan estos datos' }),
    crear('div', { clase: 'privacidad-cuerpo' }, [
      crear('p', {
        texto: 'Todo lo que escribes se guarda únicamente en este navegador y en ' +
          'este dispositivo. No se envía a ningún servidor: la aplicación funciona ' +
          'sin internet y no tiene a dónde mandar nada.'
      }),
      crear('p', {
        texto: 'Eso también significa que se pierde si borras los datos de ' +
          'navegación, si usas una ventana de incógnito o si abres la página en ' +
          'otro equipo. Exporta un respaldo cada cierto tiempo.'
      }),
      crear('p', {
        texto: 'El archivo de respaldo contiene nombres, números de documento y el ' +
          'registro de asistencia de personas reales. No lo compartas por WhatsApp ' +
          'ni por correo sin cifrar.'
      })
    ])
  ]);
}

// -------------------------------------------------- barra de datos (respaldos)

export function barraDatos({ alImportar, alBorrar }) {
  const entrada = crear('input', {
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

  return crear('div', { clase: 'barra-datos' }, [
    crear('button', {
      type: 'button', clase: 'boton secundario',
      onclick: () => exportarTodo(), texto: 'Exportar respaldo'
    }),
    crear('label', { clase: 'boton secundario', for: 'importar-archivo', texto: 'Importar respaldo' }),
    entrada,
    crear('button', {
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

  const resumen = crear('p', { clase: 'panel-resumen' });
  if (hallazgos.length === 0) {
    resumen.append(crear('span', { clase: 'pastilla ok' }, [
      icono('ok', { tam: 14 }), ' Sin observaciones'
    ]));
  } else {
    if (errores.length) {
      resumen.append(crear('span', { clase: 'pastilla error' }, [
        icono('error', { tam: 14 }),
        ` ${errores.length} error${errores.length === 1 ? '' : 'es'}`
      ]));
    }
    if (avisos.length) {
      resumen.append(crear('span', { clase: 'pastilla advertencia' }, [
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
  const lista = crear('ul', { clase: 'panel-lista' });
  for (const hall of [...errores, ...avisos]) {
    const item = crear('li', { clase: `panel-item ${hall.severidad}` }, [
      icono(ICONO_HALLAZGO[hall.severidad], { tam: 15, clase: 'icono panel-icono' }),
      crear('span', { clase: 'panel-tipo', texto: hall.severidad === 'error' ? 'Error:' : 'Advertencia:' }),
      crear('span', { clase: 'panel-mensaje', texto: ' ' + hall.mensaje })
    ]);
    if (alIrA) {
      item.append(crear('button', {
        type: 'button', clase: 'enlace-ir',
        texto: 'Ir al dato',
        onclick: () => alIrA(hall.campo)
      }));
    }
    lista.append(item);
  }

  if (!muchos) { contenedor.append(lista); return; }
  contenedor.append(crear('details', { clase: 'panel-detalle' }, [
    crear('summary', { texto: `Ver qué falta (${hallazgos.length})` }),
    lista
  ]));
}

/** Marca o limpia un campo con problema. No toca su valor. */
export function marcarCampo(elemento, hallazgos) {
  if (!elemento) return;
  const propios = hallazgos || [];
  const error = propios.some((x) => x.severidad === 'error');
  elemento.classList.toggle('con-error', error);
  elemento.classList.toggle('con-aviso', !error && propios.length > 0);
  if (elemento.matches('input, select, textarea')) {
    elemento.setAttribute('aria-invalid', error ? 'true' : 'false');
  }
}

// ---------------------------------------------- sugerencias (AGENTS.md §2)

/**
 * Muestra una propuesta FUERA del campo. No la escribe: solo deja un botón.
 * Al aceptarla, el campo queda marcado como "propuesto" hasta que se edite.
 */
export function cajaSugerencia(propuesta, alAceptar) {
  if (!propuesta) return null;
  return crear('p', { clase: 'sugerencia' }, [
    crear('span', { clase: 'sugerencia-etiqueta', texto: 'Sugerencia' }),
    crear('span', { clase: 'sugerencia-valor', texto: String(propuesta.valor) }),
    crear('span', { clase: 'sugerencia-proc', texto: propuesta.procedencia }),
    crear('button', {
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
  contenedor.append(crear('div', { clase: 'aviso-sistema', role: 'alert' },
    avisos.map((a) => crear('p', {}, [icono('aviso', { tam: 15 }), ' ' + a]))));
}

export { leer, guardar, CLAVES };
