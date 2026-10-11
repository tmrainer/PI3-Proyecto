// pagina-b1.js — controlador del Formato B-1 (fase 1).
// Enlaza el DOM con el modelo. No calcula ni valida: eso vive en sus módulos.

import {
  CLAVES, leer, guardar, nuevaRendicion, nuevoEgreso,
  aCentimos, formatearSoles, aNumero, debounce, hoyIso, configVacia, calendarioVacio, aDdMmAa, cuantos
} from './modelo.js';
import { totales, gastoPorOrigen, proponerPeriodo } from './calculos.js';
import { validarRendicion } from './validaciones.js';
import { sugerenciasEncabezado, instantaneaCentro } from './sugerencias.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  buscar, crearElemento, montarCabecera, bloquePrivacidad, barraDatos, pintarPanel,
  marcarCampo, cajaSugerencia, bannerAlerta, pintarAvisosAlmacenamiento,
  avisarAlSalirDelCampo, chip, mostrarGuardado
} from './ui.js';

// ------------------------------------------------------------------- estado

// rendiciones[0] es el B-1 en curso; los demás, los de meses anteriores, del
// más nuevo al más viejo. Antes había uno solo: empezar el mes siguiente era
// escribir encima del anterior y perderlo. Uno anterior se abre con
// ?ver=<id> (el formulario se monta una sola vez por carga de página).
let rendiciones = leer(CLAVES.rendiciones, []);
let config = leer(CLAVES.config, configVacia());
if (!rendiciones.length) rendiciones = [nuevaRendicion()];
const idPedido = new URLSearchParams(location.search).get('ver');
let indice = Math.max(0, rendiciones.findIndex((r) => r && r.id === idPedido));
let rendicion = rendiciones[indice];
if (!Array.isArray(rendicion.egresos) || rendicion.egresos.length === 0) {
  rendicion.egresos = [nuevoEgreso()];
}
// Campos marcados como "venidos de una sugerencia" hasta que se editen (§2.4).
const propuestos = new Set();

// Hay un cambio que el guardado diferido todavía no escribió.
let pendiente = false;

// true si se escribió todo. Un fallo se avisa en el momento.
function escribir() {
  pendiente = false;
  rendicion.actualizadoEn = new Date().toISOString();
  rendiciones[indice] = rendicion;
  const rendicionesOk = guardar(CLAVES.rendiciones, rendiciones);
  // La config la comparte con la página de asistencia, que puede estar abierta
  // en otra pestaña y cambiar el precio del menú. Se relee lo guardado y solo
  // se toca el campo que administra esta página; guardar la copia leída al
  // abrir devolvería el precio viejo.
  // Las sugerencias del encabezado salen del B-1 en curso, no de uno viejo.
  config = Object.assign(configVacia(), leer(CLAVES.config, {}),
    indice === 0 ? { ultimoCentro: instantaneaCentro(rendicion) } : {});
  const configOk = guardar(CLAVES.config, config);
  if (!rendicionesOk || !configOk) mostrarGuardado(false);
  return rendicionesOk && configOk;
}

const guardarDiferido = debounce(() => {
  if (pendiente && !escribir()) return;
  mostrarGuardado(true);
}, 400);

// Igual que en estado.js (vigilarPestanas): al ocultarse o cerrarse la página se
// escribe lo pendiente, y si otra pestaña guarda la rendición, esta se recarga
// para no pisarla después con su copia vieja. Aquí se recarga la página entera:
// el formulario engancha sus eventos al montarse y no se puede volver a montar.
function escribirPendiente() { if (pendiente) escribir(); }
addEventListener('pagehide', escribirPendiente);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') escribirPendiente();
});
addEventListener('storage', (e) => {
  if (e.key !== null && e.key !== CLAVES.rendiciones) return;
  pendiente = false;
  location.reload();
});

function cambio() {
  pendiente = true;
  guardarDiferido();
  refrescarTotales();
  refrescarValidacion();
}

// ------------------------------------------------------- enlace de campos

/** Texto simple: el modelo recibe exactamente lo escrito, sin transformar. */
function enlazarTexto(idInput, leerValor, escribirValor, { soloDigitos = false } = {}) {
  const el = buscar('#' + idInput);
  if (!el) return;
  el.value = leerValor() || '';
  el.addEventListener('input', () => {
    if (soloDigitos) {
      const limpio = el.value.replace(/\D/g, '');
      if (limpio !== el.value) {
        const pos = el.selectionStart;
        el.value = limpio;
        try { el.setSelectionRange(pos - 1, pos - 1); } catch (e) { /* ignorar */ }
      }
    }
    escribirValor(el.value);
    desmarcarPropuesto(idInput);
    cambio();
  });
}

function desmarcarPropuesto(id) {
  if (!propuestos.has(id)) return;
  propuestos.delete(id);
  const el = buscar('#' + id);
  if (el) el.classList.remove('propuesto');
  const marca = buscar(`#marca-${id}`);
  if (marca) marca.remove();
}

function aceptarSugerencia(id, valor) {
  const el = buscar('#' + id);
  if (!el) return;
  el.value = valor;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  propuestos.add(id);
  el.classList.add('propuesto');
  if (!buscar(`#marca-${id}`)) {
    el.insertAdjacentElement('afterend',
      crearElemento('span', { id: `marca-${id}`, clase: 'marca-propuesto', texto: 'Dato propuesto — revísalo' }));
  }
}

// ---------------------------------------------------------------- encabezado

function montarEncabezado() {
  for (const radio of document.querySelectorAll('input[name="tipoCentro"]')) {
    radio.checked = rendicion.tipoCentro === radio.value;
    radio.addEventListener('change', () => {
      rendicion.tipoCentro = radio.value;
      cambio();
    });
  }
  enlazarTexto('nombreCentro', () => rendicion.nombreCentro, (v) => { rendicion.nombreCentro = v; });
  enlazarTexto('codigoPca', () => rendicion.codigoPca, (v) => { rendicion.codigoPca = v; }, { soloDigitos: true });
  enlazarTexto('nombrePresidenta', () => rendicion.nombrePresidenta, (v) => { rendicion.nombrePresidenta = v; });
  enlazarTexto('dniPresidenta', () => rendicion.dniPresidenta, (v) => { rendicion.dniPresidenta = v; }, { soloDigitos: true });
  enlazarTexto('celular', () => rendicion.celular, (v) => { rendicion.celular = v; }, { soloDigitos: true });
  enlazarTexto('fechaRendicion', () => rendicion.fechaRendicion, (v) => { rendicion.fechaRendicion = v; });
  enlazarTexto('nombrePresidentaFirma', () => rendicion.nombrePresidentaFirma, (v) => { rendicion.nombrePresidentaFirma = v; });
  enlazarTexto('dniPresidentaFirma', () => rendicion.dniPresidentaFirma, (v) => { rendicion.dniPresidentaFirma = v; }, { soloDigitos: true });
  enlazarTexto('nombreTesorera', () => rendicion.nombreTesorera, (v) => { rendicion.nombreTesorera = v; });
  enlazarTexto('dniTesorera', () => rendicion.dniTesorera, (v) => { rendicion.dniTesorera = v; }, { soloDigitos: true });

  enlazarTexto('montoSubsidio',
    () => formatearSoles(rendicion.montoSubsidioCent),
    (v) => { rendicion.montoSubsidioCent = aCentimos(v); });
  enlazarTexto('fechaAsignacion', () => rendicion.fechaAsignacion, (v) => { rendicion.fechaAsignacion = v; });

  montarSugerenciasEncabezado();
}

function montarSugerenciasEncabezado() {
  const caja = buscar('#sugerencias-encabezado');
  caja.textContent = '';
  // Una sugerencia NUNCA se aplica sola: solo se ofrece (AGENTS.md §2).
  const props = sugerenciasEncabezado(config);
  const pendientes = Object.entries(props).filter(([campo]) => {
    if (campo === 'tipoCentro') return !rendicion.tipoCentro;
    return !String(rendicion[campo] || '').trim();
  });
  if (pendientes.length === 0) return;

  caja.append(crearElemento('p', {
    clase: 'pista',
    texto: `Tienes los datos del centro ${pendientes[0][1].procedencia}. Puedes usarlos o escribirlos de nuevo.`
  }));
  caja.append(crearElemento('div', { clase: 'acciones' }, [
    crearElemento('button', {
      type: 'button', clase: 'boton secundario',
      texto: `Usar los datos del centro (${pendientes.length})`,
      onclick: () => {
        for (const [campo, p] of pendientes) {
          if (campo === 'tipoCentro') {
            rendicion.tipoCentro = p.valor;
            for (const r of document.querySelectorAll('input[name="tipoCentro"]')) {
              r.checked = r.value === p.valor;
            }
          } else {
            aceptarSugerencia(campo, p.valor);
          }
        }
        cambio();
        montarSugerenciasEncabezado();
      }
    })
  ]));
}

// -------------------------------------------------------------------- periodo

function montarPeriodo() {
  const selTipo = buscar('#periodoTipo');
  selTipo.value = rendicion.periodo.tipo || 'mensual';
  selTipo.addEventListener('change', () => {
    rendicion.periodo.tipo = selTipo.value;
    cambio();
    mostrarPropuestaPeriodo();
  });

  enlazarTexto('periodoInicio', () => rendicion.periodo.inicio, (v) => { rendicion.periodo.inicio = v; });
  enlazarTexto('periodoFin', () => rendicion.periodo.fin, (v) => { rendicion.periodo.fin = v; });
  enlazarTexto('periodoEtiqueta', () => rendicion.periodo.etiqueta, (v) => { rendicion.periodo.etiqueta = v; });

  mostrarPropuestaPeriodo();
}

function mostrarPropuestaPeriodo() {
  const caja = buscar('#sugerencia-periodo');
  caja.textContent = '';
  const ref = rendicion.fechaRendicion || hoyIso();
  const p = proponerPeriodo(rendicion.periodo.tipo || 'mensual', ref);
  const yaIgual = rendicion.periodo.inicio === p.inicio && rendicion.periodo.fin === p.fin;
  if (yaIgual && rendicion.periodo.etiqueta) return;

  const fila = crearElemento('div', { clase: 'sugerencia' }, [
    crearElemento('span', { clase: 'sugerencia-etiqueta', texto: 'Sugerencia' }),
    crearElemento('span', { clase: 'sugerencia-valor', texto: `${aDdMmAa(p.inicio)} a ${aDdMmAa(p.fin)}` }),
    crearElemento('button', {
      type: 'button', clase: 'boton diminuto', texto: 'Usar estas fechas',
      onclick: () => {
        rendicion.periodo.inicio = p.inicio;
        rendicion.periodo.fin = p.fin;
        buscar('#periodoInicio').value = p.inicio;
        buscar('#periodoFin').value = p.fin;
        cambio();
        mostrarPropuestaPeriodo();
      }
    })
  ]);
  caja.append(fila);

  const etiquetas = crearElemento('div', { clase: 'sugerencia' }, [
    crearElemento('span', { clase: 'sugerencia-etiqueta', texto: 'Texto sugerido' })
  ]);
  for (const alt of p.alternativas) {
    etiquetas.append(crearElemento('button', {
      type: 'button', clase: 'boton diminuto', texto: alt,
      onclick: () => {
        rendicion.periodo.etiqueta = alt;
        buscar('#periodoEtiqueta').value = alt;
        cambio();
        mostrarPropuestaPeriodo();
      }
    }));
  }
  caja.append(etiquetas);
}

// -------------------------------------------------------------------- egresos

const UNIDADES = ['Kg', 'g', 'L', 'ml', 'unid', 'saco', 'bolsa', 'caja', 'varios'];
const ORIGENES = [
  ['subsidio', 'Subsidio municipal'],
  ['ayuda_social', 'Ayuda social / donación'],
  ['aporte_propio', 'Aporte propio del centro']
];

function campo(etiqueta, control, pista) {
  return crearElemento('div', { clase: 'campo' }, [
    crearElemento('label', { for: control.id, texto: etiqueta }),
    control,
    pista ? crearElemento('span', { clase: 'pista', texto: pista }) : null
  ]);
}

function fichaEgreso(fila, indice) {
  const idp = fila.id.slice(0, 8);

  const fFecha = crearElemento('input', { id: `e-fecha-${idp}`, type: 'date', value: fila.fechaCompra || '' });
  fFecha.addEventListener('input', () => { fila.fechaCompra = fFecha.value; cambio(); });

  const fDesc = crearElemento('input', { id: `e-desc-${idp}`, type: 'text', value: fila.descripcion || '', autocomplete: 'off' });
  fDesc.addEventListener('input', () => { fila.descripcion = fDesc.value; cambio(); });

  const fCant = crearElemento('input', {
    id: `e-cant-${idp}`, type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: fila.cantidad === null || fila.cantidad === undefined ? '' : String(fila.cantidad)
  });
  fCant.addEventListener('input', () => { fila.cantidad = aNumero(fCant.value); cambio(); });

  const chkCant = crearElemento('input', { id: `e-cantv-${idp}`, type: 'checkbox' });
  chkCant.checked = !!fila.cantidadVarios;
  chkCant.addEventListener('change', () => {
    fila.cantidadVarios = chkCant.checked;
    fCant.disabled = chkCant.checked;
    if (chkCant.checked) { fCant.value = ''; fila.cantidad = null; }
    cambio();
  });
  fCant.disabled = !!fila.cantidadVarios;

  const fUnidad = crearElemento('select', { id: `e-unid-${idp}` },
    [crearElemento('option', { value: '', texto: '—' })].concat(
      UNIDADES.map((u) => crearElemento('option', { value: u, texto: u }))));
  fUnidad.value = fila.unidadMedida || '';
  fUnidad.addEventListener('change', () => { fila.unidadMedida = fUnidad.value; cambio(); });

  const fRuc = crearElemento('input', {
    id: `e-ruc-${idp}`, type: 'text', inputmode: 'numeric', maxlength: '11',
    value: fila.rucProveedor || '', autocomplete: 'off'
  });
  fRuc.addEventListener('input', () => {
    fRuc.value = fRuc.value.replace(/\D/g, '');
    fila.rucProveedor = fRuc.value;
    cambio();
  });

  const fProv = crearElemento('input', {
    id: `e-prov-${idp}`, type: 'text', value: fila.proveedorNombre || '', autocomplete: 'off'
  });
  fProv.addEventListener('input', () => { fila.proveedorNombre = fProv.value; cambio(); });

  const fSerie = crearElemento('input', {
    id: `e-serie-${idp}`, type: 'text', value: fila.boletaSerie || '', autocomplete: 'off', placeholder: 'E001'
  });
  fSerie.addEventListener('input', () => { fila.boletaSerie = fSerie.value; cambio(); });

  const fCorr = crearElemento('input', {
    id: `e-corr-${idp}`, type: 'text', value: fila.boletaCorrelativo || '', autocomplete: 'off', placeholder: '000143'
  });
  fCorr.addEventListener('input', () => { fila.boletaCorrelativo = fCorr.value; cambio(); });

  const fPrecio = crearElemento('input', {
    id: `e-pu-${idp}`, type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: formatearSoles(fila.precioUnitarioCent)
  });
  fPrecio.addEventListener('input', () => { fila.precioUnitarioCent = aCentimos(fPrecio.value); cambio(); });

  const chkPrecio = crearElemento('input', { id: `e-puv-${idp}`, type: 'checkbox' });
  chkPrecio.checked = !!fila.precioUnitarioVarios;
  chkPrecio.addEventListener('change', () => {
    fila.precioUnitarioVarios = chkPrecio.checked;
    fPrecio.disabled = chkPrecio.checked;
    if (chkPrecio.checked) { fPrecio.value = ''; fila.precioUnitarioCent = null; }
    cambio();
  });
  fPrecio.disabled = !!fila.precioUnitarioVarios;

  const fMonto = crearElemento('input', {
    id: `e-total-${idp}`, type: 'text', inputmode: 'decimal', autocomplete: 'off',
    value: formatearSoles(fila.montoTotalCent), placeholder: '0.00'
  });
  fMonto.addEventListener('input', () => { fila.montoTotalCent = aCentimos(fMonto.value); cambio(); });

  const fOrigen = crearElemento('select', { id: `e-origen-${idp}` },
    ORIGENES.map(([v, t]) => crearElemento('option', { value: v, texto: t })));
  fOrigen.value = fila.origenFondo || 'subsidio';
  fOrigen.addEventListener('change', () => { fila.origenFondo = fOrigen.value; cambio(); });

  // Cada compra se pliega en una línea con lo que la identifica. Con 17 boletas
  // abiertas eran unas 27 pantallas de celular; plegadas, la lista se recorre
  // de un vistazo y se abre solo la que hay que tocar.
  const resumen = crearElemento('span', { clase: 'ficha-resumen', texto: resumenEgreso(fila) });
  const ficha = crearElemento('details', {
    clase: 'ficha', id: `ficha-${fila.id}`, 'data-campo': `egreso.${fila.id}`,
    oninput: () => { resumen.textContent = resumenEgreso(fila); },
    onchange: () => { resumen.textContent = resumenEgreso(fila); }
  }, [
    crearElemento('summary', { clase: 'ficha-cabecera' }, [
      crearElemento('span', { clase: 'ficha-numero', texto: `Compra ${indice + 1}` }),
      resumen,
      crearElemento('span', { clase: 'ficha-estado' })
    ]),
    crearElemento('div', { clase: 'ficha-quitar' }, [
      crearElemento('button', {
        type: 'button', clase: 'boton diminuto peligro', texto: `Quitar la compra ${indice + 1}`,
        onclick: () => {
          if (!confirm(`¿Quitar la compra ${indice + 1}? Esto borra lo que escribiste en esa ficha.`)) return;
          rendicion.egresos = rendicion.egresos.filter((f) => f.id !== fila.id);
          if (rendicion.egresos.length === 0) rendicion.egresos.push(nuevoEgreso());
          pintarEgresos();
          cambio();
        }
      })
    ]),
    crearElemento('div', { clase: 'rejilla dos' }, [
      campo('Fecha de la compra', fFecha),
      campo('Descripción de la compra', fDesc)
    ]),
    crearElemento('div', { clase: 'rejilla dos', style: 'margin-top:10px' }, [
      crearElemento('div', { clase: 'rejilla par' }, [
        campo('Cantidad', fCant),
        campo('Unidad de medida', fUnidad),
        // A lo ancho: en media columna, la casilla se partía en tres renglones.
        crearElemento('label', { clase: 'opcion a-lo-ancho' }, [chkCant, 'La boleta dice «varios» en la cantidad'])
      ]),
      // RM D000064-2026-MIDIS: el subsidio es exclusivamente para comprar alimentos.
      campo('Origen del dinero', fOrigen, 'No va al formato. El subsidio municipal es solo para alimentos.')
    ]),
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('RUC del proveedor', fRuc),
      campo('Nombre del proveedor', fProv, 'No va al formato.'),
      crearElemento('div', { clase: 'rejilla par' }, [
        campo('Serie', fSerie),
        campo('Correlativo', fCorr)
      ])
    ]),
    crearElemento('div', { clase: 'rejilla par', style: 'margin-top:10px' }, [
      campo('Precio unitario (S/)', fPrecio),
      campo('Monto total (S/)', fMonto),
      crearElemento('label', { clase: 'opcion a-lo-ancho' }, [chkPrecio, 'La boleta dice «varios» en el precio'])
    ])
  ]);
  // Abierta mientras le falte lo básico: una ficha nueva se abre para llenarla.
  ficha.open = !egresoCompleto(fila);
  return ficha;
}

function egresoCompleto(fila) {
  return !!(fila.fechaCompra && (fila.descripcion || '').trim() &&
    fila.montoTotalCent !== null && fila.montoTotalCent !== undefined);
}

/** «12-10-26 · Arroz · S/ 45.00», o qué le falta. Solo para mostrar. */
function resumenEgreso(fila) {
  const partes = [];
  if (fila.fechaCompra) partes.push(aDdMmAa(fila.fechaCompra));
  if ((fila.descripcion || '').trim()) partes.push(fila.descripcion.trim());
  const monto = formatearSoles(fila.montoTotalCent);
  if (monto) partes.push('S/ ' + monto);
  return partes.length ? partes.join(' · ') : 'sin llenar';
}

function pintarEgresos() {
  const lista = buscar('#lista-egresos');
  lista.textContent = '';
  rendicion.egresos.forEach((fila, i) => lista.append(fichaEgreso(fila, i)));
  buscar('#conteo-egresos').textContent =
    `${cuantos(rendicion.egresos.length, 'compra')}. La hoja del formato tiene 17 filas.`;
}

// ------------------------------------------------------------------- totales

function refrescarTotales() {
  const t = totales(rendicion);
  const pon = (id, valor, ocultarCero) => {
    const el = buscar('#' + id);
    const mostrar = valor !== null && !(ocultarCero && valor === 0);
    el.textContent = mostrar ? 'S/ ' + formatearSoles(valor) : '';
    el.classList.toggle('vacio', !mostrar);
  };
  pon('total-con-subsidio', t.conSubsidio, false);
  // "Registrar de corresponder": si es cero, el renglón va vacío (AGENTS.md §6.1).
  pon('total-aporte', t.aporte, true);
  pon('total-rendicion', t.total, false);

  const po = gastoPorOrigen(rendicion);
  const caja = buscar('#resumen-origen');
  caja.textContent = '';
  const etiquetas = { subsidio: 'Subsidio', ayuda_social: 'Ayuda social', aporte_propio: 'Aporte propio' };
  for (const [clave, etiqueta] of Object.entries(etiquetas)) {
    if (!po[clave]) continue;
    caja.append(chip(`${etiqueta}`, `S/ ${formatearSoles(po[clave])}`));
  }
}

// ---------------------------------------------------------------- validación

function refrescarValidacion() {
  const hallazgos = validarRendicion(rendicion);
  pintarPanel(buscar('#panel'), hallazgos, { alIrA: irACampo });

  for (const caja of document.querySelectorAll('[data-campo]')) {
    const propios = hallazgos.filter((x) => x.campo === caja.dataset.campo);
    marcarCampo(caja, propios);
    const control = caja.querySelector('input, select, textarea');
    if (control) marcarCampo(control, propios);
  }
  // Una compra plegada con un problema lo dice en su línea, no solo con el color.
  for (const ficha of document.querySelectorAll('#lista-egresos .ficha')) {
    const estado = ficha.querySelector('.ficha-estado');
    if (!estado) continue;
    estado.textContent = ficha.classList.contains('con-error') ? 'con error'
      : ficha.classList.contains('con-aviso') ? 'revisar' : '';
  }
}

function irACampo(campo) {
  const caja = document.querySelector(`[data-campo="${CSS.escape(campo)}"]`);
  if (!caja) return;
  if (caja.tagName === 'DETAILS') caja.open = true;
  caja.scrollIntoView({ block: 'center' });
  const control = caja.querySelector('input, select, textarea');
  if (control && !control.disabled) control.focus({ preventScroll: true });
}

// ----------------------------------------------------- meses anteriores

/** «Octubre», o las fechas del periodo, o «sin periodo». Solo para mostrar. */
function nombreDelMes(r) {
  const p = (r && r.periodo) || {};
  if ((p.etiqueta || '').trim()) return p.etiqueta.trim();
  if (p.inicio || p.fin) return `${aDdMmAa(p.inicio) || '…'} a ${aDdMmAa(p.fin) || '…'}`;
  return 'sin periodo';
}

function pintarMeses() {
  const caja = buscar('#meses-b1');
  caja.textContent = '';
  const anteriores = rendiciones.slice(1);

  if (indice > 0) {
    // Abierto uno anterior: se dice arriba, para no confundirlo con el del mes.
    buscar('#avisos-sistema').prepend(crearElemento('div', { clase: 'recordatorio-respaldo', role: 'status' }, [
      crearElemento('span', { texto: `Estás viendo el B-1 de un mes anterior: ${nombreDelMes(rendicion)}.` }),
      crearElemento('a', { clase: 'boton diminuto', href: './formato-b1.html', texto: 'Volver al B-1 del mes' })
    ]));
  } else {
    caja.append(
      crearElemento('p', {
        clase: 'pista',
        texto: 'Cuando entregues este B-1, empieza el del mes siguiente. Este queda guardado aquí abajo.'
      }),
      crearElemento('button', {
        type: 'button', clase: 'boton secundario', texto: 'Empezar el B-1 del mes siguiente',
        onclick: empezarMesSiguiente
      })
    );
  }

  if (anteriores.length === 0) return;
  const lista = crearElemento('ul', { clase: 'meses-lista' });
  rendiciones.forEach((r, i) => {
    if (i === 0) return;
    const t = totales(r);
    lista.append(crearElemento('li', { clase: i === indice ? 'mes-item abierto' : 'mes-item' }, [
      crearElemento('span', { clase: 'mes-nombre', texto: nombreDelMes(r) }),
      crearElemento('span', {
        clase: 'mes-total',
        texto: t.total === null ? 'sin subsidio' : `S/ ${formatearSoles(t.total)}`
      }),
      i === indice
        ? crearElemento('span', { clase: 'mes-abierto', texto: 'abierto' })
        : crearElemento('a', { clase: 'boton diminuto secundario', href: `./formato-b1.html?ver=${encodeURIComponent(r.id)}`, texto: 'Abrir' })
    ]));
  });
  caja.append(lista);
}

function empezarMesSiguiente() {
  if (!confirm(`El B-1 de ${nombreDelMes(rendicion)} queda guardado en «Meses anteriores».\n\n` +
    '¿Empezar el B-1 del mes siguiente?')) return;
  if (pendiente) escribir();
  const nueva = nuevaRendicion();
  // Solo cada cuánto se entrega: lo demás lo propone la app desde el mes
  // anterior y la persona acepta (sugerencias del encabezado, AGENTS.md §2.4).
  nueva.periodo.tipo = (rendicion.periodo && rendicion.periodo.tipo) || nueva.periodo.tipo;
  rendiciones.unshift(nueva);
  // Directo, sin escribir(): este B-1 vacío no debe borrar las sugerencias
  // del centro que dejó el anterior.
  if (!guardar(CLAVES.rendiciones, rendiciones)) {
    rendiciones.shift();
    mostrarGuardado(false);
    return;
  }
  pendiente = false;
  location.href = './formato-b1.html';
}

// ------------------------------------------------------------------- arranque

montarCabecera('b1', 'Ollas comunes y comedores de Villa María del Triunfo');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));
const bannerB1 = bannerAlerta(alertaProximaEntrega(leer(CLAVES.calendario, calendarioVacio()), hoyIso()));
if (bannerB1) buscar('#banner').append(bannerB1);
buscar('#privacidad').append(bloquePrivacidad());
// Antes de recargar se descarta lo pendiente: si no, el pagehide de la recarga
// escribiría encima la copia vieja.
buscar('#barra-datos').append(barraDatos({ antesDeRecargar: () => { pendiente = false; } }));

buscar('#agregar-egreso').addEventListener('click', () => {
  rendicion.egresos.push(nuevoEgreso());
  pintarEgresos();
  cambio();
  const fichas = document.querySelectorAll('#lista-egresos .ficha');
  const ultima = fichas[fichas.length - 1];
  if (ultima) {
    ultima.scrollIntoView({ block: 'center' });
    const primero = ultima.querySelector('input');
    if (primero) primero.focus({ preventScroll: true });
  }
});

montarEncabezado();
montarPeriodo();
pintarMeses();
pintarEgresos();
refrescarTotales();
refrescarValidacion();

avisarAlSalirDelCampo(refrescarValidacion);
