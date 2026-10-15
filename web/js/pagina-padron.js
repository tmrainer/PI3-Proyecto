// pagina-padron.js — controlador de padron.html.
// Solo cablea: la interfaz vive en ui-personas.js, ui-importar.js y ui-reportes.js.
// La inscripción por código de barras del DNI no se muestra hasta que funcione
// (escaneo-dni.js es todavía un esqueleto).

import { hoyIso, cuantos } from './modelo.js';
import { validarAfiliados } from './validaciones.js';
import {
  estado, cargar, alGuardar, guardarPronto, guardarYa, periodoPorDefecto,
  vigilarPestanas
} from './estado.js';
import {
  montarAltaPersona, pintarListaPersonas, pintarResumenEtario, montarFiltrosPersonas, elegirFiltro
} from './ui-personas.js';
import { montarImportacion } from './ui-importar.js';
import { pintarReportePadron, montarControlesReporte } from './ui-reportes.js';
import {
  buscar, montarCabecera,
  pintarAvisosAlmacenamiento, aplicarHallazgos, irACampo, avisarAlSalirDelCampo,
  repintarConservandoVista, mostrarGuardado, crearElemento, icono
} from './ui.js';

cargar();
alGuardar(mostrarGuardado);

const periodo = periodoPorDefecto();

const ctx = {
  fechaRef: hoyIso(),
  busqueda: '',
  filtro: 'activos',
  conteo: null,
  inicio: periodo.inicio,
  fin: periodo.fin,
  estadoTexto: null,
  onCambio: () => { guardarPronto(); refrescar(); },
  onRepintar: () => { guardarPronto(); repintar(); }
};

function validar() {
  const hallazgos = validarAfiliados(estado.padron);
  aplicarHallazgos(buscar('#panel'), hallazgos, (c) => irACampo(c, {
    antesDeBuscar: () => {        // puede estar oculta por el filtro o la búsqueda
      ctx.busqueda = '';
      buscar('#buscarAfiliado').value = '';
      elegirFiltro(buscar('#lista-afiliados'), ctx, 'todas');
    }
  }));
}

// El reporte va al final de la página y, con cientos de personas, es la mitad
// de lo que hay en pantalla. En un padrón grande se arma recién cuando se baja
// hasta él (y desde entonces, con cada cambio).
let reporteALaVista = estado.padron.afiliados.length <= 60;
function pintarReporte() {
  if (reporteALaVista) pintarReportePadron(buscar('#reporte-padron'), ctx);
}
if (!reporteALaVista) {
  const mirar = new IntersectionObserver((vistas) => {
    if (!vistas.some((v) => v.isIntersecting)) return;
    mirar.disconnect();
    reporteALaVista = true;
    pintarReporte();
  }, { rootMargin: '800px 0px' });
  mirar.observe(buscar('#reporte-padron'));
}

function refrescar() {
  pintarResumenEtario(buscar('#resumen-etario'), ctx);
  pintarReporte();
  validar();
}

function repintar() {
  pintarListaPersonas(buscar('#lista-afiliados'), ctx);
  refrescar();
}

// ------------------------------------------------------------------- arranque

montarCabecera('padron', cuantos(estado.padron.afiliados.length, 'persona'));
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));

ctx.conteo = buscar('#conteo-afiliados');
ctx.estadoTexto = buscar('#estado-guardado');

// La próxima entrega la dicen el Inicio, Entregas y el B-1.

const fRef = buscar('#fechaRef');
fRef.value = ctx.fechaRef;
fRef.addEventListener('input', () => { ctx.fechaRef = fRef.value || hoyIso(); repintar(); });

montarFiltrosPersonas(buscar('#lista-afiliados'), ctx);
montarControlesReporte(ctx, refrescar);

montarAltaPersona(ctx);
// Inscribir es de vez en cuando; consultar la lista, de todos los días. El alta
// va plegada en una línea arriba, salvo cuando todavía no hay nadie.
buscar('#bloque-alta').open = estado.padron.afiliados.length === 0;

// Inscribir, a un toque desde cualquier punto de la lista (y desde el Inicio,
// que llega con #inscribir).
function abrirInscripcion() {
  const alta = buscar('#bloque-alta');
  alta.open = true;
  alta.scrollIntoView({ block: 'start' });
  const primero = buscar('#altaPaterno');
  if (primero) primero.focus({ preventScroll: true });
}
document.body.classList.add('con-fab');
document.body.append(crearElemento('button', {
  type: 'button', clase: 'fab', 'aria-label': 'Inscribir a una persona', onclick: abrirInscripcion
}, [icono('mas', { tam: 26 }), crearElemento('span', { texto: 'Inscribir' })]));
if (location.hash === '#inscribir') abrirInscripcion();
addEventListener('hashchange', () => { if (location.hash === '#inscribir') abrirInscripcion(); });
montarImportacion(ctx);
repintar();
// Consolida la migración del padrón si la hubo. Cuando el teléfono queda libre:
// no hace falta para ver la pantalla, y escribir el padrón entero cuesta.
(window.requestIdleCallback || setTimeout)(() => guardarYa(), { timeout: 2000 });
vigilarPestanas(() => repintarConservandoVista(repintar));

avisarAlSalirDelCampo(validar);
