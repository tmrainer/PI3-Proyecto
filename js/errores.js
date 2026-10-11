// errores.js — si algo falla, decirlo en pantalla en vez de dejarla en blanco.
//
// Es un script clásico (no un módulo) y se carga antes que todos: cuando un
// módulo no carga o tiene un error, ninguno de los módulos corre, y este aviso
// tiene que poder aparecer igual. No usa nada de la aplicación.
//
// Los datos no se tocan: siguen en localStorage. El detalle técnico queda a la
// vista (plegado) para poder sacarle una foto y mostrárselo a quien mantiene
// la aplicación.

(function () {
  'use strict';
  var mostrado = false;

  function mostrar(detalle) {
    if (mostrado) return;
    mostrado = true;
    var pintar = function () {
      var caja = document.createElement('div');
      caja.className = 'aviso-sistema';
      caja.setAttribute('role', 'alert');
      var p = document.createElement('p');
      p.textContent = 'Algo falló en esta página. Tus datos siguen guardados en este ' +
        'dispositivo: recarga la página. Si vuelve a pasar, exporta un respaldo desde ' +
        'otra sección y avisa a quien mantiene la aplicación.';
      var boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'boton diminuto secundario';
      boton.textContent = 'Recargar';
      boton.addEventListener('click', function () { location.reload(); });
      var mas = document.createElement('details');
      var resumen = document.createElement('summary');
      resumen.textContent = 'Detalle técnico';
      var pre = document.createElement('pre');
      pre.className = 'detalle-error';
      pre.textContent = detalle;
      mas.append(resumen, pre);
      caja.append(p, boton, mas);
      var lugar = document.getElementById('avisos-sistema') || document.body;
      lugar.prepend(caja);
    };
    if (document.body) pintar();
    else document.addEventListener('DOMContentLoaded', pintar);
  }

  // En captura: así también llegan los errores de carga de un <script>, que
  // no suben hasta window por su cuenta.
  addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName === 'SCRIPT') {
      mostrar('No cargó ' + (t.src || 'un script'));
    } else if (e.error || e.message) {
      mostrar((e.error && e.error.stack) || (e.message + ' (' + e.filename + ':' + e.lineno + ')'));
    }
  }, true);

  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    mostrar('Promesa rechazada: ' + ((r && r.stack) || String(r)));
  });
})();
