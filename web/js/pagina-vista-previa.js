// pagina-vista-previa.js — controlador de vista-previa.html (fase 4, AGENTS.md §8.3).
//
// Pone los datos del B-1 en sus posiciones de la hoja oficial (plantilla-b1.js)
// y lo muestra en pantalla. No imprime. Opcional: una foto de la hoja en blanco
// de fondo, solo en memoria (URL.createObjectURL): ni localStorage, ni red, ni
// impresión. Para el equipo, un panel que mueve las cajas en vivo y copia las
// coordenadas para pegarlas en plantilla-b1.js (no se guardan solas).

import { CLAVES, leer, guardar, aDdMmAa, formatearSoles, cuantos } from './modelo.js';
import { totales } from './calculos.js';
import { buscar, crearElemento, montarCabecera, pintarAvisosAlmacenamiento, avisoAbajo } from './ui.js';
import { PLANTILLA_B1 } from './plantilla-b1.js';
import { hojasDelB1 } from './hoja-b1.js';
import { pdfDelB1 } from './pdf-b1.js';
import { compartirArchivo, paqueteWhatsapp } from './compartir-archivo.js';

montarCabecera('b1', 'Cómo queda en la hoja oficial');
pintarAvisosAlmacenamiento(buscar('#avisos-sistema'));

// Copia de trabajo: el panel de ajuste la cambia; el archivo no se toca.
const plantilla = JSON.parse(JSON.stringify(PLANTILLA_B1));

const rendiciones = leer(CLAVES.rendiciones, []);
const idPedido = new URLSearchParams(location.search).get('ver');
const rendicion = rendiciones.find((r) => r && r.id === idPedido) || rendiciones[0] || null;
const hojas = hojasDelB1(rendicion);
let hojaActual = 0;

if (plantilla.estimado) {
  buscar('#aviso-estimado').append(crearElemento('div', { clase: 'aviso-sistema', role: 'note' }, [
    crearElemento('p', {
      texto: 'Las posiciones están medidas sobre una foto de la hoja, no sobre la hoja misma. ' +
        'Sirven para ver cómo queda: todavía no imprimas sobre la hoja oficial.'
    })
  ]));
}
buscar('#cual-b1').textContent = rendicion
  ? `B-1 ${rendicion.periodo && rendicion.periodo.etiqueta ? `de ${rendicion.periodo.etiqueta}` : 'en curso'}. ` +
    'Solo van los datos: los rótulos, líneas y recuadros ya están en el papel.'
  : 'Todavía no hay un B-1 llenado: la hoja sale vacía.';

// ---------------------------------------------------------------- la hoja

const capa = buscar('#hoja-datos');
const LETRA_MIN = -0.08; // em: lo más que se aprietan las letras antes de truncar

function caja(texto, { xMm, yMm, anchoMm, altoMm, align }, pt, clave) {
  return crearElemento('div', {
    clase: `dato dato-${align}`, texto, 'data-clave': clave,
    style: `left:${xMm}mm;top:${yMm}mm;width:${anchoMm}mm;height:${altoMm}mm;font-size:${pt}pt`
  });
}

// Lo que no entra se aprieta un poco; si igual no entra, se marca en rojo y se
// avisa. Nunca invade la celda vecina (§8.1).
function ajustarAlAncho() {
  const noEntran = [];
  for (const el of capa.querySelectorAll('.dato')) {
    el.style.letterSpacing = '';
    el.classList.remove('no-entra');
    let espacio = 0;
    while (el.scrollWidth > el.clientWidth + 0.5 && espacio > LETRA_MIN) {
      espacio -= 0.02;
      el.style.letterSpacing = `${espacio}em`;
    }
    if (el.scrollWidth > el.clientWidth + 0.5) {
      el.classList.add('no-entra');
      noEntran.push(el);
    }
  }
  const lista = buscar('#no-entran');
  lista.textContent = '';
  if (noEntran.length) {
    lista.append(crearElemento('p', { clase: 'aviso-texto', texto: `${noEntran.length === 1 ? 'Un dato no entra' : `${noEntran.length} datos no entran`} en su espacio (en rojo):` }),
      crearElemento('ul', { clase: 'lista-datos' }, noEntran.map((el) => crearElemento('li', { texto: `«${el.textContent}»` }))));
  }
}

function pintarHoja() {
  const h = hojas[hojaActual];
  capa.textContent = '';
  for (const [clave, pos] of Object.entries(plantilla.campos)) {
    const t = h.campos[clave];
    if (!t) continue; // vacío = nada en esa posición (§8.1)
    const pt = clave.startsWith('marca') ? 12 : /Firma$|Tesorera$/.test(clave) ? plantilla.letraFirmasPt : plantilla.letraPt;
    capa.append(caja(t, pos, pt, clave));
  }
  const e = plantilla.egresos;
  h.filas.forEach((fila, i) => {
    for (const [col, pos] of Object.entries(e.columnas)) {
      if (!fila[col]) continue;
      capa.append(caja(fila[col], { ...pos, yMm: e.primeraFilaYMm + i * e.altoFilaMm, altoMm: e.altoFilaMm }, plantilla.letraTablaPt, `egresos.${col}`));
    }
  });
  ajustarAlAncho();
}

// Escala: «Ajustar» deja la hoja (210 mm) al ancho de la pantalla; + y −
// la agrandan hasta 4 veces para leerla bien en un celular. Con zoom, el marco
// se desliza de lado y la página, hacia abajo. Pellizcar también sirve.
const marco = buscar('#hoja-marco');
const tamano = buscar('#hoja-tamano');
const hoja = buscar('#hoja-b1');
const ZOOMS = [1, 1.5, 2, 3, 4];
let zoom = 0;
function escalar() {
  const ajuste = Math.min(1, marco.clientWidth / hoja.offsetWidth);
  const s = ajuste * ZOOMS[zoom];
  hoja.style.transform = `scale(${s})`;
  tamano.style.width = `${hoja.offsetWidth * s}px`;
  tamano.style.height = `${hoja.offsetHeight * s}px`;
  buscar('#zoom-valor').textContent = `${Math.round(ZOOMS[zoom] * 100)} %`;
  buscar('#zoom-menos').disabled = zoom === 0;
  buscar('#zoom-mas').disabled = zoom === ZOOMS.length - 1;
}
function cambiarZoom(nuevo) {
  // Lo que estaba en el centro sigue en el centro.
  const centro = (marco.scrollLeft + marco.clientWidth / 2) / Math.max(tamano.offsetWidth, 1);
  zoom = Math.max(0, Math.min(ZOOMS.length - 1, nuevo));
  escalar();
  marco.scrollLeft = centro * tamano.offsetWidth - marco.clientWidth / 2;
}
buscar('#zoom-menos').addEventListener('click', () => cambiarZoom(zoom - 1));
buscar('#zoom-mas').addEventListener('click', () => cambiarZoom(zoom + 1));
buscar('#zoom-ajustar').addEventListener('click', () => cambiarZoom(0));
new ResizeObserver(escalar).observe(marco);

if (hojas.length > 1) {
  const botones = hojas.map((_, i) => crearElemento('button', {
    type: 'button', clase: 'ficha-filtro', texto: `Hoja ${i + 1} de ${hojas.length}`,
    'aria-pressed': String(i === 0),
    onclick: () => {
      hojaActual = i;
      botones.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
      pintarHoja();
    }
  }));
  buscar('#elegir-hoja').append(...botones);
}

pintarHoja();
escalar();

// ------------------------------------------------------- la foto de fondo

const guia = buscar('#hoja-guia');
const opacidad = buscar('#opacidad-guia');
const mostrar = buscar('#mostrar-guia');
let urlGuia = null;
buscar('#archivo-guia').addEventListener('change', (ev) => {
  const archivo = ev.target.files && ev.target.files[0];
  if (!archivo) return;
  if (urlGuia) URL.revokeObjectURL(urlGuia);
  urlGuia = URL.createObjectURL(archivo);
  guia.src = urlGuia;
  guia.hidden = !mostrar.checked;
  opacidad.disabled = false;
  mostrar.disabled = false;
});
const aplicarGuia = () => { guia.style.opacity = String(opacidad.value / 100); guia.hidden = !urlGuia || !mostrar.checked; };
opacidad.addEventListener('input', aplicarGuia);
mostrar.addEventListener('change', aplicarGuia);
aplicarGuia();

// ------------------------------------------------- ajustar (equipo)

const cual = buscar('#ajustar-cual');
const OPCIONES = [
  ...Object.keys(plantilla.campos).map((k) => ['campo', k, k]),
  ['filas', 'egresos', 'Tabla de compras: primera fila y alto'],
  ...Object.keys(plantilla.egresos.columnas).map((k) => ['columna', k, `Columna: ${k}`])
];
cual.append(...OPCIONES.map(([, k, t], i) => crearElemento('option', { value: String(i), texto: t })));

function numero(etiqueta, valor, alCambiar) {
  const id = `aj-${etiqueta.replace(/\W+/g, '-')}`;
  const input = crearElemento('input', { id, type: 'number', step: '0.1', inputmode: 'decimal', value: String(valor) });
  input.addEventListener('input', () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) { alCambiar(n); pintarHoja(); }
  });
  return crearElemento('div', { clase: 'campo' }, [crearElemento('label', { for: id, texto: etiqueta }), input]);
}

function pintarAjuste() {
  const [tipo, clave] = OPCIONES[Number(cual.value)];
  const caja = buscar('#ajustar-numeros');
  caja.textContent = '';
  const obj = tipo === 'campo' ? plantilla.campos[clave] : tipo === 'columna' ? plantilla.egresos.columnas[clave] : plantilla.egresos;
  const claves = tipo === 'campo' ? [['xMm', 'Desde la izquierda (mm)'], ['yMm', 'Desde arriba (mm)'], ['anchoMm', 'Ancho (mm)'], ['altoMm', 'Alto (mm)']]
    : tipo === 'columna' ? [['xMm', 'Desde la izquierda (mm)'], ['anchoMm', 'Ancho (mm)']]
      : [['primeraFilaYMm', 'Primera fila, desde arriba (mm)'], ['altoFilaMm', 'Alto de cada fila (mm)']];
  caja.append(...claves.map(([k, t]) => numero(t, obj[k], (n) => { obj[k] = n; })));
}
cual.addEventListener('change', pintarAjuste);
pintarAjuste();

buscar('#copiar-plantilla').addEventListener('click', async () => {
  const texto = `export const PLANTILLA_B1 = ${JSON.stringify(plantilla, null, 2)};\n`;
  try {
    await navigator.clipboard.writeText(texto);
    avisoAbajo('Coordenadas copiadas. Pégalas en js/plantilla-b1.js.');
  } catch (e) {
    avisoAbajo('No se pudo copiar en este equipo.');
  }
});

// ------------------------------------------------------------ el PDF

const dos = (n) => String(n).padStart(2, '0');
function sello(d) {
  return `${aDdMmAa(`${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
const etiquetaDe = (r) => (r && r.periodo && r.periodo.etiqueta) || 'en curso';
// Solo letras, números, guion y punto: así lo acepta Android y se lee en WhatsApp.
const nombreArchivo = (r) => `B-1 ${etiquetaDe(r)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) + '.pdf';

let whatsapp = null;
paqueteWhatsapp().then((p) => { whatsapp = p; buscar('#pdf-whatsapp').hidden = !p || !rendicion; });

async function entregarPdf(app) {
  if (!rendicion) { avisoAbajo('Todavía no hay un B-1 llenado.'); return; }
  const ahora = new Date();
  const bytes = pdfDelB1(hojas, { generado: sello(ahora), titulo: `Formato B-1 ${etiquetaDe(rendicion)}` });
  let r;
  try {
    r = await compartirArchivo({ nombre: nombreArchivo(rendicion), tipo: 'application/pdf', bytes,
      titulo: `Formato B-1 ${etiquetaDe(rendicion)} (copia de referencia)`, app });
  } catch (e) {
    avisoAbajo(app ? 'No se pudo abrir WhatsApp. Prueba con «Guardar o compartir PDF».' : 'No se pudo abrir el menú para compartir el PDF.');
    return;
  }
  if (r === 'cancelado') return;
  registrarGeneracion(ahora, app ? 'whatsapp' : r);
  avisoAbajo(r === 'descargado' ? 'PDF descargado.' : 'PDF listo: elige dónde guardarlo o a quién mandarlo.');
}
buscar('#pdf-compartir').addEventListener('click', () => entregarPdf(null));
buscar('#pdf-whatsapp').addEventListener('click', () => entregarPdf(whatsapp));

// ---------------------------------------------------------- historial
// Cuándo se generó el PDF de cada B-1 (los últimos 20 por B-1). Se lee lo
// guardado en el momento: así no se pisa lo que se haya cambiado en el B-1.

function registrarGeneracion(fecha, como) {
  const todas = leer(CLAVES.rendiciones, []);
  const r = todas.find((x) => x && x.id === rendicion.id);
  if (!r) return;
  const t = totales(r);
  r.generaciones = [...(Array.isArray(r.generaciones) ? r.generaciones : []),
    { en: fecha.toISOString(), hojas: hojas.length, totalCent: t.total, como }].slice(-20);
  if (guardar(CLAVES.rendiciones, todas)) {
    rendicion.generaciones = r.generaciones;
    pintarHistorial();
  }
}

const COMO = { whatsapp: 'por WhatsApp', compartido: 'compartido', descargado: 'descargado' };

function pintarHistorial() {
  const caja = buscar('#historial');
  caja.textContent = '';
  const todas = leer(CLAVES.rendiciones, []).filter(Boolean);
  if (!todas.length) {
    caja.append(crearElemento('p', { clase: 'pista', texto: 'Todavía no hay ningún B-1.' }));
    return;
  }
  caja.append(crearElemento('ul', { clase: 'historial-b1' }, todas.map((r) => {
    const gen = Array.isArray(r.generaciones) ? r.generaciones : [];
    const ultima = gen[gen.length - 1];
    const t = totales(r);
    const actual = rendicion && r.id === rendicion.id;
    return crearElemento('li', {}, [
      crearElemento('p', { clase: 'historial-titulo', texto: `B-1 ${etiquetaDe(r)}${actual ? ' (el que estás viendo)' : ''}` }),
      crearElemento('p', { texto: `${cuantos((r.egresos || []).filter((e) => e && Number.isFinite(e.montoTotalCent)).length, 'compra')}` +
        `${t.total !== null ? ` · total S/ ${formatearSoles(t.total)}` : ''}` }),
      crearElemento('p', { clase: 'pista', texto: ultima
        ? `PDF generado ${cuantos(gen.length, 'vez', 'veces')}; el último, el ${sello(new Date(ultima.en))} (${COMO[ultima.como] || 'guardado'}).`
        : 'Todavía no se generó su PDF.' }),
      actual ? null : crearElemento('div', { clase: 'acciones' }, [
        crearElemento('a', { clase: 'boton diminuto secundario', href: `./vista-previa.html?ver=${encodeURIComponent(r.id)}`, texto: 'Ver este B-1' })
      ])
    ]);
  })));
}
pintarHistorial();
