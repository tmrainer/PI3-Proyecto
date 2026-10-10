// pagina-padron.js — controlador de padron.html.
// Solo cablea: la interfaz vive en ui-personas.js, ui-importar.js y ui-reportes.js.

import { CLAVES, guardar, hoyIso, debounce, descargarTexto, migrarPadron } from './modelo.js';
import { resumenEtario, afiliadosActivos, TRAMOS_ETARIOS } from './calculos.js';
import { validarPadron } from './validaciones.js';
import { soportaCamaraPdf417 } from './escaneo-dni.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  estado, cargar, alGuardar, guardarPronto, guardarYa, periodoPorDefecto, vigilarPestanas
} from './estado.js';
import { montarAltaPersona, pintarListaPersonas } from './ui-personas.js';
import { montarImportacion } from './ui-importar.js';
import { pintarReportePadron, filasComoTexto } from './ui-reportes.js';
import {
  buscar, crearElemento, icono, montarCabecera, bloquePrivacidad, barraDatos, bannerAlerta,
  pintarAvisosAlmacenamiento, aplicarHallazgos, irACampo, avisarAlSalirDelCampo
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

function pintarResumenEtario() {
  const caja = buscar('#resumen-etario');
  caja.textContent = '';
  // Una fila de ceros no informa de nada.
  const vacio = estado.padron.afiliados.length === 0;
  buscar('#buscarAfiliado').closest('.rejilla').hidden = vacio;
  buscar('#conteo-afiliados').hidden = vacio;
  if (vacio) return;

  const conteo = resumenEtario(estado.padron, ctx.fechaRef);
  caja.append(crearElemento('span', {
    clase: 'chip', html: `Activas: <b>${afiliadosActivos(estado.padron, ctx.fechaRef).length}</b>`
  }));
  for (const t of TRAMOS_ETARIOS) {
    caja.append(crearElemento('span', { clase: 'chip', html: `${t.etiqueta}: <b>${conteo[t.clave]}</b>` }));
  }
  if (conteo.sin_dato) {
    caja.append(crearElemento('span', { clase: 'chip', html: `Sin grupo: <b>${conteo.sin_dato}</b>` }));
  }
}

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
  pintarResumenEtario();
  pintarReportePadron(buscar('#reporte-padron'), ctx);
  validar();
}

function repintar() {
  pintarListaPersonas(buscar('#lista-afiliados'), ctx);
  refrescar();
}

async function pintarEstadoEscaneo() {
  const caja = buscar('#estado-escaneo');
  caja.textContent = '';
  caja.append(crearElemento('p', {
    texto: 'Más adelante, inscribir a una persona será escanear el código de barras ' +
      'del reverso de su DNI. Todavía no está disponible: falta conocer con certeza ' +
      'cómo vienen codificados los datos en ese código. No se va a suponer.'
  }));
  const soporta = await soportaCamaraPdf417();
  caja.append(crearElemento('div', { clase: 'resumen-chips' }, [
    crearElemento('span', { clase: 'chip' }, [
      icono(soporta ? 'ok' : 'error', { tam: 14 }),
      soporta ? ' Este navegador podría leer PDF417 con la cámara'
        : ' Este navegador no lee PDF417 con la cámara'
    ]),
    crearElemento('span', { clase: 'chip' }, [
      icono('ok', { tam: 14 }), ' Un lector de mano tipo teclado funcionará siempre'
    ])
  ]));
  caja.append(crearElemento('p', {
    clase: 'pista',
    texto: 'Cuando se active: lo leído se mostrará para que alguien lo revise antes ' +
      'de guardarlo, los campos que no se puedan leer quedarán vacíos, y la cadena ' +
      'cruda del código no se guardará en ninguna parte.'
  }));
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
    location.reload();
  },
  alBorrar: () => location.reload()
}));

ctx.conteo = buscar('#conteo-afiliados');
ctx.estadoTexto = buscar('#estado-guardado');

const b = bannerAlerta(alertaProximaEntrega(estado.calendario, hoyIso()));
if (b) buscar('#banner').append(b);

const fRef = buscar('#fechaRef');
fRef.value = ctx.fechaRef;
fRef.addEventListener('input', () => { ctx.fechaRef = fRef.value || hoyIso(); repintar(); });

const fBuscar = buscar('#buscarAfiliado');
fBuscar.addEventListener('input', debounce(() => {
  ctx.busqueda = fBuscar.value;
  pintarListaPersonas(buscar('#lista-afiliados'), ctx);
}, 150));

const fFiltro = buscar('#filtroAfiliado');
fFiltro.value = ctx.filtro;
fFiltro.addEventListener('change', () => {
  ctx.filtro = fFiltro.value;
  pintarListaPersonas(buscar('#lista-afiliados'), ctx);
});

const rIni = buscar('#repInicio');
const rFin = buscar('#repFin');
rIni.value = ctx.inicio;
rFin.value = ctx.fin;
rIni.addEventListener('input', () => { ctx.inicio = rIni.value || ctx.inicio; refrescar(); });
rFin.addEventListener('input', () => { ctx.fin = rFin.value || ctx.fin; refrescar(); });

buscar('#descargar-padron').addEventListener('click', () => {
  descargarTexto(`padron-${hoyIso()}.csv`, filasComoTexto(ctx, ','));
});

buscar('#copiar-padron').addEventListener('click', async () => {
  const texto = filasComoTexto(ctx, '\t');
  try {
    await navigator.clipboard.writeText(texto);
    buscar('#estado-guardado').textContent = 'Padrón copiado. Pégalo en tu hoja de cálculo.';
  } catch (e) {
    const area = crearElemento('textarea', { rows: '10', style: 'width:100%;margin-top:10px' });
    area.value = texto;
    buscar('#reporte-padron').append(
      crearElemento('p', { clase: 'pista', texto: 'Tu navegador no dejó copiar solo. Selecciona y copia:' }), area);
    area.select();
  }
});

montarAltaPersona(ctx);
montarImportacion(ctx);
repintar();
pintarEstadoEscaneo();
guardarYa();   // consolida la migración del padrón si la hubo
vigilarPestanas(repintar);

avisarAlSalirDelCampo(validar);
