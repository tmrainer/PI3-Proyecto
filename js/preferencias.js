// preferencias.js — las preferencias de este equipo, antes del primer cuadro.
//
// Script clásico y chico, cargado en el <head> antes de dibujar: la letra
// grande se aplica desde el principio, y no salta de tamaño en cada cambio de
// pantalla (si la pusiera el módulo de la página, se vería primero chica).
// No son datos de la olla: viven en localStorage con claves «pi3.*».

(function () {
  'use strict';
  try {
    if (localStorage.getItem('pi3.letraGrande') === '1') {
      document.documentElement.classList.add('letra-grande');
    }
  } catch (e) { /* sin almacenamiento: tamaño normal */ }
})();
