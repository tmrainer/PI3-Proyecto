// ui-reportes.js — exportar: los mismos dos botones, «PDF» y «Excel», en
// Asistencia, Padrón y B-1. Nada se muestra antes en pantalla: el archivo se
// arma al tocar y va al menú «Compartir» del teléfono (o a Descargas).
// Solo ordena y suma lo ya ingresado: no completa ni deduce ningún dato.

import { hoyIso, aDdMmAa, CLAVES, leer } from './modelo.js';
import { compartirArchivo } from './compartir-archivo.js';
import { estado } from './estado.js';
import { buscar, crearElemento, icono, avisoAbajo } from './ui.js';

const FORMATOS = {
  pdf: { texto: 'Exportar en PDF', tipo: 'application/pdf', ext: 'pdf', nombre: 'PDF' },
  excel: { texto: 'Exportar en Excel', tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx', nombre: 'Excel' }
};

/**
 * Los dos botones de exportar, iguales en todas las pantallas. Cada función
 * arma el archivo al tocar (puede ser async: así lo que arma el PDF o el
 * Excel se carga recién entonces y no demora abrir la pantalla). Devuelve
 * { bytes, nombre (sin extensión), titulo, alEntregar? }, o null si no se
 * puede (y ya dijo por qué).
 * @param {HTMLElement} caja
 * @param {{pdf: () => ?object, excel: () => ?object}} armar
 */
export function botonesExportar(caja, armar) {
  caja.textContent = '';
  caja.classList.add('acciones', 'exportar');
  for (const formato of ['pdf', 'excel']) {
    const f = FORMATOS[formato];
    caja.append(crearElemento('button', {
      type: 'button', clase: 'boton secundario', id: `exportar-${formato}`,
      onclick: () => entregar(armar[formato], f)
    }, [icono('archivo', { tam: 20 }), f.texto]));
  }
}

async function entregar(armar, f) {
  let a;
  try { a = await armar(); } catch (e) { avisoAbajo('No se pudo armar el archivo. Inténtalo de nuevo.'); return; }
  if (!a) return;
  // El nombre, solo con letras sin tilde, números, guion y punto: así lo acepta
  // Android y se lee bien en WhatsApp.
  const nombre = a.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 70) + '.' + f.ext;
  try {
    const r = await compartirArchivo({ nombre, tipo: f.tipo, bytes: a.bytes, titulo: a.titulo });
    if (r === 'cancelado') return;
    if (r === 'descargado') avisoAbajo(`${f.nombre} descargado.`);
    if (a.alEntregar) a.alEntregar(r);
  } catch (e) {
    avisoAbajo('No se pudo abrir el menú para guardar o compartir el archivo.');
  }
}

// ------------------------------------------------------------- el padrón

/**
 * Exportar el padrón: las fechas de los días asistidos y los dos botones.
 * Las personas son las activas a ctx.fechaRef («Edades a la fecha», arriba).
 * @param {{fechaRef: string, inicio: string, fin: string}} ctx
 */
export function montarExportarPadron(ctx) {
  const rIni = buscar('#repInicio');
  const rFin = buscar('#repFin');
  rIni.value = ctx.inicio;
  rFin.value = ctx.fin;
  rIni.addEventListener('input', () => { ctx.inicio = rIni.value || ctx.inicio; });
  rFin.addEventListener('input', () => { ctx.fin = rFin.value || ctx.fin; });

  const datos = () => ({ fechaRef: ctx.fechaRef, inicio: ctx.inicio, fin: ctx.fin, centro: nombreDelCentro() });
  const vacio = () => {
    if (estado.padron.afiliados.length) return false;
    avisoAbajo('El padrón está vacío: inscribe a alguien primero.');
    return true;
  };
  botonesExportar(buscar('#exportar-padron'), {
    pdf: async () => (vacio() ? null : {
      bytes: (await import('./pdf-reportes.js')).pdfDelPadron(estado.padron, { ...datos(), generado: selloAhora() }),
      nombre: `Padron ${hoyIso()}`, titulo: 'Padrón (copia de referencia)'
    }),
    excel: async () => (vacio() ? null : {
      bytes: (await import('./excel-reportes.js')).excelDelPadron(estado.padron, datos()), nombre: `Padron ${hoyIso()}`, titulo: 'Padrón'
    })
  });
}

// ------------------------------------------------------------- comunes

const dos = (n) => String(n).padStart(2, '0');

/** «15-10-26 01:10»: cuándo se generó, para el aviso de cada hoja. */
export function selloAhora(d = new Date()) {
  return `${aDdMmAa(`${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** El nombre del centro que se escribió en el último B-1, si hay. */
export function nombreDelCentro() {
  const c = leer(CLAVES.config, {}).ultimoCentro;
  return String((c && c.nombreCentro) || '').trim();
}
