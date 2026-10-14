// pagina-inicio.js — controlador de index.html: la pantalla de Inicio.
//
// Se entra por tareas («Pasar lista hoy», «Anotar una compra»), no por
// secciones: así nadie tiene que saber que una compra va en el «Formato B-1».
// Arriba, el día de un vistazo y la próxima entrega.

import {
  CLAVES, leer, hoyIso, formatearSoles, configVacia, calendarioVacio, padronVacio, cuantos, fechaLarga
} from './modelo.js';
import { desgloseDelDia, recaudacionDelDiaCent } from './calculos.js';
import { alertaProximaEntrega } from './alertas.js';
import {
  buscar, crearElemento, icono, montarCabecera,
  pintarAvisosAlmacenamiento, mostrarBienvenida, bienvenidaVista, exportarTodo
} from './ui.js';
import { perfilCompleto, perfilOmitido, omitirPerfil } from './perfil.js';

const padron = leer(CLAVES.padron, padronVacio());
const config = Object.assign(configVacia(), leer(CLAVES.config, {}));
const calendario = leer(CLAVES.calendario, calendarioVacio());
const hoy = hoyIso();

montarCabecera('inicio', fechaLarga(hoy));
// El nombre de la olla, si ya lo escribió en el B-1; si no, el de la app.
const centro = config.ultimoCentro && String(config.ultimoCentro.nombreCentro || '').trim();
if (centro) buscar('.cabecera-titulo h1').textContent = centro;
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'), { recordatorio: false });

// ---- el día de hoy ----
const atHoy = (padron.atenciones || []).find((a) => a.fecha === hoy);
const d = desgloseDelDia(atHoy);
buscar('#hoy-raciones').textContent = String(d.total);
const rec = atHoy ? recaudacionDelDiaCent(atHoy) : 0;
buscar('#hoy-recaudado').textContent = rec === null ? '—' : `S/ ${formatearSoles(rec).replace(/\.00$/, '')}`;
if (rec === null) buscar('#hoy-recaudado-etiqueta').textContent = 'falta el precio';
buscar('#hoy-tarjeta').dataset.leer = '';
buscar('#hoy-tarjeta').setAttribute('aria-label',
  `Hoy: ${cuantos(d.total, 'ración', 'raciones')}` + (rec ? `, ${formatearSoles(rec)} soles recaudados` : ''));

// ---- la próxima entrega ----
const entrega = buscar('#hoy-entrega');
const alerta = alertaProximaEntrega(calendario, hoy);
let textoEntrega = 'Anota cuándo entregas el B-1 y la app te avisa';
if (alerta && alerta.configurado) {
  const n = Math.abs(alerta.diasRestantes);
  textoEntrega = alerta.diasRestantes < 0 ? `La entrega del B-1 venció hace ${cuantos(n, 'día')}`
    : alerta.diasRestantes === 0 ? 'Hoy vence la entrega del B-1'
      : `Faltan ${cuantos(n, 'día')} para entregar el B-1`;
  entrega.classList.add(alerta.nivel);
}
entrega.append(icono('reloj', { tam: 22 }), crearElemento('span', { texto: textoEntrega }));

// ---- las tareas: ícono y palabra ----
for (const t of document.querySelectorAll('.tarea')) {
  const texto = t.textContent;
  t.textContent = '';
  t.append(
    crearElemento('span', { clase: `tarea-icono ${t.dataset.tono || ''}` }, [icono(t.dataset.icono, { tam: 30 })]),
    crearElemento('span', { clase: 'tarea-texto', texto })
  );
}
buscar('#como-se-usa').addEventListener('click', () => mostrarBienvenida());
// «Más»: lo mismo que el menú ⋮, con una línea de qué hay en cada uno.
for (const [id, cual] of [['#enlace-datos', 'escudo'], ['#enlace-ajustes', 'ajustes'], ['#como-se-usa', 'ayuda']]) {
  const e = buscar(id);
  e.prepend(icono(cual, { tam: 24 }));
  e.append(icono('flecha', { tam: 20 }));
}

// ---- la copia de los datos ----
const nota = buscar('#nota-copia');
const ultima = leer(CLAVES.respaldo, {}).ultimoEn;
const dias = ultima ? Math.round((Date.parse(hoy) - Date.parse(ultima)) / 86400000) : null;
const hayDatos = (padron.afiliados || []).length > 0;
if (dias !== null && dias < 14) {
  nota.append(icono('escudo', { tam: 22 }), crearElemento('span', {
    texto: dias === 0 ? 'Copia de tus datos guardada hoy' : `Copia de tus datos guardada hace ${cuantos(dias, 'día')}`
  }));
} else if (hayDatos) {
  nota.classList.add('pendiente');
  nota.append(
    icono('escudo', { tam: 22 }),
    crearElemento('span', { texto: dias === null ? 'Todavía no guardaste una copia de tus datos' : `Tu última copia es de hace ${dias} días` }),
    crearElemento('button', { type: 'button', clase: 'boton diminuto secundario', texto: 'Guardar una copia', onclick: async () => { await exportarTodo(); location.reload(); } })
  );
} else {
  nota.hidden = true;
}

// ---- quién usa este teléfono ----
// Una invitación, no un paso obligatorio: se puede decir «Ahora no».
const notaPerfil = buscar('#nota-perfil');
if (!perfilCompleto() && !perfilOmitido()) {
  notaPerfil.hidden = false;
  notaPerfil.append(
    crearElemento('p', {}, [
      crearElemento('strong', { texto: '¿Quién usa este teléfono? ' }),
      'Con tu nombre y tu rol, la app te propone tus datos en el B-1.'
    ]),
    crearElemento('div', { clase: 'acciones' }, [
      crearElemento('a', { clase: 'boton diminuto', href: './ajustes.html#perfil', texto: 'Poner mis datos' }),
      crearElemento('button', {
        type: 'button', clase: 'boton diminuto secundario', texto: 'Ahora no',
        onclick: () => { omitirPerfil(); notaPerfil.hidden = true; }
      })
    ])
  );
}

// La primera vez, con el padrón vacío, se explica cómo se usa.
if (!bienvenidaVista() && !hayDatos) mostrarBienvenida();
