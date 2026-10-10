# Arquitectura

Aplicación estática: HTML + módulos ES, sin servidor ni compilación. Todos los
datos viven en el `localStorage` del navegador, en el dispositivo de la usuaria.
Las páginas no se llaman entre sí: **se comunican solo a través de lo guardado**.

Las referencias `archivo:línea` corresponden al estado del código en el momento
de escribir este documento.

---

## a) Modelo de datos

Claves de almacenamiento (`js/modelo.js:4-10`):

| Clave               | Contenido                                       | Constructor                    |
|---------------------|-------------------------------------------------|--------------------------------|
| `b1.padron.v1`      | `{ version: 3, afiliados[], atenciones[] }`     | `padronVacio()` `modelo.js:226` |
| `b1.config.v1`      | precios vigentes del menú, calibración          | `configVacia()` `modelo.js:244` |
| `b1.calendario.v1`  | periodicidad y fechas de entrega                | `calendarioVacio()` `modelo.js:230` |
| `b1.rendiciones.v1` | lista de Formatos B-1                           | `nuevaRendicion()` `modelo.js:151` |
| `b1.insumos.v1`     | reservada para el catálogo de insumos (fase 6); hoy **sin uso** | —                |

Si una clave no se puede leer, `leer()` copia lo ilegible a `<clave>.respaldo` y
arranca vacío (`modelo.js:339-362`).

**Afiliado** (`nuevoAfiliado()`, `modelo.js:174-194`): `id`, `apellidoPaterno`,
`apellidoMaterno`, `nombres`, `tipoDocumento` (`dni`|`ce`), `numeroDocumento`,
`fechaNacimiento` (opcional), `grupoEtarioManual` (solo si no hay fecha de
nacimiento), `sexo`, `tipoAfiliado` (`habitual`|`caso_social`), `activo`,
`altaEn`, `bajaEn`, `origenDato`.

**Atención** = un día de comedor (`nuevaAtencion()`, `modelo.js:213-224`):
`id`, `fecha`, `asistencias`, `precioMenuNormalCent`,
`precioMenuAyudaSocialCent` (copiados de la config al crear el día),
`precioTomadoDeConfig`, `legado`, `nota`.

**Asistencia** = un elemento de `atencion.asistencias`:
`{ afiliadoId, tipoMenu: 'normal' | 'ayuda_social' }` (`modelo.js:217`).

Las **raciones no se guardan**: se cuentan de `asistencias`
(`desgloseDelDia()`, `calculos.js:229-239`). La excepción son los días migrados
desde la v2, que conservan sus cifras escritas a mano en `legado`
(`migrarPadron()`, `modelo.js:265-309`).

La **edad y el grupo etario no se guardan** cuando hay fecha de nacimiento: se
calculan cada vez con `grupoEtario(afiliado, fechaRef)` (`calculos.js:130-136`).

Todo monto es un entero de céntimos (`modelo.js:39`).

---

## b) Quién escribe y quién lee

En memoria, cada página comparte un único objeto `estado`
(`js/estado.js:14-18`), cargado desde `localStorage` por `cargar()`
(`estado.js:20-29`).

### `atencion.asistencias`

**Escriben** (solo `js/ui-asistencia.js`):

| Acción                         | Dónde                         | Operación |
|--------------------------------|-------------------------------|-----------|
| Tocar el nombre de una persona | `filaToque()`, L66-73         | `push({ afiliadoId, tipoMenu })` o `filter()` para quitarla; pone `legado = null` |
| Cambiar su menú ese día        | `filaToque()`, L80-83         | muta `reg.tipoMenu` |
| «Marcar a todos» (días pasados)| `fichaAtencion()`, L173-180   | reemplaza el arreglo entero con `asistenciasConTodos()` (`calculos.js:212-217`), o lo vacía |
| «Marcar a todos» (hoy)         | `pintarAsistenciaDeHoy()`, L429-435 | igual |

**Leen**: todo pasa por `asistenciasDelDia(at)` (`calculos.js:188-190`), que
devuelve `[]` si el campo falta. La usan `asistio()`, `menuDe()`,
`desgloseDelDia()`, `asistenciasConTodos()`, `asistenciaPorAfiliado()` (`calculos.js:199-365`) y
`validarAtencion()` (`validaciones.js:359`).

En el **reporte del padrón**, la lectura es:
`pintarReportePadron()` → `asistenciaPorAfiliado(estado.padron, ctx.inicio, ctx.fin)`
(`ui-reportes.js:16-17`) → `atencionesDelPeriodo()` + `asistenciasDelDia(at)`
(`calculos.js:355-356`). Lo mismo hace `filasComoTexto()` para exportar
(`ui-reportes.js:82-83`).

### `padron.atenciones`

- **Escriben**: `asegurarHoyGuardado()` agrega el día de hoy recién cuando se
  marca a la primera persona (`ui-asistencia.js:290-295`, llamada en L373 y
  L436); el botón «agregar día» (`pagina-asistencia.js:118-120`); la migración
  (`modelo.js:278-307`).
- **Leen**: `atencionesDelPeriodo()` (`calculos.js:171-175`), `pintarOtrosDias()`
  (`ui-asistencia.js:267`), `pintarAsistenciaDeHoy()` (`ui-asistencia.js:306`).

### `padron.afiliados`

- **Escriben**: el alta y la edición (`js/ui-personas.js`), la importación de
  Excel/CSV (`js/importar.js`, `js/ui-importar.js`), la migración.
- **Leen**: `afiliadosActivos()` (`calculos.js:79-87`), que es la puerta de
  entrada de la lista de asistencia, del padrón y del reporte.

### Persistencia

| Quién                     | Qué guarda                                | Dónde |
|---------------------------|-------------------------------------------|-------|
| `guardarPronto()`         | `padron` y `config`, 400 ms después (debounce); marca que hay algo pendiente | `estado.js:37-61` |
| `guardarYa()`             | `padron` y `config`, de inmediato          | `estado.js:72` |
| `vigilarPestanas()`       | lo pendiente, al ocultarse o cerrarse la página | `estado.js:99-114` |
| `pagina-calendario.js`    | `calendario` (no usa `estado.js`)          | L18 |
| `pagina-b1.js`            | `rendiciones`, y de `config` solo `ultimoCentro`: relee lo guardado antes de escribir. También escribe lo pendiente al ocultarse | L30-65 |
| Restaurar un respaldo     | reemplaza claves, descarta lo pendiente (`descartarPendiente()`, `estado.js:80`) y recarga la página | `pagina-asistencia.js:88`, `pagina-padron.js:78`, `pagina-calendario.js:119`, `pagina-b1.js:466` |

**Varias pestañas.** Las páginas que usan `estado.js` (asistencia y padrón)
llaman a `vigilarPestanas()` al arrancar (`pagina-asistencia.js:128`,
`pagina-padron.js:104`). Cuando otra pestaña guarda el padrón, la config o el
calendario, el evento `storage` las recarga y repinta; así no guardan después
su copia vieja encima. El repintado pasa por `repintarConservandoVista()`
(`ui.js:457-487`), que vuelve a abrir las fichas abiertas y devuelve el foco y
el cursor. El B-1 relee la config justo antes de guardarla, y si otra pestaña
guarda la rendición, se recarga entera (`pagina-b1.js:61-65`). Límite: si dos
pestañas cambian algo dentro de los mismos 400 ms, gana la que guardó la otra.
Lo comprueba `herramientas/humo.mjs`.

---

## c) Flujo: de la asistencia al reporte exportado

```
index.html (pagina-asistencia.js)
  pintarAsistenciaDeHoy()            ui-asistencia.js:297
    busca la atención de hoy o crea una nueva sin guardarla   L306-310
    filaToque() por persona activa                            L414
      clic → at.asistencias.push / filter                     L66-73
      alCambiar() → asegurarHoyGuardado()                     L372-373
      ctx.onCambio() → guardarPronto()                        pagina-asistencia.js:27
        ↓ 400 ms (o antes, si la página se oculta)
  guardar('b1.padron.v1', estado.padron)                      estado.js:41
        ↓
  localStorage
        ↓  (otra página, otra carga)
padron.html (pagina-padron.js)
  cargar()                                                    estado.js:20
  refrescar() → pintarReportePadron(caja, ctx)                pagina-padron.js:56
    filasPadron(padron, ctx.fechaRef)       activos + edad + grupo    ui-reportes.js:15
    asistenciaPorAfiliado(padron, ctx.inicio, ctx.fin)  días asistidos  ui-reportes.js:17
    afiliadosSinAsistencia(padron, ctx.inicio, ctx.fin, ctx.fechaRef) ui-reportes.js:70
        ↓
  «Descargar CSV»  → filasComoTexto(ctx, ',')  → descargarTexto()   ui-reportes.js:115-116
  «Copiar»         → filasComoTexto(ctx, '\t') → portapapeles       ui-reportes.js:119-121
```

Dos detalles que conviene saber:

- La asistencia y el reporte usan **dos rangos distintos**: las filas son los
  activos a `ctx.fechaRef`, y los días asistidos se cuentan entre `ctx.inicio`
  y `ctx.fin` (por defecto, el mes en curso: `periodoPorDefecto()`,
  `estado.js:125-128`).
- La lista de «personas sin ninguna asistencia» toma las activas a
  `ctx.fechaRef`, igual que la tabla (`ui-reportes.js:70`): son exactamente las
  filas con 0 días. Fuera del reporte, `afiliadosSinAsistencia()` sigue mirando
  las activas al cierre del periodo si no se le pasa la fecha
  (`calculos.js:374-378`).

---

## d) Fecha de referencia para la edad y el grupo etario

| Pantalla | Fecha usada | Dónde |
|----------|-------------|-------|
| Asistencia (hoy y días pasados) | la fecha del día de atención, `at.fecha`; si falta, `ctx.fechaRef` = hoy | `ui-asistencia.js:26`, `pagina-asistencia.js:25` |
| Padrón: lista de personas | `ctx.fechaRef`, editable en el campo `#fechaRef`; por defecto hoy | `ui-personas.js:256-257`, `pagina-padron.js:30`, L92-94 |
| Padrón: resumen por grupos | `ctx.fechaRef` | `ui-personas.js:360` |
| Padrón: reporte y CSV | `ctx.fechaRef` (no el periodo `inicio`/`fin`) | `ui-reportes.js:15`, L81 → `calculos.js:403-413` |
| Alta de afiliados | hoy (`hoyIso()`), tanto en la pista como en la validación | `ui-personas.js:39`, L73; `validaciones.js:288` |
| Importación | **ninguna**. Con fecha de nacimiento, se guarda la fecha y el grupo se calcula después en cada pantalla. Con solo una columna «edad», el grupo se calcula con `grupoPorEdad(edad)` y se **guarda fijo** en `grupoEtarioManual`: no cambia cuando la persona cumple años. La revisión de la importación lo avisa en esa fila | `importar.js:207-220`, `calculos.js:119-123` |

Si no se pasa una fecha válida, `grupoEtario()`, `afiliadosActivos()` y
`filasPadron()` usan hoy por defecto (`calculos.js:80`, L133, L403).

---

## e) Dependencias entre módulos

Capas, de abajo hacia arriba. Ningún módulo importa a uno de una capa superior.

```
modelo.js        forma de los datos, dinero, fechas, localStorage. Sin imports.
escaneo-dni.js   parser del DNI (stub). Sin imports.
   ↑
calculos.js      funciones puras                         ← modelo
alertas.js       fechas de entrega y avisos              ← modelo
sugerencias.js                                            ← modelo
estado.js        estado en memoria + guardado            ← modelo
ui.js            DOM compartido: buscar, crearElemento   ← modelo
   ↑
validaciones.js                                           ← modelo, calculos
importar.js      lectura de Excel/CSV                    ← modelo, calculos
   ↑
ui-asistencia.js                                          ← modelo, calculos, estado, ui
ui-personas.js                                            ← modelo, calculos, validaciones, estado, ui
ui-reportes.js                                            ← modelo, calculos, estado, ui
ui-importar.js                                            ← calculos, importar, estado, ui
ui-escaneo.js    aviso del lector de DNI                 ← escaneo-dni, ui
   ↑
pagina-asistencia.js  (index.html)       ← modelo, calculos, validaciones, alertas, estado, ui-asistencia, ui
pagina-padron.js      (padron.html)      ← modelo, validaciones, alertas, estado, ui-personas,
                                           ui-importar, ui-reportes, ui-escaneo, ui
pagina-b1.js          (formato-b1.html)  ← modelo, calculos, validaciones, sugerencias, alertas, ui
pagina-calendario.js  (calendario.html)  ← modelo, alertas, validaciones, ui
casos-prueba.js       (pruebas.html)     ← modelo, calculos, validaciones, alertas, importar,
                                           escaneo-dni, sugerencias
```

`pagina-b1.js` y `pagina-calendario.js` no usan `estado.js`: leen y guardan sus
claves directamente.

`herramientas/humo.mjs` no es parte de la app: es la prueba de humo que abre
las páginas en un Chromium sin ventana (ver README, «Pruebas»).

---

## f) Pendiente / no implementado

- **Lector del código de barras PDF417 del DNI.** `js/escaneo-dni.js` es un stub
  deliberado (L4): devuelve todo vacío y la interfaz cae al ingreso manual. Falta
  conocer el formato real del código.
- **`b1.insumos.v1`**: reservada en `CLAVES` para el catálogo de insumos de la
  fase 6; nada la lee ni la escribe todavía.
- **Histórico de precios de compra por insumo**: no existe.
- **Pantalla de consumo por origen de fondo**: el dato se captura
  (`egreso.origenFondo`) y `gastoPorOrigen()` existe (`calculos.js:55`), pero no
  hay pantalla.
- **Vista previa de impresión e impresión sobre la plantilla oficial del B-1.**
- **Columnas del formato municipal de padrón**: el reporte usa columnas propias
  hasta conseguir el formato oficial.
- **Quien come sin estar inscrito** no tiene dónde anotarse, y por eso suma cero
  raciones.
- **Fórmula de «gastos con el subsidio»** sin verificar (`calculos.js:17-28`).
