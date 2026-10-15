// ui-asistencia.js — pasar lista y revisar días anteriores.
//
// Marcar a alguien es UN toque en su fila. El menú sale de cómo se inscribió
// (habitual -> normal, ayuda social -> menú de ayuda social) y solo hace falta
// tocarlo cuando ese día come otro. Sin desplegables. Ver AGENTS.md §6.5.

import {
  nuevaAtencion, nombreCompleto, normalizarNombre, ORDEN_NOMBRES, aDdMmAa, hoyIso, aCentimos,
  formatearSoles, cuantos
} from './modelo.js';
import {
  afiliadosActivos, grupoEtario, etiquetaGrupoEtario, menuPorDefecto,
  desgloseDelDia, recaudacionDelDiaCent, asistio, asistenciasDelDia, menuDe, asistenciasConTodos, sinInscribirDelDia
} from './calculos.js';
import { estado, preciosActuales, guardarYa } from './estado.js';
import { lectoresDni, abrirCamaraDni } from './camara-dni.js';
import { enviarPorQr, recibirPorQr, puedeLeerQr } from './ui-compartir.js';
import { crearElemento, campo, icono, vigilarAltoFijo, chip, avatarPersona, avisoAbajo, vibrar, estadoVacio } from './ui.js';

// ctx: { fechaRef, titulo, onCambio(), onRepintar(), onResumen() }

/** Lo que se busca de una persona: nombre sin tildes ni mayúsculas, y su DNI. */
function claveBusqueda(p) {
  return `${normalizarNombre(nombreCompleto(p))} ${p.numeroDocumento || ''}`;
}

// ----------------------------------------- asistencia: una fila, un toque
//
// Marcar a alguien es UN toque en su fila. El menú sale de cómo se inscribió
// (habitual -> normal, ayuda social -> menú de ayuda social) y solo hace falta
// tocarlo cuando ese día come otro. Sin desplegables.

export function filaToque(at, persona, ctx, alCambiar) {
  const presente = asistio(at, persona.id);
  const menu = menuDe(at, persona.id) || menuPorDefecto(persona);
  const g = grupoEtario(persona, at.fecha || ctx.fechaRef);

  const marca = crearElemento('span', { clase: 'toque-marca', 'aria-hidden': 'true' }, [icono('ok', { tam: 18 })]);
  const botonNombre = crearElemento('button', {
    type: 'button', clase: 'toque-nombre',
    'aria-pressed': presente ? 'true' : 'false'
  }, [
    avatarPersona(persona, g),
    crearElemento('span', { clase: 'toque-texto' }, [
      nombreCompleto(persona),
      crearElemento('span', { clase: 'toque-sub', texto: g ? etiquetaGrupoEtario(g) : 'Sin grupo' })
    ]),
    marca
  ]);

  const botonMenu = crearElemento('button', {
    type: 'button', clase: 'toque-menu', 'data-menu': menu,
    title: 'Cambiar el menú de esta persona solo para este día',
    texto: menu === 'ayuda_social' ? 'Social' : 'Normal'
  });
  const nombrePersona = nombreCompleto(persona);
  function etiquetarMenu(m) {
    botonMenu.setAttribute('aria-label',
      `Menú de ${nombrePersona}: ${m === 'ayuda_social' ? 'ayuda social' : 'normal'}. Tocar para cambiarlo.`);
  }
  etiquetarMenu(menu);
  botonMenu.disabled = !presente;

  const fila = crearElemento('div', { clase: `toque${presente ? ' presente' : ''}` }, [botonNombre, botonMenu]);

  function pintar() {
    const hay = asistio(at, persona.id);
    const m = menuDe(at, persona.id) || menuPorDefecto(persona);
    fila.classList.toggle('presente', hay);
    botonNombre.setAttribute('aria-pressed', hay ? 'true' : 'false');
    botonMenu.disabled = !hay;
    botonMenu.dataset.menu = m;
    botonMenu.textContent = m === 'ayuda_social' ? 'Social' : 'Normal';
    etiquetarMenu(m);
  }

  const avisarCambio = () => { pintar(); if (alCambiar) alCambiar(); ctx.onCambio(); ctx.onResumen(); };
  botonNombre.addEventListener('click', () => {
    if (!Array.isArray(at.asistencias)) at.asistencias = [];
    const antes = { asistencias: at.asistencias.slice(), legado: at.legado };
    const vino = !asistio(at, persona.id);
    if (vino) {
      at.legado = null;
      at.asistencias.push({ afiliadoId: persona.id, tipoMenu: menuPorDefecto(persona) });
    } else {
      at.asistencias = at.asistencias.filter((x) => x.afiliadoId !== persona.id);
    }
    vibrar();
    avisarCambio();
    avisoAbajo(`${vino ? 'Marcaste a' : 'Quitaste a'} ${persona.nombres || nombrePersona}`, () => {
      at.asistencias = antes.asistencias;
      at.legado = antes.legado;
      avisarCambio();
    });
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

/** Copia de las marcas de un día, para poder deshacer un cambio. */
function asistenciasDelDiaCopia(at) {
  return Array.isArray(at.asistencias) ? at.asistencias.map((x) => ({ ...x })) : [];
}

// --------------------------------------------- quienes comen sin estar inscritos
//
// Alguien de paso, un familiar: no está en el padrón y no hace falta
// inscribirlo para que su ración cuente. Solo se suma, por tipo de menú.

function contadorSinInscribir(at, alCambiar) {
  const caja = crearElemento('div', { clase: 'sin-inscribir' }, [
    crearElemento('p', { clase: 'sin-inscribir-titulo', texto: 'Comieron sin estar en el padrón' })
  ]);
  for (const [clave, nombre] of [['normal', 'Menú normal'], ['ayudaSocial', 'Ayuda social']]) {
    const valor = crearElemento('output', { clase: 'sin-inscribir-valor' });
    const pintar = () => { valor.textContent = String(sinInscribirDelDia(at)[clave]); };
    const cambiar = (delta) => {
      const actual = sinInscribirDelDia(at);
      at.sinInscribir = { normal: actual.normal, ayudaSocial: actual.ayudaSocial };
      at.sinInscribir[clave] = Math.max(0, actual[clave] + delta);
      pintar();
      alCambiar();
    };
    caja.append(crearElemento('div', { clase: 'sin-inscribir-fila' }, [
      crearElemento('span', { clase: 'sin-inscribir-nombre', texto: nombre }),
      crearElemento('button', {
        type: 'button', clase: 'boton secundario paso', 'aria-label': `Uno menos, ${nombre.toLowerCase()}`,
        texto: '−', onclick: () => cambiar(-1)
      }),
      valor,
      crearElemento('button', {
        type: 'button', clase: 'boton secundario paso', 'aria-label': `Uno más, ${nombre.toLowerCase()}`,
        texto: '+', onclick: () => cambiar(1)
      })
    ]));
    pintar();
  }
  return caja;
}

// ------------------------------------------------- asistencia por día (checklist)

function fichaAtencion(at, ctx) {
  const idp = at.id.slice(0, 8);

  const esHoy = at.fecha === hoyIso();
  const resumenCorto = crearElemento('span', { clase: 'dia-resumen' });
  function refrescarResumenCorto() {
    const d = desgloseDelDia(at);
    const rec = recaudacionDelDiaCent(at);
    resumenCorto.textContent = '';
    resumenCorto.append(crearElemento('span', { clase: 'dato-fuerte', texto: `${d.total} raciones` }));
    if (d.ayudaSocial) {
      resumenCorto.append(crearElemento('span', { texto: `${d.ayudaSocial} de ayuda social` }));
    }
    if (rec !== null) {
      resumenCorto.append(crearElemento('span', { texto: `S/ ${formatearSoles(rec)}` }));
    }
  }
  refrescarResumenCorto();

  // Lo de adentro (campos, checklist, buscador) se arma al abrir el día: con
  // un año de días, armarlo todo al cargar trababa la pantalla en un celular.
  let refrescarResumenDia = () => {};
  const refrescarTodo = () => { refrescarResumenDia(); refrescarResumenCorto(); };

  const caja = crearElemento('details', {
    clase: 'dia', id: `ficha-${at.id}`, 'data-campo': `atencion.${at.id}`
  }, [
    crearElemento('summary', {}, [
      crearElemento('span', { clase: 'dia-fecha', texto: at.fecha ? aDdMmAa(at.fecha) : 'Sin fecha' }),
      esHoy ? crearElemento('span', { clase: 'dia-hoy', texto: 'HOY' }) : null,
      resumenCorto
    ])
  ]);
  caja._refrescar = refrescarTodo;

  let cuerpo = null;
  caja.addEventListener('toggle', () => {
    if (!caja.open || cuerpo) return;
    cuerpo = armarCuerpo();
    caja.append(cuerpo);
  });

  function armarCuerpo() {
    const fFecha = crearElemento('input', { id: `at-fecha-${idp}`, type: 'date', value: at.fecha || '' });
    fFecha.addEventListener('input', () => {
      at.fecha = fFecha.value;
      pintarLista();
      refrescarResumenDia();
      ctx.onCambio();
    });

    const soles = (prop, id) => {
      const el = crearElemento('input', {
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

    const fNota = crearElemento('input', { id: `at-nota-${idp}`, type: 'text', value: at.nota || '', autocomplete: 'off' });
    fNota.addEventListener('input', () => { at.nota = fNota.value; ctx.onCambio(); });

    const contadores = crearElemento('div', { clase: 'resumen-chips' });
    const avisoLegado = crearElemento('p', { clase: 'asistencia-resumen' });

    function pintarResumenDia() {
      const d = desgloseDelDia(at);
      const recaudado = recaudacionDelDiaCent(at);
      contadores.textContent = '';
      contadores.append(
        chip(`Raciones`, `${d.total}`),
        chip(`Normal`, `${d.normal}`),
        chip(`Ayuda social`, `${d.ayudaSocial}`),
        chip('Recaudado', recaudado === null ? '—' : `S/ ${formatearSoles(recaudado)}`)
      );
      avisoLegado.textContent = d.origen === 'legado'
        ? `Estas ${d.total} raciones vienen anotadas a mano de la versión anterior. ` +
          'Si marcas la asistencia, pasarán a contarse de la lista.'
        : '';
    }

    // ---- lista de un toque ----
    const buscador = crearElemento('input', {
      id: `at-buscar-${idp}`, type: 'search', placeholder: 'Buscar…', autocomplete: 'off'
    });
    const listaAsistencia = crearElemento('div', { clase: 'lista-toque' });
    let filtro = '';
    buscador.addEventListener('input', () => { filtro = normalizarNombre(buscador.value); pintarLista(); });

    function pintarLista() {
      listaAsistencia.textContent = '';
      const activos = afiliadosActivos(estado.padron, at.fecha)
        .filter((p) => !filtro || claveBusqueda(p).includes(filtro))
        .sort((a, b) => ORDEN_NOMBRES.compare(nombreCompleto(a), nombreCompleto(b)));

      if (activos.length === 0) {
        listaAsistencia.append(crearElemento('p', {
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
      const antes = { asistencias: asistenciasDelDiaCopia(at), legado: at.legado };
      if (marcar) {
        at.legado = null;
        at.asistencias = asistenciasConTodos(at, activos);
      } else {
        at.asistencias = [];
      }
      const repintar = () => { pintarLista(); if (caja._refrescar) caja._refrescar(); ctx.onCambio(); ctx.onResumen(); };
      repintar();
      avisoAbajo(marcar ? 'Marcaste a todos' : 'Quitaste a todos', () => {
        at.asistencias = antes.asistencias;
        at.legado = antes.legado;
        repintar();
      });
    }

    refrescarResumenDia = pintarResumenDia;
    pintarResumenDia();
    pintarLista();
    return crearElemento('div', { clase: 'dia-cuerpo' }, [
      crearElemento('div', { clase: 'rejilla dos' }, [campo('Fecha', fFecha), campo('Nota', fNota)]),
      contadores,
      avisoLegado,
      crearElemento('div', { clase: 'acciones', style: 'margin-top:10px' }, [
        crearElemento('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Marcar todos', onclick: () => marcarTodos(true) }),
        crearElemento('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Quitar todos', onclick: () => marcarTodos(false) }),
        crearElemento('button', {
          type: 'button', clase: 'boton diminuto peligro', texto: 'Quitar el día',
          onclick: () => {
            const lista = estado.padron.atenciones;
            const pos = lista.findIndex((o) => o.id === at.id);
            estado.padron.atenciones = lista.filter((o) => o.id !== at.id);
            ctx.onRepintar();
            ctx.onResumen();
            avisoAbajo(`Quitaste el día ${at.fecha ? aDdMmAa(at.fecha) : ''}`.trim(), () => {
              estado.padron.atenciones.splice(Math.max(0, pos), 0, at);
              ctx.onRepintar();
              ctx.onResumen();
            });
          }
        })
      ]),
      crearElemento('div', { clase: 'campo', style: 'margin-top:10px' }, [
        crearElemento('label', { for: buscador.id, texto: 'Buscar persona' }), buscador
      ]),
      listaAsistencia,
      contadorSinInscribir(at, () => { refrescarTodo(); ctx.onCambio(); ctx.onResumen(); }),
      crearElemento('details', { clase: 'asistencia', style: 'margin-top:10px' }, [
        crearElemento('summary', { texto: 'Precio del menú de este día' }),
        crearElemento('p', {
          clase: 'pista',
          texto: at.precioTomadoDeConfig
            ? 'Se copió del precio de arriba el día que se creó. Cámbialo solo si ese día fue distinto.'
            : 'Precio propio de este día.'
        }),
        crearElemento('div', { clase: 'rejilla dos' }, [
          campo('Menú normal (S/)', fPrecioNormal),
          campo('Menú de ayuda social (S/)', fPrecioAyuda)
        ])
      ])
    ]);
  }

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
    lista.append(crearElemento('p', {
      clase: 'vacio-mensaje',
      texto: 'Todavía no hay días anteriores.'
    }));
    return;
  }
  for (const at of ordenadas) lista.append(fichaAtencion(at, ctx));
}

// ------------------------------------- juntar la lista de dos teléfonos (QR)
//
// Si dos personas pasan lista en teléfonos distintos, una muestra un QR con
// sus marcas de hoy y la otra lo lee. Antes de guardar se ve qué se suma y
// qué no coincide (ui-compartir.js). Sin internet ni servidor. Se puede deshacer.

function juntarConOtroTelefono(at, ctx) {
  const pasar = crearElemento('button', {
    type: 'button', clase: 'boton diminuto secundario', texto: 'Pasar mi lista por QR',
    onclick: () => enviarPorQr('asistencia', { padron: estado.padron, fechas: [at.fecha] })
  });
  const recibir = crearElemento('button', {
    type: 'button', clase: 'boton diminuto secundario', texto: 'Recibir por QR', hidden: true,
    // Lo que está por guardarse se guarda antes: la comparación lee lo guardado.
    onclick: () => { guardarYa(); recibirPorQr({ alGuardar: ctx.onDatosNuevos }); }
  });
  puedeLeerQr().then((si) => { recibir.hidden = !si; }).catch(() => {});
  return crearElemento('div', { clase: 'juntar-qr' }, [
    crearElemento('p', { clase: 'pista', texto: '¿Pasaron lista en dos teléfonos? Junten las listas con un código QR. Otros días, el padrón y las entregas se pasan desde Tus datos.' }),
    crearElemento('div', { clase: 'acciones' }, [pasar, recibir])
  ]);
}

// -------------------------------------------------------- asistencia de hoy
//
// Siempre visible y siempre apuntando al día de hoy. El registro del día NO se
// crea al abrir la página: se crea cuando se marca a la primera persona. Así,
// abrir la aplicación no inventa un día de atención que nadie tuvo.

let atencionDeHoy = null;
let filtroHoy = '';
let soloSinMarcar = false;

function asegurarHoyGuardado() {
  if (!atencionDeHoy) return;
  if (!estado.padron.atenciones.some((o) => o.id === atencionDeHoy.id)) {
    // Se armó al abrir la página: si el precio de arriba cambió desde
    // entonces, el día nace con el de ahora, no con el de hace un rato.
    if (atencionDeHoy.precioTomadoDeConfig) Object.assign(atencionDeHoy, preciosActuales());
    estado.padron.atenciones.push(atencionDeHoy);
  }
}

export function pintarAsistenciaDeHoy(caja, ctx) {
  caja.textContent = '';
  const hoy = hoyIso();

  if (ctx.titulo) {
    ctx.titulo.textContent = 'Asistencia de hoy';
    ctx.titulo.append(crearElemento('span', { clase: 'titulo-fecha', texto: aDdMmAa(hoy) }));
  }

  atencionDeHoy = estado.padron.atenciones.find((o) => o.fecha === hoy) || null;
  if (!atencionDeHoy) {
    atencionDeHoy = nuevaAtencion(preciosActuales());
    atencionDeHoy.fecha = hoy;           // todavía sin guardar: ver asegurarHoyGuardado
  }
  const at = atencionDeHoy;

  const cuenta = crearElemento('span', { clase: 'hoy-cuenta' });
  const barraProgreso = crearElemento('i');
  const progreso = crearElemento('span', { clase: 'hoy-progreso', 'aria-hidden': 'true' }, [barraProgreso]);
  const detalle = crearElemento('span', { clase: 'hoy-detalle' });
  // Marcar a alguien cambia el conteo; sin esto, quien usa lector de pantalla
  // toca y no recibe confirmación de nada.
  const resumenVivo = crearElemento('p', { clase: 'oculto-visual', role: 'status', 'aria-live': 'polite' });
  const activos = afiliadosActivos(estado.padron, hoy);

  function refrescar() {
    const d = desgloseDelDia(at);
    const inscritos = d.total - d.sinInscribir;
    cuenta.textContent = `${inscritos} de ${activos.length}`;
    barraProgreso.style.width = `${activos.length ? Math.min(100, (inscritos / activos.length) * 100) : 0}%`;
    resumenVivo.textContent = `${inscritos} de ${activos.length} personas marcadas` +
      (d.sinInscribir ? `, y ${cuantos(d.sinInscribir, 'ración', 'raciones')} sin inscribir.` : '.');
    if (d.total === 0) {
      detalle.textContent = activos.length === 0
        ? 'No hay nadie en el padrón todavía.'
        : 'Nadie marcado todavía.';
      return;
    }
    const rec = recaudacionDelDiaCent(at);
    detalle.textContent = '';
    if (d.sinInscribir) detalle.append(crearElemento('span', { texto: `+${d.sinInscribir} sin inscribir` }));
    detalle.append(crearElemento('span', { texto: `${d.normal} con menú normal` }));
    if (d.ayudaSocial) detalle.append(crearElemento('span', { texto: `${d.ayudaSocial} de ayuda social` }));
    detalle.append(rec === null
      ? crearElemento('span', { clase: 'dato-falta', texto: 'falta el precio del menú' })
      : crearElemento('span', { texto: `S/ ${formatearSoles(rec)}` }));
  }

  const buscador = crearElemento('input', {
    id: 'hoy-buscar', type: 'search', placeholder: 'Buscar…', autocomplete: 'off'
  });
  buscador.value = filtroHoy;
  const lista = crearElemento('div', { clase: 'lista-toque' });
  // Cada fila se arma una vez y se reutiliza: buscar o filtrar solo cambia
  // cuáles se muestran, en vez de rehacer cientos de botones por tecla.
  const filas = new Map();

  // Cerrar la lista es buscar a los pocos que faltan entre decenas de filas ya
  // marcadas. Con el filtro puesto, cada toque los va quitando de en medio y la
  // lista se vacía cuando no queda nadie: eso mismo es la señal de que terminó.
  const botonFaltan = crearElemento('button', {
    type: 'button', clase: 'boton diminuto secundario', 'aria-pressed': 'false'
  });

  function alternarFaltan() {
    soloSinMarcar = !soloSinMarcar;
    botonFaltan.setAttribute('aria-pressed', soloSinMarcar ? 'true' : 'false');
    botonFaltan.classList.toggle('activo', soloSinMarcar);
    pintarLista();
  }
  botonFaltan.addEventListener('click', alternarFaltan);

  // Pasar lista mostrando el DNI: solo en el APK, que lee la zona de texto
  // del reverso (el número lleva dígito de control). Marca a quien está en el
  // padrón; no inscribe ni guarda nada más del DNI.
  const botonDni = crearElemento('button', {
    type: 'button', clase: 'boton secundario leer-dni', hidden: true,
    onclick: () => abrirCamaraDni({ modo: 'asistencia', alLeer: (r) => marcarPorDni(r.mrz.campos.numeroDocumento) })
  }, [icono('camara', { tam: 22 }), 'Pasar lista leyendo el DNI']);
  lectoresDni().then((l) => { botonDni.hidden = !l.texto; }).catch(() => {});

  /** Marca a la persona de ese DNI y devuelve qué pasó, para el visor. */
  function marcarPorDni(dni) {
    const persona = activos.find((p) => String(p.numeroDocumento || '').trim() === dni);
    if (!persona) {
      const deBaja = (estado.padron.afiliados || []).some((p) => String(p.numeroDocumento || '').trim() === dni);
      return deBaja ? 'Ese DNI está de baja en el padrón.' : 'Ese DNI no está en el padrón. Puedes inscribir a la persona en Padrón.';
    }
    const nombre = nombreCompleto(persona);
    if (asistio(at, persona.id)) return `Ya estaba en la lista de hoy: ${nombre}.`;
    if (filas.size !== ordenados.length) armarFilas();
    filas.get(persona.id).querySelector('.toque-nombre').click();
    return `✓ Marcaste a ${nombre}`;
  }

  // Quiénes ya están marcados, de una vez: preguntarlo persona por persona
  // recorría la lista del día por cada fila y se notaba con cientos.
  function marcados() {
    return new Set(asistenciasDelDia(at).map((x) => x.afiliadoId));
  }

  function sinMarcar() {
    const m = marcados();
    return activos.filter((p) => !m.has(p.id)).length;
  }

  function refrescarBotonFaltan() {
    const n = sinMarcar();
    // Con todos marcados, «Ver los 0 que faltan» parecía un botón roto.
    if (n === 0) {
      botonFaltan.textContent = soloSinMarcar ? 'Ya vinieron todos: ver la lista' : 'Ya vinieron todos';
    } else if (soloSinMarcar) {
      botonFaltan.textContent = n === 1 ? 'Viendo a quien falta' : `Viendo los ${n} que faltan`;
    } else {
      botonFaltan.textContent = n === 1 ? 'Ver a quien falta' : `Ver los ${n} que faltan`;
    }
    botonFaltan.disabled = n === 0 && !soloSinMarcar;
  }

  const alCambiar = () => {
    asegurarHoyGuardado();
    refrescar();
    refrescarBotonFaltan();
    // Con el filtro puesto, quien acaba de marcarse ya no pertenece a la
    // lista: hay que volver a pintarla para que salga. pintarLista() conserva
    // la posición del foco, que es justo para lo que se escribió.
    if (soloSinMarcar) pintarLista();
  };

  // El orden y lo que se busca de cada persona se calculan una vez: buscar o
  // filtrar solo oculta filas, sin rehacerlas ni volver a ordenar por tecla.
  const ordenados = activos.slice().sort((a, b) => ORDEN_NOMBRES.compare(nombreCompleto(a), nombreCompleto(b)));
  const claves = new Map(ordenados.map((p) => [p.id, claveBusqueda(p)]));
  const vacio = crearElemento('div', { clase: 'lista-toque-vacia', hidden: true });

  function armarFilas() {
    lista.textContent = '';
    filas.clear();
    lista.append(vacio);
    for (const persona of ordenados) {
      const fila = filaToque(at, persona, ctx, alCambiar);
      filas.set(persona.id, fila);
      lista.append(fila);
    }
  }

  function pintarLista() {
    // Con el filtro puesto, la fila tocada desaparece: se conserva la posición
    // del foco para que el teclado pueda seguir bajando por la lista.
    const activo = document.activeElement;
    const visiblesAntes = () => [...lista.querySelectorAll('.toque:not([hidden]) .toque-nombre')];
    const i = lista.contains(activo) ? visiblesAntes().indexOf(activo) : -1;

    if (filas.size !== ordenados.length) armarFilas();
    const aguja = normalizarNombre(filtroHoy);
    const ya = soloSinMarcar ? marcados() : null;
    let visibles = 0;
    for (const persona of ordenados) {
      const ve = (!aguja || claves.get(persona.id).includes(aguja)) && !(ya && ya.has(persona.id));
      filas.get(persona.id).hidden = !ve;
      if (ve) visibles += 1;
    }

    // Una pantalla vacía es una invitación a hacer algo, no un aviso. Cuando
    // falta el padrón entero, lo que hace falta es el camino para empezarlo.
    vacio.hidden = visibles > 0;
    vacio.textContent = '';
    if (visibles === 0) {
      vacio.append(activos.length === 0
        ? estadoVacio({
          icono: 'personas', titulo: 'Todavía no hay personas',
          texto: 'Para pasar lista, primero inscribe a quienes vienen a la olla.',
          boton: { texto: 'Inscribir a la primera persona', href: './padron.html#inscribir' }
        })
        : soloSinMarcar
          ? estadoVacio({ icono: 'ok', titulo: 'Lista completa', texto: 'Ya marcaste a todos.', tono: 'logrado' })
          : estadoVacio({ icono: 'buscar', titulo: 'Nadie coincide con esa búsqueda', texto: 'Prueba con el apellido o el DNI.' }));
    }
    refrescarBotonFaltan();

    if (i >= 0) {
      const botones = visiblesAntes();
      const destino = botones[Math.min(i, botones.length - 1)];
      if (destino) destino.focus({ preventScroll: true });
    }
  }

  buscador.addEventListener('input', () => {
    filtroHoy = buscador.value.trim().toLowerCase();
    pintarLista();
  });

  function marcarTodos(marcar) {
    const antes = { asistencias: asistenciasDelDiaCopia(at), legado: at.legado };
    if (marcar) {
      at.legado = null;
      at.asistencias = asistenciasConTodos(at, activos);
    } else {
      at.asistencias = [];
    }
    const repintar = () => {
      asegurarHoyGuardado();
      filas.clear();                 // todas cambiaron: se vuelven a armar
      pintarLista();
      refrescar();
      ctx.onCambio();
      ctx.onResumen();
    };
    repintar();
    avisoAbajo(marcar ? 'Marcaste a todos' : 'Quitaste a todos', () => {
      at.asistencias = antes.asistencias;
      at.legado = antes.legado;
      repintar();
    });
  }

  // Sin nadie en el padrón, el contador, los botones de marcar y el buscador no
  // pueden hacer nada: ofrecerlos es ruido en la primera pantalla que se ve.
  const sinInscribir = contadorSinInscribir(at, () => {
    asegurarHoyGuardado();
    refrescar();
    ctx.onCambio();
    ctx.onResumen();
  });

  if (activos.length === 0) {
    caja.append(lista);
    pintarLista();
    return;
  }

  // Lo que se usa mientras se pasa lista (el conteo, el buscador y «los que
  // faltan») va junto: en el celular se queda pegado arriba al bajar por la
  // lista.
  const fija = crearElemento('div', { clase: 'hoy-fija' }, [
    crearElemento('div', { clase: 'hoy-barra' }, [cuenta, progreso, detalle]),
    crearElemento('div', { clase: 'hoy-filtros' }, [
      // El buscador solo hace falta cuando la lista no cabe de un vistazo.
      activos.length > 12 ? crearElemento('div', { clase: 'campo hoy-buscar' }, [
        crearElemento('label', { for: buscador.id, texto: 'Buscar' }), buscador
      ]) : null,
      botonFaltan
    ])
  ]);
  caja.append(
    resumenVivo,
    // Fuera de la parte que se queda pegada arriba: en la fila del buscador
    // no cabía en un celular angosto ni con letra grande.
    botonDni,
    fija,
    lista,
    sinInscribir,
    // Al final: se usan una vez por día, y arriba empujaban la lista fuera de
    // la primera pantalla del celular.
    crearElemento('div', { clase: 'acciones hoy-acciones' }, [
      crearElemento('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Marcar a todos', onclick: () => marcarTodos(true) }),
      crearElemento('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Quitar a todos', onclick: () => marcarTodos(false) })
    ]),
    juntarConOtroTelefono(at, ctx)
  );
  vigilarAltoFijo(fija);
  pintarLista();
  refrescar();
}
