// pagina-pruebas.js — pinta en pruebas.html el resultado de casos-prueba.js.
// Vive en su archivo (y no dentro del HTML) para que la política de
// contenido pueda prohibir todo script en línea.

import { ejecutar } from './casos-prueba.js';
import { crearElemento, montarCabecera } from './ui.js';

montarCabecera('pruebas', 'Aserciones en el navegador, sin dependencias');

const resultados = ejecutar();
const fallan = resultados.filter((r) => r.estado === 'falla');

const resumen = document.getElementById('resumen');
resumen.append(crearElemento('p', { clase: 'panel-resumen' }, [
  crearElemento('span', {
    clase: fallan.length ? 'pastilla error' : 'pastilla ok',
    texto: fallan.length
      ? `✕ ${fallan.length} de ${resultados.length} fallan`
      : `✓ ${resultados.length} de ${resultados.length} pasan`
  })
]));

const lista = document.getElementById('lista');
let grupoActual = null;
for (const r of resultados) {
  if (r.grupo !== grupoActual) {
    grupoActual = r.grupo;
    lista.append(crearElemento('h3', { clase: 'grupo-titulo', texto: grupoActual }));
  }
  lista.append(crearElemento('div', { clase: `caso ${r.estado}` }, [
    crearElemento('span', { clase: 'marca', texto: r.estado === 'pasa' ? '✓' : '✕' }),
    crearElemento('span', {}, [
      r.nombre,
      r.detalle ? crearElemento('span', { clase: 'detalle', texto: r.detalle }) : null
    ])
  ]));
}
