// pagina-asistencia.js — controlador de asistencia.html (pasar lista).
// Solo cablea: la interfaz vive en ui-asistencia.js, los cálculos en calculos.js.

import { hoyIso, aCentimos, formatearSoles, nuevaAtencion, fechaLarga } from './modelo.js';
import { resumenEconomicoRaciones } from './calculos.js';
import { validarAtenciones, validarPreciosMenu } from './validaciones.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  estado, cargar, alGuardar, guardarPronto, guardarYa, preciosActuales, periodoPorDefecto, vigilarPestanas,
  descartarPendiente
} from './estado.js';
import { pintarAsistenciaDeHoy, pintarOtrosDias } from './ui-asistencia.js';
import {
  buscar, crearElemento, montarCabecera, bloquePrivacidad, barraDatos, bannerAlerta,
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
  onResumen: () => refrescarPronto()
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

  validar();
}

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
buscar('#privacidad').append(bloquePrivacidad());
buscar('#barra-datos').append(barraDatos({ antesDeRecargar: descartarPendiente }));

ctx.titulo = buscar('#titulo-hoy');

const b = bannerAlerta(alertaProximaEntrega(estado.calendario, hoyIso()), { pedirConfigurar: false });
if (b) buscar('#banner').append(b);

const fIni = buscar('#periodoInicio');
const fFin = buscar('#periodoFin');
fIni.value = periodo.inicio;
fFin.value = periodo.fin;
fIni.addEventListener('input', () => { periodo.inicio = fIni.value || periodo.inicio; refrescar(); });
fFin.addEventListener('input', () => { periodo.fin = fFin.value || periodo.fin; refrescar(); });

const CAMPOS_PRECIO = [['precioNormal', 'precioMenuNormalCent'], ['precioAyuda', 'precioMenuAyudaSocialCent']];
function pintarPrecios() {
  for (const [id, prop] of CAMPOS_PRECIO) buscar('#' + id).value = formatearSoles(estado.config[prop]);
}
for (const [id, prop] of CAMPOS_PRECIO) {
  const el = buscar('#' + id);
  el.addEventListener('input', () => { estado.config[prop] = aCentimos(el.value); ctx.onCambio(); });
}
pintarPrecios();

buscar('#agregar-atencion').addEventListener('click', () => {
  const at = nuevaAtencion(preciosActuales());
  estado.padron.atenciones.push(at);
  ctx.onRepintar();
  const caja = document.getElementById(`ficha-${at.id}`);
  if (caja) { caja.open = true; caja.scrollIntoView({ block: 'center' }); }
});

repintar();
guardarYa();   // consolida la migración del padrón si la hubo
vigilarPestanas(() => repintarConservandoVista(() => { pintarPrecios(); repintar(); }));

avisarAlSalirDelCampo(validar);
