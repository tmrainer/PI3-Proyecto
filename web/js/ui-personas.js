// ui-personas.js — inscribir, listar y editar personas del padrón.
// Dibuja; no calcula ni valida: eso vive en calculos.js y validaciones.js.

import { nombreCompleto, normalizarNombre, ORDEN_NOMBRES, nuevoAfiliado, esIso, hoyIso, debounce, cuantos } from './modelo.js';
import {
  grupoEtario, etiquetaGrupoEtario, edadEnFecha, resumenEtario, afiliadosActivos,
  TRAMOS_ETARIOS, TIPOS_AFILIADO
} from './calculos.js';
import { validarAfiliado, indicePadron } from './validaciones.js';
import { estado } from './estado.js';
import { lectoresDni, abrirCamaraDni } from './camara-dni.js';
import { buscar, crearElemento, campo, icono, chip, avatarPersona } from './ui.js';

// ctx: { fechaRef, busqueda, filtro, conteo, onCambio(), onRepintar() }

let altaGrupo = null;
let altaTipo = null;
export function montarAltaPersona(ctx) {
  const cajaG = buscar('#alta-grupo');
  for (const t of TRAMOS_ETARIOS) {
    const r = crearElemento('input', { type: 'radio', name: 'altaGrupo', value: t.clave, id: `ag-${t.clave}` });
    r.addEventListener('change', () => { altaGrupo = t.clave; });
    cajaG.append(crearElemento('label', { clase: 'opcion', for: r.id }, [r, `${t.etiqueta} (${t.detalle})`]));
  }
  const cajaT = buscar('#alta-tipo');
  for (const t of TIPOS_AFILIADO) {
    const r = crearElemento('input', { type: 'radio', name: 'altaTipo', value: t.clave, id: `at-${t.clave}` });
    r.addEventListener('change', () => { altaTipo = t.clave; });
    cajaT.append(crearElemento('label', { clase: 'opcion', for: r.id }, [r, t.etiqueta]));
  }

  const fNac = buscar('#altaNacimiento');
  const pistaG = crearElemento('span', { clase: 'pista' });
  cajaG.parentElement.append(pistaG);
  fNac.addEventListener('input', () => {
    const tiene = esIso(fNac.value);
    for (const r of cajaG.querySelectorAll('input')) r.disabled = tiene;
    pistaG.textContent = tiene
      ? `Con esa fecha, hoy le corresponde: ${etiquetaGrupoEtario(
        grupoEtario({ fechaNacimiento: fNac.value }, hoyIso()))}.`
      : '';
  });

  buscar('#altaDoc').addEventListener('input', (ev) => {
    if (buscar('#altaTipoDoc').value === 'dni') ev.target.value = ev.target.value.replace(/\D/g, '');
  });

  buscar('#agregar-afiliado').addEventListener('click', () => inscribir(ctx));
  montarLecturaDni();

  // Enter en cualquier campo del alta inscribe, sin tener que buscar el botón.
  for (const id of ['altaPaterno', 'altaMaterno', 'altaNombres', 'altaDoc']) {
    buscar('#' + id).addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); inscribir(ctx); }
    });
  }
}

// ------------------------------------------- inscribir leyendo el DNI (en prueba)
//
// Solo en el APK. Lee el reverso (zona de lectura mecánica: DNI, nacimiento y
// sexo con dígito de control) y luego el anverso (tildes, ñ y el segundo
// apellido, cruzados con el reverso: escaneo-dni.js). LLENA el formulario,
// no inscribe: la persona revisa, escribe quién revisó y toca «Inscribir»
// (AGENTS.md §7.1). La cadena leída no se guarda; solo los campos.

// Lo que vino del DNI y todavía no se inscribió: sexo y que el origen es el escaneo.
let altaEscaneo = null;

function montarLecturaDni() {
  const caja = crearElemento('div', { clase: 'alta-dni', hidden: true });
  const boton = crearElemento('button', { type: 'button', clase: 'boton secundario' },
    [icono('camara', { tam: 22 }), 'Leer el DNI con la cámara']);
  const nota = crearElemento('div', { clase: 'alta-dni-nota', role: 'status', 'aria-live': 'polite' });
  const fVerifica = crearElemento('input', { id: 'altaVerifica', type: 'text', autocomplete: 'name' });
  const verifica = crearElemento('div', { clase: 'campo', hidden: true }, [
    crearElemento('label', { for: 'altaVerifica', clase: 'obligatoria', texto: 'Quién revisó los datos con el DNI' }), fVerifica
  ]);
  caja.append(
    crearElemento('p', { clase: 'pista', texto: 'En prueba: lee el reverso y luego el lado de la foto. Revisa todo antes de inscribir.' }),
    boton, nota, verifica
  );
  buscar('#bloque-alta .pista').after(caja);
  lectoresDni().then((l) => { caja.hidden = !l.texto; }).catch(() => {});

  boton.addEventListener('click', () => abrirCamaraDni({
    conCodigo: false,
    alLeer: (r) => { if (r.tipo === 'mrz') llenarConDni(r.mrz, r.anverso, nota, verifica); }
  }));
}

function llenarConDni(mrz, anverso, nota, verifica) {
  const c = mrz.campos;
  nota.textContent = '';
  if (c.pais !== 'PER') {
    nota.append(crearElemento('p', { clase: 'aviso-texto', texto: 'No parece un DNI peruano. Escribe los datos a mano.' }));
    return;
  }
  const poner = (id, valor) => {
    const el = buscar('#' + id);
    el.value = valor || '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  buscar('#altaTipoDoc').value = 'dni';
  poner('altaDoc', c.numeroDocumento);
  poner('altaNacimiento', c.fechaNacimiento);

  const revisar = [];
  const dudas = [];
  const nombre = (id, etiqueta, cruce, deMrz) => {
    if (!cruce) {                                          // sin el anverso
      poner(id, deMrz);
      if (deMrz) revisar.push(`${etiqueta}: viene sin tildes ni ñ.`);
      return;
    }
    if (cruce.estado === 'dudoso') {
      poner(id, '');
      dudas.push({ id, etiqueta, opciones: cruce.opciones });
      return;
    }
    poner(id, cruce.valor);
    if (cruce.estado === 'sin-confirmar' && cruce.valor) revisar.push(`${etiqueta}: compáralo con el DNI.`);
  };
  nombre('altaPaterno', 'Apellido paterno', anverso && anverso.apellidoPaterno, c.apellidos.join(' '));
  nombre('altaMaterno', 'Apellido materno', anverso && anverso.apellidoMaterno, '');
  nombre('altaNombres', 'Nombres', anverso && anverso.nombres, c.nombres);
  if (!buscar('#altaMaterno').value) revisar.push('Apellido materno: escríbelo (no se leyó).');

  altaEscaneo = { sexo: c.sexo };
  nota.append(crearElemento('p', { texto: 'Listo. Revisa los datos con el DNI en la mano.' }));
  for (const d of dudas) {
    // No se elige sola: la persona toca la que coincide con el DNI.
    nota.append(crearElemento('p', { clase: 'aviso-texto', texto: `${d.etiqueta}: ¿cuál dice el DNI?` }),
      crearElemento('div', { clase: 'acciones' }, d.opciones.map((o) => crearElemento('button', {
        type: 'button', clase: 'boton diminuto secundario', texto: o,
        onclick: (ev) => { poner(d.id, o); ev.target.parentElement.remove(); }
      }))));
  }
  if (revisar.length) {
    nota.append(crearElemento('ul', { clase: 'pista' }, revisar.map((t) => crearElemento('li', { texto: t }))));
  }
  verifica.hidden = false;
  buscar('#altaVerifica').focus({ preventScroll: true });
}

function inscribir(ctx) {
  const msg = buscar('#alta-mensaje');
  const a = nuevoAfiliado();
  a.apellidoPaterno = buscar('#altaPaterno').value.trim();
  a.apellidoMaterno = buscar('#altaMaterno').value.trim();
  a.nombres = buscar('#altaNombres').value.trim();
  a.tipoDocumento = buscar('#altaTipoDoc').value;
  a.numeroDocumento = buscar('#altaDoc').value.trim();
  a.fechaNacimiento = buscar('#altaNacimiento').value;
  a.grupoEtarioManual = esIso(a.fechaNacimiento) ? null : altaGrupo;
  a.tipoAfiliado = altaTipo || '';
  const verifica = document.getElementById('altaVerifica');
  if (altaEscaneo) {
    a.origenDato = 'escaneo_dni';
    a.sexo = altaEscaneo.sexo || '';
    a.verificadoPor = verifica ? verifica.value.trim() : '';
  }

  const faltan = [];
  if (!a.apellidoPaterno) faltan.push('apellido paterno');
  if (!a.nombres) faltan.push('nombres');
  if (!a.numeroDocumento) faltan.push('número de documento');
  if (!grupoEtario(a, hoyIso())) faltan.push('grupo de edad');
  if (!a.tipoAfiliado) faltan.push('tipo');
  if (altaEscaneo && !a.verificadoPor) faltan.push('quién revisó los datos con el DNI');
  if (faltan.length) {
    msg.textContent = 'Falta: ' + faltan.join(', ') + '.';
    return;
  }

  // Duplicado por documento: se avisa ANTES de inscribir, no después.
  const repetido = estado.padron.afiliados.find(
    (o) => o.activo && o.numeroDocumento === a.numeroDocumento);
  if (repetido) {
    msg.textContent = `El documento ${a.numeroDocumento} ya está registrado en ` +
      `${nombreCompleto(repetido)}. No se inscribió a nadie.`;
    return;
  }
  const mismoNombre = estado.padron.afiliados.find(
    (o) => o.activo && normalizarNombre(nombreCompleto(o)) === normalizarNombre(nombreCompleto(a)));
  if (mismoNombre && !confirm(
    `Ya hay alguien con el nombre ${nombreCompleto(a)} en el padrón.\n\n` +
    '¿Inscribir igual? Pueden ser dos personas distintas.')) return;

  estado.padron.afiliados.push(a);
  msg.textContent = `${nombreCompleto(a)} quedó inscrita.`;
  for (const id of ['altaPaterno', 'altaMaterno', 'altaNombres', 'altaDoc', 'altaNacimiento']) {
    buscar('#' + id).value = '';
  }
  for (const r of document.querySelectorAll('input[name="altaGrupo"], input[name="altaTipo"]')) {
    r.checked = false;
    r.disabled = false;
  }
  altaGrupo = null;
  altaTipo = null;
  if (altaEscaneo) {
    altaEscaneo = null;
    verifica.closest('.campo').hidden = true;
    document.querySelector('.alta-dni-nota').textContent = '';
  }
  buscar('#altaPaterno').focus();
  ctx.onRepintar();
}

function cuerpoAfiliado(a, ctx) {
  const idp = a.id.slice(0, 8);
  const texto = (prop, extra = {}) => {
    const el = crearElemento('input', Object.assign(
      { id: `a-${prop}-${idp}`, type: 'text', value: a[prop] || '', autocomplete: 'off' }, extra));
    el.addEventListener('input', () => {
      if (extra.inputmode === 'numeric') el.value = el.value.replace(/\D/g, '');
      a[prop] = el.value;
      ctx.onCambio();
      refrescarCabeceraFicha(a);
    });
    return el;
  };

  const fTipoDoc = crearElemento('select', { id: `a-tipodoc-${idp}` }, [
    crearElemento('option', { value: 'dni', texto: 'DNI' }),
    crearElemento('option', { value: 'ce', texto: 'Carné de extranjería' })
  ]);
  fTipoDoc.value = a.tipoDocumento || 'dni';
  fTipoDoc.addEventListener('change', () => { a.tipoDocumento = fTipoDoc.value; ctx.onCambio(); });

  const fNac = crearElemento('input', { id: `a-nac-${idp}`, type: 'date', value: a.fechaNacimiento || '' });
  const fGrupo = crearElemento('select', { id: `a-grupo-${idp}` }, [
    crearElemento('option', { value: '', texto: '— elegir —' })
  ].concat(TRAMOS_ETARIOS.map((t) => crearElemento('option', { value: t.clave, texto: `${t.etiqueta} (${t.detalle})` }))));
  fGrupo.value = a.grupoEtarioManual || '';
  const pistaGrupo = crearElemento('span', { clase: 'pista' });

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
    ctx.onCambio();
    refrescarCabeceraFicha(a);
  });
  fGrupo.addEventListener('change', () => {
    a.grupoEtarioManual = fGrupo.value || null;
    ctx.onCambio();
    refrescarCabeceraFicha(a);
  });
  sincronizarGrupo();

  const fTipo = crearElemento('select', { id: `a-tipo-${idp}` }, [
    crearElemento('option', { value: '', texto: '— elegir —' })
  ].concat(TIPOS_AFILIADO.map((t) => crearElemento('option', { value: t.clave, texto: t.etiqueta }))));
  fTipo.value = a.tipoAfiliado || '';
  fTipo.addEventListener('change', () => {
    a.tipoAfiliado = fTipo.value;
    ctx.onRepintar();
  });

  const fSexo = crearElemento('select', { id: `a-sexo-${idp}` }, [
    crearElemento('option', { value: '', texto: 'No indicado' }),
    crearElemento('option', { value: 'F', texto: 'F' }),
    crearElemento('option', { value: 'M', texto: 'M' })
  ]);
  fSexo.value = a.sexo || '';
  fSexo.addEventListener('change', () => { a.sexo = fSexo.value; ctx.onCambio(); });

  const fAlta = crearElemento('input', { id: `a-alta-${idp}`, type: 'date', value: a.altaEn || '' });
  fAlta.addEventListener('input', () => { a.altaEn = fAlta.value; ctx.onRepintar(); });

  const editor = crearElemento('div', { clase: 'persona-editor' });

  editor.append(
    crearElemento('div', { clase: 'acciones', style: 'margin:10px 0' }, [
        crearElemento('button', {
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
            ctx.onRepintar();
          }
        }),
        crearElemento('button', {
          type: 'button', clase: 'boton diminuto peligro', texto: 'Borrar',
          onclick: () => {
            const nombre = nombreCompleto(a) || 'esta persona';
            if (!confirm(`Se borrará definitivamente a ${nombre} del padrón.\n\n` +
              'Si solo dejó de asistir, usa «Dar de baja»: así queda el historial.\n\n' +
              '¿Borrar de todas formas?')) return;
            estado.padron.afiliados = estado.padron.afiliados.filter((o) => o.id !== a.id);
            ctx.onRepintar();
          }
        })
    ]),
    crearElemento('div', { clase: 'rejilla tres' }, [
      campo('Apellido paterno', texto('apellidoPaterno')),
      campo('Apellido materno', texto('apellidoMaterno')),
      campo('Nombres', texto('nombres'))
    ]),
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Tipo de documento', fTipoDoc),
      campo('Número de documento', texto('numeroDocumento', { inputmode: 'numeric', maxlength: '12' }),
        'Obligatorio. DNI: 8 dígitos.'),
      campo('Tipo', fTipo, 'Define el menú que le toca por defecto.')
    ]),
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Fecha de nacimiento', fNac, 'Opcional.'),
      crearElemento('div', { clase: 'campo' }, [
        crearElemento('label', { for: fGrupo.id, texto: 'Grupo de edad' }), fGrupo, pistaGrupo
      ]),
      campo('Sexo', fSexo, 'Opcional.')
    ]),
    crearElemento('div', { clase: 'rejilla tres', style: 'margin-top:10px' }, [
      campo('Fecha de alta', fAlta),
      campo('Quién verificó los datos', texto('verificadoPor'),
        'Obligatorio si los datos vinieron de un escaneo.'),
      campo('Nota', texto('nota'))
    ])
  );
  return editor;
}

/** Una línea por persona. El editor se construye al desplegarla, no antes. */
function filaAfiliado(a, ctx, indice) {
  const hallazgos = validarAfiliado(a, estado.padron, indice);
  const errores = hallazgos.filter((x) => x.severidad === 'error').length;

  const nombre = crearElemento('span', { clase: 'persona-nombre', texto: nombreCompleto(a) || 'Persona sin nombre' });
  const meta = crearElemento('span', { clase: 'persona-meta' });

  // El documento va primero y en cifras tabulares: es lo que se busca al
  // cotejar la lista contra un papel. Lo demás, detrás y más tenue.
  function refrescarMeta() {
    nombre.textContent = nombreCompleto(a) || 'Persona sin nombre';
    meta.textContent = '';

    if (a.numeroDocumento) {
      meta.append(crearElemento('span', { clase: 'meta-doc', texto: a.numeroDocumento }));
    }
    const g = grupoEtario(a, ctx.fechaRef);
    const edad = esIso(a.fechaNacimiento) ? edadEnFecha(a.fechaNacimiento, ctx.fechaRef) : null;
    meta.append(crearElemento('span', {
      texto: (g ? etiquetaGrupoEtario(g) : 'Sin grupo') + (edad === null ? '' : `, ${edad} años`)
    }));
    if (a.tipoAfiliado === 'caso_social') {
      meta.append(crearElemento('span', { clase: 'meta-social', texto: 'Ayuda social' }));
    } else if (!a.tipoAfiliado) {
      meta.append(crearElemento('span', { texto: 'Sin tipo' }));
    }
    if (!a.activo) meta.append(crearElemento('span', { texto: 'Dada de baja' }));
  }
  refrescarMeta();

  const boton = crearElemento('button', {
    type: 'button', clase: 'persona-fila', 'aria-expanded': 'false'
  }, [
    avatarPersona(a, grupoEtario(a, ctx.fechaRef)),
    crearElemento('span', { clase: 'persona-texto' }, [nombre, meta]),
    errores ? crearElemento('span', { clase: 'persona-falta', texto: 'faltan datos' }) : null,
    icono('flecha', { tam: 18, clase: 'icono persona-flecha' })
  ]);

  const caja = crearElemento('article', {
    clase: `persona${a.activo ? '' : ' inactiva'}`,
    id: `ficha-${a.id}`,
    'data-campo': `afiliado.${a.id}`
  }, [boton]);

  let editor = null;
  caja._desplegar = (abrir) => {
    const abierto = boton.getAttribute('aria-expanded') === 'true';
    const quiero = abrir === undefined ? !abierto : abrir;
    if (quiero && !editor) {           // construcción perezosa
      editor = cuerpoAfiliado(a, ctx);
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

function coincideBusqueda(a, ctx) {
  if (!ctx.busqueda) return true;
  const aguja = normalizarNombre(ctx.busqueda);
  return normalizarNombre(nombreCompleto(a)).includes(aguja) ||
    String(a.numeroDocumento || '').includes(ctx.busqueda.trim());
}

function pasaFiltro(a, ctx, indice) {
  switch (ctx.filtro) {
    case 'activos': return a.activo;
    case 'bajas': return !a.activo;
    case 'ayuda_social': return a.activo && a.tipoAfiliado === 'caso_social';
    case 'incompletas':
      return validarAfiliado(a, estado.padron, indice).some((x) => x.severidad === 'error');
    default: return true;
  }
}

// Filas pintadas, por persona, con el filtro actual. Buscar solo las muestra u
// oculta: rehacer cientos de filas por tecla se notaba en un celular.
let filasPintadas = new Map();
let incompletasPintadas = 0;

export function pintarListaPersonas(lista, ctx) {
  lista.textContent = '';
  const indice = indicePadron(estado.padron);
  const conFiltro = estado.padron.afiliados
    .filter((a) => pasaFiltro(a, ctx, indice))
    .sort((a, b) => ORDEN_NOMBRES.compare(nombreCompleto(a), nombreCompleto(b)));
  incompletasPintadas = estado.padron.afiliados
    .filter((a) => a.activo && validarAfiliado(a, estado.padron, indice).some((x) => x.severidad === 'error')).length;
  const fichaFaltan = document.querySelector('#filtroAfiliado [data-valor="incompletas"]');
  if (fichaFaltan) fichaFaltan.textContent = incompletasPintadas ? `Les faltan datos (${incompletasPintadas})` : 'Les faltan datos';

  filasPintadas = new Map();
  for (const a of conFiltro) {
    const fila = filaAfiliado(a, ctx, indice);
    filasPintadas.set(a, fila);
    lista.append(fila);
  }
  lista.append(crearElemento('p', { clase: 'vacio-mensaje lista-vacia', hidden: true }));
  aplicarBusqueda(lista, ctx);
}

function aplicarBusqueda(lista, ctx) {
  let visibles = 0;
  for (const [a, fila] of filasPintadas) {
    const ve = coincideBusqueda(a, ctx);
    fila.hidden = !ve;
    if (ve) visibles += 1;
  }
  // Las activas ya se cuentan arriba; aquí, solo lo que no se ve de otro modo.
  const total = estado.padron.afiliados.length;
  if (ctx.conteo) ctx.conteo.textContent = [
    visibles < total ? `Se ven ${visibles} de ${total}.` : '',
    incompletasPintadas ? `${cuantos(incompletasPintadas, 'persona')} con datos incompletos.` : ''
  ].filter(Boolean).join(' ');

  const vacio = lista.querySelector('.lista-vacia');
  if (vacio) {
    vacio.hidden = visibles > 0;
    vacio.textContent = total === 0
      ? 'Todavía no hay nadie en el padrón. Usa el formulario de arriba.'
      : 'Nadie coincide con la búsqueda o el filtro.';
  }
}

// ------------------------------------------- resumen por grupos y filtros

/** Chips con las activas y su reparto por grupo etario, a ctx.fechaRef. */
export function pintarResumenEtario(caja, ctx) {
  caja.textContent = '';
  // Una fila de ceros no informa de nada.
  const vacio = estado.padron.afiliados.length === 0;
  buscar('#buscarAfiliado').closest('.rejilla').hidden = vacio;
  buscar('#conteo-afiliados').hidden = vacio;
  if (vacio) return;

  const conteo = resumenEtario(estado.padron, ctx.fechaRef);
  caja.append(chip(`Activas`, `${afiliadosActivos(estado.padron, ctx.fechaRef).length}`));
  for (const t of TRAMOS_ETARIOS) {
    caja.append(chip(`${t.etiqueta}`, `${conteo[t.clave]}`));
  }
  if (conteo.sin_dato) {
    caja.append(chip(`Sin grupo`, `${conteo.sin_dato}`));
  }
}

/** Buscador y filtro de la lista: cambian ctx y repintan solo la lista. */
export function montarFiltrosPersonas(lista, ctx) {
  const fBuscar = buscar('#buscarAfiliado');
  fBuscar.addEventListener('input', debounce(() => {
    ctx.busqueda = fBuscar.value;
    aplicarBusqueda(lista, ctx);
  }, 150));

  // Fichas en vez de una lista desplegable: se ven todas las opciones de una
  // vez y se elige con un toque.
  for (const b of document.querySelectorAll('#filtroAfiliado .ficha-filtro')) {
    b.addEventListener('click', () => elegirFiltro(lista, ctx, b.dataset.valor));
  }
  marcarFiltro(ctx.filtro);
}

function marcarFiltro(valor) {
  for (const b of document.querySelectorAll('#filtroAfiliado .ficha-filtro')) {
    b.setAttribute('aria-pressed', b.dataset.valor === valor ? 'true' : 'false');
  }
}

/** Cambia el filtro de la lista y repinta (también para ir a una persona oculta). */
export function elegirFiltro(lista, ctx, valor) {
  ctx.filtro = valor;
  marcarFiltro(valor);
  pintarListaPersonas(lista, ctx);
}
