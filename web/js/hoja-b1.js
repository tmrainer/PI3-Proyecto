// hoja-b1.js — qué texto va en cada lugar de la hoja oficial del B-1.
//
// Puro: recibe una rendición y devuelve los textos ya escritos como en el
// papel (fechas DD-MM-AA, soles con dos decimales, «varios»). No sabe de
// posiciones: eso está en plantilla-b1.js. No inventa nada: lo que falta en la
// rendición queda vacío en la hoja (AGENTS.md §2 y §8.1).
//
// Si hay más compras que renglones, van en una segunda hoja (o más), con el
// encabezado repetido y los tres totales solo en la última (§12.1).

import { aDdMmAa, formatearSoles } from './modelo.js';
import { totales } from './calculos.js';
import { FILAS_EGRESOS } from './plantilla-b1.js';

const soles = (c) => (Number.isFinite(c) ? formatearSoles(c) : '');
const texto = (v) => String(v ?? '').trim();

/** Una compra como renglón de la tabla. */
export function filaDeEgreso(e) {
  const serie = texto(e.boletaSerie);
  const numero = texto(e.boletaCorrelativo);
  return {
    fechaCompra: aDdMmAa(e.fechaCompra),
    descripcion: texto(e.descripcion),
    cantidad: e.cantidadVarios ? 'varios' : (Number.isFinite(e.cantidad) ? String(e.cantidad) : ''),
    unidadMedida: texto(e.unidadMedida),
    rucProveedor: texto(e.rucProveedor),
    boleta: serie && numero ? `${serie}-${numero}` : serie || numero,
    precioUnitario: e.precioUnitarioVarios ? 'varios' : soles(e.precioUnitarioCent),
    montoTotal: soles(e.montoTotalCent)
  };
}

const filaVacia = (f) => Object.values(f).every((v) => v === '');

/**
 * @param {object} r  una rendición (modelo.js: nuevaRendicion)
 * @returns {{campos: Object<string, string>, filas: object[]}[]}  una entrada por hoja
 */
export function hojasDelB1(r) {
  const rendicion = r || {};
  const filas = (rendicion.egresos || []).map(filaDeEgreso).filter((f) => !filaVacia(f));
  const encabezado = {
    marcaComedor: rendicion.tipoCentro === 'comedor' ? 'X' : '',
    marcaOllaComun: rendicion.tipoCentro === 'olla_comun' ? 'X' : '',
    nombreCentro: texto(rendicion.nombreCentro),
    codigoPca: texto(rendicion.codigoPca),
    periodo: texto(rendicion.periodo && rendicion.periodo.etiqueta),
    fechaRendicion: aDdMmAa(rendicion.fechaRendicion),
    nombrePresidenta: texto(rendicion.nombrePresidenta),
    dniPresidenta: texto(rendicion.dniPresidenta),
    celular: texto(rendicion.celular),
    montoSubsidio: soles(rendicion.montoSubsidioCent),
    fechaAsignacion: aDdMmAa(rendicion.fechaAsignacion),
    nombrePresidentaFirma: texto(rendicion.nombrePresidentaFirma),
    dniPresidentaFirma: texto(rendicion.dniPresidentaFirma),
    nombreTesorera: texto(rendicion.nombreTesorera),
    dniTesorera: texto(rendicion.dniTesorera)
  };
  const t = totales(rendicion);
  const pie = {
    totalConSubsidio: soles(t.conSubsidio),
    // «Registrar de corresponder»: si es cero, el renglón va vacío (§6.1).
    totalAporte: t.aporte ? soles(t.aporte) : '',
    totalRendicion: soles(t.total)
  };
  const cuantas = Math.max(1, Math.ceil(filas.length / FILAS_EGRESOS));
  return Array.from({ length: cuantas }, (_, i) => ({
    campos: { ...encabezado, ...(i === cuantas - 1 ? pie : {}) },
    filas: filas.slice(i * FILAS_EGRESOS, (i + 1) * FILAS_EGRESOS)
  }));
}
