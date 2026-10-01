// importar.js — lectura de un padrón pegado desde Excel o de un CSV.
// Funciones PURAS: sin DOM, sin estado, sin red. Ver AGENTS.md §6.9.
//
// Interpreta lo que la usuaria pega, pero NO completa lo que falte: cada fila
// sale con sus avisos y es ella quien confirma la importación.

import { normalizarNombre, esIso, hoyIso, uuid, nuevoAfiliado } from './modelo.js';
import { TRAMOS_ETARIOS } from './calculos.js';

// --------------------------------------------------------------- lectura CSV

/** Detecta el separador mirando la primera línea fuera de comillas. */
export function detectarSeparador(texto) {
  const linea = String(texto || '').split(/\r?\n/)[0] || '';
  let dentro = false;
  const cuenta = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of linea) {
    if (ch === '"') dentro = !dentro;
    else if (!dentro && ch in cuenta) cuenta[ch] += 1;
  }
  const mejor = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return mejor[1] > 0 ? mejor[0] : '\t';
}

/** CSV/TSV a matriz de celdas. Admite comillas, separadores y saltos dentro. */
export function parsearTabla(texto, separador) {
  const sep = separador || detectarSeparador(texto);
  const filas = [];
  let fila = [];
  let celda = '';
  let dentro = false;
  const s = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (dentro) {
      if (ch === '"') {
        if (s[i + 1] === '"') { celda += '"'; i += 1; } else dentro = false;
      } else celda += ch;
      continue;
    }
    if (ch === '"') { dentro = true; continue; }
    if (ch === sep) { fila.push(celda); celda = ''; continue; }
    if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; continue; }
    celda += ch;
  }
  fila.push(celda);
  filas.push(fila);

  return filas
    .map((f) => f.map((c) => c.trim()))
    .filter((f) => f.some((c) => c !== ''));
}

// ------------------------------------------------- reconocimiento de columnas

const SINONIMOS = {
  apellidoPaterno: ['apellido paterno', 'ap paterno', 'ap. paterno', 'apaterno',
    'paterno', 'primer apellido'],
  apellidoMaterno: ['apellido materno', 'ap materno', 'ap. materno', 'amaterno',
    'materno', 'segundo apellido'],
  nombres: ['nombres', 'nombre', 'nombre(s)'],
  apellidos: ['apellidos', 'apellido'],
  numeroDocumento: ['numero de documento', 'numero documento', 'n documento',
    'nro documento', 'nro de documento', 'documento', 'dni', 'dni/ce', 'doc', 'numero'],
  tipoDocumento: ['tipo de documento', 'tipo documento', 'tipo doc'],
  fechaNacimiento: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento',
    'fec nac', 'fecha nac', 'f nacimiento'],
  grupoEtario: ['grupo de edad', 'grupo etario', 'grupo', 'etapa de vida', 'etapa'],
  edad: ['edad', 'anos', 'años'],
  tipoAfiliado: ['tipo', 'tipo de afiliada', 'tipo de afiliado', 'condicion',
    'categoria', 'ayuda social'],
  sexo: ['sexo', 'genero']
};

function norm(t) {
  return normalizarNombre(t).replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}

/** Asocia cada columna del archivo a un campo del padrón. Lo que no reconoce, lo ignora. */
export function detectarColumnas(cabecera) {
  const mapa = {};
  const sinReconocer = [];
  (cabecera || []).forEach((titulo, i) => {
    const t = norm(titulo);
    if (!t) return;
    let encontrado = null;
    for (const [campo, nombres] of Object.entries(SINONIMOS)) {
      if (nombres.includes(t)) { encontrado = campo; break; }
    }
    if (!encontrado) {
      for (const [campo, nombres] of Object.entries(SINONIMOS)) {
        if (nombres.some((n) => t.startsWith(n))) { encontrado = campo; break; }
      }
    }
    if (encontrado && !(encontrado in mapa)) mapa[encontrado] = i;
    else if (!encontrado) sinReconocer.push(titulo);
  });
  return { mapa, sinReconocer };
}

export function pareceCabecera(fila) {
  return Object.keys(detectarColumnas(fila).mapa).length >= 2;
}

// ------------------------------------------------- interpretación de valores

export function parsearFechaFlexible(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  if (esIso(t)) return t;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return '';
  const [, d, mes, a] = m;
  const anio = a.length === 2 ? (Number(a) > 40 ? '19' + a : '20' + a) : a;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parsearGrupoEtario(texto) {
  const t = norm(texto);
  if (!t) return null;
  if (/^(nino|nina|ninos|menor|infante)/.test(t)) return 'nino';
  if (/^adolescente/.test(t)) return 'adolescente';
  if (/^adulto mayor|^tercera edad|^anciano/.test(t)) return 'adulto_mayor';
  if (/^adulto|^joven/.test(t)) return 'adulto';
  return null;
}

export function grupoPorEdad(edad) {
  if (!Number.isFinite(edad) || edad < 0) return null;
  const tramo = TRAMOS_ETARIOS.find((x) => edad >= x.min && edad <= x.max);
  return tramo ? tramo.clave : null;
}

export function parsearTipoAfiliado(texto) {
  const t = norm(texto);
  if (!t) return '';
  if (/ayuda social|caso social|^social|vulnerable|^si$|^x$/.test(t)) return 'caso_social';
  if (/habitual|regular|normal|comun|^no$/.test(t)) return 'habitual';
  return '';
}

export function parsearTipoDocumento(texto) {
  const t = norm(texto);
  if (/^ce|extranjeria|carne/.test(t)) return 'ce';
  return 'dni';
}

function partirApellidos(texto) {
  const partes = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { paterno: '', materno: '' };
  if (partes.length === 1) return { paterno: partes[0], materno: '' };
  return { paterno: partes[0], materno: partes.slice(1).join(' ') };
}

// ------------------------------------------------------ preparar importación

/**
 * Lee el texto pegado y devuelve, por fila, la persona que se crearía y qué le
 * falta. NO modifica el padrón ni completa ningún dato: la usuaria confirma.
 *
 * estado: 'lista'      — se puede importar
 *         'incompleta' — se importa, pero quedará señalada en el padrón
 *         'duplicada'  — ya existe ese documento activo; no se importa
 *         'vacia'      — sin nombre utilizable; no se importa
 */
export function prepararImportacion(texto, padron) {
  const tabla = parsearTabla(texto);
  if (tabla.length === 0) {
    return { columnas: {}, sinReconocer: [], filas: [], error: 'No se encontró ninguna fila.' };
  }

  const hayCabecera = pareceCabecera(tabla[0]);
  if (!hayCabecera) {
    return {
      columnas: {}, sinReconocer: [], filas: [],
      error: 'No se reconoció la primera fila como encabezado. Debe traer títulos ' +
        'como «Apellido paterno», «Nombres», «DNI», «Grupo de edad», «Tipo».'
    };
  }

  const { mapa, sinReconocer } = detectarColumnas(tabla[0]);
  const cuerpo = tabla.slice(1);
  const docsExistentes = new Set(
    ((padron && padron.afiliados) || []).filter((a) => a.activo && a.numeroDocumento)
      .map((a) => a.numeroDocumento));
  const nombresExistentes = new Set(
    ((padron && padron.afiliados) || []).filter((a) => a.activo)
      .map((a) => normalizarNombre(
        `${a.apellidoPaterno} ${a.apellidoMaterno} ${a.nombres}`)));
  const docsEnElArchivo = new Set();

  const filas = cuerpo.map((celdas, i) => {
    const val = (campo) => (mapa[campo] === undefined ? '' : (celdas[mapa[campo]] || '').trim());
    const avisos = [];
    const a = nuevoAfiliado();
    a.id = uuid();
    a.origenDato = 'importado';
    a.altaEn = hoyIso();

    a.apellidoPaterno = val('apellidoPaterno');
    a.apellidoMaterno = val('apellidoMaterno');
    if (!a.apellidoPaterno && val('apellidos')) {
      const p = partirApellidos(val('apellidos'));
      a.apellidoPaterno = p.paterno;
      a.apellidoMaterno = p.materno;
    }
    a.nombres = val('nombres');

    a.numeroDocumento = val('numeroDocumento').replace(/\s/g, '');
    a.tipoDocumento = mapa.tipoDocumento === undefined ? 'dni' : parsearTipoDocumento(val('tipoDocumento'));

    const fnac = parsearFechaFlexible(val('fechaNacimiento'));
    if (val('fechaNacimiento') && !fnac) avisos.push('no se entendió la fecha de nacimiento');
    a.fechaNacimiento = fnac;

    let grupo = parsearGrupoEtario(val('grupoEtario'));
    if (!grupo && val('edad')) {
      const edad = Number(String(val('edad')).replace(/\D/g, ''));
      grupo = grupoPorEdad(edad);
      if (!grupo) avisos.push('no se entendió la edad');
    }
    if (!fnac) a.grupoEtarioManual = grupo;

    a.tipoAfiliado = parsearTipoAfiliado(val('tipoAfiliado'));
    const sexo = norm(val('sexo'));
    a.sexo = sexo.startsWith('f') ? 'F' : sexo.startsWith('m') ? 'M' : '';

    const nombreCompleto = `${a.apellidoPaterno} ${a.apellidoMaterno} ${a.nombres}`.trim();
    let estado = 'lista';

    if (!a.apellidoPaterno && !a.nombres) {
      estado = 'vacia';
      avisos.push('la fila no trae ni apellido ni nombre');
    } else if (a.numeroDocumento && docsExistentes.has(a.numeroDocumento)) {
      estado = 'duplicada';
      avisos.push('ese documento ya está en el padrón');
    } else if (a.numeroDocumento && docsEnElArchivo.has(a.numeroDocumento)) {
      estado = 'duplicada';
      avisos.push('ese documento se repite dentro del propio archivo');
    } else {
      if (a.numeroDocumento) docsEnElArchivo.add(a.numeroDocumento);
      const falta = [];
      if (!a.numeroDocumento) falta.push('documento');
      if (!fnac && !a.grupoEtarioManual) falta.push('grupo de edad');
      if (!a.tipoAfiliado) falta.push('tipo');
      if (falta.length) {
        estado = 'incompleta';
        avisos.push('falta ' + falta.join(', '));
      }
      if (nombresExistentes.has(normalizarNombre(nombreCompleto))) {
        avisos.push('ya hay alguien con ese mismo nombre');
      }
    }

    return { linea: i + 2, afiliado: a, nombreCompleto, estado, avisos };
  });

  const resumen = { lista: 0, incompleta: 0, duplicada: 0, vacia: 0 };
  for (const f of filas) resumen[f.estado] += 1;

  return { columnas: mapa, sinReconocer, filas, resumen, error: null };
}

/** Las filas que realmente se darían de alta. Las duplicadas y vacías quedan fuera. */
export function filasImportables(filas) {
  return (filas || []).filter((f) => f.estado === 'lista' || f.estado === 'incompleta');
}
