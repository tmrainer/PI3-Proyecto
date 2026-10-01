// pagina-asistencia.js — controlador de asistencia.html.
// Solo cablea: la interfaz vive en ui-asistencia.js, los cálculos en calculos.js.

import { CLAVES, guardar, hoyIso, aCentimos, formatearSoles, nuevaAtencion } from './modelo.js';
import { resumenEconomicoRaciones } from './calculos.js';
import { validarPadron, validarPreciosMenu } from './validaciones.js';
import { alertaProximaEntrega } from './alertas.js';
import { estado, cargar, alGuardar, guardarPronto, guardarYa, preciosActuales, periodoPorDefecto } from './estado.js';
import { pintarAsistenciaDeHoy, pintarOtrosDias } from './ui-asistencia.js';
import {
  $, crear, montarCabecera, bloquePrivacidad, barraDatos, bannerAlerta,
  pintarAvisosAlmacenamiento, aplicarHallazgos, irACampo
} from './ui.js';

cargar();
alGuardar((t) => { $('#estado-guardado').textContent = t; });

const periodo = periodoPorDefecto();

const ctx = {
  fechaRef: hoyIso(),
  titulo: null,
  onCambio: () => { guardarPronto(); refrescar(); },
  onRepintar: () => { guardarPronto(); repintar(); },
  onResumen: () => refrescar()
};

function refrescar() {
  const r = resumenEconomicoRaciones(estado.padron, periodo.inicio, periodo.fin);
  const caja = $('#resumen-raciones');
  caja.textContent = '';
  caja.append(
    crear('span', { clase: 'chip', html: `Raciones: <b>${r.racionesTotales}</b>` }),
    crear('span', { clase: 'chip', html: `Normales: <b>${r.racionesNormales}</b>` }),
    crear('span', { clase: 'chip', html: `Ayuda social: <b>${r.racionesAyudaSocial}</b>` })
  );
  if (r.recaudacionCent !== null) {
    caja.append(
      crear('span', { clase: 'chip', html: `Recaudado: <b>S/ ${formatearSoles(r.recaudacionCent)}</b>` }),
      crear('span', { clase: 'chip', html: `Promedio por ración: <b>S/ ${formatearSoles(r.precioPromedioRacionCent)}</b>` })
    );
  }

  const partes = [];
  if (r.racionesTotales === 0) {
    partes.push('No hay raciones en este periodo: nadie está marcado en la asistencia.');
  } else if (r.recaudacionCent === null) {
    partes.push('Todavía no se puede calcular el promedio: falta el precio del menú ' +
      'en los días registrados. La aplicación no lo estima.');
  } else {
    partes.push(`Promedio ponderado sobre ${r.racionesConPrecio} de ${r.racionesTotales} raciones.`);
    if (r.diasSinPrecio) partes.push(`${r.diasSinPrecio} día(s) fuera por falta de precio.`);
  }
  if (r.diasDeLegado) {
    partes.push(`${r.diasDeLegado} día(s) traen raciones anotadas a mano en la versión anterior.`);
  }
  $('#nota-precio').textContent = partes.join(' ');

  validar();
}

function validar() {
  const hallazgos = validarPadron(estado.padron)
    .filter((x) => x.campo.startsWith('atencion.') || x.campo.startsWith('precio.'))
    .concat(validarPreciosMenu(estado.config));
  aplicarHallazgos($('#panel'), hallazgos, (c) => irACampo(c));
}

function repintar() {
  pintarAsistenciaDeHoy($('#hoy'), ctx);
  pintarOtrosDias($('#lista-atenciones'), ctx);
  refrescar();
}

// ------------------------------------------------------------------- arranque

montarCabecera('asistencia', 'Pasar lista y contar raciones');
pintarAvisosAlmacenamiento($('#avisos-sistema'));
$('#privacidad').append(bloquePrivacidad());
$('#barra-datos').append(barraDatos({
  alImportar: (datos) => {
    if (!datos || !datos.padron) { alert('El archivo no contiene un padrón.'); return; }
    if (!confirm('Importar reemplazará el padrón que tienes ahora. ¿Continuar?')) return;
    guardar(CLAVES.padron, datos.padron);
    if (datos.config) guardar(CLAVES.config, datos.config);
    location.reload();
  },
  alBorrar: () => location.reload()
}));

ctx.titulo = $('#titulo-hoy');

const b = bannerAlerta(alertaProximaEntrega(estado.calendario, hoyIso()));
if (b) $('#banner').append(b);

const fIni = $('#periodoInicio');
const fFin = $('#periodoFin');
fIni.value = periodo.inicio;
fFin.value = periodo.fin;
fIni.addEventListener('input', () => { periodo.inicio = fIni.value || periodo.inicio; refrescar(); });
fFin.addEventListener('input', () => { periodo.fin = fFin.value || periodo.fin; refrescar(); });

for (const [id, prop] of [['precioNormal', 'precioMenuNormalCent'], ['precioAyuda', 'precioMenuAyudaSocialCent']]) {
  const el = $('#' + id);
  el.value = formatearSoles(estado.config[prop]);
  el.addEventListener('input', () => { estado.config[prop] = aCentimos(el.value); ctx.onCambio(); });
}

$('#agregar-atencion').addEventListener('click', () => {
  const at = nuevaAtencion(preciosActuales());
  estado.padron.atenciones.push(at);
  ctx.onRepintar();
  const caja = document.getElementById(`ficha-${at.id}`);
  if (caja) { caja.open = true; caja.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});

repintar();
guardarYa();   // consolida la migración del padrón si la hubo
