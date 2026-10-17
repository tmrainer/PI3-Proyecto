// pagina-vista-previa.js — controlador de vista-previa.html (fase 4, AGENTS.md §8.3).
//
// Se abre desde el paso «Revisar» del B-1. Solo muestra: exportar (PDF o
// Excel) está en el propio B-1, junto al enlace que trae aquí.
//
// Pone los datos del B-1 en sus posiciones de la hoja oficial (plantilla-b1.js)
// y lo muestra en pantalla. No imprime. Opcional: una foto de la hoja en blanco
// de fondo, solo en memoria (URL.createObjectURL): ni localStorage, ni red, ni
// impresión. Para el equipo, un panel que mueve las cajas en vivo y copia las
// coordenadas para pegarlas en plantilla-b1.js (no se guardan solas).

import { CLAVES, leer } from './modelo.js';
import { buscar, crearElemento, montarCabecera, pintarAvisosAlmacenamiento, avisoAbajo } from './ui.js';
import { PLANTILLA_B1 } from './plantilla-b1.js';
import { hojasDelB1 } from './hoja-b1.js';
import { dibujarFormato } from './pdf-b1.js';

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

// ------------------------------------------------- el formato dibujado
// El mismo dibujo del PDF, en SVG (mm: viewBox 210 × 297): sin él solo se
// veían los datos sueltos y parecía que el formato no terminaba de cargar.

function lienzoSvg(svg) {
  const NS = 'http://www.w3.org/2000/svg';
  let color = '#000';
  let ancho = 0.2;
  let raya = null;
  const pieza = (etiqueta, atributos) => {
    const e = document.createElementNS(NS, etiqueta);
    for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
    svg.append(e);
    return e;
  };
  const trazo = () => ({ stroke: color, 'stroke-width': ancho, ...(raya ? { 'stroke-dasharray': raya } : {}) });
  return {
    gris(g) { const v = Math.round(g * 255); color = `rgb(${v},${v},${v})`; },
    grosor(mm) { ancho = mm; },
    punteada(si) { raya = si ? '0.21 0.64' : null; },   // el [0.6 1.8] pt del PDF, en mm
    linea(x1, y1, x2, y2) { pieza('line', { x1, y1, x2, y2, ...trazo() }); },
    caja(x, y, w, h) { pieza('rect', { x, y, width: w, height: h, fill: 'none', ...trazo() }); },
    relleno(x, y, w, h) { pieza('rect', { x, y, width: w, height: h, fill: color }); },
    texto(t, x, yBase, pt, { negrita = false } = {}) {
      if (!t) return;
      const e = pieza('text', { x, y: yBase, 'font-size': pt / 2.8346, 'font-weight': negrita ? 700 : 400, fill: color,
        'font-family': 'Arial, "Liberation Sans", Helvetica, sans-serif' });
      e.textContent = t;
    }
  };
}
const formato = buscar('#hoja-formato');
dibujarFormato(lienzoSvg(formato));
const mostrarFormato = buscar('#mostrar-formato');
mostrarFormato.addEventListener('change', () => { formato.style.display = mostrarFormato.checked ? '' : 'none'; });

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
  // Con la foto, el dibujo encima confunde: se esconde (se puede volver a mostrar).
  mostrarFormato.checked = false;
  formato.style.display = 'none';
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
