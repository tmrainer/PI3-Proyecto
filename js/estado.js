// estado.js — los datos en memoria y su persistencia, compartidos por las
// páginas que los usan. No dibuja nada. Ver AGENTS.md §4.6.

import {
  CLAVES, leer, guardar, debounce, hoyIso,
  padronVacio, migrarPadron, configVacia, calendarioVacio, VERSION_PADRON
} from './modelo.js';

/**
 * Objeto mutable y único. Se accede como `estado.padron`, nunca se desestructura,
 * para que la migración o una importación puedan reemplazar el objeto entero sin
 * dejar referencias viejas colgando.
 */
export const estado = {
  padron: null,
  config: null,
  calendario: null
};

export function cargar() {
  let p = leer(CLAVES.padron, padronVacio());
  if (p.version !== VERSION_PADRON) p = migrarPadron(p);
  if (!Array.isArray(p.afiliados)) p.afiliados = [];
  if (!Array.isArray(p.atenciones)) p.atenciones = [];
  estado.padron = p;
  estado.config = Object.assign(configVacia(), leer(CLAVES.config, {}));
  estado.calendario = leer(CLAVES.calendario, calendarioVacio());
  return estado;
}

let avisarGuardado = () => {};

/** La página dice dónde mostrar el «Guardado». */
export function alGuardar(fn) { avisarGuardado = fn || (() => {}); }

// Hay un cambio pedido con guardarPronto() que todavía no llegó a escribirse.
let pendiente = false;

function escribir() {
  pendiente = false;
  guardar(CLAVES.padron, estado.padron);
  guardar(CLAVES.config, estado.config);
}

const guardarDiferido = debounce(() => {
  if (pendiente) escribir();      // si no, ya lo escribió guardarYa()
  avisarGuardado('Guardado en este dispositivo.');
}, 400);

/**
 * Pide guardar `estado.padron` y `estado.config` en localStorage
 * ('b1.padron.v1' y 'b1.config.v1'), 400 ms después del ÚLTIMO pedido: varios
 * toques seguidos producen una sola escritura. Al terminar avisa con el texto
 * de alGuardar().
 *
 * Es lo que llaman las páginas en cada cambio (ctx.onCambio). No guarda
 * `estado.calendario`. Si la página se oculta o se cierra antes de los 400 ms,
 * lo pendiente se escribe en ese momento (ver vigilarPestanas).
 * @returns {void}
 */
export function guardarPronto() { pendiente = true; guardarDiferido(); }

/**
 * Guarda YA `estado.padron` y `estado.config` en localStorage ('b1.padron.v1'
 * y 'b1.config.v1'), sin esperar y sin mostrar el aviso de «Guardado».
 *
 * Se usa al arrancar una página, para consolidar una migración del padrón, y
 * tras una importación. Deja sin efecto un guardarPronto pendiente: cuando se
 * cumpla su plazo solo mostrará el aviso, sin volver a escribir.
 * @returns {void}
 */
export function guardarYa() { escribir(); }

/**
 * Olvida un guardarPronto pendiente sin escribirlo. Para justo antes de
 * recargar la página tras restaurar un respaldo o borrar todo: si no, el
 * pagehide de la recarga escribiría la copia vieja encima.
 * @returns {void}
 */
export function descartarPendiente() { pendiente = false; }

/**
 * Cosas que pasan fuera de esta página y que hay que atender. Se llama una vez,
 * después de cargar().
 *
 * - Al ocultarse (cambiar de app, bloquear el celular) o cerrarse, se escribe
 *   lo pendiente de guardarPronto. Un celular puede descartar la pestaña sin
 *   avisar, y el último toque se perdería. SOLO lo pendiente: escribir siempre
 *   pisaría con una copia vieja lo que otra pestaña guardó mientras tanto.
 * - Si otra pestaña guarda el padrón, la config o el calendario, se recargan
 *   aquí y se llama a `alRecargar` para repintar. Sin esto, esta pestaña
 *   guardaría luego su copia vieja encima y borraría, por ejemplo, la
 *   asistencia marcada en la otra.
 *
 * Límite: si las dos pestañas cambian algo dentro del mismo plazo de 400 ms,
 * gana lo que guardó la otra.
 * @param {() => void} alRecargar  repinta la página con los datos recargados
 */
export function vigilarPestanas(alRecargar) {
  const escribirPendiente = () => { if (pendiente) escribir(); };
  addEventListener('pagehide', escribirPendiente);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') escribirPendiente();
  });

  const claves = [CLAVES.padron, CLAVES.config, CLAVES.calendario];
  addEventListener('storage', (e) => {
    // key null: la otra pestaña borró todo el almacenamiento.
    if (e.key !== null && !claves.includes(e.key)) return;
    pendiente = false;
    cargar();
    alRecargar();
  });
}

/** Precio vigente del menú, que se copia a cada día nuevo (AGENTS.md §2). */
export function preciosActuales() {
  return {
    precioMenuNormalCent: estado.config.precioMenuNormalCent,
    precioMenuAyudaSocialCent: estado.config.precioMenuAyudaSocialCent
  };
}

/** Periodo por defecto de los resúmenes: el mes en curso. */
export function periodoPorDefecto() {
  const hoy = hoyIso();
  return { inicio: hoy.slice(0, 8) + '01', fin: hoy };
}
