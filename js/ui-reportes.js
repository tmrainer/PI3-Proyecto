// ui-reportes.js — el padrón listo para copiar a un formato municipal.
// Solo ordena y numera lo ya ingresado: no completa ni deduce ningún dato.

import { nombreCompleto, hoyIso, descargarTexto } from './modelo.js';
import {
  filasPadron, asistenciaPorAfiliado, afiliadosSinAsistencia, TRAMOS_ETARIOS
} from './calculos.js';
import { estado } from './estado.js';
import { buscar, crearElemento } from './ui.js';

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
    crearElemento('span', { clase: 'chip', html: `Total: <b>${filas.length}</b>` })
  ]);
  for (const t of TRAMOS_ETARIOS) {
    chips.append(crearElemento('span', { clase: 'chip', html: `${t.etiqueta}: <b>${porGrupo[t.clave]}</b>` }));
  }
  chips.append(crearElemento('span', { clase: 'chip', html: `Ayuda social: <b>${ayudaSocial}</b>` }));
  caja.append(chips);

  const ausentes = afiliadosSinAsistencia(estado.padron, ctx.inicio, ctx.fin, ctx.fechaRef);
  if (ausentes.length) {
    caja.append(crearElemento('p', {
      clase: 'asistencia-resumen',
      texto: `${ausentes.length} persona(s) sin ninguna asistencia en el periodo: ` +
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
      f.n, f.apellidoPaterno, f.apellidoMaterno, f.nombres, f.tipoDocumento,
      f.numeroDocumento, f.grupoEtarioEtiqueta, f.edad === null ? '' : f.edad,
      f.tipoAfiliadoEtiqueta, as ? as.dias : 0
    ].map((v) => {
      const s = String(v === null || v === undefined ? '' : v);
      return separador === ',' && /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(separador));
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

  buscar('#descargar-padron').addEventListener('click', () => {
    descargarTexto(`padron-${hoyIso()}.csv`, filasComoTexto(ctx, ','));
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
