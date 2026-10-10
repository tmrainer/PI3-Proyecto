// ui-personas.js — inscribir, listar y editar personas del padrón.
// Dibuja; no calcula ni valida: eso vive en calculos.js y validaciones.js.

import { nombreCompleto, normalizarNombre, nuevoAfiliado, esIso, hoyIso } from './modelo.js';
import {
  grupoEtario, etiquetaGrupoEtario, edadEnFecha, TRAMOS_ETARIOS, TIPOS_AFILIADO
} from './calculos.js';
import { validarAfiliado } from './validaciones.js';
import { estado } from './estado.js';
import { buscar, crearElemento, campo, icono } from './ui.js';

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

  // Enter en cualquier campo del alta inscribe, sin tener que buscar el botón.
  for (const id of ['altaPaterno', 'altaMaterno', 'altaNombres', 'altaDoc']) {
    buscar('#' + id).addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); inscribir(ctx); }
    });
  }
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
function filaAfiliado(a, ctx) {
  const hallazgos = validarAfiliado(a, estado.padron);
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
    icono('flecha', { tam: 15, clase: 'icono persona-flecha' }),
    crearElemento('span', { clase: 'persona-texto' }, [nombre, meta]),
    errores ? crearElemento('span', { clase: 'persona-falta', texto: 'faltan datos' }) : null
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

function pasaFiltro(a, ctx) {
  switch (ctx.filtro) {
    case 'activos': return a.activo;
    case 'bajas': return !a.activo;
    case 'ayuda_social': return a.activo && a.tipoAfiliado === 'caso_social';
    case 'incompletas':
      return validarAfiliado(a, estado.padron).some((x) => x.severidad === 'error');
    default: return true;
  }
}

export function pintarListaPersonas(lista, ctx) {
  lista.textContent = '';
  const visibles = estado.padron.afiliados
    .filter((a) => pasaFiltro(a, ctx) && coincideBusqueda(a, ctx))
    .sort((a, b) => nombreCompleto(a).localeCompare(nombreCompleto(b), 'es'));

  const incompletas = estado.padron.afiliados
    .filter((a) => a.activo && validarAfiliado(a, estado.padron).some((x) => x.severidad === 'error')).length;
  const activas = estado.padron.afiliados.filter((a) => a.activo).length;
  if (ctx.conteo) ctx.conteo.textContent =
    `Mostrando ${visibles.length} de ${estado.padron.afiliados.length}. ` +
    `${activas} activa(s)` +
    (incompletas ? `, ${incompletas} con datos incompletos.` : '.');

  if (visibles.length === 0) {
    lista.append(crearElemento('p', {
      clase: 'vacio-mensaje',
      texto: estado.padron.afiliados.length === 0
        ? 'Todavía no hay nadie en el padrón. Usa el formulario de arriba.'
        : 'Nadie coincide con la búsqueda o el filtro.'
    }));
    return;
  }
  for (const a of visibles) lista.append(filaAfiliado(a, ctx));
}
