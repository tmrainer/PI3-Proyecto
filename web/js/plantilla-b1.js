// plantilla-b1.js — dónde cae cada dato en la hoja oficial del Formato B-1.
//
// ÚNICA fuente de coordenadas (AGENTS.md §8.2): recalibrar es cambiar números
// aquí, nunca tocar CSS. Todo en milímetros desde la esquina superior
// izquierda de una hoja A4 vertical (210 × 297 mm). `y` es el borde de arriba
// de la caja; el texto se apoya abajo, sobre la línea punteada del papel.
//
// ESTIMADO: medido sobre una foto de la hoja en blanco, enderezada a A4 con su
// perspectiva corregida (las 4 esquinas del papel), no sobre la plantilla
// física con regla. Las líneas de la tabla salieron rectas y a ±0,5 mm entre sí,
// pero la escala absoluta depende de las esquinas de la foto.
// DECISIÓN ABIERTA (§12.2): se cierra midiendo la hoja física o un escaneo
// plano a 300 ppp; entonces `estimado` pasa a false.

export const PLANTILLA_B1 = {
  estimado: true,
  hoja: { anchoMm: 210, altoMm: 297 },
  // Tamaño de letra de los datos, en pt.
  letraPt: 9,
  letraTablaPt: 7.5,
  letraFirmasPt: 8, // el espacio junto a «Nombre y apellido» es corto
  campos: {
    // Centro de atención: una X dentro del recuadro que corresponde.
    marcaComedor: { xMm: 129.4, yMm: 45.7, anchoMm: 8.9, altoMm: 6.4, align: 'center' },
    marcaOllaComun: { xMm: 177.6, yMm: 45.4, anchoMm: 14.1, altoMm: 6.6, align: 'center' },
    nombreCentro: { xMm: 65, yMm: 51.3, anchoMm: 72.5, altoMm: 4.5, align: 'left' },
    codigoPca: { xMm: 166, yMm: 51.3, anchoMm: 35, altoMm: 4.5, align: 'left' },
    periodo: { xMm: 44, yMm: 58.5, anchoMm: 67, altoMm: 4.5, align: 'left' },
    fechaRendicion: { xMm: 169, yMm: 58.5, anchoMm: 33, altoMm: 4.5, align: 'left' },
    nombrePresidenta: { xMm: 58.5, yMm: 65.9, anchoMm: 142.5, altoMm: 4.5, align: 'left' },
    dniPresidenta: { xMm: 23, yMm: 72.5, anchoMm: 52, altoMm: 4.5, align: 'left' },
    celular: { xMm: 156.5, yMm: 72.2, anchoMm: 45.5, altoMm: 4.5, align: 'left' },
    // Ingresos: el «S/» ya está impreso.
    montoSubsidio: { xMm: 152.5, yMm: 88.3, anchoMm: 42.5, altoMm: 4.5, align: 'right' },
    fechaAsignacion: { xMm: 149, yMm: 95.5, anchoMm: 46, altoMm: 4.5, align: 'center' },
    // Pie de egresos: los tres totales, en la columna «Monto total».
    totalConSubsidio: { xMm: 171.7, yMm: 189.2, anchoMm: 28.5, altoMm: 3.9, align: 'right' },
    totalAporte: { xMm: 171.7, yMm: 193.1, anchoMm: 28.5, altoMm: 3.9, align: 'right' },
    totalRendicion: { xMm: 171.7, yMm: 197.0, anchoMm: 28.5, altoMm: 3.7, align: 'right' },
    // Firmas: nombre y DNI junto a sus rótulos. La firma y el sello van a mano.
    nombrePresidentaFirma: { xMm: 45, yMm: 248.2, anchoMm: 45, altoMm: 4.2, align: 'left' },
    dniPresidentaFirma: { xMm: 26.5, yMm: 252.2, anchoMm: 45, altoMm: 4.2, align: 'left' },
    nombreTesorera: { xMm: 167.5, yMm: 248.8, anchoMm: 36, altoMm: 4.2, align: 'left' },
    dniTesorera: { xMm: 149, yMm: 252.6, anchoMm: 51, altoMm: 4.2, align: 'left' }
  },
  egresos: {
    primeraFilaYMm: 123.3,
    altoFilaMm: 3.876,
    filas: 17, // FILAS_EGRESOS: contadas en la hoja (antes, provisional)
    columnas: {
      fechaCompra: { xMm: 15.1, anchoMm: 17.4, align: 'center' },
      descripcion: { xMm: 32.5, anchoMm: 40.3, align: 'left' },
      cantidad: { xMm: 72.8, anchoMm: 9.7, align: 'center' },
      unidadMedida: { xMm: 82.5, anchoMm: 16.4, align: 'center' },
      rucProveedor: { xMm: 98.9, anchoMm: 30.3, align: 'center' },
      boleta: { xMm: 129.2, anchoMm: 26.9, align: 'center' },
      precioUnitario: { xMm: 156.1, anchoMm: 15.5, align: 'right' },
      montoTotal: { xMm: 171.6, anchoMm: 29.1, align: 'right' }
    }
  }
};

export const FILAS_EGRESOS = PLANTILLA_B1.egresos.filas;
