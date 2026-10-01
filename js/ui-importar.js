// ui-importar.js — cargar un padrón pegado desde Excel o desde un CSV.
// Nada se guarda hasta que la usuaria ve qué filas entran y confirma (§6.9).

import { etiquetaGrupoEtario } from './calculos.js';
import { prepararImportacion, filasImportables } from './importar.js';
import { estado, guardarYa } from './estado.js';
import { $, crear } from './ui.js';

// ctx: { estadoTexto, onRepintar() }

// -------------------------------------------- importar un padrón desde archivo
//
// Nada se guarda hasta que la usuaria ve exactamente qué filas entran y cuáles
// no, y confirma. Ver AGENTS.md §6.9.

let importacionPendiente = null;

export function montarImportacion(ctx) {
  const area = $('#pegarPadron');
  const archivo = $('#archivoPadron');
  const vista = $('#vista-importacion');
  const btnRevisar = $('#revisar-importacion');
  const btnConfirmar = $('#confirmar-importacion');
  const btnCancelar = $('#cancelar-importacion');

  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    try {
      area.value = await f.text();
      revisar();
    } catch (e) {
      vista.textContent = '';
      vista.append(crear('p', { clase: 'aviso-sistema', texto: 'No se pudo leer el archivo.' }));
    }
    archivo.value = '';
  });

  function limpiar() {
    importacionPendiente = null;
    vista.textContent = '';
    btnConfirmar.hidden = true;
    btnCancelar.hidden = true;
  }

  function revisar() {
    const texto = area.value;
    if (!texto.trim()) { limpiar(); return; }

    const r = prepararImportacion(texto, estado.padron);
    vista.textContent = '';

    if (r.error) {
      vista.append(crear('div', { clase: 'aviso-sistema' }, [crear('p', { texto: r.error })]));
      btnConfirmar.hidden = true;
      btnCancelar.hidden = false;
      importacionPendiente = null;
      return;
    }

    importacionPendiente = r;
    const entran = filasImportables(r.filas);

    const chips = crear('div', { clase: 'imp-resumen' }, [
      crear('span', { clase: 'chip', html: `Se importarán: <b>${entran.length}</b>` }),
      r.resumen.incompleta ? crear('span', { clase: 'chip', html: `Con datos que faltan: <b>${r.resumen.incompleta}</b>` }) : null,
      r.resumen.duplicada ? crear('span', { clase: 'chip', html: `Ya están en el padrón: <b>${r.resumen.duplicada}</b>` }) : null,
      r.resumen.vacia ? crear('span', { clase: 'chip', html: `Filas vacías: <b>${r.resumen.vacia}</b>` }) : null
    ]);
    vista.append(chips);

    if (r.sinReconocer.length) {
      vista.append(crear('p', {
        clase: 'pista',
        texto: 'Columnas que no se reconocieron y se ignoran: ' + r.sinReconocer.join(', ') + '.'
      }));
    }

    const cuerpo = crear('tbody');
    for (const f of r.filas.slice(0, 50)) {
      const a = f.afiliado;
      cuerpo.append(crear('tr', { clase: `imp-fila-${f.estado}` }, [
        crear('td', { clase: 'num', texto: String(f.linea) }),
        crear('td', { texto: f.nombreCompleto || '—' }),
        crear('td', { texto: a.numeroDocumento || '—' }),
        crear('td', { texto: a.grupoEtarioManual ? etiquetaGrupoEtario(a.grupoEtarioManual)
          : (a.fechaNacimiento ? 'por fecha de nacimiento' : '—') }),
        crear('td', { texto: a.tipoAfiliado === 'caso_social' ? 'Ayuda social'
          : a.tipoAfiliado === 'habitual' ? 'Habitual' : '—' }),
        crear('td', { texto: f.avisos.join('; ') || 'lista' })
      ]));
    }
    vista.append(crear('div', { clase: 'tabla-desplazable' }, [
      crear('table', { clase: 'tabla' }, [
        crear('thead', {}, [crear('tr', {},
          ['Fila', 'Nombre', 'Documento', 'Grupo', 'Tipo', 'Estado']
            .map((t) => crear('th', { texto: t })))]),
        cuerpo
      ])
    ]));
    if (r.filas.length > 50) {
      vista.append(crear('p', { clase: 'pista', texto: `… y ${r.filas.length - 50} fila(s) más.` }));
    }

    btnConfirmar.hidden = entran.length === 0;
    btnConfirmar.textContent = `Importar ${entran.length} persona(s)`;
    btnCancelar.hidden = false;
  }

  btnRevisar.addEventListener('click', revisar);
  btnCancelar.addEventListener('click', () => { area.value = ''; limpiar(); });

  btnConfirmar.addEventListener('click', () => {
    if (!importacionPendiente) return;
    const entran = filasImportables(importacionPendiente.filas);
    if (entran.length === 0) return;
    if (!confirm(`Se añadirán ${entran.length} persona(s) al padrón.\n\n` +
      'No se borra ni se modifica a nadie de los que ya están. ¿Continuar?')) return;

    for (const f of entran) estado.padron.afiliados.push(f.afiliado);
    area.value = '';
    limpiar();
    guardarYa();
    ctx.onRepintar();
    if (ctx.estadoTexto) ctx.estadoTexto.textContent = `${entran.length} persona(s) importada(s).`;
  });
}
