// sugerencias.js — funciones puras que PROPONEN. Nunca aplican nada.
// Ver AGENTS.md §2: origen interno, procedencia visible, aceptación explícita,
// reversible. Toda sugerencia viaja con su procedencia o no se muestra.

import { aDdMmAa, normalizarNombre } from './modelo.js';

function propuesta(valor, procedencia) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  return { valor, procedencia };
}

/**
 * Encabezado a partir del último centro guardado por la propia usuaria.
 * Devuelve un objeto {campo: {valor, procedencia}} — la UI lo muestra FUERA
 * de los campos y solo entra si la usuaria lo acepta.
 */
export function sugerenciasEncabezado(config) {
  const ultimo = config && config.ultimoCentro;
  if (!ultimo) return {};
  const proc = ultimo.guardadoEn
    ? `de tu rendición del ${aDdMmAa(ultimo.guardadoEn)}`
    : 'de tu rendición anterior';
  const campos = [
    'tipoCentro', 'nombreCentro', 'codigoPca',
    'nombrePresidenta', 'dniPresidenta', 'celular',
    'nombreTesorera', 'dniTesorera'
  ];
  const out = {};
  for (const c of campos) {
    const p = propuesta(ultimo[c], proc);
    if (p) out[c] = p;
  }
  return out;
}

/**
 * RUC ya usado con un proveedor que la usuaria escribió antes.
 * Solo busca entre sus propias rendiciones. Nunca consulta a nadie.
 */
export function sugerirRucProveedor(rendiciones, nombreProveedor) {
  const buscado = normalizarNombre(nombreProveedor);
  if (!buscado) return null;
  const vistos = [];
  for (const r of rendiciones || []) {
    for (const e of r.egresos || []) {
      if (!e.rucProveedor || !e.proveedorNombre) continue;
      if (normalizarNombre(e.proveedorNombre) !== buscado) continue;
      vistos.push({ ruc: e.rucProveedor, fecha: e.fechaCompra });
    }
  }
  if (vistos.length === 0) return null;
  vistos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const mejor = vistos[0];
  return propuesta(mejor.ruc,
    mejor.fecha ? `de tu compra del ${aDdMmAa(mejor.fecha)}` : 'de una compra anterior');
}

/** Descripciones de compra ya usadas, para elegir sin volver a teclear. */
export function descripcionesUsadas(rendiciones, limite = 30) {
  const conteo = new Map();
  for (const r of rendiciones || []) {
    for (const e of r.egresos || []) {
      const d = String(e.descripcion || '').trim();
      if (!d) continue;
      conteo.set(d, (conteo.get(d) || 0) + 1);
    }
  }
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([texto, veces]) => ({ valor: texto, procedencia: `usada ${veces} vez/veces antes` }));
}

/** Snapshot del encabezado para proponerlo la próxima vez. */
export function instantaneaCentro(rendicion) {
  if (!rendicion) return null;
  return {
    guardadoEn: rendicion.fechaRendicion || '',
    tipoCentro: rendicion.tipoCentro,
    nombreCentro: rendicion.nombreCentro,
    codigoPca: rendicion.codigoPca,
    nombrePresidenta: rendicion.nombrePresidenta,
    dniPresidenta: rendicion.dniPresidenta,
    celular: rendicion.celular,
    nombreTesorera: rendicion.nombreTesorera,
    dniTesorera: rendicion.dniTesorera
  };
}
