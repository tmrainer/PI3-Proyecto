// pagina-padron.js — controlador de padron.html.
// Solo cablea: la interfaz vive en ui-personas.js, ui-importar.js, ui-reportes.js
// y ui-escaneo.js.

import { hoyIso } from './modelo.js';
import { validarAfiliados } from './validaciones.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  estado, cargar, alGuardar, guardarPronto, guardarYa, periodoPorDefecto,
  vigilarPestanas, descartarPendiente
} from './estado.js';
import {
  montarAltaPersona, pintarListaPersonas, pintarResumenEtario, montarFiltrosPersonas
} from './ui-personas.js';
import { montarImportacion } from './ui-importar.js';
import { pintarReportePadron, montarControlesReporte } from './ui-reportes.js';
import { pintarEstadoEscaneo } from './ui-escaneo.js';
import {
  buscar, montarCabecera, bloquePrivacidad, barraDatos, bannerAlerta,
  pintarAvisosAlmacenamiento, aplicarHallazgos, irACampo, avisarAlSalirDelCampo,
  repintarConservandoVista, mostrarGuardado
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
      ctx.filtro = 'todas';
      buscar('#buscarAfiliado').value = '';
      buscar('#filtroAfiliado').value = 'todas';
      pintarListaPersonas(buscar('#lista-afiliados'), ctx);
    }
  }));
}

function refrescar() {
  pintarResumenEtario(buscar('#resumen-etario'), ctx);
  pintarReportePadron(buscar('#reporte-padron'), ctx);
  validar();
}

function repintar() {
  pintarListaPersonas(buscar('#lista-afiliados'), ctx);
  refrescar();
}

// ------------------------------------------------------------------- arranque

montarCabecera('padron', 'Ollas comunes y comedores de Villa María del Triunfo');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));
buscar('#privacidad').append(bloquePrivacidad());
buscar('#barra-datos').append(barraDatos({ antesDeRecargar: descartarPendiente }));

ctx.conteo = buscar('#conteo-afiliados');
ctx.estadoTexto = buscar('#estado-guardado');

const b = bannerAlerta(alertaProximaEntrega(estado.calendario, hoyIso()));
if (b) buscar('#banner').append(b);

const fRef = buscar('#fechaRef');
fRef.value = ctx.fechaRef;
fRef.addEventListener('input', () => { ctx.fechaRef = fRef.value || hoyIso(); repintar(); });

montarFiltrosPersonas(buscar('#lista-afiliados'), ctx);
montarControlesReporte(ctx, refrescar);

montarAltaPersona(ctx);
// Inscribir es de vez en cuando; consultar la lista, de todos los días. El alta
// va plegada en una línea arriba, salvo cuando todavía no hay nadie.
buscar('#bloque-alta').open = estado.padron.afiliados.length === 0;
montarImportacion(ctx);
repintar();
pintarEstadoEscaneo(buscar('#estado-escaneo'));
guardarYa();   // consolida la migración del padrón si la hubo
vigilarPestanas(() => repintarConservandoVista(repintar));

avisarAlSalirDelCampo(validar);
