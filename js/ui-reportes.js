// ui-reportes.js — el padrón listo para copiar a un formato municipal.
// Solo ordena y numera lo ya ingresado: no completa ni deduce ningún dato.

import { nombreCompleto } from './modelo.js';
import {
  filasPadron, asistenciaPorAfiliado, afiliadosSinAsistencia, TRAMOS_ETARIOS
} from './calculos.js';
import { estado } from './estado.js';
import { crear } from './ui.js';

// ctx: { fechaRef, inicio, fin }

export function pintarReportePadron(caja, ctx) {
  caja.textContent = '';
  const filas = filasPadron(estado.padron, ctx.fechaRef);
  const asistencias = new Map(
    asistenciaPorAfiliado(estado.padron, ctx.inicio, ctx.fin).map((x) => [x.afiliadoId, x]));

  if (filas.length === 0) {
    caja.append(crear('p', { clase: 'vacio-mensaje', texto: 'No hay personas activas que listar.' }));
    return;
  }

  const cuerpo = crear('tbody');
  for (const f of filas) {
    const as = asistencias.get(f.afiliadoId);
    cuerpo.append(crear('tr', {}, [
      crear('td', { clase: 'num', texto: String(f.n) }),
      crear('td', { texto: f.apellidoPaterno }),
      crear('td', { texto: f.apellidoMaterno }),
      crear('td', { texto: f.nombres }),
      crear('td', { texto: f.tipoDocumento }),
      crear('td', { texto: f.numeroDocumento }),
      crear('td', { texto: f.grupoEtarioEtiqueta || '—' }),
      crear('td', { texto: f.edad === null ? '—' : String(f.edad) }),
      crear('td', { texto: f.tipoAfiliadoEtiqueta || '—' }),
      crear('td', { clase: 'num', texto: as ? String(as.dias) : '0' })
    ]));
  }

  caja.append(crear('div', { clase: 'tabla-desplazable' }, [
    crear('table', { clase: 'tabla' }, [
      crear('thead', {}, [crear('tr', {}, [
        'N°', 'Ap. paterno', 'Ap. materno', 'Nombres', 'Doc.', 'Número',
        'Grupo de edad', 'Edad', 'Tipo', 'Días'
      ].map((t) => crear('th', { texto: t })))]),
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
  const chips = crear('div', { clase: 'resumen-chips', style: 'margin-top:10px' }, [
    crear('span', { clase: 'chip', html: `Total: <b>${filas.length}</b>` })
  ]);
  for (const t of TRAMOS_ETARIOS) {
    chips.append(crear('span', { clase: 'chip', html: `${t.etiqueta}: <b>${porGrupo[t.clave]}</b>` }));
  }
  chips.append(crear('span', { clase: 'chip', html: `Ayuda social: <b>${ayudaSocial}</b>` }));
  caja.append(chips);

  const ausentes = afiliadosSinAsistencia(estado.padron, ctx.inicio, ctx.fin);
  if (ausentes.length) {
    caja.append(crear('p', {
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
