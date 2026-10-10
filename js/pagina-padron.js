// pagina-padron.js — controlador de padron.html.
// Solo cablea: la interfaz vive en ui-personas.js, ui-importar.js, ui-reportes.js
// y ui-escaneo.js.

import { CLAVES, guardar, hoyIso, migrarPadron } from './modelo.js';
import { validarPadron } from './validaciones.js';
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
  repintarConservandoVista
} from './ui.js';

cargar();
alGuardar((t) => { buscar('#estado-guardado').textContent = t; });

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
  const hallazgos = validarPadron(estado.padron).filter((x) => x.campo.startsWith('afiliado.'));
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
buscar('#barra-datos').append(barraDatos({
  alImportar: (datos) => {
    const entrante = datos && datos.padron;
    if (!entrante || !Array.isArray(entrante.afiliados)) {
      alert('El archivo no contiene un padrón. No se cambió nada.');
      return;
    }
    if (!confirm('Importar reemplazará el padrón que tienes ahora. ¿Continuar?')) return;
    guardar(CLAVES.padron, migrarPadron(entrante));
    if (datos.config) guardar(CLAVES.config, datos.config);
    descartarPendiente();
    location.reload();
  },
  alBorrar: () => { descartarPendiente(); location.reload(); }
}));

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
montarImportacion(ctx);
repintar();
pintarEstadoEscaneo(buscar('#estado-escaneo'));
guardarYa();   // consolida la migración del padrón si la hubo
vigilarPestanas(() => repintarConservandoVista(repintar));

avisarAlSalirDelCampo(validar);
