// preferencias.js — las preferencias de este equipo, antes del primer cuadro.
//
// Script clásico y chico, cargado en el <head> antes de dibujar: el modo
// (claro u oscuro), el tamaño de letra y el botón de voz se aplican desde el
// principio, sin saltos en cada cambio de pantalla (si los pusiera el módulo
// de la página, se vería primero el aspecto por defecto).
//
// Se eligen en Ajustes (pagina-ajustes.js), que vuelve a llamar a
// window.aplicarPreferencias() después de cada cambio. No son datos de la olla:
// viven en localStorage con claves «pi3.*» y no van en las copias.
//
//   pi3.tema         'auto' | 'claro' | 'oscuro'      (auto: el del teléfono)
//   pi3.letra        'normal' | 'grande' | 'muy-grande'
//   pi3.voz.boton    '1' para mostrar 🔊 en la cabecera
//   pi3.voz.velocidad 'normal' | 'lenta'

(function () {
  'use strict';

  function leer(clave, porDefecto) {
    try { return localStorage.getItem(clave) || porDefecto; } catch (e) { return porDefecto; }
  }

  window.aplicarPreferencias = function () {
    var raiz = document.documentElement;
    var tema = leer('pi3.tema', 'auto');
    if (tema === 'claro' || tema === 'oscuro') raiz.setAttribute('data-tema', tema);
    else raiz.removeAttribute('data-tema');

    // «Letra grande» de antes (pi3.letraGrande = '1') sigue valiendo.
    var letra = leer('pi3.letra', leer('pi3.letraGrande', '0') === '1' ? 'grande' : 'normal');
    raiz.classList.toggle('letra-grande', letra === 'grande');
    raiz.classList.toggle('letra-muy-grande', letra === 'muy-grande');

    raiz.classList.toggle('con-voz', leer('pi3.voz.boton', '0') === '1');
  };

  window.aplicarPreferencias();
})();
