// pagina-b1.js — controlador del Formato B-1 (fase 1).
// Enlaza el DOM con el modelo. No calcula ni valida: eso vive en sus módulos.

import {
  CLAVES, leer, guardar, nuevaRendicion, nuevoEgreso,
  aCentimos, formatearSoles, aNumero, debounce, hoyIso, configVacia, calendarioVacio
} from './modelo.js';
import { totales, gastoPorOrigen, proponerPeriodo } from './calculos.js';
import { validarRendicion } from './validaciones.js';
import { sugerenciasEncabezado, instantaneaCentro } from './sugerencias.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  buscar, crearElemento, montarCabecera, bloquePrivacidad, barraDatos, pintarPanel,
  marcarCampo, cajaSugerencia, bannerAlerta, pintarAvisosAlmacenamiento,
  avisarAlSalirDelCampo
} from './ui.js';

// ------------------------------------------------------------------- estado

let rendiciones = leer(CLAVES.rendiciones, []);
let config = leer(CLAVES.config, configVacia());
let rendicion = rendiciones[0] || nuevaRendicion();
if (!rendiciones.length) rendiciones = [rendicion];
if (!Array.isArray(rendicion.egresos) || rendicion.egresos.length === 0) {
  rendicion.egresos = [nuevoEgreso()];
}
// Campos marcados como "venidos de una sugerencia" hasta que se editen (§2.4).
const propuestos = new Set();

const guardarDiferido = debounce(() => {
  rendicion.actualizadoEn = new Date().toISOString();
  rendiciones[0] = rendicion;
  guardar(CLAVES.rendiciones, rendiciones);
  // La config la comparte con la página de asistencia, que puede estar abierta
  // en otra pestaña y cambiar el precio del menú. Se relee lo guardado y solo
  // se toca el campo que administra esta página; guardar la copia leída al
  // abrir devolvería el precio viejo.
  config = Object.assign(configVacia(), leer(CLAVES.config, {}),
    { ultimoCentro: instantaneaCentro(rendicion) });
  guardar(CLAVES.config, config);
  buscar('#estado-guardado').textContent = 'Guardado en este dispositivo.';
}, 400);

function cambio() {
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
    texto: 'Tienes datos de una rendición anterior. Puedes usarlos o escribirlos de nuevo.'
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
    }),
    crearElemento('span', {
      clase: 'sugerencia-proc',
      texto: pendientes[0][1].procedencia
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
    crearElemento('span', { clase: 'sugerencia-valor', texto: `${p.inicio} a ${p.fin}` }),
    crearElemento('span', { clase: 'sugerencia-proc', texto: `según la fecha ${ref}` }),
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
  etiquetas.append(crearElemento('span', { clase: 'sugerencia-proc', texto: 'elige uno o escribe el tuyo' }));
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

  return crearElemento('article', { clase: 'ficha', id: `ficha-${fila.id}`, 'data-campo': `egreso.${fila.id}` }, [
    crearElemento('div', { clase: 'ficha-cabecera' }, [
      crearElemento('span', { clase: 'ficha-numero', texto: `Compra ${indice + 1}` }),
      crearElemento('button', {
        type: 'button', clase: 'boton diminuto peligro', texto: 'Quitar',
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
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      crearElemento('div', { clase: 'campo' }, [
        crearElemento('label', { for: fCant.id, texto: 'Cantidad' }),
        fCant,
        crearElemento('label', { clase: 'opcion' }, [chkCant, 'La boleta dice «varios»'])
      ]),
      campo('Unidad de medida', fUnidad),
      campo('Origen del dinero', fOrigen, 'No va al formato; sirve para tus cuentas.')
    ]),
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('RUC del proveedor', fRuc),
      campo('Nombre del proveedor', fProv, 'No va al formato. Sirve para recordar su RUC.'),
      crearElemento('div', { clase: 'rejilla dos' }, [
        campo('Serie', fSerie),
        campo('Correlativo', fCorr)
      ])
    ]),
    crearElemento('div', { clase: 'rejilla dos', style: 'margin-top:10px' }, [
      crearElemento('div', { clase: 'campo' }, [
        crearElemento('label', { for: fPrecio.id, texto: 'Precio unitario (S/)' }),
        fPrecio,
        crearElemento('label', { clase: 'opcion' }, [chkPrecio, 'La boleta dice «varios»'])
      ]),
      campo('Monto total de la boleta (S/)', fMonto, 'Este es el número que suma.')
    ])
  ]);
}

function pintarEgresos() {
  const lista = buscar('#lista-egresos');
  lista.textContent = '';
  rendicion.egresos.forEach((fila, i) => lista.append(fichaEgreso(fila, i)));
  buscar('#conteo-egresos').textContent =
    `${rendicion.egresos.length} ficha(s). La hoja del formato tiene 17 filas.`;
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
    caja.append(crearElemento('span', { clase: 'chip', html: `${etiqueta}: <b>S/ ${formatearSoles(po[clave])}</b>` }));
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
}

function irACampo(campo) {
  const caja = document.querySelector(`[data-campo="${CSS.escape(campo)}"]`);
  if (!caja) return;
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const control = caja.querySelector('input, select, textarea');
  if (control && !control.disabled) control.focus({ preventScroll: true });
}

// ------------------------------------------------------------------- arranque

montarCabecera('b1', 'Ollas comunes y comedores de Villa María del Triunfo');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));
const bannerB1 = bannerAlerta(alertaProximaEntrega(leer(CLAVES.calendario, calendarioVacio()), hoyIso()));
if (bannerB1) buscar('#banner').append(bannerB1);
buscar('#privacidad').append(bloquePrivacidad());
buscar('#barra-datos').append(barraDatos({
  alImportar: (datos) => {
    if (!datos || !Array.isArray(datos.rendiciones)) {
      alert('El archivo no contiene rendiciones. No se cambió nada.');
      return;
    }
    if (!confirm('Importar reemplazará la rendición que tienes en pantalla. ¿Continuar?')) return;
    rendiciones = datos.rendiciones;
    guardar(CLAVES.rendiciones, rendiciones);
    if (datos.config) guardar(CLAVES.config, datos.config);
    location.reload();
  },
  alBorrar: () => location.reload()
}));

buscar('#agregar-egreso').addEventListener('click', () => {
  rendicion.egresos.push(nuevoEgreso());
  pintarEgresos();
  cambio();
  const fichas = document.querySelectorAll('#lista-egresos .ficha');
  const ultima = fichas[fichas.length - 1];
  if (ultima) {
    ultima.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const primero = ultima.querySelector('input');
    if (primero) primero.focus({ preventScroll: true });
  }
});

montarEncabezado();
montarPeriodo();
pintarEgresos();
refrescarTotales();
refrescarValidacion();

avisarAlSalirDelCampo(refrescarValidacion);
