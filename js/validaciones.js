// validaciones.js — funciones puras. Señalan y explican; NUNCA corrigen.
// Ver AGENTS.md §5. Ninguna severidad impide seguir escribiendo ni guardar.

import {
  esIso, nombreCompleto, normalizarNombre, formatearSoles, hoyIso, aFecha, aIso
} from './modelo.js';
import {
  totales, totalRendicionGastos, gastoPorOrigen, descuadreFila,
  duracionPeriodo, afiliadosActivos, racionesDelDia, asistenciasDelDia,
  desgloseDelDia, grupoEtario, TRAMOS_ETARIOS
} from './calculos.js';

const ERROR = 'error';
const AVISO = 'advertencia';

function h(severidad, campo, mensaje) {
  return { severidad, campo, mensaje };
}

const soloDigitos = (v) => /^\d+$/.test(String(v || ''));
const vacio = (v) => String(v === null || v === undefined ? '' : v).trim() === '';

// ------------------------------------------------------------ §5.1 Encabezado

function validarEncabezado(r) {
  const hs = [];
  if (r.tipoCentro !== 'comedor' && r.tipoCentro !== 'olla_comun') {
    hs.push(h(ERROR, 'tipoCentro', 'Marca si es COMEDOR u OLLA COMÚN. Debe ser exactamente uno.'));
  }
  const obligatorios = [
    ['nombreCentro', 'el nombre del centro de atención'],
    ['codigoPca', 'el código de PCA'],
    ['fechaRendicion', 'la fecha de rendición'],
    ['nombrePresidenta', 'el nombre de la presidenta'],
    ['dniPresidenta', 'el DNI de la presidenta'],
    ['celular', 'el número de celular']
  ];
  for (const [campo, nombre] of obligatorios) {
    if (vacio(r[campo])) hs.push(h(ERROR, campo, `Falta ${nombre}.`));
  }
  if (vacio(r.periodo && r.periodo.etiqueta)) {
    hs.push(h(ERROR, 'periodo.etiqueta', 'Falta lo que va escrito en "MES DE RENDICIÓN".'));
  }
  if (!esIso(r.periodo && r.periodo.inicio) || !esIso(r.periodo && r.periodo.fin)) {
    hs.push(h(ERROR, 'periodo.inicio', 'Falta el inicio o el fin del periodo que se rinde.'));
  } else if (r.periodo.inicio > r.periodo.fin) {
    hs.push(h(ERROR, 'periodo.inicio', 'El inicio del periodo es posterior a su fin.'));
  } else {
    const dias = duracionPeriodo(r.periodo);
    const rangos = { semanal: [7, 7], quincenal: [14, 16], mensual: [28, 31] };
    const rango = rangos[r.periodo.tipo];
    if (rango && (dias < rango[0] || dias > rango[1])) {
      hs.push(h(AVISO, 'periodo.inicio',
        `El periodo dura ${dias} día(s), que no es lo habitual para una entrega ` +
        `${r.periodo.tipo} (${rango[0]}–${rango[1]} días). Revísalo si no fue a propósito.`));
    }
  }
  if (!vacio(r.dniPresidenta) && !/^\d{8}$/.test(r.dniPresidenta)) {
    hs.push(h(ERROR, 'dniPresidenta', 'El DNI debe tener exactamente 8 dígitos.'));
  }
  if (!vacio(r.celular) && !/^9\d{8}$/.test(r.celular)) {
    hs.push(h(ERROR, 'celular', 'El celular debe tener 9 dígitos y empezar en 9.'));
  }
  if (!vacio(r.codigoPca) && !soloDigitos(r.codigoPca)) {
    hs.push(h(AVISO, 'codigoPca', 'El código de PCA suele ser solo dígitos. Verifica lo escrito.'));
  }
  return hs;
}

// --------------------------------------------------------------- §5.2 Ingresos

function validarIngresos(r) {
  const hs = [];
  if (!Number.isFinite(r.montoSubsidioCent)) {
    hs.push(h(ERROR, 'montoSubsidio', 'Falta el monto del subsidio.'));
  } else if (r.montoSubsidioCent <= 0) {
    hs.push(h(ERROR, 'montoSubsidio', 'El monto del subsidio debe ser mayor que cero.'));
  }
  if (!esIso(r.fechaAsignacion)) {
    hs.push(h(ERROR, 'fechaAsignacion', 'Falta la fecha de la asignación.'));
  } else if (esIso(r.fechaRendicion) && r.fechaAsignacion > r.fechaRendicion) {
    hs.push(h(ERROR, 'fechaAsignacion',
      'La fecha de asignación es posterior a la fecha de rendición.'));
  } else if (esIso(r.periodo && r.periodo.inicio) && esIso(r.periodo.fin)) {
    const base = aFecha(r.periodo.inicio);
    const hace30 = aIso(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 30));
    if (r.fechaAsignacion < hace30 || r.fechaAsignacion > r.periodo.fin) {
      hs.push(h(AVISO, 'fechaAsignacion',
        'La fecha de asignación queda lejos del periodo que estás rindiendo.'));
    }
  }
  return hs;
}

// ---------------------------------------------------------------- §5.3 Egresos

function filaTieneAlgo(f) {
  return !vacio(f.fechaCompra) || !vacio(f.descripcion) || !vacio(f.rucProveedor) ||
    !vacio(f.boletaSerie) || !vacio(f.boletaCorrelativo) ||
    Number.isFinite(f.montoTotalCent) || Number.isFinite(f.cantidad) ||
    Number.isFinite(f.precioUnitarioCent);
}

function validarEgresos(r) {
  const hs = [];
  const filas = r.egresos || [];
  const conDatos = filas.filter(filaTieneAlgo);
  if (conDatos.length === 0) {
    hs.push(h(ERROR, 'egresos', 'No hay ningún egreso registrado.'));
    return hs;
  }

  const vistas = new Map();
  filas.forEach((f, i) => {
    if (!filaTieneAlgo(f)) return;
    const n = i + 1;
    const campo = `egreso.${f.id}`;

    if (!esIso(f.fechaCompra)) hs.push(h(ERROR, campo, `Compra ${n}: falta la fecha.`));
    if (vacio(f.descripcion)) hs.push(h(ERROR, campo, `Compra ${n}: falta la descripción.`));
    if (vacio(f.rucProveedor)) hs.push(h(ERROR, campo, `Compra ${n}: falta el RUC del proveedor.`));
    if (vacio(f.boletaSerie) || vacio(f.boletaCorrelativo)) {
      hs.push(h(ERROR, campo, `Compra ${n}: falta la serie o el correlativo de la boleta.`));
    }
    if (!Number.isFinite(f.montoTotalCent)) {
      hs.push(h(ERROR, campo, `Compra ${n}: falta el monto total.`));
    } else if (f.montoTotalCent <= 0) {
      hs.push(h(ERROR, campo, `Compra ${n}: el monto total debe ser mayor que cero.`));
    }

    if (!vacio(f.rucProveedor)) {
      if (!/^\d{11}$/.test(f.rucProveedor)) {
        hs.push(h(ERROR, campo, `Compra ${n}: el RUC debe tener exactamente 11 dígitos.`));
      } else if (!/^(10|15|17|20)/.test(f.rucProveedor)) {
        hs.push(h(AVISO, campo,
          `Compra ${n}: los RUC peruanos suelen empezar en 10, 15, 17 o 20. Verifica el número.`));
      }
    }

    if (esIso(f.fechaCompra)) {
      if (esIso(r.fechaAsignacion) && f.fechaCompra < r.fechaAsignacion) {
        hs.push(h(ERROR, campo,
          `Compra ${n}: la fecha es anterior a la asignación del subsidio.`));
      }
      if (esIso(r.fechaRendicion) && f.fechaCompra > r.fechaRendicion) {
        hs.push(h(ERROR, campo, `Compra ${n}: la fecha es posterior a la rendición.`));
      }
      if (esIso(r.periodo && r.periodo.inicio) && esIso(r.periodo.fin) &&
          (f.fechaCompra < r.periodo.inicio || f.fechaCompra > r.periodo.fin)) {
        hs.push(h(AVISO, campo, `Compra ${n}: la fecha cae fuera del periodo que se rinde.`));
      }
    }

    if (!vacio(f.boletaSerie) && !vacio(f.boletaCorrelativo)) {
      const llave = `${String(f.boletaSerie).trim().toUpperCase()}-${String(f.boletaCorrelativo).trim()}`;
      if (vistas.has(llave)) {
        hs.push(h(AVISO, campo,
          `Compra ${n}: la boleta ${llave} ya figura en la compra ${vistas.get(llave)}.`));
      } else {
        vistas.set(llave, n);
      }
    }

    const d = descuadreFila(f);
    if (d) {
      hs.push(h(AVISO, campo,
        `Compra ${n}: cantidad × precio unitario da S/ ${formatearSoles(d.esperado)}, ` +
        `pero el monto total dice S/ ${formatearSoles(d.declarado)}. ` +
        'Revisa cuál de los tres números es el correcto; la app no cambia ninguno.'));
    }
  });

  return hs;
}

// --------------------------------------------------------------- §5.4 Conjunto

function validarConjunto(r) {
  const hs = [];
  const t = totales(r);

  if (t.total !== null && t.conSubsidio + t.aporte !== t.total) {
    hs.push(h(ERROR, 'totales',
      'Error interno: los tres totales no cuadran entre sí. Esto es un fallo del ' +
      'programa, no de tus datos. Repórtalo.'));
  }
  const porOrigen = gastoPorOrigen(r);
  const sumaOrigenes = porOrigen.subsidio + porOrigen.ayuda_social + porOrigen.aporte_propio;
  if (sumaOrigenes !== totalRendicionGastos(r)) {
    hs.push(h(ERROR, 'totales',
      'Error interno: la suma por origen de fondo no coincide con el total. Repórtalo.'));
  }
  if (Number.isFinite(r.montoSubsidioCent) && t.total !== null && t.total < r.montoSubsidioCent) {
    hs.push(h(AVISO, 'totales',
      `Queda S/ ${formatearSoles(r.montoSubsidioCent - t.total)} del subsidio sin rendir. ` +
      'El formato no tiene un renglón para ese saldo: consulta en la Municipalidad qué corresponde hacer.'));
  }
  if (Number.isFinite(r.montoSubsidioCent) && porOrigen.subsidio > r.montoSubsidioCent) {
    hs.push(h(AVISO, 'totales',
      'Las compras marcadas como pagadas con el subsidio suman más que el subsidio recibido.'));
  }
  if (!vacio(r.nombrePresidentaFirma) && !vacio(r.nombrePresidenta) &&
      normalizarNombre(r.nombrePresidentaFirma) !== normalizarNombre(r.nombrePresidenta)) {
    hs.push(h(AVISO, 'nombrePresidentaFirma',
      'El nombre de la firma no coincide con el del encabezado.'));
  }
  if (!vacio(r.dniPresidentaFirma) && !vacio(r.dniPresidenta) &&
      r.dniPresidentaFirma !== r.dniPresidenta) {
    hs.push(h(AVISO, 'dniPresidentaFirma',
      'El DNI de la firma no coincide con el del encabezado.'));
  }
  if (vacio(r.nombreTesorera) && vacio(r.dniTesorera)) {
    hs.push(h(AVISO, 'nombreTesorera',
      'Falta la tesorera. El formato lleva dos firmas: presidenta y tesorera.'));
  }
  if (!vacio(r.dniTesorera) && !/^\d{8}$/.test(r.dniTesorera)) {
    hs.push(h(ERROR, 'dniTesorera', 'El DNI de la tesorera debe tener 8 dígitos.'));
  }

  const FILAS_EGRESOS = 17; // provisional; ver AGENTS.md §8.4 y §12.2
  const conDatos = (r.egresos || []).filter(filaTieneAlgo).length;
  if (conDatos > FILAS_EGRESOS) {
    hs.push(h(AVISO, 'egresos',
      `Hay ${conDatos} compras y la hoja del formato tiene ${FILAS_EGRESOS} filas. ` +
      'Harán falta dos hojas.'));
  }
  return hs;
}

export function validarRendicion(rendicion) {
  if (!rendicion) return [];
  return [
    ...validarEncabezado(rendicion),
    ...validarIngresos(rendicion),
    ...validarEgresos(rendicion),
    ...validarConjunto(rendicion)
  ];
}

// ----------------------------------------------------------------- §5.5 Padrón

export function validarAfiliado(afiliado, padron) {
  const hs = [];
  const a = afiliado;
  const campo = `afiliado.${a.id}`;

  if (vacio(a.apellidoPaterno)) hs.push(h(ERROR, campo, 'Falta el apellido paterno.'));
  if (vacio(a.nombres)) hs.push(h(ERROR, campo, 'Faltan los nombres.'));

  // El número de documento es OBLIGATORIO (decisión del equipo, AGENTS.md §5.5).
  if (vacio(a.numeroDocumento)) {
    hs.push(h(ERROR, campo, 'Falta el número de documento. Es obligatorio para el padrón.'));
  } else {
    if (a.tipoDocumento === 'dni' && !/^\d{8}$/.test(a.numeroDocumento)) {
      hs.push(h(ERROR, campo, 'El DNI debe tener exactamente 8 dígitos.'));
    }
    if (a.tipoDocumento === 'ce' && !/^[A-Za-z0-9]{8,12}$/.test(a.numeroDocumento)) {
      hs.push(h(ERROR, campo, 'El carné de extranjería debe tener entre 8 y 12 caracteres.'));
    }
    const repetido = ((padron && padron.afiliados) || []).find(
      (o) => o.id !== a.id && o.activo && o.numeroDocumento === a.numeroDocumento);
    if (repetido) {
      hs.push(h(ERROR, campo,
        `El documento ${a.numeroDocumento} ya está registrado en ${nombreCompleto(repetido)}.`));
    }
  }

  const mismoNombre = ((padron && padron.afiliados) || []).find(
    (o) => o.id !== a.id && normalizarNombre(nombreCompleto(o)) === normalizarNombre(nombreCompleto(a)));
  if (mismoNombre && !vacio(nombreCompleto(a))) {
    hs.push(h(AVISO, campo, 'Ya hay otra persona registrada con el mismo nombre completo.'));
  }

  if (!vacio(a.fechaNacimiento)) {
    if (!esIso(a.fechaNacimiento)) {
      hs.push(h(ERROR, campo, 'La fecha de nacimiento no tiene un formato válido.'));
    } else {
      const hoy = hoyIso();
      if (a.fechaNacimiento > hoy) {
        hs.push(h(ERROR, campo, 'La fecha de nacimiento está en el futuro.'));
      } else if (Number(a.fechaNacimiento.slice(0, 4)) < Number(hoyIso().slice(0, 4)) - 120) {
        hs.push(h(ERROR, campo, 'La fecha de nacimiento es de hace más de 120 años.'));
      }
    }
  }

  // Grupo etario OBLIGATORIO: por fecha de nacimiento, o elegido a mano.
  if (!grupoEtario(a, hoyIso())) {
    hs.push(h(ERROR, campo,
      'Falta el grupo de edad. Elígelo, o anota la fecha de nacimiento y sale solo.'));
  }
  if (a.grupoEtarioManual && !TRAMOS_ETARIOS.some((t) => t.clave === a.grupoEtarioManual)) {
    hs.push(h(ERROR, campo, 'El grupo de edad elegido no es uno de los cuatro válidos.'));
  }

  // Tipo de afiliada OBLIGATORIO: define el menú que le toca por defecto.
  if (a.tipoAfiliado !== 'habitual' && a.tipoAfiliado !== 'caso_social') {
    hs.push(h(ERROR, campo,
      'Falta indicar si es habitual o de ayuda social. De ahí sale el menú que le ' +
      'toca cuando la marcas en la asistencia.'));
  }

  if (esIso(a.altaEn) && a.altaEn > hoyIso()) {
    hs.push(h(ERROR, campo, 'La fecha de alta está en el futuro.'));
  }
  if (esIso(a.bajaEn) && esIso(a.altaEn) && a.bajaEn < a.altaEn) {
    hs.push(h(ERROR, campo, 'La fecha de baja es anterior a la de alta.'));
  }
  if (a.origenDato === 'escaneo_dni' && vacio(a.verificadoPor)) {
    hs.push(h(AVISO, campo,
      'Estos datos vinieron de un escaneo y nadie los ha confirmado todavía.'));
  }
  return hs;
}

// --------------------------------------------------------------- §5.6 Raciones

export function validarAtencion(atencion, padron) {
  const hs = [];
  const at = atencion;
  const campo = `atencion.${at.id}`;

  if (!esIso(at.fecha)) {
    hs.push(h(ERROR, campo, 'Falta la fecha de la atención.'));
    return hs;
  }

  const d = desgloseDelDia(at);

  if (d.total === 0) {
    hs.push(h(AVISO, campo,
      'Este día no tiene a nadie marcado en la asistencia, así que cuenta cero raciones.'));
  }

  // Si hubo raciones de un tipo de menú, hace falta su precio para el promedio.
  if (d.normal > 0 && !Number.isFinite(at.precioMenuNormalCent)) {
    hs.push(h(ERROR, campo,
      'Falta el precio del menú normal de ese día. Puedes fijarlo arriba, en «Precio del menú».'));
  }
  if (d.ayudaSocial > 0 && !Number.isFinite(at.precioMenuAyudaSocialCent)) {
    hs.push(h(ERROR, campo,
      'Falta el precio del menú de ayuda social de ese día. Puedes fijarlo arriba, en «Precio del menú».'));
  }
  if (Number.isFinite(at.precioMenuNormalCent) &&
      Number.isFinite(at.precioMenuAyudaSocialCent) &&
      at.precioMenuAyudaSocialCent > at.precioMenuNormalCent) {
    hs.push(h(AVISO, campo,
      'El menú de ayuda social cuesta más que el normal. Puede ser correcto; solo revísalo.'));
  }

  if (d.origen === 'legado') {
    hs.push(h(AVISO, campo,
      `Este día viene de la versión anterior: ${d.total} ración(es) anotadas a mano, ` +
      'sin asistencia marcada. Siguen contando. Si quieres, marca la asistencia y pasarán ' +
      'a contarse de ahí.'));
  }

  // --- asistencia ---
  const asistencias = asistenciasDelDia(at);
  const vistos = new Set();
  const activosEseDia = afiliadosActivos(padron, at.fecha);

  for (const a of asistencias) {
    if (!a || !a.afiliadoId) continue;
    if (vistos.has(a.afiliadoId)) {
      hs.push(h(ERROR, campo, 'Hay una persona marcada dos veces en la asistencia de ese día.'));
    }
    vistos.add(a.afiliadoId);
    const persona = ((padron && padron.afiliados) || []).find((o) => o.id === a.afiliadoId);
    if (!persona) {
      hs.push(h(AVISO, campo, 'La asistencia incluye a alguien que ya no está en el padrón.'));
    } else if (!activosEseDia.some((o) => o.id === a.afiliadoId)) {
      hs.push(h(AVISO, campo,
        `${nombreCompleto(persona)} figura en la asistencia pero no estaba activa ese día.`));
    }
  }

  if (d.total > activosEseDia.length && d.origen === 'legado') {
    hs.push(h(AVISO, campo,
      `Ese día cuenta ${d.total} raciones y el padrón tenía ${activosEseDia.length} ` +
      'persona(s) activa(s).'));
  }

  const repetida = ((padron && padron.atenciones) || [])
    .find((o) => o.id !== at.id && o.fecha === at.fecha);
  if (repetida) {
    hs.push(h(AVISO, campo, 'Ya hay otro registro de atención con esta misma fecha.'));
  }
  return hs;
}

// --------------------------------------------------- Precio del menú (config)

export function validarPreciosMenu(config, hayRaciones = true) {
  const hs = [];
  if (!config) return hs;
  // Sin raciones registradas todavía no hay nada que valorar: reclamar el
  // precio en ese momento es regañar a quien aún no ha empezado.
  if (!Number.isFinite(config.precioMenuNormalCent)) {
    if (hayRaciones) {
      hs.push(h(AVISO, 'precio.normal',
        'Falta el precio del menú normal. Sin él no se puede sacar el promedio por ración.'));
    }
  } else if (config.precioMenuNormalCent <= 0) {
    hs.push(h(ERROR, 'precio.normal', 'El precio del menú normal debe ser mayor que cero.'));
  }
  if (Number.isFinite(config.precioMenuAyudaSocialCent) &&
      config.precioMenuAyudaSocialCent < 0) {
    hs.push(h(ERROR, 'precio.ayuda', 'El precio del menú de ayuda social no puede ser negativo.'));
  }
  return hs;
}

// ------------------------------------------------- Calendario de entregas

export function validarCalendario(calendario) {
  const hs = [];
  if (!calendario) return hs;
  if (vacio(calendario.fechaLimiteBase)) {
    hs.push(h(AVISO, 'calendario.base',
      'Sin una fecha de entrega conocida, la app no puede avisarte de la siguiente.'));
  } else if (!esIso(calendario.fechaLimiteBase)) {
    hs.push(h(ERROR, 'calendario.base', 'La fecha de entrega no tiene un formato válido.'));
  }
  if (!['semanal', 'quincenal', 'mensual'].includes(calendario.periodicidad)) {
    hs.push(h(ERROR, 'calendario.periodicidad', 'Falta indicar cada cuánto se entrega.'));
  }
  return hs;
}

export function validarPadron(padron) {
  const hs = [];
  for (const a of (padron && padron.afiliados) || []) hs.push(...validarAfiliado(a, padron));
  for (const at of (padron && padron.atenciones) || []) hs.push(...validarAtencion(at, padron));
  return hs;
}

export function contar(hallazgos) {
  return {
    errores: hallazgos.filter((x) => x.severidad === ERROR).length,
    advertencias: hallazgos.filter((x) => x.severidad === AVISO).length
  };
}
