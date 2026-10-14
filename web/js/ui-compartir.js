// ui-compartir.js — pasar datos a otro teléfono por QR, y recibirlos.
//
// Enviar: el padrón, la asistencia de los días que se elijan o las entregas.
// Recibir: se lee el envío y, ANTES de guardar, se muestra la comparación con
// lo de este teléfono: qué se agrega, qué ya estaba, qué no coincide y qué
// queda como está. Lo que no coincide se queda como aquí salvo que se elija
// lo recibido. Así dos teléfonos no cruzan datos sin que nadie lo vea.
//
// Recibir lee y escribe lo GUARDADO (localStorage), sin tocar `estado`: la
// página que lo usa guarda lo pendiente antes y recarga después (alGuardar).

import { crearElemento, avisoAbajo, vibrar } from './ui.js';
import {
  CLAVES, leer, guardar, cuantos, aDdMmAa, fechaLarga, formatearSoles, nombreCompleto,
  padronVacio, calendarioVacio, configVacia, migrarPadron, VERSION_PADRON
} from './modelo.js';
import { asistenciasDelDia, etiquetaGrupoEtario } from './calculos.js';
import {
  codificarParaQr, paqueteDelPadron, paqueteDeAsistencia, paqueteDeEntregas,
  compararPadron, aplicarPadron, compararAsistencia, aplicarAsistencia, compararEntregas, aplicarEntregas
} from './compartir-qr.js';
import { mostrarListaQr, leerListaQr, puedeLeerQr } from './camara-qr.js';
import { leerPerfil } from './perfil.js';

export { puedeLeerQr };

const AVISO_PRIVADO = 'Lleva nombres y DNI: muéstralo solo al otro teléfono de la olla.';
const DONDE_RECIBIR = 'En el otro teléfono: «Recibir por QR», en Tus datos.';

// ----------------------------------------------------------------- enviar

/**
 * @param {'padron'|'asistencia'|'entregas'} tipo
 * @param {{padron?: object, calendario?: object, fechas?: string[]}} datos
 */
export async function enviarPorQr(tipo, { padron, calendario, fechas = [] }) {
  let paquete;
  let titulo;
  let detalle;
  if (tipo === 'padron') {
    paquete = paqueteDelPadron(padron);
    if (!paquete.p.length) { avisoAbajo('El padrón está vacío: no hay nada que pasar.'); return; }
    titulo = 'Pasar el padrón';
    detalle = `${cuantos(paquete.p.length, 'persona')}. ${DONDE_RECIBIR} ${AVISO_PRIVADO}`;
  } else if (tipo === 'asistencia') {
    const r = paqueteDeAsistencia(padron, fechas);
    if (!r.personas) {
      avisoAbajo(r.sinDocumento ? 'Las personas marcadas no tienen documento: no se pueden pasar por QR.'
        : 'No hay nadie marcado en esos días.');
      return;
    }
    paquete = r.paquete;
    titulo = fechas.length === 1 ? 'Pasar la asistencia del día' : `Pasar la asistencia de ${fechas.length} días`;
    detalle = `${fechas.length === 1 ? aDdMmAa(fechas[0]) : cuantos(paquete.d.length, 'día')}: ` +
      `${cuantos(r.personas, 'marca')}. ${DONDE_RECIBIR}` +
      (r.sinDocumento ? ` ${cuantos(r.sinDocumento, 'persona')} sin documento no van en el código.` : '');
  } else {
    paquete = paqueteDeEntregas(calendario);
    if (!paquete.c[1] && !paquete.e.length) { avisoAbajo('Todavía no hay entregas que pasar.'); return; }
    titulo = 'Pasar las entregas';
    detalle = `Cada cuánto se entrega, la fecha base, los avisos y ${cuantos(paquete.e.length, 'entrega')} anotadas. ${DONDE_RECIBIR}`;
  }
  const partes = await codificarParaQr(tipo, paquete);
  if (!partes.length) {
    avisoAbajo('Son demasiados datos para pasar por QR. Elige menos días, o usa «Guardar una copia».');
    return;
  }
  const quien = leerPerfil().nombre;
  mostrarListaQr({
    partes, titulo,
    detalle: detalle + (quien ? ` Enviado por ${quien}.` : '') +
      (partes.length > 1 ? ` Son ${partes.length} códigos: deja la otra cámara apuntando hasta que los lea todos.` : '')
  });
}

/** Elegir qué días de asistencia pasar (los que tienen marcas, del más nuevo al más viejo). */
export function elegirDiasYEnviar(padron) {
  const dias = ((padron && padron.atenciones) || [])
    .map((at) => ({ fecha: at.fecha, n: asistenciasDelDia(at).length }))
    .filter((d) => d.n > 0)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  if (!dias.length) { avisoAbajo('Todavía no hay días con asistencia.'); return; }
  const casillas = dias.map((d, i) => {
    const c = crearElemento('input', { type: 'checkbox', id: `enviar-dia-${i}`, value: d.fecha });
    c.checked = i === 0;
    return c;
  });
  const enviar = crearElemento('button', { type: 'button', clase: 'boton', texto: 'Mostrar el código' });
  const contar = () => {
    const n = casillas.filter((c) => c.checked).length;
    enviar.disabled = n === 0;
    enviar.textContent = n > 1 ? `Mostrar el código (${n} días)` : 'Mostrar el código';
  };
  for (const c of casillas) c.addEventListener('change', contar);
  const dialogo = crearElemento('dialog', { clase: 'camara-dni', 'aria-labelledby': 'dias-titulo' }, [
    crearElemento('h2', { id: 'dias-titulo', texto: 'Qué días pasar' }),
    crearElemento('p', { clase: 'camara-pista', texto: 'Marca los días. Mientras más días, más códigos.' }),
    crearElemento('div', { clase: 'opciones lista-dias' }, dias.map((d, i) =>
      crearElemento('label', { clase: 'opcion', for: casillas[i].id }, [
        casillas[i], `${fechaLarga(d.fecha)} · ${cuantos(d.n, 'persona')}`
      ]))),
    crearElemento('div', { clase: 'acciones' }, [
      enviar,
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Cancelar', onclick: () => cerrar() })
    ])
  ]);
  function cerrar() { dialogo.close(); dialogo.remove(); }
  enviar.addEventListener('click', () => {
    const fechas = casillas.filter((c) => c.checked).map((c) => c.value);
    cerrar();
    enviarPorQr('asistencia', { padron, fechas });
  });
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
  contar();
}

// ---------------------------------------------------------------- recibir

/** Lo guardado ahora mismo, sin tocar `estado` (que la página puede estar usando). */
export function leerGuardado() {
  let padron = leer(CLAVES.padron, padronVacio());
  if (padron.version !== VERSION_PADRON) padron = migrarPadron(padron);
  if (!Array.isArray(padron.afiliados)) padron.afiliados = [];
  if (!Array.isArray(padron.atenciones)) padron.atenciones = [];
  const calendario = Object.assign(calendarioVacio(), leer(CLAVES.calendario, {}));
  if (!Array.isArray(calendario.entregas)) calendario.entregas = [];
  const config = Object.assign(configVacia(), leer(CLAVES.config, {}));
  return { padron, calendario, config };
}

function textoCrudo(clave) {
  try { return localStorage.getItem(clave); } catch (e) { return null; }
}

function devolverCrudo(clave, texto) {
  try {
    if (texto === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, texto);
  } catch (e) { /* sin espacio: ya avisa leer/guardar */ }
}

/**
 * Abre la cámara, lee el envío y muestra la comparación antes de guardar.
 * @param {{alGuardar?: () => void}} opciones  se llama tras guardar y tras deshacer
 */
export function recibirPorQr({ alGuardar = () => {} } = {}) {
  leerListaQr({ alRecibir: (paquete) => compararYConfirmar(paquete, alGuardar) });
}

// Lo que se muestra de cada valor: en palabras, nunca la clave interna.
const PALABRAS = {
  tipoDocumento: { dni: 'DNI', ce: 'Carné de extranjería' },
  tipoAfiliado: { habitual: 'Habitual', caso_social: 'Caso social' },
  sexo: { F: 'F', M: 'M' },
  periodicidad: { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' },
  estado: { pendiente: 'Pendiente', entregada: 'Entregada', observada: 'Observada', conforme: 'Conforme' },
  menu: { normal: 'Menú normal', ayuda_social: 'Ayuda social' }
};

function enPalabras(campo, v) {
  if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) return '(vacío)';
  if (campo === 'activo') return v === false ? 'No' : 'Sí';
  if (campo === 'grupoEtarioManual') return etiquetaGrupoEtario(v);
  if (campo === 'diasDeAviso') return `${v.join(', ')} días antes`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return aDdMmAa(v);
  return (PALABRAS[campo] && PALABRAS[campo][v]) || String(v);
}

let correlativo = 0;

/**
 * «Dejar lo de aquí» o «Usar lo recibido», con lo que dice cada uno.
 * @returns {{caja: HTMLElement, usarRecibido: () => boolean}}
 */
function elegirLado(aqui, recibido, porDefectoRecibido) {
  correlativo += 1;
  const nombre = `lado-${correlativo}`;
  const radios = [['aqui', `Dejar lo de aquí: ${aqui}`], ['recibido', `Usar lo recibido: ${recibido}`]].map(([v, t]) => {
    const r = crearElemento('input', { type: 'radio', name: nombre, value: v, id: `${nombre}-${v}` });
    r.checked = (v === 'recibido') === porDefectoRecibido;
    return { r, t };
  });
  return {
    caja: crearElemento('div', { clase: 'opciones elegir-lado' },
      radios.map(({ r, t }) => crearElemento('label', { clase: 'opcion', for: r.id }, [r, t]))),
    usarRecibido: () => radios[1].r.checked
  };
}

function casilla(texto, marcada) {
  correlativo += 1;
  const c = crearElemento('input', { type: 'checkbox', id: `casilla-${correlativo}` });
  c.checked = marcada;
  return { caja: crearElemento('label', { clase: 'opcion', for: c.id }, [c, texto]), marcada: () => c.checked };
}

const seccion = (titulo, hijos, clase = '') =>
  crearElemento('section', { clase: `comparar-seccion ${clase}` }, [crearElemento('h3', { texto: titulo }), ...hijos]);

const linea = (texto, clase = '') => crearElemento('p', { clase, texto });

function compararYConfirmar(paquete, alGuardar) {
  const datos = leerGuardado();
  const armado = paquete.tipo === 'padron' ? vistaPadron(paquete, datos)
    : paquete.tipo === 'asistencia' ? vistaAsistencia(paquete, datos) : vistaEntregas(paquete, datos);
  if (!armado.hayCambios) {
    avisoAbajo(armado.sinCambios || 'Ya tenías todo igual: no hay nada que cambiar.');
    return;
  }
  const guardarBoton = crearElemento('button', { type: 'button', clase: 'boton', texto: 'Guardar los cambios' });
  const dialogo = crearElemento('dialog', { clase: 'camara-dni comparar', 'aria-labelledby': 'comparar-titulo' }, [
    crearElemento('h2', { id: 'comparar-titulo', texto: armado.titulo }),
    crearElemento('p', { clase: 'camara-pista', texto: 'Revisa antes de guardar. Lo que no coincide se queda como aquí, salvo que elijas lo recibido.' }),
    crearElemento('div', { clase: 'resumen-chips comparar-resumen' }, armado.resumen),
    ...armado.secciones,
    crearElemento('div', { clase: 'acciones comparar-acciones' }, [
      guardarBoton,
      crearElemento('button', { type: 'button', clase: 'boton secundario', texto: 'Cancelar', onclick: () => cerrar() })
    ])
  ]);
  function cerrar() { dialogo.close(); dialogo.remove(); }
  guardarBoton.addEventListener('click', () => {
    const r = armado.aplicar();
    cerrar();
    if (!r) { avisoAbajo('No elegiste nada para guardar: todo quedó como estaba.'); return; }
    const antes = r.claves.map((k) => [k, textoCrudo(k)]);
    const ok = r.claves.every((k) => guardar(k, r.valores[k]));
    if (!ok) {
      for (const [k, t] of antes) devolverCrudo(k, t);
      avisoAbajo('No se pudo guardar: el almacenamiento está lleno o bloqueado. No cambió nada.');
      alGuardar();
      return;
    }
    vibrar(40);
    alGuardar();
    avisoAbajo(r.mensaje, () => {
      for (const [k, t] of antes) devolverCrudo(k, t);
      alGuardar();
    });
  });
  document.body.append(dialogo);
  dialogo.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(); });
  dialogo.showModal();
}

const chip = (texto) => crearElemento('span', { clase: 'chip', texto });

function vistaPadron(paquete, { padron }) {
  const c = compararPadron(padron, paquete);
  const secciones = [];
  const nuevas = c.nuevas.map((p) => ({ p, ...casilla(`${nombreCompleto(p)} · ${p.numeroDocumento || 'sin documento'}`, true) }));
  if (nuevas.length) secciones.push(seccion(`Personas nuevas (${nuevas.length})`, [
    linea('No están en este teléfono. Se agregan las marcadas.', 'pista'),
    crearElemento('div', { clase: 'opciones' }, nuevas.map((x) => x.caja))
  ]));
  const dudosas = c.dudosas.map((d) => ({
    p: d.recibida,
    ...casilla(`Agregar a ${nombreCompleto(d.recibida)} como persona nueva`, false),
    detalle: linea(`Aquí: DNI ${d.mia.numeroDocumento}. Recibido: DNI ${d.recibida.numeroDocumento}.`)
  }));
  if (dudosas.length) secciones.push(seccion(`Mismo nombre, otro DNI (${dudosas.length})`, [
    linea('Puede ser la misma persona con el DNI mal escrito en uno de los teléfonos. Mira su DNI antes de agregarla.', 'aviso-texto'),
    ...dudosas.flatMap((x) => [x.detalle, crearElemento('div', { clase: 'opciones' }, [x.caja])])
  ], 'comparar-cuidado'));
  const distintas = c.distintas.map((d) => {
    const lado = elegirLado(
      d.campos.map((x) => enPalabras(x.campo, x.mio)).join(' · '),
      d.campos.map((x) => enPalabras(x.campo, x.recibido)).join(' · '),
      d.soloCompleta && !d.nombreDistinto
    );
    return {
      d, lado,
      caja: crearElemento('div', { clase: 'comparar-item' }, [
        crearElemento('p', { clase: 'comparar-nombre', texto: `${nombreCompleto(d.mia)} · ${d.mia.numeroDocumento}` }),
        d.nombreDistinto ? linea('El nombre no coincide con el mismo DNI: puede ser otra persona. Mira su DNI.', 'aviso-texto') : null,
        linea(`Cambia: ${d.campos.map((x) => x.etiqueta.toLowerCase()).join(', ')}.`, 'pista'),
        lado.caja
      ])
    };
  });
  if (distintas.length) secciones.push(seccion(`Con datos distintos (${distintas.length})`, distintas.map((x) => x.caja)));
  return {
    titulo: 'Padrón recibido',
    hayCambios: nuevas.length + dudosas.length + distintas.length > 0,
    sinCambios: `Ya tenías a todas las personas del padrón recibido (${c.iguales} iguales).`,
    resumen: [
      chip(cuantos(nuevas.length, 'nueva')), chip(cuantos(c.iguales, 'igual', 'iguales')),
      chip(cuantos(distintas.length, 'distinta')),
      dudosas.length ? chip(`${dudosas.length} para revisar`) : null,
      c.soloAqui ? chip(`${c.soloAqui} solo aquí (no se tocan)`) : null
    ].filter(Boolean),
    secciones,
    aplicar() {
      const agregar = [...nuevas, ...dudosas].filter((x) => x.marcada()).map((x) => x.p);
      const usarRecibida = distintas.filter((x) => x.lado.usarRecibido()).map((x) => x.d);
      if (!agregar.length && !usarRecibida.length) return null;
      return {
        claves: [CLAVES.padron],
        valores: { [CLAVES.padron]: aplicarPadron(padron, { agregar, usarRecibida }) },
        mensaje: [agregar.length ? `Se ${agregar.length === 1 ? 'agregó' : 'agregaron'} ${cuantos(agregar.length, 'persona')}` : '',
          usarRecibida.length ? `${cuantos(usarRecibida.length, 'persona')} con lo recibido` : ''].filter(Boolean).join(', ') + '.'
      };
    }
  };
}

function vistaAsistencia(paquete, { padron, config }) {
  const dias = compararAsistencia(padron, paquete);
  const vistas = dias.map((d) => {
    const nombres = d.agregar.map((a) => nombreCompleto(a.afiliado));
    const menus = d.menuDistinto.map((m) => ({
      m, lado: elegirLado(enPalabras('menu', m.mio), enPalabras('menu', m.recibido), false)
    }));
    const precio = (p) => `normal S/ ${p.normal === null ? '—' : formatearSoles(p.normal)}, ` +
      `ayuda social S/ ${p.ayuda === null ? '—' : formatearSoles(p.ayuda)}`;
    const precios = d.preciosDistintos
      ? elegirLado(precio(d.preciosDistintos.mio), precio(d.preciosDistintos.recibido), false) : null;
    // Un día que aquí no existe solo se crea si trae a alguien que sumar.
    const cambia = !!(d.agregar.length || menus.length || precios);
    const incluir = casilla(d.existe ? 'Sumar a este día' : 'Agregar este día', !!cambia);
    const caja = crearElemento('div', { clase: 'comparar-item' }, [
      crearElemento('p', { clase: 'comparar-nombre', texto: `${fechaLarga(d.fecha)}${d.existe ? '' : ' (día nuevo aquí)'}` }),
      d.agregar.length ? linea(`${d.agregar.length === 1 ? 'Se suma' : 'Se suman'} ${cuantos(d.agregar.length, 'persona')}: ${nombres.slice(0, 8).join(', ')}` +
        `${nombres.length > 8 ? ` y ${nombres.length - 8} más` : ''}.`) : linea('No hay nadie nuevo que sumar.', 'pista'),
      d.yaEstaban ? linea(`${cuantos(d.yaEstaban, 'persona')} ya ${d.yaEstaban === 1 ? 'estaba' : 'estaban'} igual.`, 'pista') : null,
      d.soloAqui ? linea(`${cuantos(d.soloAqui, 'persona marcada', 'personas marcadas')} solo aquí: se ${d.soloAqui === 1 ? 'queda' : 'quedan'}.`, 'pista') : null,
      d.desconocidos ? linea(`${cuantos(d.desconocidos, 'persona')} no ${d.desconocidos === 1 ? 'está' : 'están'} en tu padrón: no se suman. Pasa primero el padrón.`, 'aviso-texto') : null,
      d.inactivos ? linea(`${cuantos(d.inactivos, 'persona')} no ${d.inactivos === 1 ? 'estaba activa' : 'estaban activas'} ese día aquí: no se suman.`, 'aviso-texto') : null,
      ...menus.flatMap((x) => [linea(`${nombreCompleto(x.m.afiliado)}: el menú no coincide.`, 'aviso-texto'), x.lado.caja]),
      precios ? linea('Los precios del día no coinciden.', 'aviso-texto') : null,
      precios ? precios.caja : null,
      incluir.caja
    ]);
    return { d, menus, precios, incluir, caja, cambia };
  });
  const sumas = dias.reduce((n, d) => n + d.agregar.length, 0);
  return {
    titulo: dias.length === 1 ? 'Asistencia recibida' : `Asistencia recibida (${dias.length} días)`,
    hayCambios: vistas.some((v) => v.cambia),
    sinCambios: dias.some((d) => d.desconocidos)
      ? 'No hay nadie que sumar: las personas recibidas no están en tu padrón. Pasa primero el padrón.'
      : 'Ya tenías esa asistencia: no hay nadie nuevo que sumar.',
    resumen: [chip(`${cuantos(dias.length, 'día')}`), chip(`${sumas} por sumar`)],
    secciones: vistas.map((v) => v.caja),
    aplicar() {
      const eleccion = { dias: new Set(), menuRecibido: new Set(), preciosRecibidos: new Set() };
      let suman = 0;
      for (const v of vistas) {
        if (!v.incluir.marcada()) continue;
        eleccion.dias.add(v.d.fecha);
        suman += v.d.agregar.length;
        for (const x of v.menus) if (x.lado.usarRecibido()) eleccion.menuRecibido.add(`${v.d.fecha}|${x.m.afiliado.id}`);
        if (v.precios && v.precios.usarRecibido()) eleccion.preciosRecibidos.add(v.d.fecha);
      }
      if (!eleccion.dias.size) return null;
      return {
        claves: [CLAVES.padron],
        valores: {
          [CLAVES.padron]: aplicarAsistencia(padron, dias, eleccion, {
            precioMenuNormalCent: config.precioMenuNormalCent, precioMenuAyudaSocialCent: config.precioMenuAyudaSocialCent
          })
        },
        mensaje: `${suman === 1 ? 'Se sumó' : 'Se sumaron'} ${cuantos(suman, 'persona')} en ${cuantos(eleccion.dias.size, 'día')}.`
      };
    }
  };
}

function vistaEntregas(paquete, { calendario }) {
  const c = compararEntregas(calendario, paquete);
  const config = c.config.map((x) => ({
    x,
    lado: elegirLado(enPalabras(x.campo, x.mio), enPalabras(x.campo, x.recibido),
      // Sin fecha base, aquí nunca se configuraron las entregas: se propone lo recibido.
      !calendario.fechaLimiteBase || x.mio === '' || x.mio === undefined || (Array.isArray(x.mio) && !x.mio.length))
  }));
  const nuevas = c.nuevas.map((n) => ({ n, ...casilla(`${aDdMmAa(n.fechaLimite)} · ${enPalabras('estado', n.estado)}${n.nota ? ` · ${n.nota}` : ''}`, true) }));
  const distintas = c.distintas.map((d) => ({
    d,
    lado: elegirLado(
      `${enPalabras('estado', d.mio.estado || 'pendiente')}${d.mio.nota ? ` · ${d.mio.nota}` : ''}`,
      `${enPalabras('estado', d.recibido.estado)}${d.recibido.nota ? ` · ${d.recibido.nota}` : ''}`, false)
  }));
  const secciones = [];
  if (config.length) secciones.push(seccion('Cómo se calculan las fechas', config.flatMap(({ x, lado }) => [
    crearElemento('p', { clase: 'comparar-nombre', texto: x.etiqueta }), lado.caja])));
  if (nuevas.length) secciones.push(seccion(`Entregas anotadas solo allá (${nuevas.length})`, [
    crearElemento('div', { clase: 'opciones' }, nuevas.map((x) => x.caja))]));
  if (distintas.length) secciones.push(seccion(`Entregas que no coinciden (${distintas.length})`, distintas.flatMap(({ d, lado }) => [
    crearElemento('p', { clase: 'comparar-nombre', texto: `Entrega del ${aDdMmAa(d.fechaLimite)}` }), lado.caja])));
  return {
    titulo: 'Entregas recibidas',
    hayCambios: secciones.length > 0,
    sinCambios: 'Ya tenías las entregas iguales: no hay nada que cambiar.',
    resumen: [chip(cuantos(nuevas.length, 'nueva')), chip(cuantos(c.iguales, 'igual', 'iguales')),
      chip(cuantos(distintas.length + config.length, 'distinta'))],
    secciones,
    aplicar() {
      const eleccion = {
        config: new Set(config.filter((x) => x.lado.usarRecibido()).map((x) => x.x.campo)),
        nuevas: new Set(nuevas.filter((x) => x.marcada()).map((x) => x.n.fechaLimite)),
        distintas: new Set(distintas.filter((x) => x.lado.usarRecibido()).map((x) => x.d.fechaLimite))
      };
      if (!eleccion.config.size && !eleccion.nuevas.size && !eleccion.distintas.size) return null;
      return {
        claves: [CLAVES.calendario],
        valores: { [CLAVES.calendario]: aplicarEntregas(calendario, c, eleccion) },
        mensaje: 'Entregas actualizadas con lo que elegiste.'
      };
    }
  };
}
