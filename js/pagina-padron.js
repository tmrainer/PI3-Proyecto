// pagina-padron.js — padrón, asistencia y raciones (fase 2).
// Las raciones NO se escriben: se cuentan de la asistencia marcada (AGENTS.md §6.5).

import {
  CLAVES, leer, guardar, padronVacio, migrarPadron, nuevoAfiliado, nuevaAtencion,
  nombreCompleto, normalizarNombre, aDdMmAa, hoyIso, debounce, esIso, aCentimos,
  formatearSoles, calendarioVacio, configVacia, descargarTexto, VERSION_PADRON
} from './modelo.js';
import {
  afiliadosActivos, grupoEtario, etiquetaGrupoEtario, edadEnFecha,
  resumenEtario, TRAMOS_ETARIOS, TIPOS_AFILIADO, menuPorDefecto,
  desgloseDelDia, recaudacionDelDiaCent, resumenEconomicoRaciones,
  asistenciaPorAfiliado, afiliadosSinAsistencia, asistio, menuDe, filasPadron
} from './calculos.js';
import { validarPadron, validarAfiliado, validarPreciosMenu } from './validaciones.js';
import { soportaCamaraPdf417 } from './escaneo-dni.js';
import { alertaProximaEntrega } from './alertas.js';
import { prepararImportacion, filasImportables } from './importar.js';
import {
  $, crear, montarCabecera, bloquePrivacidad, barraDatos, pintarPanel,
  marcarCampo, bannerAlerta, pintarAvisosAlmacenamiento
} from './ui.js';

// ------------------------------------------------------------------- estado

let padron = leer(CLAVES.padron, padronVacio());
if (padron.version !== VERSION_PADRON) padron = migrarPadron(padron);
if (!Array.isArray(padron.afiliados)) padron.afiliados = [];
if (!Array.isArray(padron.atenciones)) padron.atenciones = [];

const config = Object.assign(configVacia(), leer(CLAVES.config, {}));
const calendario = leer(CLAVES.calendario, calendarioVacio());

let fechaRef = hoyIso();
let periodoInicio = fechaRef.slice(0, 8) + '01';
let periodoFin = fechaRef;
let busqueda = '';
let filtroLista = 'activos';

const guardarDiferido = debounce(() => {
  guardar(CLAVES.padron, padron);
  guardar(CLAVES.config, config);
  $('#estado-guardado').textContent = 'Guardado en este dispositivo.';
}, 400);

function cambio({ repintar = false } = {}) {
  guardarDiferido();
  if (repintar) {
    pintarAfiliados();
    pintarAtenciones();
  }
  pintarResumen();
  pintarReporte();
  refrescarValidacion();
}

function preciosActuales() {
  return {
    precioMenuNormalCent: config.precioMenuNormalCent,
    precioMenuAyudaSocialCent: config.precioMenuAyudaSocialCent
  };
}

function campo(etiqueta, control, pista) {
  return crear('div', { clase: 'campo' }, [
    crear('label', { for: control.id, texto: etiqueta }),
    control,
    pista ? crear('span', { clase: 'pista', texto: pista }) : null
  ]);
}

// ------------------------------------------------------------ precio del menú

function montarPrecios() {
  const enlazar = (id, prop) => {
    const el = $('#' + id);
    el.value = formatearSoles(config[prop]);
    el.addEventListener('input', () => { config[prop] = aCentimos(el.value); cambio(); });
  };
  enlazar('precioNormal', 'precioMenuNormalCent');
  enlazar('precioAyuda', 'precioMenuAyudaSocialCent');
}

// ------------------------------------------------------------------ resumen

function pintarResumen() {
  const conteo = resumenEtario(padron, fechaRef);
  const caja = $('#resumen-etario');
  caja.textContent = '';
  caja.append(crear('span', {
    clase: 'chip', html: `Activas: <b>${afiliadosActivos(padron, fechaRef).length}</b>`
  }));
  for (const tramo of TRAMOS_ETARIOS) {
    caja.append(crear('span', {
      clase: 'chip', html: `${tramo.etiqueta}: <b>${conteo[tramo.clave]}</b>`
    }));
  }
  if (conteo.sin_dato) {
    caja.append(crear('span', { clase: 'chip', html: `Sin grupo: <b>${conteo.sin_dato}</b>` }));
  }

  const r = resumenEconomicoRaciones(padron, periodoInicio, periodoFin);
  const cajaR = $('#resumen-raciones');
  cajaR.textContent = '';
  cajaR.append(
    crear('span', { clase: 'chip', html: `Raciones: <b>${r.racionesTotales}</b>` }),
    crear('span', { clase: 'chip', html: `Normales: <b>${r.racionesNormales}</b>` }),
    crear('span', { clase: 'chip', html: `Ayuda social: <b>${r.racionesAyudaSocial}</b>` })
  );
  if (r.recaudacionCent !== null) {
    cajaR.append(
      crear('span', { clase: 'chip', html: `Recaudado: <b>S/ ${formatearSoles(r.recaudacionCent)}</b>` }),
      crear('span', {
        clase: 'chip',
        html: `Promedio por ración: <b>S/ ${formatearSoles(r.precioPromedioRacionCent)}</b>`
      })
    );
  }

  const nota = $('#nota-precio');
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
  nota.textContent = partes.join(' ');

  // El conteo de la lista lo escribe pintarAfiliados(), que sabe del filtro.
}

// --------------------------------------------------------------- alta rápida

let altaGrupo = null;
let altaTipo = null;

function montarAlta() {
  const cajaG = $('#alta-grupo');
  for (const t of TRAMOS_ETARIOS) {
    const r = crear('input', { type: 'radio', name: 'altaGrupo', value: t.clave, id: `ag-${t.clave}` });
    r.addEventListener('change', () => { altaGrupo = t.clave; });
    cajaG.append(crear('label', { clase: 'opcion', for: r.id }, [r, `${t.etiqueta} (${t.detalle})`]));
  }
  const cajaT = $('#alta-tipo');
  for (const t of TIPOS_AFILIADO) {
    const r = crear('input', { type: 'radio', name: 'altaTipo', value: t.clave, id: `at-${t.clave}` });
    r.addEventListener('change', () => { altaTipo = t.clave; });
    cajaT.append(crear('label', { clase: 'opcion', for: r.id }, [r, t.etiqueta]));
  }

  const fNac = $('#altaNacimiento');
  const pistaG = crear('span', { clase: 'pista' });
  cajaG.parentElement.append(pistaG);
  fNac.addEventListener('input', () => {
    const tiene = esIso(fNac.value);
    for (const r of cajaG.querySelectorAll('input')) r.disabled = tiene;
    pistaG.textContent = tiene
      ? `Con esa fecha, hoy le corresponde: ${etiquetaGrupoEtario(
        grupoEtario({ fechaNacimiento: fNac.value }, hoyIso()))}.`
      : '';
  });

  $('#altaDoc').addEventListener('input', (ev) => {
    if ($('#altaTipoDoc').value === 'dni') ev.target.value = ev.target.value.replace(/\D/g, '');
  });

  $('#agregar-afiliado').addEventListener('click', inscribir);

  // Enter en cualquier campo del alta inscribe, sin tener que buscar el botón.
  for (const id of ['altaPaterno', 'altaMaterno', 'altaNombres', 'altaDoc']) {
    $('#' + id).addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); inscribir(); }
    });
  }
}

function inscribir() {
  const msg = $('#alta-mensaje');
  const a = nuevoAfiliado();
  a.apellidoPaterno = $('#altaPaterno').value.trim();
  a.apellidoMaterno = $('#altaMaterno').value.trim();
  a.nombres = $('#altaNombres').value.trim();
  a.tipoDocumento = $('#altaTipoDoc').value;
  a.numeroDocumento = $('#altaDoc').value.trim();
  a.fechaNacimiento = $('#altaNacimiento').value;
  a.grupoEtarioManual = esIso(a.fechaNacimiento) ? null : altaGrupo;
  a.tipoAfiliado = altaTipo || '';

  const faltan = [];
  if (!a.apellidoPaterno) faltan.push('apellido paterno');
  if (!a.nombres) faltan.push('nombres');
  if (!a.numeroDocumento) faltan.push('número de documento');
  if (!grupoEtario(a, hoyIso())) faltan.push('grupo de edad');
  if (!a.tipoAfiliado) faltan.push('tipo');
  if (faltan.length) {
    msg.textContent = 'Falta: ' + faltan.join(', ') + '.';
    return;
  }

  // Duplicado por documento: se avisa ANTES de inscribir, no después.
  const repetido = padron.afiliados.find(
    (o) => o.activo && o.numeroDocumento === a.numeroDocumento);
  if (repetido) {
    msg.textContent = `El documento ${a.numeroDocumento} ya está registrado en ` +
      `${nombreCompleto(repetido)}. No se inscribió a nadie.`;
    return;
  }
  const mismoNombre = padron.afiliados.find(
    (o) => o.activo && normalizarNombre(nombreCompleto(o)) === normalizarNombre(nombreCompleto(a)));
  if (mismoNombre && !confirm(
    `Ya hay alguien con el nombre ${nombreCompleto(a)} en el padrón.\n\n` +
    '¿Inscribir igual? Pueden ser dos personas distintas.')) return;

  padron.afiliados.push(a);
  msg.textContent = `${nombreCompleto(a)} quedó inscrita.`;
  for (const id of ['altaPaterno', 'altaMaterno', 'altaNombres', 'altaDoc', 'altaNacimiento']) {
    $('#' + id).value = '';
  }
  for (const r of document.querySelectorAll('input[name="altaGrupo"], input[name="altaTipo"]')) {
    r.checked = false;
    r.disabled = false;
  }
  altaGrupo = null;
  altaTipo = null;
  $('#altaPaterno').focus();
  cambio({ repintar: true });
  pintarHoy();
}

// ----------------------------------------------------------------- afiliados

/** El editor completo de una persona. Se construye SOLO al desplegar su fila. */
function cuerpoAfiliado(a) {
  const idp = a.id.slice(0, 8);
  const texto = (prop, extra = {}) => {
    const el = crear('input', Object.assign(
      { id: `a-${prop}-${idp}`, type: 'text', value: a[prop] || '', autocomplete: 'off' }, extra));
    el.addEventListener('input', () => {
      if (extra.inputmode === 'numeric') el.value = el.value.replace(/\D/g, '');
      a[prop] = el.value;
      cambio();
      refrescarCabeceraFicha(a);
    });
    return el;
  };

  const fTipoDoc = crear('select', { id: `a-tipodoc-${idp}` }, [
    crear('option', { value: 'dni', texto: 'DNI' }),
    crear('option', { value: 'ce', texto: 'Carné de extranjería' })
  ]);
  fTipoDoc.value = a.tipoDocumento || 'dni';
  fTipoDoc.addEventListener('change', () => { a.tipoDocumento = fTipoDoc.value; cambio(); });

  const fNac = crear('input', { id: `a-nac-${idp}`, type: 'date', value: a.fechaNacimiento || '' });
  const fGrupo = crear('select', { id: `a-grupo-${idp}` }, [
    crear('option', { value: '', texto: '— elegir —' })
  ].concat(TRAMOS_ETARIOS.map((t) => crear('option', { value: t.clave, texto: `${t.etiqueta} (${t.detalle})` }))));
  fGrupo.value = a.grupoEtarioManual || '';
  const pistaGrupo = crear('span', { clase: 'pista' });

  function sincronizarGrupo() {
    const tiene = esIso(a.fechaNacimiento);
    fGrupo.disabled = tiene;
    pistaGrupo.textContent = tiene
      ? 'Se calcula desde la fecha de nacimiento.'
      : 'Obligatorio si no hay fecha de nacimiento.';
  }
  fNac.addEventListener('input', () => {
    a.fechaNacimiento = fNac.value;
    sincronizarGrupo();
    cambio({ repintar: false });
    refrescarCabeceraFicha(a);
  });
  fGrupo.addEventListener('change', () => {
    a.grupoEtarioManual = fGrupo.value || null;
    cambio();
    refrescarCabeceraFicha(a);
  });
  sincronizarGrupo();

  const fTipo = crear('select', { id: `a-tipo-${idp}` }, [
    crear('option', { value: '', texto: '— elegir —' })
  ].concat(TIPOS_AFILIADO.map((t) => crear('option', { value: t.clave, texto: t.etiqueta }))));
  fTipo.value = a.tipoAfiliado || '';
  fTipo.addEventListener('change', () => {
    a.tipoAfiliado = fTipo.value;
    cambio({ repintar: true });
  });

  const fSexo = crear('select', { id: `a-sexo-${idp}` }, [
    crear('option', { value: '', texto: 'No indicado' }),
    crear('option', { value: 'F', texto: 'F' }),
    crear('option', { value: 'M', texto: 'M' })
  ]);
  fSexo.value = a.sexo || '';
  fSexo.addEventListener('change', () => { a.sexo = fSexo.value; cambio(); });

  const fAlta = crear('input', { id: `a-alta-${idp}`, type: 'date', value: a.altaEn || '' });
  fAlta.addEventListener('input', () => { a.altaEn = fAlta.value; cambio({ repintar: true }); });

  const editor = crear('div', { clase: 'persona-editor' });

  editor.append(
    crear('div', { clase: 'acciones', style: 'margin:10px 0' }, [
        crear('button', {
          type: 'button', clase: 'boton diminuto secundario',
          texto: a.activo ? 'Dar de baja' : 'Reactivar',
          onclick: () => {
            if (a.activo) {
              const motivo = prompt('Motivo de la baja (opcional):', a.motivoBaja || '');
              if (motivo === null) return;
              a.activo = false;
              a.bajaEn = hoyIso();
              a.motivoBaja = motivo;
            } else {
              a.activo = true;
              a.bajaEn = '';
              a.motivoBaja = '';
            }
            cambio({ repintar: true });
          }
        }),
        crear('button', {
          type: 'button', clase: 'boton diminuto peligro', texto: 'Borrar',
          onclick: () => {
            const nombre = nombreCompleto(a) || 'esta persona';
            if (!confirm(`Se borrará definitivamente a ${nombre} del padrón.\n\n` +
              'Si solo dejó de asistir, usa «Dar de baja»: así queda el historial.\n\n' +
              '¿Borrar de todas formas?')) return;
            padron.afiliados = padron.afiliados.filter((o) => o.id !== a.id);
            cambio({ repintar: true });
          }
        })
    ]),
    crear('div', { clase: 'rejilla tres' }, [
      campo('Apellido paterno', texto('apellidoPaterno')),
      campo('Apellido materno', texto('apellidoMaterno')),
      campo('Nombres', texto('nombres'))
    ]),
    crear('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Tipo de documento', fTipoDoc),
      campo('Número de documento', texto('numeroDocumento', { inputmode: 'numeric', maxlength: '12' }),
        'Obligatorio. DNI: 8 dígitos.'),
      campo('Tipo', fTipo, 'Define el menú que le toca por defecto.')
    ]),
    crear('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Fecha de nacimiento', fNac, 'Opcional.'),
      crear('div', { clase: 'campo' }, [
        crear('label', { for: fGrupo.id, texto: 'Grupo de edad' }), fGrupo, pistaGrupo
      ]),
      campo('Sexo', fSexo, 'Opcional.')
    ]),
    crear('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Fecha de alta', fAlta),
      campo('Quién verificó los datos', texto('verificadoPor'),
        'Obligatorio si los datos vinieron de un escaneo.'),
      campo('Nota', texto('nota'))
    ])
  );
  return editor;
}

/** Una línea por persona. El editor se construye al desplegarla, no antes. */
function filaAfiliado(a) {
  const hallazgos = validarAfiliado(a, padron);
  const errores = hallazgos.filter((x) => x.severidad === 'error').length;

  const nombre = crear('span', { clase: 'persona-nombre', texto: nombreCompleto(a) || 'Persona sin nombre' });
  const meta = crear('span', { clase: 'persona-meta' });

  function refrescarMeta() {
    const g = grupoEtario(a, fechaRef);
    const edad = esIso(a.fechaNacimiento) ? edadEnFecha(a.fechaNacimiento, fechaRef) : null;
    const partes = [g ? etiquetaGrupoEtario(g) : 'Sin grupo'];
    if (edad !== null) partes.push(`${edad} años`);
    partes.push(a.tipoAfiliado === 'caso_social' ? 'Ayuda social'
      : a.tipoAfiliado === 'habitual' ? 'Habitual' : 'Sin tipo');
    if (a.numeroDocumento) partes.push(`${(a.tipoDocumento || '').toUpperCase()} ${a.numeroDocumento}`);
    if (!a.activo) partes.push('dada de baja');
    meta.textContent = partes.join(' · ');
    nombre.textContent = nombreCompleto(a) || 'Persona sin nombre';
  }
  refrescarMeta();

  const boton = crear('button', {
    type: 'button', clase: 'persona-fila', 'aria-expanded': 'false'
  }, [
    crear('span', { clase: 'persona-flecha', 'aria-hidden': 'true', texto: '▸' }),
    crear('span', { clase: 'persona-texto' }, [nombre, meta]),
    errores ? crear('span', { clase: 'persona-falta', texto: 'faltan datos' }) : null
  ]);

  const caja = crear('article', {
    clase: `persona${a.activo ? '' : ' inactiva'}`,
    id: `ficha-${a.id}`,
    'data-campo': `afiliado.${a.id}`
  }, [boton]);

  let editor = null;
  caja._desplegar = (abrir) => {
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    const quiero = abrir === undefined ? !abierto : abrir;
    if (quiero && !editor) {           // construcción perezosa
      editor = cuerpoAfiliado(a);
      caja.append(editor);
    }
    if (editor) editor.hidden = !quiero;
    boton.setAttribute('aria-expanded', quiero ? 'true' : 'false');
  };
  caja._refrescarCabecera = refrescarMeta;
  boton.addEventListener('click', () => caja._desplegar());
  return caja;
}

function refrescarCabeceraFicha(a) {
  const ficha = document.getElementById(`ficha-${a.id}`);
  if (ficha && ficha._refrescarCabecera) ficha._refrescarCabecera();
}

function coincideBusqueda(a) {
  if (!busqueda) return true;
  const aguja = normalizarNombre(busqueda);
  return normalizarNombre(nombreCompleto(a)).includes(aguja) ||
    String(a.numeroDocumento || '').includes(busqueda.trim());
}

function pasaFiltro(a) {
  switch (filtroLista) {
    case 'activos': return a.activo;
    case 'bajas': return !a.activo;
    case 'ayuda_social': return a.activo && a.tipoAfiliado === 'caso_social';
    case 'incompletas':
      return validarAfiliado(a, padron).some((x) => x.severidad === 'error');
    default: return true;
  }
}

function pintarAfiliados() {
  const lista = $('#lista-afiliados');
  lista.textContent = '';
  const visibles = padron.afiliados
    .filter((a) => pasaFiltro(a) && coincideBusqueda(a))
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));

  const incompletas = padron.afiliados
    .filter((a) => a.activo && validarAfiliado(a, padron).some((x) => x.severidad === 'error')).length;
  const activas = padron.afiliados.filter((a) => a.activo).length;
  $('#conteo-afiliados').textContent =
    `Mostrando ${visibles.length} de ${padron.afiliados.length}. ` +
    `${activas} activa(s)` +
    (incompletas ? ` · ${incompletas} con datos incompletos.` : '.');

  if (visibles.length === 0) {
    lista.append(crear('p', {
      clase: 'vacio-mensaje',
      texto: padron.afiliados.length === 0
        ? 'Todavía no hay nadie en el padrón. Usa el formulario de arriba.'
        : 'Nadie coincide con la búsqueda o el filtro.'
    }));
    return;
  }
  for (const a of visibles) lista.append(filaAfiliado(a));
}

// ----------------------------------------- asistencia: una fila, un toque
//
// Marcar a alguien es UN toque en su fila. El menú sale de cómo se inscribió
// (habitual -> normal, ayuda social -> menú de ayuda social) y solo hace falta
// tocarlo cuando ese día come otro. Sin desplegables.

function filaToque(at, persona, alCambiar) {
  const presente = asistio(at, persona.id);
  const menu = menuDe(at, persona.id) || menuPorDefecto(persona);
  const g = grupoEtario(persona, at.fecha || fechaRef);

  const marca = crear('span', { clase: 'toque-marca', 'aria-hidden': 'true', texto: '✓' });
  const botonNombre = crear('button', {
    type: 'button', clase: 'toque-nombre',
    'aria-pressed': presente ? 'true' : 'false'
  }, [
    marca,
    crear('span', { clase: 'toque-texto' }, [
      nombreCompleto(persona),
      crear('span', { clase: 'toque-sub', texto: g ? etiquetaGrupoEtario(g) : 'Sin grupo' })
    ])
  ]);

  const botonMenu = crear('button', {
    type: 'button', clase: 'toque-menu', 'data-menu': menu,
    title: 'Cambiar el menú de esta persona solo para este día',
    texto: menu === 'ayuda_social' ? 'Ayuda social' : 'Normal'
  });
  botonMenu.disabled = !presente;

  const fila = crear('div', { clase: `toque${presente ? ' presente' : ''}` }, [botonNombre, botonMenu]);

  function pintar() {
    const hay = asistio(at, persona.id);
    const m = menuDe(at, persona.id) || menuPorDefecto(persona);
    fila.classList.toggle('presente', hay);
    botonNombre.setAttribute('aria-pressed', hay ? 'true' : 'false');
    botonMenu.disabled = !hay;
    botonMenu.dataset.menu = m;
    botonMenu.textContent = m === 'ayuda_social' ? 'Ayuda social' : 'Normal';
  }

  botonNombre.addEventListener('click', () => {
    if (!Array.isArray(at.asistencias)) at.asistencias = [];
    if (asistio(at, persona.id)) {
      at.asistencias = at.asistencias.filter((x) => x.afiliadoId !== persona.id);
    } else {
      at.legado = null;
      at.asistencias.push({ afiliadoId: persona.id, tipoMenu: menuPorDefecto(persona) });
    }
    pintar();
    if (alCambiar) alCambiar();
    cambio();
    pintarAsistencia();
  });

  botonMenu.addEventListener('click', () => {
    const reg = (at.asistencias || []).find((x) => x.afiliadoId === persona.id);
    if (!reg) return;
    reg.tipoMenu = reg.tipoMenu === 'ayuda_social' ? 'normal' : 'ayuda_social';
    pintar();
    if (alCambiar) alCambiar();
    cambio();
    pintarAsistencia();
  });

  return fila;
}

// ------------------------------------------------- asistencia por día (checklist)

function fichaAtencion(at) {
  const idp = at.id.slice(0, 8);

  const fFecha = crear('input', { id: `at-fecha-${idp}`, type: 'date', value: at.fecha || '' });
  fFecha.addEventListener('input', () => {
    at.fecha = fFecha.value;
    pintarLista();
    refrescarResumenDia();
    cambio();
  });

  const soles = (prop, id) => {
    const el = crear('input', {
      id, type: 'text', inputmode: 'decimal', placeholder: '0.00', value: formatearSoles(at[prop])
    });
    el.addEventListener('input', () => {
      at[prop] = aCentimos(el.value);
      at.precioTomadoDeConfig = false;
      refrescarResumenDia();
      cambio();
    });
    return el;
  };
  const fPrecioNormal = soles('precioMenuNormalCent', `at-pn-${idp}`);
  const fPrecioAyuda = soles('precioMenuAyudaSocialCent', `at-pa-${idp}`);

  const fNota = crear('input', { id: `at-nota-${idp}`, type: 'text', value: at.nota || '', autocomplete: 'off' });
  fNota.addEventListener('input', () => { at.nota = fNota.value; cambio(); });

  const contadores = crear('div', { clase: 'resumen-chips' });
  const avisoLegado = crear('p', { clase: 'asistencia-resumen' });

  function refrescarResumenDia() {
    const d = desgloseDelDia(at);
    const recaudado = recaudacionDelDiaCent(at);
    contadores.textContent = '';
    contadores.append(
      crear('span', { clase: 'chip', html: `Raciones: <b>${d.total}</b>` }),
      crear('span', { clase: 'chip', html: `Normal: <b>${d.normal}</b>` }),
      crear('span', { clase: 'chip', html: `Ayuda social: <b>${d.ayudaSocial}</b>` }),
      crear('span', {
        clase: 'chip',
        html: recaudado === null
          ? 'Recaudado: <b>—</b>'
          : `Recaudado: <b>S/ ${formatearSoles(recaudado)}</b>`
      })
    );
    avisoLegado.textContent = d.origen === 'legado'
      ? `Estas ${d.total} raciones vienen anotadas a mano de la versión anterior. ` +
        'Si marcas la asistencia, pasarán a contarse de la lista.'
      : '';
  }

  // ---- lista de un toque ----
  const buscador = crear('input', {
    id: `at-buscar-${idp}`, type: 'search', placeholder: 'Buscar por nombre…', autocomplete: 'off'
  });
  const listaAsistencia = crear('div', { clase: 'lista-toque' });
  let filtro = '';
  buscador.addEventListener('input', () => { filtro = buscador.value.trim().toLowerCase(); pintarLista(); });

  function pintarLista() {
    listaAsistencia.textContent = '';
    const activos = afiliadosActivos(padron, at.fecha)
      .filter((p) => !filtro || nombreCompleto(p).toLowerCase().includes(filtro))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));

    if (activos.length === 0) {
      listaAsistencia.append(crear('p', {
        clase: 'pista',
        texto: filtro ? 'Nadie coincide con esa búsqueda.'
          : 'No hay personas activas en el padrón para esa fecha.'
      }));
      return;
    }
    for (const persona of activos) listaAsistencia.append(filaToque(at, persona, refrescarTodo));
  }

  function marcarTodos(marcar) {
    const activos = afiliadosActivos(padron, at.fecha);
    if (marcar) {
      at.legado = null;
      at.asistencias = activos.map((p) => {
        const previo = (at.asistencias || []).find((x) => x.afiliadoId === p.id);
        return { afiliadoId: p.id, tipoMenu: previo ? previo.tipoMenu : menuPorDefecto(p) };
      });
    } else {
      at.asistencias = [];
    }
    pintarLista();
    if (caja._refrescar) caja._refrescar();
    cambio();
    pintarAsistencia();
  }

  refrescarResumenDia();

  const esHoy = at.fecha === hoyIso();
  const resumenCorto = crear('span', { clase: 'dia-resumen' });
  function refrescarResumenCorto() {
    const d = desgloseDelDia(at);
    const rec = recaudacionDelDiaCent(at);
    resumenCorto.textContent =
      `${d.total} ración(es)` +
      (d.ayudaSocial ? ` · ${d.ayudaSocial} de ayuda social` : '') +
      (rec === null ? '' : ` · S/ ${formatearSoles(rec)}`);
  }
  refrescarResumenCorto();
  const refrescarTodo = () => { refrescarResumenDia(); refrescarResumenCorto(); };

  const caja = crear('details', {
    clase: 'dia', id: `ficha-${at.id}`, 'data-campo': `atencion.${at.id}`
  }, [
    crear('summary', {}, [
      crear('span', { clase: 'dia-fecha', texto: at.fecha ? aDdMmAa(at.fecha) : 'Sin fecha' }),
      esHoy ? crear('span', { clase: 'dia-hoy', texto: 'HOY' }) : null,
      resumenCorto
    ])
  ]);
  caja._refrescar = refrescarTodo;

  // El cuerpo —y sobre todo el checklist— se construye al abrir el día, no antes.
  let cuerpo = null;
  caja.addEventListener('toggle', () => {
    if (!caja.open || cuerpo) return;
    pintarLista();
    cuerpo = crear('div', { clase: 'dia-cuerpo' }, [
      crear('div', { clase: 'rejilla dos' }, [campo('Fecha', fFecha), campo('Nota', fNota)]),
      contadores,
      avisoLegado,
      crear('div', { clase: 'acciones', style: 'margin-top:10px' }, [
        crear('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Marcar todos', onclick: () => marcarTodos(true) }),
        crear('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Quitar todos', onclick: () => marcarTodos(false) }),
        crear('button', {
          type: 'button', clase: 'boton diminuto peligro', texto: 'Quitar el día',
          onclick: () => {
            if (!confirm('¿Quitar este día? También se borra su asistencia.')) return;
            padron.atenciones = padron.atenciones.filter((o) => o.id !== at.id);
            cambio({ repintar: true });
            pintarAsistencia();
          }
        })
      ]),
      crear('div', { clase: 'campo', style: 'margin-top:10px' }, [
        crear('label', { for: buscador.id, texto: 'Buscar persona' }), buscador
      ]),
      listaAsistencia,
      crear('details', { clase: 'asistencia', style: 'margin-top:10px' }, [
        crear('summary', { texto: 'Precio del menú de este día' }),
        crear('p', {
          clase: 'pista',
          texto: at.precioTomadoDeConfig
            ? 'Tomado del precio que fijaste arriba. Cámbialo solo si ese día fue distinto.'
            : 'Precio propio de este día.'
        }),
        crear('div', { clase: 'rejilla dos' }, [
          campo('Menú normal (S/)', fPrecioNormal),
          campo('Menú de ayuda social (S/)', fPrecioAyuda)
        ])
      ])
    ]);
    caja.append(cuerpo);
  });

  if (esHoy) caja.open = true;      // el día de hoy arranca abierto
  return caja;
}

function pintarAtenciones() {
  const lista = $('#lista-atenciones');
  lista.textContent = '';
  const hoy = hoyIso();
  const ordenadas = [...padron.atenciones]
    .filter((at) => at.fecha !== hoy)        // hoy va arriba, en su propia sección
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (ordenadas.length === 0) {
    lista.append(crear('p', { clase: 'vacio-mensaje', texto: 'No hay otros días registrados.' }));
    return;
  }
  for (const at of ordenadas) lista.append(fichaAtencion(at));
}

// -------------------------------------------------------- asistencia de hoy
//
// Siempre visible y siempre apuntando al día de hoy. El registro del día NO se
// crea al abrir la página: se crea cuando se marca a la primera persona. Así,
// abrir la aplicación no inventa un día de atención que nadie tuvo.

let atencionDeHoy = null;
let filtroHoy = '';

function asegurarHoyGuardado() {
  if (!atencionDeHoy) return;
  if (!padron.atenciones.some((o) => o.id === atencionDeHoy.id)) {
    padron.atenciones.push(atencionDeHoy);
  }
}

function pintarHoy() {
  const caja = $('#hoy');
  caja.textContent = '';
  const hoy = hoyIso();

  $('#titulo-hoy').textContent = `Asistencia de hoy · ${aDdMmAa(hoy)}`;

  atencionDeHoy = padron.atenciones.find((o) => o.fecha === hoy) || null;
  if (!atencionDeHoy) {
    atencionDeHoy = nuevaAtencion(preciosActuales());
    atencionDeHoy.fecha = hoy;           // todavía sin guardar: ver asegurarHoyGuardado
  }
  const at = atencionDeHoy;

  const cuenta = crear('span', { clase: 'hoy-cuenta' });
  const detalle = crear('span', { clase: 'hoy-detalle' });
  const activos = afiliadosActivos(padron, hoy);

  function refrescar() {
    const d = desgloseDelDia(at);
    cuenta.textContent = `${d.total} de ${activos.length}`;
    if (d.total === 0) {
      detalle.textContent = activos.length === 0
        ? 'No hay nadie en el padrón todavía.'
        : 'Nadie marcado todavía. Toca a quien vino.';
      return;
    }
    const rec = recaudacionDelDiaCent(at);
    detalle.textContent =
      `${d.normal} con menú normal · ${d.ayudaSocial} de ayuda social` +
      (rec === null ? ' · falta el precio del menú' : ` · S/ ${formatearSoles(rec)}`);
  }

  const alCambiar = () => { asegurarHoyGuardado(); refrescar(); };

  const buscador = crear('input', {
    id: 'hoy-buscar', type: 'search', placeholder: 'Buscar por nombre…', autocomplete: 'off'
  });
  buscador.value = filtroHoy;
  const lista = crear('div', { clase: 'lista-toque' });

  function pintarLista() {
    lista.textContent = '';
    const visibles = activos
      .filter((p) => !filtroHoy || nombreCompleto(p).toLowerCase().includes(filtroHoy))
      .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));
    if (visibles.length === 0) {
      lista.append(crear('p', {
        clase: 'vacio-mensaje',
        texto: activos.length === 0
          ? 'No hay nadie activo en el padrón. Inscribe personas arriba.'
          : 'Nadie coincide con esa búsqueda.'
      }));
      return;
    }
    for (const persona of visibles) lista.append(filaToque(at, persona, alCambiar));
  }
  buscador.addEventListener('input', () => {
    filtroHoy = buscador.value.trim().toLowerCase();
    pintarLista();
  });

  function marcarTodos(marcar) {
    if (marcar) {
      at.legado = null;
      at.asistencias = activos.map((p) => {
        const previo = (at.asistencias || []).find((x) => x.afiliadoId === p.id);
        return { afiliadoId: p.id, tipoMenu: previo ? previo.tipoMenu : menuPorDefecto(p) };
      });
    } else {
      at.asistencias = [];
    }
    asegurarHoyGuardado();
    pintarLista();
    refrescar();
    cambio();
    pintarAsistencia();
  }

  caja.append(
    crear('div', { clase: 'hoy-barra' }, [
      cuenta, detalle,
      crear('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Marcar a todos', onclick: () => marcarTodos(true) }),
      crear('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Quitar a todos', onclick: () => marcarTodos(false) })
    ]),
    crear('div', { clase: 'campo' }, [
      crear('label', { for: buscador.id, texto: 'Buscar' }), buscador
    ]),
    lista
  );
  pintarLista();
  refrescar();
}

// ------------------------------------------------- resumen de asistencia y reporte

function pintarAsistencia() {
  pintarResumen();
  pintarReporte();
}

function repintarTodo() {
  pintarHoy();
  pintarAfiliados();
  pintarAtenciones();
  pintarResumen();
  pintarReporte();
  refrescarValidacion();
}

function pintarReporte() {
  const caja = $('#reporte-padron');
  caja.textContent = '';
  const filas = filasPadron(padron, fechaRef);
  const asistencias = new Map(
    asistenciaPorAfiliado(padron, periodoInicio, periodoFin).map((x) => [x.afiliadoId, x]));

  if (filas.length === 0) {
    caja.append(crear('p', { clase: 'vacio-mensaje', texto: 'No hay personas activas que listar.' }));
    return;
  }

  const cuerpo = crear('tbody');
  for (const f of filas) {
    const as = asistencias.get(f.afiliadoId);
    cuerpo.append(crear('tr', {}, [
      crear('td', { clase: 'num', texto: String(f.n) }),
      crear('td', { texto: f.apellidoPaterno }),
      crear('td', { texto: f.apellidoMaterno }),
      crear('td', { texto: f.nombres }),
      crear('td', { texto: f.tipoDocumento }),
      crear('td', { texto: f.numeroDocumento }),
      crear('td', { texto: f.grupoEtarioEtiqueta || '—' }),
      crear('td', { texto: f.edad === null ? '—' : String(f.edad) }),
      crear('td', { texto: f.tipoAfiliadoEtiqueta || '—' }),
      crear('td', { clase: 'num', texto: as ? String(as.dias) : '0' })
    ]));
  }

  caja.append(crear('div', { clase: 'tabla-desplazable' }, [
    crear('table', { clase: 'tabla' }, [
      crear('thead', {}, [crear('tr', {}, [
        'N°', 'Ap. paterno', 'Ap. materno', 'Nombres', 'Doc.', 'Número',
        'Grupo de edad', 'Edad', 'Tipo', 'Días'
      ].map((t) => crear('th', { texto: t })))]),
      cuerpo
    ])
  ]));

  const porGrupo = {};
  for (const t of TRAMOS_ETARIOS) porGrupo[t.clave] = 0;
  let ayudaSocial = 0;
  for (const f of filas) {
    if (f.grupoEtario) porGrupo[f.grupoEtario] += 1;
    if (f.tipoAfiliado === 'caso_social') ayudaSocial += 1;
  }
  const chips = crear('div', { clase: 'resumen-chips', style: 'margin-top:10px' }, [
    crear('span', { clase: 'chip', html: `Total: <b>${filas.length}</b>` })
  ]);
  for (const t of TRAMOS_ETARIOS) {
    chips.append(crear('span', { clase: 'chip', html: `${t.etiqueta}: <b>${porGrupo[t.clave]}</b>` }));
  }
  chips.append(crear('span', { clase: 'chip', html: `Ayuda social: <b>${ayudaSocial}</b>` }));
  caja.append(chips);

  const ausentes = afiliadosSinAsistencia(padron, periodoInicio, periodoFin);
  if (ausentes.length) {
    caja.append(crear('p', {
      clase: 'asistencia-resumen',
      texto: `${ausentes.length} persona(s) sin ninguna asistencia en el periodo: ` +
        ausentes.slice(0, 8).map(nombreCompleto).join(', ') + (ausentes.length > 8 ? '…' : '')
    }));
  }
}

function filasComoTexto(separador) {
  const filas = filasPadron(padron, fechaRef);
  const asistencias = new Map(
    asistenciaPorAfiliado(padron, periodoInicio, periodoFin).map((x) => [x.afiliadoId, x]));
  // Títulos sin ambigüedad: así lo exportado se puede volver a importar (§6.9).
  const cab = ['N°', 'Apellido paterno', 'Apellido materno', 'Nombres',
    'Tipo de documento', 'Número de documento', 'Grupo de edad', 'Edad', 'Tipo',
    'Días asistidos'];
  const lineas = [cab.join(separador)];
  for (const f of filas) {
    const as = asistencias.get(f.afiliadoId);
    lineas.push([
      f.n, f.apellidoPaterno, f.apellidoMaterno, f.nombres, f.tipoDocumento,
      f.numeroDocumento, f.grupoEtarioEtiqueta, f.edad === null ? '' : f.edad,
      f.tipoAfiliadoEtiqueta, as ? as.dias : 0
    ].map((v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return separador === ',' && /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(separador));
  }
  return lineas.join('\n');
}

// ------------------------------------------------- estado del escaneo de DNI

async function pintarEstadoEscaneo() {
  const caja = $('#estado-escaneo');
  caja.textContent = '';
  caja.append(crear('p', {
    texto: 'Más adelante, inscribir a una persona será escanear el código de barras ' +
      'del reverso de su DNI. Todavía no está disponible: falta conocer con certeza ' +
      'cómo vienen codificados los datos en ese código. No se va a suponer.'
  }));
  const soporta = await soportaCamaraPdf417();
  caja.append(crear('div', { clase: 'resumen-chips' }, [
    crear('span', {
      clase: 'chip',
      texto: soporta ? '✓ Este navegador podría leer PDF417 con la cámara'
        : '✕ Este navegador no lee PDF417 con la cámara'
    }),
    crear('span', { clase: 'chip', texto: '✓ Un lector de mano tipo teclado funcionará siempre' })
  ]));
  caja.append(crear('p', {
    clase: 'pista',
    texto: 'Cuando se active: lo leído se mostrará para que alguien lo revise antes ' +
      'de guardarlo, los campos que no se puedan leer quedarán vacíos, y la cadena ' +
      'cruda del código no se guardará en ninguna parte.'
  }));
}

// -------------------------------------------- importar un padrón desde archivo
//
// Nada se guarda hasta que la usuaria ve exactamente qué filas entran y cuáles
// no, y confirma. Ver AGENTS.md §6.9.

let importacionPendiente = null;

function montarImportacion() {
  const area = $('#pegarPadron');
  const archivo = $('#archivoPadron');
  const vista = $('#vista-importacion');
  const btnRevisar = $('#revisar-importacion');
  const btnConfirmar = $('#confirmar-importacion');
  const btnCancelar = $('#cancelar-importacion');

  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    try {
      area.value = await f.text();
      revisar();
    } catch (e) {
      vista.textContent = '';
      vista.append(crear('p', { clase: 'aviso-sistema', texto: 'No se pudo leer el archivo.' }));
    }
    archivo.value = '';
  });

  function limpiar() {
    importacionPendiente = null;
    vista.textContent = '';
    btnConfirmar.hidden = true;
    btnCancelar.hidden = true;
  }

  function revisar() {
    const texto = area.value;
    if (!texto.trim()) { limpiar(); return; }

    const r = prepararImportacion(texto, padron);
    vista.textContent = '';

    if (r.error) {
      vista.append(crear('div', { clase: 'aviso-sistema' }, [crear('p', { texto: r.error })]));
      btnConfirmar.hidden = true;
      btnCancelar.hidden = false;
      importacionPendiente = null;
      return;
    }

    importacionPendiente = r;
    const entran = filasImportables(r.filas);

    const chips = crear('div', { clase: 'imp-resumen' }, [
      crear('span', { clase: 'chip', html: `Se importarán: <b>${entran.length}</b>` }),
      r.resumen.incompleta ? crear('span', { clase: 'chip', html: `Con datos que faltan: <b>${r.resumen.incompleta}</b>` }) : null,
      r.resumen.duplicada ? crear('span', { clase: 'chip', html: `Ya están en el padrón: <b>${r.resumen.duplicada}</b>` }) : null,
      r.resumen.vacia ? crear('span', { clase: 'chip', html: `Filas vacías: <b>${r.resumen.vacia}</b>` }) : null
    ]);
    vista.append(chips);

    if (r.sinReconocer.length) {
      vista.append(crear('p', {
        clase: 'pista',
        texto: 'Columnas que no se reconocieron y se ignoran: ' + r.sinReconocer.join(', ') + '.'
      }));
    }

    const cuerpo = crear('tbody');
    for (const f of r.filas.slice(0, 50)) {
      const a = f.afiliado;
      cuerpo.append(crear('tr', { clase: `imp-fila-${f.estado}` }, [
        crear('td', { clase: 'num', texto: String(f.linea) }),
        crear('td', { texto: f.nombreCompleto || '—' }),
        crear('td', { texto: a.numeroDocumento || '—' }),
        crear('td', { texto: a.grupoEtarioManual ? etiquetaGrupoEtario(a.grupoEtarioManual)
          : (a.fechaNacimiento ? 'por fecha de nacimiento' : '—') }),
        crear('td', { texto: a.tipoAfiliado === 'caso_social' ? 'Ayuda social'
          : a.tipoAfiliado === 'habitual' ? 'Habitual' : '—' }),
        crear('td', { texto: f.avisos.join('; ') || 'lista' })
      ]));
    }
    vista.append(crear('div', { clase: 'tabla-desplazable' }, [
      crear('table', { clase: 'tabla' }, [
        crear('thead', {}, [crear('tr', {},
          ['Fila', 'Nombre', 'Documento', 'Grupo', 'Tipo', 'Estado']
            .map((t) => crear('th', { texto: t })))]),
        cuerpo
      ])
    ]));
    if (r.filas.length > 50) {
      vista.append(crear('p', { clase: 'pista', texto: `… y ${r.filas.length - 50} fila(s) más.` }));
    }

    btnConfirmar.hidden = entran.length === 0;
    btnConfirmar.textContent = `Importar ${entran.length} persona(s)`;
    btnCancelar.hidden = false;
  }

  btnRevisar.addEventListener('click', revisar);
  btnCancelar.addEventListener('click', () => { area.value = ''; limpiar(); });

  btnConfirmar.addEventListener('click', () => {
    if (!importacionPendiente) return;
    const entran = filasImportables(importacionPendiente.filas);
    if (entran.length === 0) return;
    if (!confirm(`Se añadirán ${entran.length} persona(s) al padrón.\n\n` +
      'No se borra ni se modifica a nadie de los que ya están. ¿Continuar?')) return;

    for (const f of entran) padron.afiliados.push(f.afiliado);
    area.value = '';
    limpiar();
    guardar(CLAVES.padron, padron);
    repintarTodo();
    $('#estado-guardado').textContent = `${entran.length} persona(s) importada(s).`;
  });
}

// ---------------------------------------------------------------- validación

function refrescarValidacion() {
  const hallazgos = validarPadron(padron).concat(validarPreciosMenu(config));
  pintarPanel($('#panel'), hallazgos, { alIrA: irACampo });
  for (const caja of document.querySelectorAll('[data-campo]')) {
    marcarCampo(caja, hallazgos.filter((x) => x.campo === caja.dataset.campo));
  }
}

function irACampo(campo) {
  let caja = document.querySelector(`[data-campo="${CSS.escape(campo)}"]`);

  // Puede estar oculta por el filtro o la búsqueda: se limpian para poder llegar.
  if (!caja && campo.startsWith('afiliado.')) {
    busqueda = '';
    filtroLista = 'todas';
    $('#buscarAfiliado').value = '';
    $('#filtroAfiliado').value = 'todas';
    pintarAfiliados();
    caja = document.querySelector(`[data-campo="${CSS.escape(campo)}"]`);
  }
  if (!caja) return;

  if (caja._desplegar) caja._desplegar(true);          // persona plegada
  if (caja.tagName === 'DETAILS') caja.open = true;    // día plegado

  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const control = caja.querySelector('input, select, textarea');
  if (control && !control.disabled) control.focus({ preventScroll: true });
}

// ------------------------------------------------------------------- arranque

montarCabecera('padron', 'Personas afiliadas, asistencia y raciones');
pintarAvisosAlmacenamiento($('#avisos-sistema'));
$('#privacidad').append(bloquePrivacidad());
$('#barra-datos').append(barraDatos({
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

const bannerCaja = $('#banner');
const b = bannerAlerta(alertaProximaEntrega(calendario, hoyIso()));
if (b) bannerCaja.append(b);

const fRef = $('#fechaRef');
fRef.value = fechaRef;
fRef.addEventListener('input', () => {
  fechaRef = fRef.value || hoyIso();
  pintarResumen();
  pintarReporte();
  pintarAfiliados();
});

const fIni = $('#periodoInicio');
const fFin = $('#periodoFin');
fIni.value = periodoInicio;
fFin.value = periodoFin;
fIni.addEventListener('input', () => { periodoInicio = fIni.value || periodoInicio; pintarAsistencia(); });
fFin.addEventListener('input', () => { periodoFin = fFin.value || periodoFin; pintarAsistencia(); });

const fBuscar = $('#buscarAfiliado');
fBuscar.addEventListener('input', debounce(() => {
  busqueda = fBuscar.value;
  pintarAfiliados();
}, 150));

const fFiltro = $('#filtroAfiliado');
fFiltro.value = filtroLista;
fFiltro.addEventListener('change', () => { filtroLista = fFiltro.value; pintarAfiliados(); });



$('#agregar-atencion').addEventListener('click', () => {
  const at = nuevaAtencion(preciosActuales());
  padron.atenciones.push(at);
  cambio({ repintar: true });
  const ficha = document.getElementById(`ficha-${at.id}`);
  if (ficha) ficha.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#descargar-padron').addEventListener('click', () => {
  descargarTexto(`padron-${hoyIso()}.csv`, filasComoTexto(','));
});

$('#copiar-padron').addEventListener('click', async () => {
  const texto = filasComoTexto('\t');
  try {
    await navigator.clipboard.writeText(texto);
    $('#estado-guardado').textContent = 'Padrón copiado. Pégalo en tu hoja de cálculo.';
  } catch (e) {
    // Sin permiso de portapapeles: se muestra el texto para copiarlo a mano.
    const area = crear('textarea', { rows: '10', style: 'width:100%;margin-top:10px' });
    area.value = texto;
    const caja = $('#reporte-padron');
    caja.append(crear('p', { clase: 'pista', texto: 'Tu navegador no dejó copiar solo. Selecciona y copia:' }), area);
    area.select();
  }
});

montarPrecios();
montarAlta();
montarImportacion();
pintarHoy();
pintarAfiliados();
pintarAtenciones();
pintarResumen();
pintarReporte();
refrescarValidacion();
pintarEstadoEscaneo();
guardar(CLAVES.padron, padron);   // consolida la migración si la hubo
