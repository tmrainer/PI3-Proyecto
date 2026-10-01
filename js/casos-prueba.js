// casos-prueba.js — aserciones puras, sin DOM. Las ejecuta pruebas.html.
// Cubren los criterios de aceptación de AGENTS.md §11.

import {
  aCentimos, formatearSoles, aNumero, aDdMmAa, esIso, normalizarNombre,
  nuevaRendicion, nuevoEgreso, nuevoAfiliado, nuevaAtencion, padronVacio,
  nombreCompleto, migrarPadron, calendarioVacio, VERSION_PADRON
} from './modelo.js';
import {
  totales, totalRendicionGastos, gastosConSubsidio, aporteCentroAtencion,
  gastoPorOrigen, descuadreFila, edadEnFecha, grupoEtario, afiliadosActivos,
  racionesPeriodo, proponerPeriodo, duracionPeriodo, resumenEtario,
  racionesDelDia, desgloseDelDia, recaudacionDelDiaCent, resumenEconomicoRaciones,
  asistenciaPorAfiliado, afiliadosSinAsistencia, conteoAsistenciaDelDia,
  menuPorDefecto, filasPadron, TRAMOS_ETARIOS
} from './calculos.js';
import {
  validarRendicion, validarAfiliado, validarAtencion, validarCalendario, contar
} from './validaciones.js';
import {
  avanzarPeriodo, fechasDeEntrega, alertaProximaEntrega, agendaEntregas, nivelPorDias
} from './alertas.js';
import {
  detectarSeparador, parsearTabla, detectarColumnas, parsearFechaFlexible,
  parsearGrupoEtario, parsearTipoAfiliado, prepararImportacion, filasImportables
} from './importar.js';
import { parsearCadenaDni, CAMPOS } from './escaneo-dni.js';
import { sugerirRucProveedor, sugerenciasEncabezado } from './sugerencias.js';

// ------------------------------------------------------------------- utilería

function ok(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje || 'La condición no se cumplió');
}
function igual(obtenido, esperado, mensaje) {
  if (obtenido !== esperado) {
    throw new Error(`${mensaje || 'Valor distinto'} — se esperaba ${JSON.stringify(esperado)} ` +
      `y llegó ${JSON.stringify(obtenido)}`);
  }
}

/**
 * Rendición con la MISMA ARITMÉTICA que el ejemplar llenado a mano (200.00 /
 * 9.85 / 209.85), pero con todos los datos identificativos sustituidos por
 * valores ficticios: ni el nombre del centro, ni el código de PCA, ni los DNI,
 * ni los RUC son reales. Ver AGENTS.md §9.
 */
function rendicionDelEjemplar() {
  const r = nuevaRendicion();
  r.tipoCentro = 'olla_comun';
  r.nombreCentro = 'Centro de prueba';
  r.codigoPca = '0000000000';
  r.periodo = { tipo: 'mensual', inicio: '2026-09-01', fin: '2026-09-30', etiqueta: 'Setiembre' };
  r.fechaRendicion = '2026-09-14';
  r.nombrePresidenta = 'Nombre Ficticio';
  r.dniPresidenta = '00000001';
  r.celular = '900000000';
  r.montoSubsidioCent = 20000;          // S/ 200.00
  r.fechaAsignacion = '2026-09-07';
  r.egresos = [
    Object.assign(nuevoEgreso(), {
      fechaCompra: '2026-09-10', descripcion: 'Saco de papa',
      cantidad: 1, unidadMedida: 'saco', rucProveedor: '10000000001',
      boletaSerie: 'E001', boletaCorrelativo: '143',
      precioUnitarioCent: 6800, montoTotalCent: 6800
    }),
    Object.assign(nuevoEgreso(), {
      fechaCompra: '2026-09-13', descripcion: 'Carne',
      cantidadVarios: true, unidadMedida: 'varios', rucProveedor: '10000000002',
      boletaSerie: '0001', boletaCorrelativo: '000080',
      precioUnitarioVarios: true, montoTotalCent: 14185
    })
  ];
  return r;
}

export const casos = [

  // ---------------------------------------------------- dinero sin coma flotante
  {
    grupo: 'Dinero',
    nombre: 'aCentimos convierte sin error de coma flotante',
    fn: () => {
      igual(aCentimos('209.85'), 20985);
      igual(aCentimos('0.10'), 10);
      igual(aCentimos('0.20'), 20);
      igual(aCentimos('200'), 20000);
      igual(aCentimos('1,50'), 150, 'acepta coma decimal');
      igual(aCentimos('  68.00 '), 6800);
    }
  },
  {
    grupo: 'Dinero',
    nombre: 'aCentimos devuelve null ante lo vacío o inválido; no adivina',
    fn: () => {
      igual(aCentimos(''), null);
      igual(aCentimos('   '), null);
      igual(aCentimos('abc'), null);
      igual(aCentimos('1.234'), null, 'más de dos decimales no es un monto en soles');
      igual(aCentimos(null), null);
      igual(aCentimos(undefined), null);
      igual(aCentimos('-5.00'), null);
    }
  },
  {
    grupo: 'Dinero',
    nombre: '0.1 + 0.2 en céntimos da exactamente 0.30',
    fn: () => {
      const a = aCentimos('0.10');
      const b = aCentimos('0.20');
      igual(a + b, 30);
      igual(formatearSoles(a + b), '0.30');
      ok(0.1 + 0.2 !== 0.3, 'la coma flotante sí falla: por eso trabajamos en céntimos');
    }
  },
  {
    grupo: 'Dinero',
    nombre: 'formatearSoles deja vacío lo que no existe',
    fn: () => {
      igual(formatearSoles(null), '');
      igual(formatearSoles(undefined), '');
      igual(formatearSoles(20985), '209.85');
      igual(formatearSoles(5), '0.05');
      igual(formatearSoles(0), '0.00');
    }
  },
  {
    grupo: 'Dinero',
    nombre: 'aNumero acepta cantidades y rechaza texto',
    fn: () => {
      igual(aNumero('3.5'), 3.5);
      igual(aNumero('2'), 2);
      igual(aNumero('varios'), null);
      igual(aNumero(''), null);
    }
  },

  // ------------------------------------------------------------------- totales
  {
    grupo: 'Totales',
    nombre: 'El ejemplar llenado a mano da 200.00 / 9.85 / 209.85',
    fn: () => {
      const r = rendicionDelEjemplar();
      const t = totales(r);
      igual(formatearSoles(t.conSubsidio), '200.00', 'gastos con el subsidio');
      igual(formatearSoles(t.aporte), '9.85', 'aporte del centro');
      igual(formatearSoles(t.total), '209.85', 'total de rendición');
    }
  },
  {
    grupo: 'Totales',
    nombre: 'La fila con «varios» entra en la suma por su monto total',
    fn: () => {
      const r = rendicionDelEjemplar();
      igual(totalRendicionGastos(r), 20985);
      igual(r.egresos[1].cantidad, null, 'la fila varios no inventa una cantidad');
      igual(r.egresos[1].precioUnitarioCent, null, 'ni un precio unitario');
    }
  },
  {
    grupo: 'Totales',
    nombre: 'Total MENOR que el subsidio (tramo sin verificar)',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos = [Object.assign(nuevoEgreso(), { montoTotalCent: 15000 })];
      const t = totales(r);
      igual(t.total, 15000);
      igual(t.conSubsidio, 15000, 'min(subsidio, total)');
      igual(t.aporte, 0, 'no hay aporte del centro');
      igual(t.conSubsidio + t.aporte, t.total, 'el invariante se mantiene');
    }
  },
  {
    grupo: 'Totales',
    nombre: 'Total IGUAL al subsidio',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos = [Object.assign(nuevoEgreso(), { montoTotalCent: 20000 })];
      const t = totales(r);
      igual(t.conSubsidio, 20000);
      igual(t.aporte, 0);
      igual(t.total, 20000);
    }
  },
  {
    grupo: 'Totales',
    nombre: 'Filas vacías no suman ni rompen el cálculo',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos.push(nuevoEgreso(), nuevoEgreso());
      igual(totalRendicionGastos(r), 20985);
      igual(totales(r).aporte, 985);
    }
  },
  {
    grupo: 'Totales',
    nombre: 'Sin monto de subsidio los tres totales quedan en null, no en cero',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.montoSubsidioCent = null;
      const t = totales(r);
      igual(t.total, null);
      igual(t.conSubsidio, null);
      igual(t.aporte, null);
      igual(gastosConSubsidio(r), null);
      igual(aporteCentroAtencion(r), null);
      igual(formatearSoles(t.total), '', 'en pantalla se ve vacío, no 0.00');
    }
  },
  {
    grupo: 'Totales',
    nombre: 'Invariante gastos + aporte === total en muchos casos',
    fn: () => {
      for (const subsidio of [0, 1, 999, 20000, 100000]) {
        for (const montos of [[], [1], [6800, 14185], [50000, 50000, 1]]) {
          const r = rendicionDelEjemplar();
          r.montoSubsidioCent = subsidio;
          r.egresos = montos.map((m) => Object.assign(nuevoEgreso(), { montoTotalCent: m }));
          const t = totales(r);
          igual(t.conSubsidio + t.aporte, t.total,
            `subsidio ${subsidio}, montos [${montos}]`);
        }
      }
    }
  },
  {
    grupo: 'Totales',
    nombre: 'La suma por origen de fondo iguala el total',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos[1].origenFondo = 'ayuda_social';
      const po = gastoPorOrigen(r);
      igual(po.subsidio, 6800);
      igual(po.ayuda_social, 14185);
      igual(po.aporte_propio, 0);
      igual(po.subsidio + po.ayuda_social + po.aporte_propio, totalRendicionGastos(r));
    }
  },
  {
    grupo: 'Totales',
    nombre: 'descuadreFila detecta el descuadre y calla ante «varios»',
    fn: () => {
      igual(descuadreFila({ cantidad: 2, precioUnitarioCent: 500, montoTotalCent: 1000 }), null);
      const d = descuadreFila({ cantidad: 2, precioUnitarioCent: 500, montoTotalCent: 1200 });
      ok(d && d.esperado === 1000 && d.declarado === 1200, 'debe reportar ambos números');
      igual(descuadreFila({ cantidadVarios: true, cantidad: 2, precioUnitarioCent: 500, montoTotalCent: 9999 }), null);
      igual(descuadreFila({ cantidad: 2, precioUnitarioCent: 500, montoTotalCent: 1001 }), null, 'tolerancia de 1 céntimo');
    }
  },

  // ------------------------------------------------------------------ periodos
  {
    grupo: 'Periodo',
    nombre: 'Propone mes completo y ofrece las dos etiquetas',
    fn: () => {
      const p = proponerPeriodo('mensual', '2026-09-14');
      igual(p.inicio, '2026-09-01');
      igual(p.fin, '2026-09-30');
      igual(p.etiqueta, 'Setiembre', 'como en el ejemplar llenado a mano');
      ok(p.alternativas.includes('Mensual'), 'también ofrece «Mensual»');
      igual(duracionPeriodo(p), 30);
    }
  },
  {
    grupo: 'Periodo',
    nombre: 'Propone quincena y semana correctas',
    fn: () => {
      const q1 = proponerPeriodo('quincenal', '2026-09-07');
      igual(q1.inicio, '2026-09-01');
      igual(q1.fin, '2026-09-15');
      igual(q1.etiqueta, 'Quincenal');

      const q2 = proponerPeriodo('quincenal', '2026-09-20');
      igual(q2.inicio, '2026-09-16');
      igual(q2.fin, '2026-09-30');

      const s = proponerPeriodo('semanal', '2026-09-10'); // jueves
      igual(s.inicio, '2026-09-07', 'lunes de esa semana');
      igual(s.fin, '2026-09-13', 'domingo de esa semana');
      igual(s.etiqueta, 'Entrega semanal');
      igual(duracionPeriodo(s), 7);
    }
  },

  // ---------------------------------------------------------------- validación
  {
    grupo: 'Validación',
    nombre: 'El ejemplar completo no deja errores',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.nombrePresidentaFirma = r.nombrePresidenta;
      r.dniPresidentaFirma = r.dniPresidenta;
      r.nombreTesorera = 'Otra Ficticia';
      r.dniTesorera = '00000002';
      const c = contar(validarRendicion(r));
      igual(c.errores, 0, 'no debería haber errores: ' +
        JSON.stringify(validarRendicion(r).filter((x) => x.severidad === 'error')));
    }
  },
  {
    grupo: 'Validación',
    nombre: 'DNI, RUC y celular mal formados dan error',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.dniPresidenta = '123';
      r.celular = '812345678';
      r.egresos[0].rucProveedor = '123';
      const hs = validarRendicion(r);
      ok(hs.some((x) => x.campo === 'dniPresidenta' && x.severidad === 'error'), 'DNI');
      ok(hs.some((x) => x.campo === 'celular' && x.severidad === 'error'), 'celular');
      ok(hs.some((x) => x.severidad === 'error' && /RUC/.test(x.mensaje)), 'RUC');
    }
  },
  {
    grupo: 'Validación',
    nombre: 'Saldo de subsidio sin rendir es advertencia, no error',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos = [Object.assign(nuevoEgreso(), {
        fechaCompra: '2026-09-10', descripcion: 'Arroz', rucProveedor: '10000000001',
        boletaSerie: 'E001', boletaCorrelativo: '1', montoTotalCent: 15000
      })];
      const hs = validarRendicion(r);
      const saldo = hs.find((x) => /sin rendir/.test(x.mensaje));
      ok(saldo, 'debe avisar del saldo');
      igual(saldo.severidad, 'advertencia');
    }
  },
  {
    grupo: 'Validación',
    nombre: 'Boleta repetida avisa; fecha fuera de rango da error',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.egresos[1].boletaSerie = 'E001';
      r.egresos[1].boletaCorrelativo = '143';
      r.egresos[1].fechaCompra = '2026-09-01'; // antes de la asignación
      const hs = validarRendicion(r);
      ok(hs.some((x) => x.severidad === 'advertencia' && /ya figura/.test(x.mensaje)), 'duplicado');
      ok(hs.some((x) => x.severidad === 'error' && /anterior a la asignación/.test(x.mensaje)), 'fecha');
    }
  },
  {
    grupo: 'Validación',
    nombre: 'Ninguna validación modifica la rendición',
    fn: () => {
      const r = rendicionDelEjemplar();
      r.dniPresidenta = '123';
      const antes = JSON.stringify(r);
      validarRendicion(r);
      igual(JSON.stringify(r), antes, 'la rendición quedó intacta');
    }
  },

  // -------------------------------------------------------------------- padrón
  {
    grupo: 'Padrón',
    nombre: 'La edad se calcula respecto a una fecha de referencia',
    fn: () => {
      igual(edadEnFecha('2000-09-14', '2026-09-13'), 25, 'un día antes del cumpleaños');
      igual(edadEnFecha('2000-09-14', '2026-09-14'), 26, 'el día del cumpleaños');
      igual(edadEnFecha('2000-09-14', '2026-09-15'), 26);
      igual(edadEnFecha('', '2026-09-14'), null);
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'El grupo etario cambia solo al cruzar el cumpleaños',
    fn: () => {
      const a = Object.assign(nuevoAfiliado(), { fechaNacimiento: '1966-09-14' });
      igual(grupoEtario(a, '2026-09-13'), 'adulto', '59 años');
      igual(grupoEtario(a, '2026-09-14'), 'adulto_mayor', '60 años');
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'Sin fecha ni grupo manual devuelve null; nunca «adulto» por defecto',
    fn: () => {
      const a = nuevoAfiliado();
      igual(grupoEtario(a, '2026-09-14'), null);
      a.grupoEtarioManual = 'nino';
      igual(grupoEtario(a, '2026-09-14'), 'nino', 'usa el manual si no hay fecha');
      a.fechaNacimiento = '2000-01-01';
      igual(grupoEtario(a, '2026-09-14'), 'adulto', 'la fecha manda sobre el manual');
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'Afiliados activos respeta altas y bajas',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [
        Object.assign(nuevoAfiliado(), { id: 'a', altaEn: '2026-09-01', activo: true }),
        Object.assign(nuevoAfiliado(), { id: 'b', altaEn: '2026-09-20', activo: true }),
        Object.assign(nuevoAfiliado(), { id: 'c', altaEn: '2026-09-01', activo: false, bajaEn: '2026-09-05' })
      ];
      igual(afiliadosActivos(p, '2026-09-10').length, 1);
      igual(afiliadosActivos(p, '2026-09-25').length, 2);
      igual(afiliadosActivos(p, '2026-08-01').length, 0);
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'El resumen etario cuenta «sin dato» aparte',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [
        Object.assign(nuevoAfiliado(), { altaEn: '2026-01-01', fechaNacimiento: '2015-01-01' }),
        Object.assign(nuevoAfiliado(), { altaEn: '2026-01-01' })
      ];
      const r = resumenEtario(p, '2026-09-14');
      igual(r.nino, 1);
      igual(r.sin_dato, 1);
      igual(r.adulto, 0);
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'El número de documento es obligatorio',
    fn: () => {
      const p = padronVacio();
      const a = Object.assign(nuevoAfiliado(), {
        apellidoPaterno: 'Pérez', nombres: 'Ana', fechaNacimiento: '1990-05-05'
      });
      p.afiliados = [a];
      const hs = validarAfiliado(a, p);
      ok(hs.some((x) => x.severidad === 'error' && /número de documento/.test(x.mensaje)),
        'sin documento debe dar error');
      a.numeroDocumento = '00000001';
      a.tipoAfiliado = 'habitual';
      igual(contar(validarAfiliado(a, p)).errores, 0, 'con documento de 8 dígitos, sin errores');
      a.numeroDocumento = '123';
      ok(validarAfiliado(a, p).some((x) => x.severidad === 'error' && /8 dígitos/.test(x.mensaje)));
    }
  },
  {
    grupo: 'Padrón',
    nombre: 'Documento repetido entre activos da error',
    fn: () => {
      const p = padronVacio();
      const a = Object.assign(nuevoAfiliado(), {
        id: 'a', apellidoPaterno: 'Pérez', nombres: 'Ana', numeroDocumento: '00000001'
      });
      const b = Object.assign(nuevoAfiliado(), {
        id: 'b', apellidoPaterno: 'Quispe', nombres: 'Rosa', numeroDocumento: '00000001'
      });
      p.afiliados = [a, b];
      ok(validarAfiliado(b, p).some((x) => x.severidad === 'error' && /ya está registrado/.test(x.mensaje)));
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Las raciones se cuentan de la asistencia, no se escriben',
    fn: () => {
      const at = Object.assign(nuevaAtencion(null), {
        asistencias: [
          { afiliadoId: 'a', tipoMenu: 'normal' },
          { afiliadoId: 'b', tipoMenu: 'normal' },
          { afiliadoId: 'c', tipoMenu: 'ayuda_social' }
        ]
      });
      const d = desgloseDelDia(at);
      igual(d.normal, 2);
      igual(d.ayudaSocial, 1);
      igual(d.total, 3);
      igual(d.origen, 'asistencia');
      igual(racionesDelDia(at), 3);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Un día sin nadie marcado cuenta cero raciones',
    fn: () => {
      const at = nuevaAtencion(null);
      igual(racionesDelDia(at), 0);
      igual(desgloseDelDia(at).origen, 'asistencia');
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'El precio se copia de la configuración al crear el día',
    fn: () => {
      const at = nuevaAtencion({ precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100 });
      igual(at.precioMenuNormalCent, 300);
      igual(at.precioMenuAyudaSocialCent, 100);
      igual(at.precioTomadoDeConfig, true, 'queda marcado de dónde vino');
      const sin = nuevaAtencion(null);
      igual(sin.precioMenuNormalCent, null);
      igual(sin.precioTomadoDeConfig, false);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'La recaudación del día usa el precio de cada menú',
    fn: () => {
      const at = Object.assign(nuevaAtencion({ precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100 }), {
        asistencias: [
          ...Array.from({ length: 40 }, (_, i) => ({ afiliadoId: 'n' + i, tipoMenu: 'normal' })),
          ...Array.from({ length: 10 }, (_, i) => ({ afiliadoId: 's' + i, tipoMenu: 'ayuda_social' }))
        ]
      });
      igual(recaudacionDelDiaCent(at), 40 * 300 + 10 * 100);
      igual(formatearSoles(recaudacionDelDiaCent(at)), '130.00');
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Falta un precio con raciones de ese tipo: no se estima, devuelve null',
    fn: () => {
      const base = (precioNormal, precioAyuda, menus) => Object.assign(
        nuevaAtencion({ precioMenuNormalCent: precioNormal, precioMenuAyudaSocialCent: precioAyuda }),
        { asistencias: menus.map((m, i) => ({ afiliadoId: 'x' + i, tipoMenu: m })) });

      igual(recaudacionDelDiaCent(base(null, 100, ['normal'])), null);
      igual(recaudacionDelDiaCent(base(300, null, ['normal', 'ayuda_social'])), null, 'basta que falte uno');
      igual(recaudacionDelDiaCent(base(300, null, ['normal'])), 300,
        'sin raciones de ayuda social, su precio no hace falta');
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'El precio promedio es ponderado por ración, no promedio de precios',
    fn: () => {
      const p = padronVacio();
      p.atenciones = [Object.assign(
        nuevaAtencion({ precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100 }), {
          fecha: '2026-09-10',
          asistencias: [
            ...Array.from({ length: 90 }, (_, i) => ({ afiliadoId: 'n' + i, tipoMenu: 'normal' })),
            ...Array.from({ length: 10 }, (_, i) => ({ afiliadoId: 's' + i, tipoMenu: 'ayuda_social' }))
          ]
        })];
      const r = resumenEconomicoRaciones(p, '2026-09-01', '2026-09-30');
      igual(r.racionesTotales, 100);
      igual(r.recaudacionCent, 90 * 300 + 10 * 100);        // 28 000
      igual(r.precioPromedioRacionCent, 280, 'no 200, que sería el promedio simple');
      igual(r.diasSinPrecio, 0);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Los días sin precio quedan fuera del promedio y se informan',
    fn: () => {
      const p = padronVacio();
      const conPrecio = Object.assign(nuevaAtencion({ precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 0 }), {
        fecha: '2026-09-10',
        asistencias: Array.from({ length: 100 }, (_, i) => ({ afiliadoId: 'n' + i, tipoMenu: 'normal' }))
      });
      const sinPrecio = Object.assign(nuevaAtencion(null), {
        fecha: '2026-09-11',
        asistencias: Array.from({ length: 50 }, (_, i) => ({ afiliadoId: 'm' + i, tipoMenu: 'normal' }))
      });
      p.atenciones = [conPrecio, sinPrecio];
      const r = resumenEconomicoRaciones(p, '2026-09-01', '2026-09-30');
      igual(r.racionesTotales, 150, 'las raciones se cuentan todas');
      igual(r.racionesConPrecio, 100, 'el promedio solo usa las que tienen precio');
      igual(r.precioPromedioRacionCent, 300);
      igual(r.diasSinPrecio, 1);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Sin ningún precio anotado, no hay promedio: null, no cero',
    fn: () => {
      const p = padronVacio();
      p.atenciones = [Object.assign(nuevaAtencion(null), {
        fecha: '2026-09-10', asistencias: [{ afiliadoId: 'a', tipoMenu: 'normal' }]
      })];
      const r = resumenEconomicoRaciones(p, '2026-09-01', '2026-09-30');
      igual(r.precioPromedioRacionCent, null);
      igual(r.recaudacionCent, null);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'racionesPeriodo suma solo lo que cae dentro del periodo',
    fn: () => {
      const p = padronVacio();
      const dia = (fecha, cuantos) => Object.assign(nuevaAtencion(null), {
        fecha, asistencias: Array.from({ length: cuantos }, (_, i) => ({ afiliadoId: fecha + i, tipoMenu: 'normal' }))
      });
      p.atenciones = [dia('2026-09-10', 50), dia('2026-09-20', 60), dia('2026-10-01', 70)];
      igual(racionesPeriodo(p, '2026-09-01', '2026-09-30'), 110);
    }
  },
  {
    grupo: 'Raciones',
    nombre: 'Falta el precio de un menú con asistencia: es error',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [Object.assign(nuevoAfiliado(), { id: 'a', altaEn: '2026-09-01' })];
      const at = Object.assign(nuevaAtencion(null), {
        id: 'x', fecha: '2026-09-10', asistencias: [{ afiliadoId: 'a', tipoMenu: 'normal' }]
      });
      p.atenciones = [at];
      ok(validarAtencion(at, p).some(
        (x) => x.severidad === 'error' && /precio del menú normal/.test(x.mensaje)));
    }
  },

  // ---------------------------------------------------------------- asistencia
  {
    grupo: 'Asistencia',
    nombre: 'El menú por defecto sale de cómo se inscribió la persona',
    fn: () => {
      igual(menuPorDefecto({ tipoAfiliado: 'caso_social' }), 'ayuda_social');
      igual(menuPorDefecto({ tipoAfiliado: 'habitual' }), 'normal');
      igual(menuPorDefecto({ tipoAfiliado: '' }), 'normal', 'sin tipo, no adivina otra cosa');
    }
  },
  {
    grupo: 'Asistencia',
    nombre: 'Cuenta días por persona y separa por tipo de menú',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [
        Object.assign(nuevoAfiliado(), { id: 'ana', altaEn: '2026-09-01' }),
        Object.assign(nuevoAfiliado(), { id: 'rosa', altaEn: '2026-09-01' })
      ];
      p.atenciones = [
        Object.assign(nuevaAtencion(null), {
          fecha: '2026-09-10',
          asistencias: [{ afiliadoId: 'ana', tipoMenu: 'normal' }, { afiliadoId: 'rosa', tipoMenu: 'ayuda_social' }]
        }),
        Object.assign(nuevaAtencion(null), {
          fecha: '2026-09-11', asistencias: [{ afiliadoId: 'ana', tipoMenu: 'ayuda_social' }]
        })
      ];
      const filas = asistenciaPorAfiliado(p, '2026-09-01', '2026-09-30');
      igual(filas.length, 2);
      igual(filas[0].afiliadoId, 'ana', 'ordenado de más a menos días');
      igual(filas[0].dias, 2);
      igual(filas[0].normal, 1);
      igual(filas[0].ayudaSocial, 1);
    }
  },
  {
    grupo: 'Asistencia',
    nombre: 'Lista quién no asistió ningún día del periodo',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [
        Object.assign(nuevoAfiliado(), { id: 'ana', altaEn: '2026-09-01' }),
        Object.assign(nuevoAfiliado(), { id: 'rosa', altaEn: '2026-09-01' })
      ];
      p.atenciones = [Object.assign(nuevaAtencion(null), {
        fecha: '2026-09-10', asistencias: [{ afiliadoId: 'ana', tipoMenu: 'normal' }]
      })];
      const sin = afiliadosSinAsistencia(p, '2026-09-01', '2026-09-30');
      igual(sin.length, 1);
      igual(sin[0].id, 'rosa');
    }
  },
  {
    grupo: 'Asistencia',
    nombre: 'Persona marcada dos veces el mismo día es error',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [Object.assign(nuevoAfiliado(), { id: 'ana', altaEn: '2026-09-01' })];
      const at = Object.assign(nuevaAtencion({ precioMenuNormalCent: 300 }), {
        id: 'x', fecha: '2026-09-10',
        asistencias: [{ afiliadoId: 'ana', tipoMenu: 'normal' }, { afiliadoId: 'ana', tipoMenu: 'normal' }]
      });
      p.atenciones = [at];
      ok(validarAtencion(at, p).some((x) => x.severidad === 'error' && /dos veces/.test(x.mensaje)));
    }
  },

  // ---------------------------------------------------------- grupos de edad
  {
    grupo: 'Grupos de edad',
    nombre: 'Los cuatro tramos siguen las etapas de vida del MINSA',
    fn: () => {
      const g = (edadAnios) => grupoEtario(
        { fechaNacimiento: `${2026 - edadAnios}-01-01` }, '2026-06-01');
      igual(g(0), 'nino');
      igual(g(11), 'nino');
      igual(g(12), 'adolescente');
      igual(g(17), 'adolescente');
      igual(g(18), 'adulto');
      igual(g(59), 'adulto');
      igual(g(60), 'adulto_mayor');
      igual(g(90), 'adulto_mayor');
      igual(TRAMOS_ETARIOS.length, 4);
    }
  },
  {
    grupo: 'Grupos de edad',
    nombre: 'El grupo de edad y el tipo son obligatorios al inscribir',
    fn: () => {
      const p = padronVacio();
      const a = Object.assign(nuevoAfiliado(), {
        apellidoPaterno: 'Pérez', nombres: 'Ana', numeroDocumento: '00000001'
      });
      p.afiliados = [a];
      let hs = validarAfiliado(a, p);
      ok(hs.some((x) => x.severidad === 'error' && /grupo de edad/.test(x.mensaje)), 'grupo');
      ok(hs.some((x) => x.severidad === 'error' && /habitual o de ayuda social/.test(x.mensaje)), 'tipo');

      a.grupoEtarioManual = 'adulto';
      a.tipoAfiliado = 'caso_social';
      igual(contar(validarAfiliado(a, p)).errores, 0);

      a.grupoEtarioManual = 'anciano';
      ok(validarAfiliado(a, p).some((x) => x.severidad === 'error' && /no es uno de los cuatro/.test(x.mensaje)));
    }
  },

  // ---------------------------------------------------------- reporte padrón
  {
    grupo: 'Reporte',
    nombre: 'Las filas del padrón van numeradas y ordenadas por apellido',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [
        Object.assign(nuevoAfiliado(), { id: '1', apellidoPaterno: 'Zapata', nombres: 'Ana', numeroDocumento: '00000003', grupoEtarioManual: 'adulto', tipoAfiliado: 'habitual', altaEn: '2026-09-01' }),
        Object.assign(nuevoAfiliado(), { id: '2', apellidoPaterno: 'Álvarez', nombres: 'Rosa', numeroDocumento: '00000001', grupoEtarioManual: 'nino', tipoAfiliado: 'caso_social', altaEn: '2026-09-01' }),
        Object.assign(nuevoAfiliado(), { id: '3', apellidoPaterno: 'Baja', nombres: 'Luz', numeroDocumento: '00000002', grupoEtarioManual: 'adulto', tipoAfiliado: 'habitual', altaEn: '2026-09-01', activo: false, bajaEn: '2026-09-05' })
      ];
      const filas = filasPadron(p, '2026-09-20');
      igual(filas.length, 2, 'solo las activas');
      igual(filas[0].apellidoPaterno, 'Álvarez', 'ordenado con tildes');
      igual(filas[0].n, 1);
      igual(filas[1].n, 2);
      igual(filas[0].tipoAfiliadoEtiqueta, 'Ayuda social');
      igual(filas[0].grupoEtarioEtiqueta, 'Niño/a');
      igual(filas[0].edad, null, 'sin fecha de nacimiento no se inventa una edad');
    }
  },

  // -------------------------------------------------------------- migración v3
  {
    grupo: 'Migración',
    nombre: 'Un día de la v2 conserva sus raciones escritas a mano, marcadas como legado',
    fn: () => {
      const v2 = {
        version: 2,
        afiliados: [{ id: 'a', nombres: 'Ana' }],
        atenciones: [{
          id: 'at1', fecha: '2026-09-10',
          racionesNormales: 38, racionesAyudaSocial: 12,
          precioMenuNormalCent: 300, precioMenuAyudaSocialCent: 100, asistencias: []
        }]
      };
      const v3 = migrarPadron(v2);
      igual(v3.version, VERSION_PADRON);
      const at = v3.atenciones[0];
      const d = desgloseDelDia(at);
      igual(d.origen, 'legado');
      igual(d.normal, 38);
      igual(d.ayudaSocial, 12);
      igual(d.total, 50, 'siguen contando');
      igual(recaudacionDelDiaCent(at), 38 * 300 + 12 * 100, 'y siguen valorándose');
    }
  },
  {
    grupo: 'Migración',
    nombre: 'La v1 pasa por v2 hasta v3 sin inventar precios',
    fn: () => {
      const v1 = {
        version: 1,
        afiliados: [{ id: 'a', nombres: 'Ana', tipoDocumento: 'sin_documento' }],
        atenciones: [{ id: 'at1', fecha: '2026-09-10', racionesServidas: 50, racionesCasoSocial: 12 }]
      };
      const v3 = migrarPadron(v1);
      const at = v3.atenciones[0];
      igual(at.legado.racionesNormales, 38, '50 totales menos 12 de ayuda social');
      igual(at.legado.racionesAyudaSocial, 12);
      igual(at.precioMenuNormalCent, null, 'el precio nunca existió: no se inventa');
      igual(v3.afiliados[0].tipoAfiliado, '', 'el tipo queda por elegir, no se supone');
      igual(v3.afiliados[0].tipoDocumento, 'dni', '«sin documento» ya no existe');
    }
  },
  {
    grupo: 'Migración',
    nombre: 'Un día con asistencia marcada no hereda nada',
    fn: () => {
      const v2 = {
        version: 2,
        atenciones: [{
          id: 'at1', fecha: '2026-09-10', racionesNormales: 99,
          asistencias: [{ afiliadoId: 'a', tipoMenu: 'normal' }]
        }]
      };
      const at = migrarPadron(v2).atenciones[0];
      igual(at.legado, null);
      igual(racionesDelDia(at), 1, 'manda la asistencia');
    }
  },
  {
    grupo: 'Migración',
    nombre: 'Migrar algo ya migrado o basura no rompe nada',
    fn: () => {
      const ya = migrarPadron(migrarPadron({ version: 1, afiliados: [], atenciones: [] }));
      igual(ya.version, VERSION_PADRON);
      igual(migrarPadron(null).afiliados.length, 0);
      igual(migrarPadron('basura').atenciones.length, 0);
      igual(migrarPadron({}).version, VERSION_PADRON);
    }
  },

  // --------------------------------------------------------------- calendario
  {
    grupo: 'Entregas',
    nombre: 'avanzarPeriodo respeta semana, quincena y mes',
    fn: () => {
      igual(avanzarPeriodo('2026-09-14', 'semanal'), '2026-09-21');
      igual(avanzarPeriodo('2026-09-14', 'quincenal'), '2026-09-29');
      igual(avanzarPeriodo('2026-09-14', 'mensual'), '2026-10-14');
      igual(avanzarPeriodo('2026-01-31', 'mensual'), '2026-02-28', 'ajusta a fin de mes');
      igual(avanzarPeriodo('2026-09-14', 'mensual', -1), '2026-08-14');
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'Las fechas se cuentan hacia adelante y hacia atrás desde la base',
    fn: () => {
      const cal = Object.assign(calendarioVacio(), {
        periodicidad: 'mensual', fechaLimiteBase: '2026-03-14'
      });
      const f = fechasDeEntrega(cal, '2026-09-20', 3);
      igual(f[0], '2026-10-14', 'la primera que no ha pasado');
      igual(f[1], '2026-11-14');
      igual(f[2], '2026-12-14');

      const futuro = Object.assign(calendarioVacio(), {
        periodicidad: 'semanal', fechaLimiteBase: '2027-01-01'
      });
      igual(fechasDeEntrega(futuro, '2026-09-20', 1)[0], '2026-09-25', 'retrocede si la base es futura');
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'Sin configurar no inventa una fecha',
    fn: () => {
      const a = alertaProximaEntrega(calendarioVacio(), '2026-09-20');
      igual(a.configurado, false);
      ok(!a.fechaLimite, 'no debe traer ninguna fecha');
      igual(fechasDeEntrega(calendarioVacio(), '2026-09-20', 3).length, 0);
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'Cuenta los días que faltan y marca el nivel',
    fn: () => {
      const cal = Object.assign(calendarioVacio(), {
        periodicidad: 'mensual', fechaLimiteBase: '2026-09-20',
        entregas: [{ id: '1', fechaLimite: '2026-08-20', estado: 'entregada' }]
      });
      const a = alertaProximaEntrega(cal, '2026-09-17');
      igual(a.configurado, true);
      igual(a.fechaLimite, '2026-09-20');
      igual(a.diasRestantes, 3);
      igual(a.nivel, 'urgente');

      igual(nivelPorDias(0, [7, 3, 1]), 'hoy');
      igual(nivelPorDias(-2, [7, 3, 1]), 'vencida');
      igual(nivelPorDias(5, [7, 3, 1]), 'proxima');
      igual(nivelPorDias(40, [7, 3, 1]), 'lejana');
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'Una entrega pasada sin marcar pesa más que la siguiente',
    fn: () => {
      const cal = Object.assign(calendarioVacio(), {
        periodicidad: 'mensual', fechaLimiteBase: '2026-09-20'
      });
      const a = alertaProximaEntrega(cal, '2026-09-25');
      igual(a.nivel, 'vencida');
      igual(a.fechaLimite, '2026-09-20');
      igual(a.diasRestantes, -5);

      cal.entregas = [{ id: '1', fechaLimite: '2026-09-20', estado: 'entregada' }];
      const b = alertaProximaEntrega(cal, '2026-09-25');
      igual(b.nivel, 'lejana');
      igual(b.fechaLimite, '2026-10-20');
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'La agenda incluye la vencida y las siguientes',
    fn: () => {
      const cal = Object.assign(calendarioVacio(), {
        periodicidad: 'semanal', fechaLimiteBase: '2026-09-18'
      });
      const agenda = agendaEntregas(cal, '2026-09-20', 3);
      igual(agenda.length, 4, 'la anterior más tres');
      igual(agenda[0].fechaLimite, '2026-09-18');
      igual(agenda[0].nivel, 'vencida');
      igual(agenda[1].fechaLimite, '2026-09-25');
      ok(agenda[1].diasRestantes === 5);
    }
  },
  {
    grupo: 'Entregas',
    nombre: 'Sin fecha base avisa, pero no da error',
    fn: () => {
      const hs = validarCalendario(calendarioVacio());
      igual(contar(hs).errores, 0);
      ok(hs.some((x) => x.severidad === 'advertencia'));
    }
  },

  // ------------------------------------------------------------ escaneo de DNI
  {
    grupo: 'Escaneo DNI',
    nombre: 'parsearCadenaDni nunca lanza y devuelve el objeto completo',
    fn: () => {
      for (const entrada of ['', null, undefined, '§%&/()=?', 0, [], {}, 'x'.repeat(500)]) {
        const r = parsearCadenaDni(entrada);
        ok(r && typeof r === 'object', `devolvió algo raro para ${JSON.stringify(entrada)}`);
        for (const c of CAMPOS) ok(c in r, `falta el campo ${c}`);
        ok(Array.isArray(r.camposNoLeidos), 'camposNoLeidos debe ser un arreglo');
      }
    }
  },
  {
    grupo: 'Escaneo DNI',
    nombre: 'Mientras sea un stub, no afirma nada: confianza desconocida y todo vacío',
    fn: () => {
      const r = parsearCadenaDni('CUALQUIER COSA 12345678');
      igual(r.confianza, 'desconocida');
      igual(r.numeroDocumento, '');
      igual(r.apellidoPaterno, '');
      igual(r.nombres, '');
      igual(r.fechaNacimiento, '');
      igual(r.camposNoLeidos.length, CAMPOS.length, 'todos los campos quedan sin leer');
    }
  },

  // ---------------------------------------------------------------- sugerencias
  {
    grupo: 'Sugerencias',
    nombre: 'Toda sugerencia viaja con su procedencia',
    fn: () => {
      const config = { ultimoCentro: { guardadoEn: '2026-08-14', nombreCentro: 'Centro X', codigoPca: '123' } };
      const s = sugerenciasEncabezado(config);
      ok(s.nombreCentro && s.nombreCentro.procedencia, 'sin procedencia no se muestra');
      ok(/14-08-26/.test(s.nombreCentro.procedencia), 'la procedencia dice de cuándo viene');
      igual(s.nombreCentro.valor, 'Centro X');
    }
  },
  {
    grupo: 'Sugerencias',
    nombre: 'Sin datos previos no hay ninguna sugerencia (no se inventa nada)',
    fn: () => {
      igual(Object.keys(sugerenciasEncabezado(null)).length, 0);
      igual(Object.keys(sugerenciasEncabezado({})).length, 0);
      igual(sugerirRucProveedor([], 'Mercado'), null);
      igual(sugerirRucProveedor(null, ''), null);
    }
  },
  {
    grupo: 'Sugerencias',
    nombre: 'El RUC sugerido sale de una compra propia anterior',
    fn: () => {
      const rendiciones = [{
        egresos: [
          { proveedorNombre: 'Mercado Central', rucProveedor: '10000000001', fechaCompra: '2026-08-01' },
          { proveedorNombre: 'mercado  central', rucProveedor: '10000000009', fechaCompra: '2026-09-01' }
        ]
      }];
      const s = sugerirRucProveedor(rendiciones, 'MERCADO CENTRAL');
      igual(s.valor, '10000000009', 'la más reciente');
      ok(/01-09-26/.test(s.procedencia));
    }
  },

  // ------------------------------------------------------------- importación
  {
    grupo: 'Importar',
    nombre: 'Reconoce el separador de Excel, CSV y punto y coma',
    fn: () => {
      igual(detectarSeparador('a\tb\tc'), '\t');
      igual(detectarSeparador('a,b,c'), ',');
      igual(detectarSeparador('a;b;c'), ';');
      igual(detectarSeparador('"a,b";c'), ';', 'no cuenta los separadores entre comillas');
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Lee comillas, comas dentro del campo y filas vacías',
    fn: () => {
      const t = 'Apellido,Nombres\n"Pérez, Jr.",Ana\n\nQuispe,Rosa\n';
      const filas = parsearTabla(t);
      igual(filas.length, 3, 'la fila vacía se descarta');
      igual(filas[1][0], 'Pérez, Jr.');
      igual(filas[2][1], 'Rosa');
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Reconoce los títulos de columna aunque cambien de forma',
    fn: () => {
      const { mapa } = detectarColumnas(
        ['Ap. Paterno', 'APELLIDO MATERNO', 'Nombres', 'DNI', 'Grupo de edad', 'Tipo', 'Correo']);
      igual(mapa.apellidoPaterno, 0);
      igual(mapa.apellidoMaterno, 1);
      igual(mapa.nombres, 2);
      igual(mapa.numeroDocumento, 3);
      igual(mapa.grupoEtario, 4);
      igual(mapa.tipoAfiliado, 5);
      const { sinReconocer } = detectarColumnas(['Nombres', 'Correo']);
      ok(sinReconocer.includes('Correo'), 'lo que no entiende lo declara');
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Entiende las fechas como se escriben aquí',
    fn: () => {
      igual(parsearFechaFlexible('14-09-2026'), '2026-09-14');
      igual(parsearFechaFlexible('14/9/1960'), '1960-09-14');
      igual(parsearFechaFlexible('2026-09-14'), '2026-09-14');
      igual(parsearFechaFlexible('14-09-60'), '1960-09-14', 'dos dígitos: 60 es 1960');
      igual(parsearFechaFlexible('14-09-26'), '2026-09-14', 'y 26 es 2026');
      igual(parsearFechaFlexible('cualquier cosa'), '', 'no inventa una fecha');
      igual(parsearFechaFlexible(''), '');
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Entiende el grupo de edad y el tipo escritos de varias formas',
    fn: () => {
      igual(parsearGrupoEtario('Niño'), 'nino');
      igual(parsearGrupoEtario('NIÑA'), 'nino');
      igual(parsearGrupoEtario('adolescente'), 'adolescente');
      igual(parsearGrupoEtario('Adulto Mayor'), 'adulto_mayor');
      igual(parsearGrupoEtario('tercera edad'), 'adulto_mayor');
      igual(parsearGrupoEtario('Adulto'), 'adulto');
      igual(parsearGrupoEtario('vejete'), null, 'lo que no entiende queda sin grupo');

      igual(parsearTipoAfiliado('Ayuda social'), 'caso_social');
      igual(parsearTipoAfiliado('caso social'), 'caso_social');
      igual(parsearTipoAfiliado('SI'), 'caso_social');
      igual(parsearTipoAfiliado('Habitual'), 'habitual');
      igual(parsearTipoAfiliado('no'), 'habitual');
      igual(parsearTipoAfiliado('???'), '', 'no adivina');
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Clasifica cada fila y no importa duplicados ni vacíos',
    fn: () => {
      const p = padronVacio();
      p.afiliados = [Object.assign(nuevoAfiliado(), {
        id: 'ya', apellidoPaterno: 'Existente', nombres: 'Ana',
        numeroDocumento: '00000001', activo: true
      })];
      const texto = [
        'Apellido paterno\tApellido materno\tNombres\tDNI\tGrupo de edad\tTipo',
        'Quispe\tRojas\tRosa\t00000002\tAdulto\tHabitual',
        'Existente\t\tAna\t00000001\tAdulto\tHabitual',
        'Mamani\t\tLuz\t\t\t',
        '\t\t\t\t\t'
      ].join('\n');
      const r = prepararImportacion(texto, p);
      igual(r.error, null);
      igual(r.filas.length, 3, 'la fila totalmente vacía ni se cuenta');
      igual(r.resumen.lista, 1);
      igual(r.resumen.duplicada, 1);
      igual(r.resumen.incompleta, 1);
      igual(filasImportables(r.filas).length, 2, 'la duplicada queda fuera');

      const lista = r.filas.find((f) => f.estado === 'lista');
      igual(lista.afiliado.apellidoPaterno, 'Quispe');
      igual(lista.afiliado.grupoEtarioManual, 'adulto');
      igual(lista.afiliado.tipoAfiliado, 'habitual');
      igual(lista.afiliado.origenDato, 'importado', 'queda marcado de dónde vino');

      const incompleta = r.filas.find((f) => f.estado === 'incompleta');
      ok(/falta documento, grupo de edad, tipo/.test(incompleta.avisos.join()),
        'dice exactamente qué falta: ' + incompleta.avisos.join());
    }
  },
  {
    grupo: 'Importar',
    nombre: 'La edad en números también sirve para el grupo',
    fn: () => {
      const texto = 'Nombres\tApellido paterno\tEdad\tDNI\tTipo\n' +
        'Ana\tPerez\t8\t00000003\tHabitual\n' +
        'Rosa\tQuispe\t67\t00000004\tAyuda social';
      const r = prepararImportacion(texto, padronVacio());
      igual(r.filas[0].afiliado.grupoEtarioManual, 'nino');
      igual(r.filas[1].afiliado.grupoEtarioManual, 'adulto_mayor');
      igual(r.filas[1].afiliado.tipoAfiliado, 'caso_social');
      igual(r.resumen.lista, 2);
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Sin encabezado reconocible, no importa nada y lo explica',
    fn: () => {
      const r = prepararImportacion('Ana\tPerez\t12345678\nRosa\tQuispe\t87654321', padronVacio());
      igual(r.filas.length, 0);
      ok(r.error && /encabezado/.test(r.error), 'explica qué falta: ' + r.error);
      igual(prepararImportacion('', padronVacio()).filas.length, 0);
    }
  },
  {
    grupo: 'Importar',
    nombre: 'Lo exportado se puede volver a importar',
    fn: () => {
      const cab = 'N°,Apellido paterno,Apellido materno,Nombres,Tipo de documento,' +
        'Número de documento,Grupo de edad,Edad,Tipo,Días asistidos';
      const fila = '1,Álvarez,Rojas,Rosa,DNI,00000009,Niño/a,,Ayuda social,3';
      const r = prepararImportacion(cab + '\n' + fila, padronVacio());
      igual(r.error, null);
      igual(r.resumen.lista, 1, JSON.stringify(r.filas[0] && r.filas[0].avisos));
      const a = r.filas[0].afiliado;
      igual(a.apellidoPaterno, 'Álvarez');
      igual(a.numeroDocumento, '00000009');
      igual(a.grupoEtarioManual, 'nino');
      igual(a.tipoAfiliado, 'caso_social');
    }
  },

  // ---------------------------------------------------------------- utilidades
  {
    grupo: 'Fechas y texto',
    nombre: 'Las fechas se muestran como en el papel',
    fn: () => {
      igual(aDdMmAa('2026-09-14'), '14-09-26');
      igual(aDdMmAa(''), '');
      igual(aDdMmAa('no es fecha'), '');
      ok(esIso('2026-09-14'));
      ok(!esIso('14-09-2026'));
    }
  },
  {
    grupo: 'Fechas y texto',
    nombre: 'Normalizar nombres ignora tildes, mayúsculas y dobles espacios',
    fn: () => {
      igual(normalizarNombre('  MARÍA   José '), 'maria jose');
      igual(normalizarNombre('Maria Jose'), 'maria jose');
      igual(nombreCompleto({ apellidoPaterno: 'Pérez', apellidoMaterno: '', nombres: 'Ana' }), 'Pérez Ana');
    }
  }
];

export function ejecutar() {
  const resultados = [];
  for (const caso of casos) {
    try {
      caso.fn();
      resultados.push({ ...caso, estado: 'pasa', detalle: '' });
    } catch (e) {
      resultados.push({ ...caso, estado: 'falla', detalle: e && e.message ? e.message : String(e) });
    }
  }
  return resultados;
}
