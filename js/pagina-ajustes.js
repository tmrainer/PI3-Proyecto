// pagina-ajustes.js — controlador de ajustes.html.
//
// En un solo lugar lo que antes estaba repartido: la copia de los datos y la
// privacidad (antes, plegada al pie de cada pantalla), el modo claro u
// oscuro, el tamaño de letra y la lectura en voz alta. Las preferencias son de
// este equipo (claves «pi3.*», ver js/preferencias.js): no van en las copias.

import { CLAVES, leer, hoyIso, cuantos, fechaLarga } from './modelo.js';
import {
  buscar, crearElemento, montarCabecera, bloquePrivacidad, barraDatos, botonBorrarTodo,
  pintarAvisosAlmacenamiento, mostrarBienvenida, decir, puedeHablar, sincronizarBarras, avisoAbajo
} from './ui.js';

montarCabecera('ajustes', 'De este teléfono');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));

function leerPreferencia(clave, porDefecto) {
  try { return localStorage.getItem(clave) || porDefecto; } catch (e) { return porDefecto; }
}

function guardarPreferencia(clave, valor) {
  try { localStorage.setItem(clave, valor); } catch (e) { /* solo mientras dure esta pantalla */ }
  window.aplicarPreferencias();
  sincronizarBarras();
}

/** Opciones de una sola elección (radios con forma de ficha). */
function elegirUno(caja, nombre, opciones, actual, alElegir) {
  for (const [valor, texto] of opciones) {
    const radio = crearElemento('input', { type: 'radio', name: nombre, value: valor, id: `${nombre}-${valor}` });
    radio.checked = valor === actual;
    radio.addEventListener('change', () => { if (radio.checked) alElegir(valor); });
    caja.append(crearElemento('label', { clase: 'opcion', for: radio.id }, [radio, texto]));
  }
}

// ---- copia de los datos ----
buscar('#privacidad').append(bloquePrivacidad());
// Borrar todo va aparte, al final, lejos de «Guardar una copia».
buscar('#barra-datos').append(barraDatos({ borrar: false }));
buscar('#borrar-todo').append(botonBorrarTodo());
const ultima = leer(CLAVES.respaldo, {}).ultimoEn;
const dias = ultima ? Math.round((Date.parse(hoyIso()) - Date.parse(ultima)) / 86400000) : null;
buscar('#ultima-copia').textContent = dias === null
  ? 'Todavía no guardaste ninguna copia en este teléfono.'
  : dias === 0 ? 'Tu última copia es de hoy.'
    : `Tu última copia es del ${fechaLarga(ultima).toLowerCase()} (hace ${cuantos(dias, 'día')}).`;
if (dias === null || dias >= 14) buscar('#ultima-copia').classList.add('pendiente');

// ---- aspecto ----
elegirUno(buscar('#opciones-tema'), 'tema',
  [['auto', 'Automático (como el teléfono)'], ['claro', 'Claro'], ['oscuro', 'Oscuro']],
  leerPreferencia('pi3.tema', 'auto'),
  (valor) => guardarPreferencia('pi3.tema', valor));

const letraActual = leerPreferencia('pi3.letra', leerPreferencia('pi3.letraGrande', '0') === '1' ? 'grande' : 'normal');
elegirUno(buscar('#opciones-letra'), 'letra',
  [['normal', 'Normal'], ['grande', 'Grande'], ['muy-grande', 'Muy grande']],
  letraActual,
  (valor) => guardarPreferencia('pi3.letra', valor));

// ---- voz ----
const hayVoz = puedeHablar();
const casilla = buscar('#voz-boton');
casilla.checked = leerPreferencia('pi3.voz.boton', '0') === '1';
casilla.addEventListener('change', () => {
  guardarPreferencia('pi3.voz.boton', casilla.checked ? '1' : '0');
  avisoAbajo(casilla.checked ? 'Listo: el botón 🔊 está arriba, junto a los tres puntos.' : 'Quitaste el botón 🔊.');
});
elegirUno(buscar('#opciones-velocidad'), 'velocidad',
  [['normal', 'Normal'], ['lenta', 'Lenta']],
  leerPreferencia('pi3.voz.velocidad', 'normal'),
  (valor) => guardarPreferencia('pi3.voz.velocidad', valor));
buscar('#probar-voz').addEventListener('click', () => {
  decir('Hola. Así suena la voz que lee la pantalla. Toca a quien vino y las raciones se cuentan solas.');
});
if (!hayVoz) {
  buscar('#voz-pista').textContent = 'Este equipo no puede leer en voz alta.';
  for (const control of document.querySelectorAll('#voz-boton, #opciones-velocidad input, #probar-voz')) control.disabled = true;
}

// ---- ayuda ----
buscar('#como-se-usa').addEventListener('click', () => mostrarBienvenida());

// Llegar con #copia (desde el aviso de copia) deja esa sección a la vista.
if (location.hash === '#copia') buscar('#copia').scrollIntoView({ block: 'start' });
