// ui-importar.js — cargar un padrón pegado desde Excel o desde un CSV.
// Nada se guarda hasta que la usuaria ve qué filas entran y confirma (§6.9).

import { cuantos, hoyIso } from './modelo.js';
import { etiquetaGrupoEtario, grupoEtario } from './calculos.js';
import { prepararImportacion, filasImportables } from './importar.js';
import { leerXlsx, pareceXlsx } from './xlsx.js';
import { estado, guardarYa } from './estado.js';
import { buscar, crearElemento, chip } from './ui.js';

// ctx: { estadoTexto, onRepintar() }

// -------------------------------------------- importar un padrón desde archivo
//
// Nada se guarda hasta que la usuaria ve exactamente qué filas entran y cuáles
// no, y confirma. Ver AGENTS.md §6.9.

let importacionPendiente = null;

const ESTADO_FILA = {
  lista: 'Se agrega',
  incompleta: 'Se agrega, le faltan datos',
  duplicada: 'No se agrega: ya está'
};

export function montarImportacion(ctx) {
  const area = buscar('#pegarPadron');
  const archivo = buscar('#archivoPadron');
  const vista = buscar('#vista-importacion');
  const btnRevisar = buscar('#revisar-importacion');
  const btnConfirmar = buscar('#confirmar-importacion');
  const btnCancelar = buscar('#cancelar-importacion');

  archivo.addEventListener('change', async () => {
    const f = archivo.files && archivo.files[0];
    if (!f) return;
    const avisar = (texto) => {
      vista.textContent = '';
      vista.append(crearElemento('p', { clase: 'aviso-sistema', texto }));
    };
    try {
      const datos = await f.arrayBuffer();
      if (pareceXlsx(datos)) {
        area.value = await leerXlsx(datos);
      } else if (/\.xls$/i.test(f.name)) {
        avisar('Ese es un Excel antiguo (.xls). Ábrelo en Excel y guárdalo como .xlsx.');
        archivo.value = '';
        return;
      } else {
        area.value = new TextDecoder().decode(datos);
      }
      revisar();
    } catch (e) {
      avisar('No se pudo leer el archivo. Prueba abriéndolo y copiando las filas aquí.');
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
      vista.append(crearElemento('div', { clase: 'aviso-sistema' }, [crearElemento('p', { texto: r.error })]));
      btnConfirmar.hidden = true;
      btnCancelar.hidden = false;
      importacionPendiente = null;
      return;
    }

    importacionPendiente = r;
    const entran = filasImportables(r.filas);

    const chips = crearElemento('div', { clase: 'imp-resumen' }, [
      chip(`Se agregarán`, `${entran.length}`),
      r.resumen.incompleta ? chip(`Con datos que faltan`, `${r.resumen.incompleta}`) : null,
      r.resumen.duplicada ? chip(`Ya están en el padrón`, `${r.resumen.duplicada}`) : null,
      r.resumen.conCero ? chip(`DNI con el 0 agregado`, `${r.resumen.conCero}`) : null,
      r.resumen.vacia ? chip(`Filas vacías`, `${r.resumen.vacia}`) : null
    ]);
    vista.append(chips);


    if (r.sinReconocer.length) {
      vista.append(crearElemento('p', {
        clase: 'pista',
        texto: 'Columnas que no se reconocieron y se ignoran: ' + r.sinReconocer.join(', ') + '.'
      }));
    }

    // Una tarjeta por persona, no una tabla de seis columnas: en el celular la
    // tabla obligaba a deslizar de lado y cortaba justo la columna «Estado».
    // Las filas vacías (títulos, totales al pie) no se listan: ya las cuenta
    // el resumen de arriba.
    const lista = crearElemento('ul', { clase: 'imp-lista' });
    const visibles = r.filas.filter((f) => f.estado !== 'vacia');
    for (const f of visibles.slice(0, 50)) {
      const a = f.afiliado;
      const g = a.grupoEtarioManual || grupoEtario(a, hoyIso());
      const datos = [
        a.numeroDocumento ? `${a.tipoDocumento === 'ce' ? 'CE' : 'DNI'} ${a.numeroDocumento}` : 'sin documento',
        g ? etiquetaGrupoEtario(g) : 'sin grupo de edad',
        a.tipoAfiliado === 'caso_social' ? 'Ayuda social' : a.tipoAfiliado === 'habitual' ? 'Habitual' : 'sin tipo'
      ];
      lista.append(crearElemento('li', { clase: `imp-item imp-${f.estado}` }, [
        crearElemento('div', { clase: 'imp-cabeza' }, [
          crearElemento('span', { clase: 'imp-nombre', texto: f.nombreCompleto || '—' }),
          crearElemento('span', { clase: 'imp-estado', texto: ESTADO_FILA[f.estado] })
        ]),
        crearElemento('div', { clase: 'imp-datos', texto: `Fila ${f.linea} · ${datos.join(' · ')}` }),
        f.avisos.length ? crearElemento('div', { clase: 'imp-avisos', texto: f.avisos.join('; ') }) : null
      ]));
    }
    vista.append(lista);
    if (visibles.length > 50) {
      vista.append(crearElemento('p', { clase: 'pista', texto: `… y ${cuantos(visibles.length - 50, 'persona')} más.` }));
    }

    btnConfirmar.hidden = entran.length === 0;
    btnConfirmar.textContent = `Agregar ${cuantos(entran.length, 'persona')}`;
    btnCancelar.hidden = false;
  }

  btnRevisar.addEventListener('click', revisar);
  btnCancelar.addEventListener('click', () => { area.value = ''; limpiar(); });

  btnConfirmar.addEventListener('click', () => {
    if (!importacionPendiente) return;
    const entran = filasImportables(importacionPendiente.filas);
    if (entran.length === 0) return;
    if (!confirm(`Se agregarán ${cuantos(entran.length, 'persona')} al padrón.\n\n` +
      'No se borra ni se modifica a nadie de los que ya están. ¿Continuar?')) return;

    for (const f of entran) estado.padron.afiliados.push(f.afiliado);
    area.value = '';
    limpiar();
    guardarYa();
    ctx.onRepintar();
    if (ctx.estadoTexto) ctx.estadoTexto.textContent = entran.length === 1 ? '1 persona agregada.' : `${entran.length} personas agregadas.`;
  });
}
