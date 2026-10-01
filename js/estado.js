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

const guardarDiferido = debounce(() => {
  guardar(CLAVES.padron, estado.padron);
  guardar(CLAVES.config, estado.config);
  avisarGuardado('Guardado en este dispositivo.');
}, 400);

export function guardarPronto() { guardarDiferido(); }

export function guardarYa() {
  guardar(CLAVES.padron, estado.padron);
  guardar(CLAVES.config, estado.config);
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
