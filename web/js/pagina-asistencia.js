// pagina-asistencia.js — controlador de asistencia.html (pasar lista).
// Solo cablea: la interfaz vive en ui-asistencia.js, los cálculos en calculos.js.

import { hoyIso, aCentimos, formatearSoles, nuevaAtencion, fechaLarga, debounce } from './modelo.js';
import { resumenEconomicoRaciones } from './calculos.js';
import { botonesExportar, selloAhora, nombreDelCentro } from './ui-reportes.js';
import { validarAtenciones, validarPreciosMenu } from './validaciones.js';
import {
  estado, cargar, alGuardar, guardarPronto, guardarYa, preciosActuales, hoySigueAlPrecio, periodoPorDefecto, vigilarPestanas
} from './estado.js';
import { pintarAsistenciaDeHoy, pintarOtrosDias } from './ui-asistencia.js';
import {
  buscar, crearElemento, montarCabecera,
  pintarAvisosAlmacenamiento, aplicarHallazgos, irACampo, avisarAlSalirDelCampo,
  repintarConservandoVista, chip, pantallaEncendidaMientrasSeUsa, mostrarGuardado
} from './ui.js';

cargar();
alGuardar(mostrarGuardado);

const periodo = periodoPorDefecto();

const ctx = {
  fechaRef: hoyIso(),
  titulo: null,
  onCambio: () => { guardarPronto(); refrescarPronto(); },
  onRepintar: () => { guardarPronto(); repintar(); },
  onResumen: () => refrescarPronto(),
  // Llegaron datos por QR (ya guardados): se vuelven a leer y se repinta todo.
  onDatosNuevos: () => { cargar(); repintarConservandoVista(() => { pintarPrecios(); repintar(); }); }
};

// Un toque debe verse marcado AL INSTANTE: el resumen del periodo y la
// revisión de todos los días van después, una sola vez aunque se pidan
// varias (onCambio y onResumen llegan juntos en cada toque).
let refrescoPendiente = 0;
function refrescarPronto() {
  if (refrescoPendiente) return;
  refrescoPendiente = setTimeout(() => { refrescoPendiente = 0; refrescar(); }, 0);
}

function refrescar() {
  clearTimeout(refrescoPendiente);
  refrescoPendiente = 0;
  const r = resumenEconomicoRaciones(estado.padron, periodo.inicio, periodo.fin);
  const caja = buscar('#resumen-raciones');
  caja.textContent = '';
  caja.append(
    chip(`Raciones`, `${r.racionesTotales}`),
    chip(`Normales`, `${r.racionesNormales}`),
    chip(`Ayuda social`, `${r.racionesAyudaSocial}`)
  );
  if (r.recaudacionCent !== null) {
    caja.append(
      chip(`Recaudado`, `S/ ${formatearSoles(r.recaudacionCent)}`),
      chip(`Promedio por ración`, `S/ ${formatearSoles(r.precioPromedioRacionCent)}`)
    );
  }

  // Solo se explica lo que no se ve en las cifras: cuando falta algo.
  const partes = [];
  if (r.racionesTotales === 0) {
    partes.push('Nadie marcado en estas fechas.');
  } else if (r.recaudacionCent === null) {
    partes.push('Falta el precio del menú: sin él no se calcula lo recaudado.');
  } else if (r.racionesConPrecio < r.racionesTotales) {
    const sin = r.racionesTotales - r.racionesConPrecio;
    partes.push(`${sin === 1 ? '1 ración no tiene' : `${sin} raciones no tienen`} precio y no cuenta${sin === 1 ? '' : 'n'} en el promedio.`);
  }
  if (r.diasDeLegado) {
    partes.push(`${r.diasDeLegado === 1 ? '1 día trae' : `${r.diasDeLegado} días traen`} raciones anotadas a mano en la versión anterior.`);
  }
  buscar('#nota-precio').textContent = partes.join(' ');

  validarPronto();
}

// Revisar todos los días es lo más caro de un toque (con un año de días, más
// que marcar en sí): se hace cuando se deja de tocar, una vez por tanda.
const validarPronto = debounce(() => validar(), 600);

function validar() {
  const hallazgos = validarAtenciones(estado.padron)
    .concat(validarPreciosMenu(estado.config, estado.padron.atenciones.length > 0));
  aplicarHallazgos(buscar('#panel'), hallazgos, (c) => irACampo(c));
}

function repintar() {
  pintarAsistenciaDeHoy(buscar('#hoy'), ctx);
  pintarOtrosDias(buscar('#lista-atenciones'), ctx);
  refrescar();
}

// ------------------------------------------------------------------- arranque

montarCabecera('asistencia', fechaLarga(hoyIso()));
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));
pantallaEncendidaMientrasSeUsa();

ctx.titulo = buscar('#titulo-hoy');

// La próxima entrega la dicen el Inicio, Entregas y el B-1: aquí, mientras se
// pasa lista, sería una franja más encima de la lista.

const fIni = buscar('#periodoInicio');
const fFin = buscar('#periodoFin');
fIni.value = periodo.inicio;
fFin.value = periodo.fin;
fIni.addEventListener('input', () => { periodo.inicio = fIni.value || periodo.inicio; refrescar(); });
fFin.addEventListener('input', () => { periodo.fin = fFin.value || periodo.fin; refrescar(); });
const datosAsistencia = () => ({ inicio: periodo.inicio, fin: periodo.fin, centro: nombreDelCentro() });
botonesExportar(buscar('#exportar-asistencia'), {
  // PDF y Excel se cargan al tocar: abrir Asistencia no los espera.
  pdf: async () => ({
    bytes: (await import('./pdf-reportes.js')).pdfDeAsistencia(estado.padron, { ...datosAsistencia(), generado: selloAhora() }),
    nombre: `Asistencia ${periodo.inicio} a ${periodo.fin}`, titulo: 'Asistencia (copia de referencia)'
  }),
  excel: async () => ({
    bytes: (await import('./excel-reportes.js')).excelDeAsistencia(estado.padron, datosAsistencia()),
    nombre: `Asistencia ${periodo.inicio} a ${periodo.fin}`, titulo: 'Asistencia'
  })
});

const CAMPOS_PRECIO = [['precioNormal', 'precioMenuNormalCent'], ['precioAyuda', 'precioMenuAyudaSocialCent']];
function pintarPrecios() {
  for (const [id, prop] of CAMPOS_PRECIO) buscar('#' + id).value = formatearSoles(estado.config[prop]);
}
// El precio se copia a cada día al crearlo y los días anteriores guardan el
// suyo (un aumento en octubre no reescribe lo recaudado en setiembre). El de
// HOY sí sigue al de arriba mientras no se le haya puesto un precio propio:
// quien cambia el precio, lo cambia para hoy.
const repintarHoy = debounce(() => ctx.onRepintar(), 400);
for (const [id, prop] of CAMPOS_PRECIO) {
  const el = buscar('#' + id);
  el.addEventListener('input', () => {
    estado.config[prop] = aCentimos(el.value);
    if (hoySigueAlPrecio()) repintarHoy();
    ctx.onCambio();
  });
}
pintarPrecios();

buscar('#agregar-atencion').addEventListener('click', () => {
  const at = nuevaAtencion(preciosActuales());
  // Sin fecha: el de hoy ya tiene su sección arriba (sin campo de fecha), y
  // otro día «de hoy» no se veía en ninguna de las dos listas. La fecha la
  // pone la persona: la ficha se abre con el cursor ahí.
  at.fecha = '';
  estado.padron.atenciones.push(at);
  ctx.onRepintar();
  const caja = document.getElementById(`ficha-${at.id}`);
  if (caja) {
    caja.open = true;
    caja.scrollIntoView({ block: 'center' });
    // El cuerpo de la ficha se arma al abrirse (evento toggle, que llega después).
    setTimeout(() => {
      const fecha = caja.querySelector('input[type="date"]');
      if (fecha) fecha.focus({ preventScroll: true });
    }, 0);
  }
});

repintar();
// Consolida la migración del padrón si la hubo. Cuando el teléfono queda libre:
// no hace falta para ver la pantalla, y escribir el padrón entero cuesta.
(window.requestIdleCallback || setTimeout)(() => guardarYa(), { timeout: 2000 });
vigilarPestanas(() => repintarConservandoVista(() => { pintarPrecios(); repintar(); }));

avisarAlSalirDelCampo(validar);
