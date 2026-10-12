// pagina-probar-dni.js — controlador de probar-dni.html: el modo de prueba del
// lector de DNI, para el equipo del proyecto (AGENTS.md §7.5).
//
// Escanea un DNI y muestra cómo se separaron los datos, para compararlos con
// el documento. Lo único que se ofrece copiar es la plantilla anónima (letras
// a «A», cifras a «9») y si cada dato salió bien: con eso se escriben los
// casos de prueba sin que el repositorio guarde los datos de nadie.
// Nada de lo leído va a localStorage, ni a una copia, ni a un registro (§7.1).

import { crearElemento, montarCabecera, buscar, avisoAbajo } from './ui.js';
import { lectoresDni, abrirCamaraDni } from './camara-dni.js';
import { leerPdf417DniAzul, plantillaAnonima } from './escaneo-dni.js';

montarCabecera('probar-dni', 'Para el equipo del proyecto');

const boton = buscar('#escanear');
const seccion = buscar('#resultado');
let informe = '';

const { codigo, texto } = await lectoresDni();
buscar('#lectores').textContent = codigo || texto
  ? `Este teléfono puede leer: ${[codigo && 'el código de barras (DNI azul)', texto && 'la zona de texto (todos los DNI)']
    .filter(Boolean).join(' y ')}.`
  : 'Este teléfono no puede leer el DNI con la cámara. En el APK sí se puede.';
boton.disabled = !(codigo || texto);
boton.addEventListener('click', () => abrirCamaraDni({ alLeer: mostrar }));

buscar('#borrar').addEventListener('click', borrar);
buscar('#copiar').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(informe);
    avisoAbajo('Copiado. Pégalo en el mensaje al equipo.');
  } catch (e) {
    avisoAbajo('No se pudo copiar. Selecciona la plantilla a mano.');
  }
});

function borrar() {
  seccion.hidden = true;
  buscar('#resultado-campos').textContent = '';
  buscar('#plantilla').textContent = '';
  informe = '';
}

/** Una fila: dato, valor leído y «¿salió bien?» con Sí / No. */
function fila(nombre, valor, nota = '') {
  const id = `ok-${nombre.replace(/\W+/g, '-')}`;
  const grupo = crearElemento('div', { clase: 'probar-respuesta', role: 'radiogroup', 'aria-label': `¿${nombre} salió bien?` });
  for (const [v, t] of [['si', 'Bien'], ['no', 'Mal']]) {
    const r = crearElemento('input', { type: 'radio', name: id, value: v, id: `${id}-${v}` });
    grupo.append(crearElemento('label', { clase: 'opcion', for: r.id }, [r, t]));
  }
  return crearElemento('div', { clase: 'probar-fila', 'data-dato': nombre }, [
    crearElemento('div', {}, [
      crearElemento('span', { clase: 'probar-nombre', texto: nombre }),
      crearElemento('span', { clase: 'probar-valor', texto: valor || '(vacío)' }),
      nota ? crearElemento('span', { clase: 'pista', texto: nota }) : null
    ]),
    grupo
  ]);
}

function mostrar(r) {
  borrar();
  const caja = buscar('#resultado-campos');
  let plantilla = '';
  let tipo = '';
  if (r.tipo === 'pdf417') {
    const { largo, campos } = leerPdf417DniAzul(r.cadena);
    tipo = `Código de barras PDF417, ${largo} caracteres. Distribución de campos SIN VERIFICAR.`;
    caja.append(
      fila('DNI', campos.numeroDocumento),
      fila('Apellido paterno', campos.apellidoPaterno),
      fila('Apellido materno', campos.apellidoMaterno),
      fila('Nombres', campos.nombres),
      fila('Sexo', campos.sexo),
      fila('Fecha (¿vencimiento?)', campos.vencimiento, 'Compárala con la fecha de caducidad del DNI.')
    );
    plantilla = plantillaAnonima(r.cadena);
  } else {
    const { campos } = r.mrz;
    const a = r.anverso;
    tipo = 'Zona de lectura mecánica (MRZ). Los cuatro dígitos de control cuadran y salió igual dos veces.' +
      (a ? ' Nombres cruzados con el anverso.' : ' Sin el anverso (se omitió).');
    const ESTADOS = {
      confirmado: 'Igual en el anverso y en la MRZ.',
      dudoso: 'El anverso y la MRZ difieren en una letra: habría que elegir.',
      'sin-confirmar': 'Sin cruzar: compáralo con el DNI.',
      'no-leido': 'No se leyó.'
    };
    const cruzado = (nombre, c, deMrz) => (a
      ? fila(nombre, c.estado === 'dudoso' ? c.opciones.join('  o  ') : c.valor, ESTADOS[c.estado])
      : fila(nombre, deMrz, 'Solo de la MRZ: sin tildes ni ñ.'));
    caja.append(
      fila('País', campos.pais),
      fila('DNI', campos.numeroDocumento),
      fila('Fecha de nacimiento', campos.fechaNacimiento),
      fila('Sexo', campos.sexo),
      fila('Vencimiento', campos.vencimiento),
      cruzado('Apellido paterno', a && a.apellidoPaterno, campos.apellidos.join(' ')),
      cruzado('Apellido materno', a && a.apellidoMaterno, '(la MRZ no lo trae)'),
      cruzado('Nombres', a && a.nombres, campos.nombres)
    );
    plantilla = plantillaAnonima(r.mrz.lineas.join('\n'));
    if (a) {
      plantilla += '\n\nanverso: ' + ['apellidoPaterno', 'apellidoMaterno', 'nombres']
        .map((k) => `${k} ${a[k].estado} ${plantillaAnonima(a[k].valor || (a[k].opciones || []).join(' / '))}`).join('; ');
    }
  }
  buscar('#resultado-tipo').textContent = tipo;
  buscar('#plantilla').textContent = plantilla;
  seccion.hidden = false;
  seccion.scrollIntoView({ block: 'start' });

  // Lo que se copia: el tipo, la plantilla y Bien/Mal por dato. Nunca los datos.
  const armarInforme = () => {
    const respuestas = [...caja.querySelectorAll('.probar-fila')].map((f) => {
      const elegido = f.querySelector('input:checked');
      return `${f.dataset.dato}: ${elegido ? (elegido.value === 'si' ? 'bien' : 'MAL') : 'sin marcar'}`;
    });
    informe = [`Lector de DNI — ${r.tipo === 'pdf417' ? 'PDF417' : 'MRZ'}`, tipo, '', ...respuestas, '', plantilla].join('\n');
  };
  caja.addEventListener('change', armarInforme);
  armarInforme();
}

// Al salir de la página no queda nada en pantalla.
addEventListener('pagehide', borrar);
