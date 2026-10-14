// pagina-ajustes.js — controlador de ajustes.html.
//
// Lo que es de este teléfono: quién lo usa, el modo claro u oscuro, el tamaño
// de letra y la lectura en voz alta. Las preferencias son de este equipo
// (claves «pi3.*», ver js/preferencias.js): no van en las copias. Lo que toca
// a los datos (dónde se guardan, la copia, borrar todo) está en datos.html.

/** Versión que se muestra en «Acerca de». Subirla junto con versionName del APK. */
const VERSION_APP = '1.2';
import {
  buscar, crearElemento, montarCabecera, icono,
  pintarAvisosAlmacenamiento, mostrarBienvenida, decir, puedeHablar, sincronizarBarras, avisoAbajo
} from './ui.js';
import { leerPerfil, guardarPerfil, ROLES } from './perfil.js';

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

// ---- tus datos: página aparte ----
// Antes la copia estaba aquí: quien llega con #copia va a la página nueva.
if (location.hash === '#copia') location.replace('./datos.html#copia');
const enlaceDatos = buscar('#enlace-datos');
enlaceDatos.prepend(icono('escudo', { tam: 24 }));
enlaceDatos.append(icono('flecha', { tam: 20 }));

// ---- quién usa este teléfono ----
const perfil = leerPerfil();
const avisoPerfil = buscar('#perfil-guardado');
function guardarElPerfil() {
  guardarPerfil(perfil);
  avisoPerfil.textContent = 'Guardado en este teléfono.';
}
for (const [id, prop, soloCifras] of [['perfil-nombre', 'nombre', false], ['perfil-dni', 'dni', true], ['perfil-celular', 'celular', true]]) {
  const el = buscar('#' + id);
  el.value = perfil[prop] || '';
  el.addEventListener('input', () => {
    if (soloCifras) el.value = el.value.replace(/\D/g, '');
    perfil[prop] = el.value.trim();
    guardarElPerfil();
  });
}
elegirUno(buscar('#opciones-rol'), 'rol', ROLES, perfil.rol, (valor) => { perfil.rol = valor; guardarElPerfil(); });

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

// ---- acerca de ----
buscar('#version-app').textContent = `Versión ${VERSION_APP}`;

// Llegar con #perfil (desde la invitación del Inicio) deja esa sección a la vista.
if (location.hash === '#perfil') buscar('#perfil').scrollIntoView({ block: 'start' });
