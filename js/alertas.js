// alertas.js — cuenta regresiva hasta la próxima entrega del formato.
// Funciones PURAS: sin DOM, sin estado, sin red. Ver AGENTS.md §6.6.
//
// La app NO conoce el calendario oficial de la Municipalidad. Todo sale de dos
// datos que escribe la usuaria: cada cuánto entrega, y UNA fecha de entrega que
// ella conoce. A partir de ahí se cuentan las siguientes. Si la Municipalidad
// cambia una fecha, la usuaria la corrige a mano.

import { aFecha, aIso, esIso, hoyIso, diasEntre, aDdMmAa } from './modelo.js';

export const PERIODICIDADES = [
  ['semanal', 'Semanal', 'cada 7 días'],
  ['quincenal', 'Quincenal', 'cada 15 días'],
  ['mensual', 'Mensual', 'el mismo día de cada mes']
];

/** Avanza una fecha un periodo. Mensual conserva el día, ajustando a fin de mes. */
export function avanzarPeriodo(fechaIso, periodicidad, pasos = 1) {
  const f = aFecha(fechaIso);
  if (!f) return '';
  if (periodicidad === 'semanal') {
    return aIso(new Date(f.getFullYear(), f.getMonth(), f.getDate() + 7 * pasos));
  }
  if (periodicidad === 'quincenal') {
    return aIso(new Date(f.getFullYear(), f.getMonth(), f.getDate() + 15 * pasos));
  }
  const dia = f.getDate();
  const destino = new Date(f.getFullYear(), f.getMonth() + pasos, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return aIso(destino);
}

export function retrocederPeriodo(fechaIso, periodicidad, pasos = 1) {
  return avanzarPeriodo(fechaIso, periodicidad, -pasos);
}

/**
 * Serie de fechas de entrega alrededor de hoy, a partir de la fecha base.
 * Devuelve `cuantas` fechas: la primera es la primera que no ha pasado todavía.
 */
export function fechasDeEntrega(calendario, hoyRef, cuantas = 6) {
  const hoy = esIso(hoyRef) ? hoyRef : hoyIso();
  if (!calendario || !esIso(calendario.fechaLimiteBase)) return [];
  const per = calendario.periodicidad || 'mensual';

  let actual = calendario.fechaLimiteBase;
  let guardia = 0;
  // Retrocede hasta quedar en la última fecha anterior a hoy.
  while (actual > hoy && guardia < 2000) { actual = retrocederPeriodo(actual, per); guardia += 1; }
  // Avanza hasta la primera que no ha pasado.
  guardia = 0;
  while (actual < hoy && guardia < 2000) { actual = avanzarPeriodo(actual, per); guardia += 1; }

  const salida = [];
  for (let i = 0; i < cuantas; i += 1) {
    salida.push(actual);
    actual = avanzarPeriodo(actual, per);
  }
  return salida;
}

/** Fecha de entrega inmediatamente anterior a hoy, o '' si no hay base. */
export function entregaAnterior(calendario, hoyRef) {
  const hoy = esIso(hoyRef) ? hoyRef : hoyIso();
  const proxima = fechasDeEntrega(calendario, hoy, 1)[0];
  if (!proxima) return '';
  return retrocederPeriodo(proxima, calendario.periodicidad || 'mensual');
}

export const NIVELES = ['vencida', 'hoy', 'urgente', 'proxima', 'lejana'];

/**
 * Con avisos [7, 3, 1]: a 7 días «se acerca», a 3 o menos «falta muy poco».
 * El corte de «urgente» es el segundo aviso más bajo, para que el aviso más
 * temprano no se trague a los demás; con un solo aviso configurado, ese mismo.
 */
export function nivelPorDias(dias, diasDeAviso) {
  if (dias < 0) return 'vencida';
  if (dias === 0) return 'hoy';
  const avisos = Array.isArray(diasDeAviso) && diasDeAviso.length ? diasDeAviso : [7, 3, 1];
  const orden = [...avisos].sort((a, b) => a - b);
  const corteUrgente = orden.length > 1 ? orden[1] : orden[0];
  const corteProxima = orden[orden.length - 1];
  if (dias <= corteUrgente) return 'urgente';
  if (dias <= corteProxima) return 'proxima';
  return 'lejana';
}

function estadoRegistrado(calendario, fechaLimite) {
  const reg = ((calendario && calendario.entregas) || [])
    .find((e) => e.fechaLimite === fechaLimite);
  return reg ? reg.estado : 'pendiente';
}

/**
 * La alerta que se muestra arriba de la pantalla.
 * Devuelve null si falta configurar el calendario: no se inventa una fecha.
 */
export function alertaProximaEntrega(calendario, hoyRef) {
  const hoy = esIso(hoyRef) ? hoyRef : hoyIso();
  if (!calendario || !esIso(calendario.fechaLimiteBase)) {
    return {
      configurado: false,
      mensaje: 'Todavía no has indicado cuándo entregas el formato.',
      nivel: 'lejana'
    };
  }

  // Una entrega ya vencida y no marcada como entregada pesa más que la siguiente.
  const anterior = entregaAnterior(calendario, hoy);
  if (anterior && estadoRegistrado(calendario, anterior) === 'pendiente') {
    const atraso = diasEntre(anterior, hoy);
    return {
      configurado: true,
      fechaLimite: anterior,
      diasRestantes: -atraso,
      nivel: 'vencida',
      estado: 'pendiente',
      mensaje: `La entrega del ${aDdMmAa(anterior)} venció hace ${atraso} día(s) y sigue sin marcarse como entregada.`
    };
  }

  const proxima = fechasDeEntrega(calendario, hoy, 1)[0];
  if (!proxima) return null;
  const dias = diasEntre(hoy, proxima);
  const nivel = nivelPorDias(dias, calendario.diasDeAviso);
  const cuando = dias === 0 ? 'hoy'
    : dias === 1 ? 'mañana'
      : `en ${dias} días`;
  return {
    configurado: true,
    fechaLimite: proxima,
    diasRestantes: dias,
    nivel,
    estado: estadoRegistrado(calendario, proxima),
    mensaje: `Próxima entrega ${cuando}: ${aDdMmAa(proxima)}.`
  };
}

/** Fechas próximas con su estado y días restantes, para la página del calendario. */
export function agendaEntregas(calendario, hoyRef, cuantas = 6) {
  const hoy = esIso(hoyRef) ? hoyRef : hoyIso();
  const fechas = fechasDeEntrega(calendario, hoy, cuantas);
  const anterior = entregaAnterior(calendario, hoy);
  const lista = [];
  if (anterior) {
    const dias = diasEntre(hoy, anterior);
    lista.push({
      fechaLimite: anterior,
      diasRestantes: dias,
      nivel: 'vencida',
      estado: estadoRegistrado(calendario, anterior)
    });
  }
  for (const f of fechas) {
    const dias = diasEntre(hoy, f);
    lista.push({
      fechaLimite: f,
      diasRestantes: dias,
      nivel: nivelPorDias(dias, calendario.diasDeAviso),
      estado: estadoRegistrado(calendario, f)
    });
  }
  return lista;
}
