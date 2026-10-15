// ui-reportes.js — el padrón listo para copiar a un formato municipal.
// Solo ordena y numera lo ya ingresado: no completa ni deduce ningún dato.

import { nombreCompleto, hoyIso, cuantos, aDdMmAa, CLAVES, leer } from './modelo.js';
import { pdfDelPadron } from './pdf-reportes.js';
import { compartirArchivo } from './compartir-archivo.js';
import {
  filasPadron, asistenciaPorAfiliado, afiliadosSinAsistencia, TRAMOS_ETARIOS
} from './calculos.js';
import { estado } from './estado.js';
import { celdaParaHoja } from './importar.js';
import { buscar, crearElemento, chip, avisoAbajo } from './ui.js';

// ctx: { fechaRef, inicio, fin }

export function pintarReportePadron(caja, ctx) {
  caja.textContent = '';
  const filas = filasPadron(estado.padron, ctx.fechaRef);
  const asistencias = new Map(
    asistenciaPorAfiliado(estado.padron, ctx.inicio, ctx.fin).map((x) => [x.afiliadoId, x]));

  if (filas.length === 0) {
    caja.append(crearElemento('p', {
      clase: 'vacio-mensaje',
      texto: 'El reporte sale del padrón. Inscribe personas o carga un archivo y aparecerán aquí.'
    }));
    return;
  }

  const cuerpo = crearElemento('tbody');
  for (const f of filas) {
    const as = asistencias.get(f.afiliadoId);
    cuerpo.append(crearElemento('tr', {}, [
      crearElemento('td', { clase: 'num', texto: String(f.n) }),
      crearElemento('td', { texto: f.apellidoPaterno }),
      crearElemento('td', { texto: f.apellidoMaterno }),
      crearElemento('td', { texto: f.nombres }),
      crearElemento('td', { texto: f.tipoDocumento }),
      crearElemento('td', { texto: f.numeroDocumento }),
      crearElemento('td', { texto: f.grupoEtarioEtiqueta || '—' }),
      crearElemento('td', { texto: f.edad === null ? '—' : String(f.edad) }),
      crearElemento('td', { texto: f.tipoAfiliadoEtiqueta || '—' }),
      crearElemento('td', { clase: 'num', texto: as ? String(as.dias) : '0' })
    ]));
  }

  caja.append(crearElemento('div', { clase: 'tabla-desplazable' }, [
    crearElemento('table', { clase: 'tabla' }, [
      crearElemento('thead', {}, [crearElemento('tr', {}, [
        'N°', 'Ap. paterno', 'Ap. materno', 'Nombres', 'Doc.', 'Número',
        'Grupo de edad', 'Edad', 'Tipo', 'Días'
      ].map((t) => crearElemento('th', { texto: t })))]),
      cuerpo
    ])
  ]));

  const porGrupo = {};
  for (const t of TRAMOS_ETARIOS) porGrupo[t.clave] = 0;
  let ayudaSocial = 0;
  for (const f of filas) {
    if (f.grupoEtario) porGrupo[f.grupoEtario] += 1;
    if (f.tipoAfiliado === 'caso_social') ayudaSocial += 1;
  }
  const chips = crearElemento('div', { clase: 'resumen-chips', style: 'margin-top:10px' }, [
    chip(`Total`, `${filas.length}`)
  ]);
  for (const t of TRAMOS_ETARIOS) {
    chips.append(chip(`${t.etiqueta}`, `${porGrupo[t.clave]}`));
  }
  chips.append(chip(`Ayuda social`, `${ayudaSocial}`));
  caja.append(chips);

  const ausentes = afiliadosSinAsistencia(estado.padron, ctx.inicio, ctx.fin, ctx.fechaRef);
  if (ausentes.length) {
    caja.append(crearElemento('p', {
      clase: 'asistencia-resumen',
      texto: `${ausentes.length === 1 ? '1 persona no vino' : `${ausentes.length} personas no vinieron`} ningún día en estas fechas: ` +
        ausentes.slice(0, 8).map(nombreCompleto).join(', ') + (ausentes.length > 8 ? '…' : '')
    }));
  }
}

export function filasComoTexto(ctx, separador) {
  const filas = filasPadron(estado.padron, ctx.fechaRef);
  const asistencias = new Map(
    asistenciaPorAfiliado(estado.padron, ctx.inicio, ctx.fin).map((x) => [x.afiliadoId, x]));
  // Títulos sin ambigüedad: así lo exportado se puede volver a importar (§6.9).
  const cab = ['N°', 'Apellido paterno', 'Apellido materno', 'Nombres',
    'Tipo de documento', 'Número de documento', 'Grupo de edad', 'Edad', 'Tipo',
    'Días asistidos'];
  const lineas = [cab.join(separador)];
  for (const f of filas) {
    const as = asistencias.get(f.afiliadoId);
    lineas.push([
      celdaParaHoja(f.n, separador), celdaParaHoja(f.apellidoPaterno, separador),
      celdaParaHoja(f.apellidoMaterno, separador), celdaParaHoja(f.nombres, separador),
      celdaParaHoja(f.tipoDocumento, separador),
      celdaParaHoja(f.numeroDocumento, separador, { comoTexto: true }),
      celdaParaHoja(f.grupoEtarioEtiqueta, separador),
      celdaParaHoja(f.edad === null ? '' : f.edad, separador),
      celdaParaHoja(f.tipoAfiliadoEtiqueta, separador), celdaParaHoja(as ? as.dias : 0, separador)
    ].join(separador));
  }
  return lineas.join('\n');
}

/**
 * Controles del reporte: el periodo de los días asistidos, y exportar como CSV
 * o copiar para pegar en una hoja de cálculo. `alCambiarPeriodo` repinta.
 */
export function montarControlesReporte(ctx, alCambiarPeriodo) {
  const rIni = buscar('#repInicio');
  const rFin = buscar('#repFin');
  rIni.value = ctx.inicio;
  rFin.value = ctx.fin;
  rIni.addEventListener('input', () => { ctx.inicio = rIni.value || ctx.inicio; alCambiarPeriodo(); });
  rFin.addEventListener('input', () => { ctx.fin = rFin.value || ctx.fin; alCambiarPeriodo(); });

  // En el APK, el menú «Compartir» de Android (una descarga no llegaba a
  // ninguna parte); en la computadora, la descarga. BOM: tildes en Excel.
  buscar('#descargar-padron').addEventListener('click', async () => {
    const bytes = new TextEncoder().encode('\ufeff' + filasComoTexto(ctx, ','));
    try {
      await compartirArchivo({ nombre: `padron-${hoyIso()}.csv`, tipo: 'text/csv', bytes, titulo: 'Padrón para Excel' });
    } catch (e) {
      avisoAbajo('No se pudo abrir el menú para guardar el archivo.');
    }
  });

  buscar('#pdf-padron').addEventListener('click', () => {
    const bytes = pdfDelPadron(estado.padron, { fechaRef: ctx.fechaRef, inicio: ctx.inicio, fin: ctx.fin,
      centro: nombreDelCentro(), generado: selloAhora() });
    compartirPdf(bytes, `Padron ${hoyIso()}.pdf`, 'Padrón (copia de referencia)');
  });

  buscar('#copiar-padron').addEventListener('click', async () => {
    const texto = filasComoTexto(ctx, '\t');
    try {
      await navigator.clipboard.writeText(texto);
      buscar('#estado-guardado').textContent = 'Padrón copiado. Pégalo en tu hoja de cálculo.';
    } catch (e) {
      const area = crearElemento('textarea', { rows: '10', style: 'width:100%;margin-top:10px' });
      area.value = texto;
      buscar('#reporte-padron').append(
        crearElemento('p', { clase: 'pista', texto: 'Tu navegador no dejó copiar solo. Selecciona y copia:' }), area);
      area.select();
    }
  });
}

// ------------------------------------------------------------- los PDF

const dos = (n) => String(n).padStart(2, '0');

/** «15-10-26 01:10»: cuándo se generó, para el aviso de cada hoja. */
export function selloAhora(d = new Date()) {
  return `${aDdMmAa(`${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** El nombre del centro que se escribió en el último B-1, si hay. */
export function nombreDelCentro() {
  const c = leer(CLAVES.config, {}).ultimoCentro;
  return String((c && c.nombreCentro) || '').trim();
}

/**
 * Entrega un PDF: el menú «Compartir» de Android (WhatsApp, Drive…) o, en la
 * computadora, la descarga. Avisa abajo cómo terminó.
 */
export async function compartirPdf(bytes, nombre, titulo) {
  try {
    const r = await compartirArchivo({ nombre, tipo: 'application/pdf', bytes, titulo });
    if (r === 'descargado') avisoAbajo('PDF descargado.');
  } catch (e) {
    avisoAbajo('No se pudo abrir el menú para compartir el PDF.');
  }
}
