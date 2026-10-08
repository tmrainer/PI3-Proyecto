// pagina-calendario.js — entregas del formato y cuenta regresiva.

import {
  CLAVES, leer, guardar, calendarioVacio, nuevaEntrega, aDdMmAa, hoyIso, debounce, esIso
} from './modelo.js';
import { alertaProximaEntrega, agendaEntregas, PERIODICIDADES } from './alertas.js';
import { validarCalendario } from './validaciones.js';
import {
  $, crear, montarCabecera, bloquePrivacidad, barraDatos, pintarPanel,
  marcarCampo, bannerAlerta, pintarAvisosAlmacenamiento, avisarAlSalirDelCampo
} from './ui.js';

let calendario = leer(CLAVES.calendario, calendarioVacio());
if (!Array.isArray(calendario.entregas)) calendario.entregas = [];
if (!Array.isArray(calendario.diasDeAviso)) calendario.diasDeAviso = [7, 3, 1];

const guardarDiferido = debounce(() => {
  guardar(CLAVES.calendario, calendario);
  $('#estado-guardado').textContent = 'Guardado en este dispositivo.';
}, 400);

function cambio() {
  guardarDiferido();
  pintarBanner();
  pintarAgenda();
  refrescarValidacion();
}

function pintarBanner() {
  const caja = $('#banner');
  caja.textContent = '';
  const b = bannerAlerta(alertaProximaEntrega(calendario, hoyIso()), { mostrarEnlace: false });
  if (b) caja.append(b);
}

const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente',
  entregada: 'Entregada',
  observada: 'Observada',
  conforme: 'Conforme'
};

function registroDe(fechaLimite) {
  let reg = calendario.entregas.find((e) => e.fechaLimite === fechaLimite);
  if (!reg) {
    reg = nuevaEntrega(fechaLimite);
    calendario.entregas.push(reg);
  }
  return reg;
}

function pintarAgenda() {
  const caja = $('#agenda');
  caja.textContent = '';

  if (!esIso(calendario.fechaLimiteBase)) {
    caja.append(crear('p', {
      clase: 'vacio-mensaje',
      texto: 'Indica arriba una fecha de entrega que conozcas y aquí aparecerán las siguientes.'
    }));
    return;
  }

  const lista = crear('ul', { clase: 'agenda' });
  for (const item of agendaEntregas(calendario, hoyIso(), 6)) {
    const reg = calendario.entregas.find((e) => e.fechaLimite === item.fechaLimite);
    const estado = reg ? reg.estado : 'pendiente';

    const texto = item.diasRestantes < 0
      ? `hace ${Math.abs(item.diasRestantes)} día(s)`
      : item.diasRestantes === 0 ? 'es hoy'
        : `faltan ${item.diasRestantes} día(s)`;

    const selEstado = crear('select', {}, Object.entries(ETIQUETA_ESTADO)
      .map(([v, t]) => crear('option', { value: v, texto: t })));
    selEstado.value = estado;
    selEstado.addEventListener('change', () => {
      registroDe(item.fechaLimite).estado = selEstado.value;
      cambio();
    });

    lista.append(crear('li', { clase: `agenda-item ${item.nivel}` }, [
      crear('span', { clase: 'agenda-fecha', texto: aDdMmAa(item.fechaLimite) }),
      crear('span', { clase: 'agenda-dias', texto }),
      crear('span', { clase: 'agenda-estado' }, [selEstado])
    ]));
  }
  caja.append(lista);
}

function refrescarValidacion() {
  const hallazgos = validarCalendario(calendario);
  pintarPanel($('#panel'), hallazgos, { alIrA: irACampo });
  for (const caja of document.querySelectorAll('[data-campo]')) {
    marcarCampo(caja, hallazgos.filter((x) => x.campo === caja.dataset.campo));
  }
}

function irACampo(campo) {
  const caja = document.querySelector(`[data-campo="${CSS.escape(campo)}"]`);
  if (!caja) return;
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const control = caja.querySelector('input, select');
  if (control) control.focus({ preventScroll: true });
}

// ------------------------------------------------------------------- arranque

montarCabecera('calendario', 'Ollas comunes y comedores de Villa María del Triunfo');
pintarAvisosAlmacenamiento($('#avisos-sistema'));
$('#privacidad').append(bloquePrivacidad());
$('#barra-datos').append(barraDatos({
  alImportar: (datos) => {
    if (!datos || !datos.calendario) {
      alert('El archivo no contiene un calendario. No se cambió nada.');
      return;
    }
    if (!confirm('Importar reemplazará el calendario que tienes ahora. ¿Continuar?')) return;
    guardar(CLAVES.calendario, datos.calendario);
    location.reload();
  },
  alBorrar: () => location.reload()
}));

const selPer = $('#periodicidad');
selPer.value = calendario.periodicidad || 'mensual';
selPer.addEventListener('change', () => { calendario.periodicidad = selPer.value; cambio(); });

const fBase = $('#fechaBase');
fBase.value = calendario.fechaLimiteBase || '';
fBase.addEventListener('input', () => { calendario.fechaLimiteBase = fBase.value; cambio(); });

const fAviso = $('#diasAviso');
fAviso.value = calendario.diasDeAviso.join(', ');
fAviso.addEventListener('input', () => {
  const nums = fAviso.value.split(',')
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 400);
  calendario.diasDeAviso = nums.length ? nums : [7, 3, 1];
  cambio();
});

// PERIODICIDADES se usa para que el texto de la UI y el cálculo no se separen.
for (const [clave, , detalle] of PERIODICIDADES) {
  const opt = [...selPer.options].find((o) => o.value === clave);
  if (opt) opt.title = detalle;
}

pintarBanner();
pintarAgenda();
refrescarValidacion();

avisarAlSalirDelCampo(refrescarValidacion);
