// ui-escaneo.js — el aviso de la inscripción por código de barras del DNI.
// El lector todavía no existe (escaneo-dni.js es un esqueleto): aquí solo se
// explica eso y se dice qué podría usar este navegador cuando exista.

import { soportaCamaraPdf417 } from './escaneo-dni.js';
import { crearElemento, icono } from './ui.js';

export async function pintarEstadoEscaneo(caja) {
  caja.textContent = '';
  caja.append(crearElemento('p', {
    texto: 'Más adelante, inscribir a una persona será escanear el código de barras ' +
      'del reverso de su DNI. Todavía no está disponible: falta conocer con certeza ' +
      'cómo vienen codificados los datos en ese código. No se va a suponer.'
  }));
  const soporta = await soportaCamaraPdf417();
  caja.append(crearElemento('div', { clase: 'resumen-chips' }, [
    crearElemento('span', { clase: 'chip' }, [
      icono(soporta ? 'ok' : 'error', { tam: 14 }),
      soporta ? ' Este navegador podría leer PDF417 con la cámara'
        : ' Este navegador no lee PDF417 con la cámara'
    ]),
    crearElemento('span', { clase: 'chip' }, [
      icono('ok', { tam: 14 }), ' Un lector de mano tipo teclado funcionará siempre'
    ])
  ]));
  caja.append(crearElemento('p', {
    clase: 'pista',
    texto: 'Cuando se active: lo leído se mostrará para que alguien lo revise antes ' +
      'de guardarlo, los campos que no se puedan leer quedarán vacíos, y la cadena ' +
      'cruda del código no se guardará en ninguna parte.'
  }));
}
