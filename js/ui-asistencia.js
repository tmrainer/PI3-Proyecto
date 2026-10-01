// ui-asistencia.js — pasar lista y revisar días anteriores.
//
// Marcar a alguien es UN toque en su fila. El menú sale de cómo se inscribió
// (habitual -> normal, ayuda social -> menú de ayuda social) y solo hace falta
// tocarlo cuando ese día come otro. Sin desplegables. Ver AGENTS.md §6.5.

import { nuevaAtencion, nombreCompleto, aDdMmAa, hoyIso, aCentimos, formatearSoles } from './modelo.js';
import {
  afiliadosActivos, grupoEtario, etiquetaGrupoEtario, menuPorDefecto,
  desgloseDelDia, recaudacionDelDiaCent, asistio, menuDe
} from './calculos.js';
import { estado, preciosActuales } from './estado.js';
import { crear, campo } from './ui.js';

// ctx: { fechaRef, titulo, onCambio(), onRepintar(), onResumen() }

// ----------------------------------------- asistencia: una fila, un toque
//
// Marcar a alguien es UN toque en su fila. El menú sale de cómo se inscribió
// (habitual -> normal, ayuda social -> menú de ayuda social) y solo hace falta
// tocarlo cuando ese día come otro. Sin desplegables.

export function filaToque(at, persona, ctx, alCambiar) {
  const presente = asistio(at, persona.id);
  const menu = menuDe(at, persona.id) || menuPorDefecto(persona);
  const g = grupoEtario(persona, at.fecha || ctx.fechaRef);

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
    ctx.onCambio();
    ctx.onResumen();
  });

  botonMenu.addEventListener('click', () => {
    const reg = (at.asistencias || []).find((x) => x.afiliadoId === persona.id);
    if (!reg) return;
    reg.tipoMenu = reg.tipoMenu === 'ayuda_social' ? 'normal' : 'ayuda_social';
    pintar();
    if (alCambiar) alCambiar();
    ctx.onCambio();
    ctx.onResumen();
  });

  return fila;
}

// ------------------------------------------------- asistencia por día (checklist)

function fichaAtencion(at, ctx) {
  const idp = at.id.slice(0, 8);

  const fFecha = crear('input', { id: `at-fecha-${idp}`, type: 'date', value: at.fecha || '' });
  fFecha.addEventListener('input', () => {
    at.fecha = fFecha.value;
    pintarLista();
    refrescarResumenDia();
    ctx.onCambio();
  });

  const soles = (prop, id) => {
    const el = crear('input', {
      id, type: 'text', inputmode: 'decimal', placeholder: '0.00', value: formatearSoles(at[prop])
    });
    el.addEventListener('input', () => {
      at[prop] = aCentimos(el.value);
      at.precioTomadoDeConfig = false;
      refrescarResumenDia();
      ctx.onCambio();
    });
    return el;
  };
  const fPrecioNormal = soles('precioMenuNormalCent', `at-pn-${idp}`);
  const fPrecioAyuda = soles('precioMenuAyudaSocialCent', `at-pa-${idp}`);

  const fNota = crear('input', { id: `at-nota-${idp}`, type: 'text', value: at.nota || '', autocomplete: 'off' });
  fNota.addEventListener('input', () => { at.nota = fNota.value; ctx.onCambio(); });

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
    const activos = afiliadosActivos(estado.padron, at.fecha)
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
    for (const persona of activos) listaAsistencia.append(filaToque(at, persona, ctx, refrescarTodo));
  }

  function marcarTodos(marcar) {
    const activos = afiliadosActivos(estado.padron, at.fecha);
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
    ctx.onCambio();
    ctx.onResumen();
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
            estado.padron.atenciones = estado.padron.atenciones.filter((o) => o.id !== at.id);
            ctx.onRepintar();
            ctx.onResumen();
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

export function pintarOtrosDias(lista, ctx) {
  lista.textContent = '';
  const hoy = hoyIso();
  const ordenadas = [...estado.padron.atenciones]
    .filter((at) => at.fecha !== hoy)        // hoy va arriba, en su propia sección
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (ordenadas.length === 0) {
    lista.append(crear('p', { clase: 'vacio-mensaje', texto: 'No hay otros días registrados.' }));
    return;
  }
  for (const at of ordenadas) lista.append(fichaAtencion(at, ctx));
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
  if (!estado.padron.atenciones.some((o) => o.id === atencionDeHoy.id)) {
    estado.padron.atenciones.push(atencionDeHoy);
  }
}

export function pintarAsistenciaDeHoy(caja, ctx) {
  caja.textContent = '';
  const hoy = hoyIso();

  if (ctx.titulo) ctx.titulo.textContent = `Asistencia de hoy · ${aDdMmAa(hoy)}`;

  atencionDeHoy = estado.padron.atenciones.find((o) => o.fecha === hoy) || null;
  if (!atencionDeHoy) {
    atencionDeHoy = nuevaAtencion(preciosActuales());
    atencionDeHoy.fecha = hoy;           // todavía sin guardar: ver asegurarHoyGuardado
  }
  const at = atencionDeHoy;

  const cuenta = crear('span', { clase: 'hoy-cuenta' });
  const detalle = crear('span', { clase: 'hoy-detalle' });
  const activos = afiliadosActivos(estado.padron, hoy);

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
    for (const persona of visibles) lista.append(filaToque(at, persona, ctx, alCambiar));
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
    ctx.onCambio();
    ctx.onResumen();
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
