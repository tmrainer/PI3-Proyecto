// pagina-datos.js — controlador de datos.html: «Tus datos».
//
// Todo lo que toca a los datos, aparte de los ajustes del teléfono: dónde se
// guardan (incluida la copia de seguridad de Google en el APK), la copia que
// guarda la persona y «Borrar todo», al final y lejos de «Guardar una copia».

import { CLAVES, leer, hoyIso, cuantos, fechaLarga } from './modelo.js';
import {
  buscar, crearElemento, montarCabecera, lugaresDeLosDatos, barraDatos, botonBorrarTodo, pintarAvisosAlmacenamiento
} from './ui.js';
import { enviarPorQr, elegirDiasYEnviar, recibirPorQr, puedeLeerQr, leerGuardado } from './ui-compartir.js';

montarCabecera('datos', 'Dónde están y cómo cuidarlos');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));

buscar('#lugares').append(lugaresDeLosDatos());
buscar('#barra-datos').append(barraDatos({ borrar: false }));
buscar('#borrar-todo').append(botonBorrarTodo());

// ---- pasar a otro teléfono ----
// Se lee lo guardado en el momento de tocar: siempre lo último.
const botonQr = (texto, accion) => crearElemento('button', { type: 'button', clase: 'boton secundario', texto, onclick: accion });
buscar('#enviar-qr').append(
  botonQr('Pasar el padrón', () => enviarPorQr('padron', leerGuardado())),
  botonQr('Pasar la asistencia…', () => elegirDiasYEnviar(leerGuardado().padron)),
  botonQr('Pasar las entregas', () => enviarPorQr('entregas', leerGuardado()))
);
const recibir = crearElemento('button', {
  type: 'button', clase: 'boton', texto: 'Recibir por QR', hidden: true, onclick: () => recibirPorQr()
});
const sinCamara = crearElemento('p', {
  clase: 'pista', hidden: true, texto: 'Este teléfono puede mostrar los códigos, pero no leerlos con la cámara.'
});
buscar('#recibir-qr').append(recibir, sinCamara);
puedeLeerQr().then((si) => { recibir.hidden = !si; sinCamara.hidden = si; }).catch(() => { sinCamara.hidden = false; });

const ultima = leer(CLAVES.respaldo, {}).ultimoEn;
const dias = ultima ? Math.round((Date.parse(hoyIso()) - Date.parse(ultima)) / 86400000) : null;
buscar('#ultima-copia').textContent = dias === null
  ? 'Todavía no guardaste ninguna copia en este teléfono.'
  : dias === 0 ? 'Tu última copia es de hoy.'
    : `Tu última copia es del ${fechaLarga(ultima).toLowerCase()} (hace ${cuantos(dias, 'día')}).`;
if (dias === null || dias >= 14) buscar('#ultima-copia').classList.add('pendiente');

// Llegar con #copia (desde un aviso de copia) deja esa sección a la vista.
if (['#copia', '#donde', '#pasar'].includes(location.hash)) buscar(location.hash).scrollIntoView({ block: 'start' });
