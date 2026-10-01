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

const PAGINAS = [
  { href: './asistencia.html', texto: 'Asistencia', clave: 'asistencia' },
  { href: './padron.html', texto: 'Padrón', clave: 'padron' },
  { href: './index.html', texto: 'Formato B-1', clave: 'b1' },
  { href: './calendario.html', texto: 'Entregas', clave: 'calendario' },
  { href: './pruebas.html', texto: 'Pruebas', clave: 'pruebas' }
];

export function montarCabecera(claveActiva, subtitulo) {
  const nav = crear('nav', { clase: 'nav', 'aria-label': 'Secciones' },
    PAGINAS.map((p) => crear('a', {
      href: p.href,
      clase: p.clave === claveActiva ? 'nav-enlace activo' : 'nav-enlace',
      'aria-current': p.clave === claveActiva ? 'page' : null,
      texto: p.texto
    })));
  const cab = crear('header', { clase: 'cabecera' }, [
    crear('div', { clase: 'cabecera-titulo' }, [
      crear('h1', { texto: 'Rendición B-1' }),
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
      crear('span', { clase: 'banner-icono', 'aria-hidden': 'true', texto: '◷' }),
      crear('span', { clase: 'banner-texto', texto: alerta.mensaje }),
      mostrarEnlace ? crear('a', { clase: 'banner-enlace', href: './calendario.html', texto: 'Configurar entregas' }) : null
    );
    return caja;
  }

  const cuenta = alerta.diasRestantes < 0
    ? `${Math.abs(alerta.diasRestantes)} día(s) de atraso`
    : alerta.diasRestantes === 0 ? 'hoy' : `faltan ${alerta.diasRestantes} día(s)`;

  caja.append(
    crear('span', { clase: 'banner-icono', 'aria-hidden': 'true', texto: nivel === 'vencida' ? '⚠' : '◷' }),
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

const ICONOS = { error: '✕', advertencia: '!' };

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
    resumen.append(crear('span', { clase: 'pastilla ok', texto: '✓ Sin observaciones' }));
  } else {
    if (errores.length) {
      resumen.append(crear('span', {
        clase: 'pastilla error',
        texto: `✕ ${errores.length} error${errores.length === 1 ? '' : 'es'}`
      }));
    }
    if (avisos.length) {
      resumen.append(crear('span', {
        clase: 'pastilla advertencia',
        texto: `! ${avisos.length} advertencia${avisos.length === 1 ? '' : 's'}`
      }));
    }
  }
  contenedor.append(resumen);

  if (hallazgos.length === 0) return;

  const lista = crear('ul', { clase: 'panel-lista' });
  for (const hall of [...errores, ...avisos]) {
    const item = crear('li', { clase: `panel-item ${hall.severidad}` }, [
      crear('span', { clase: 'panel-icono', 'aria-hidden': 'true', texto: ICONOS[hall.severidad] }),
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
  contenedor.append(lista);
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
    avisos.map((a) => crear('p', { texto: '⚠ ' + a }))));
}

export { leer, guardar, CLAVES };
