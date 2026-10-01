# AGENTS.md — Asistente de rendición B-1 y padrón (Ollas Comunes / Comedores, VMT)

Especificación permanente del proyecto. Este archivo es la fuente de verdad para
cualquier agente o persona que escriba código en este repositorio. Si una
instrucción de un prompt contradice este archivo, se detiene y se pregunta antes
de codificar.

---

## 1. Qué es el proyecto

Una aplicación web estática que asiste a las dirigentes de ollas comunes y
comedores en la gestión administrativa que les exige el Programa de
Complementación Alimentaria (PCA) de la Municipalidad Distrital de Villa María
del Triunfo.

Dos núcleos:

1. El **Formato B-1** ("Balance de Centros de Atención Subsidiados"): la app
   ayuda a llenarlo y lo valida. Más adelante imprimirá los datos sobre la
   plantilla oficial de papel.
2. El **padrón de personas afiliadas** al comedor u olla común: quiénes son, en
   qué grupo etario caen, y cuántas raciones se sirven. Es la base para verificar
   las raciones y para los trámites que piden padrón actualizado.

Alrededor de esos dos núcleos crecen tres módulos que el informe del proyecto
identifica como necesarios: histórico de precios, alertas de fecha de entrega, y
consumo de insumos por origen de fondo.

### Contexto (del informe del proyecto — Desafío 2, UNACEM)

- Las dirigentes de las ollas comunes asumen el rol administrativo de forma
  voluntaria, sin personal especializado.
- El formato se entrega en papel a la Subgerencia de Programas Sociales. Los
  documentos originales quedan en custodia de la Municipalidad.
- El problema real es **entregas tardías, incompletas o con observaciones**:
  errores al llenar, desconocimiento del procedimiento, retrasos. Una entrega
  observada o invalidada retrasa el acceso a los recursos y afecta la continuidad
  de la atención a las familias beneficiarias.
- El *customer journey* identifica seis etapas con fricción: Requisitos →
  Recopilación → Llenado → Presentación → Correcciones → Seguimiento. La app
  ataca **Recopilación, Llenado, Correcciones y Seguimiento**.
- El informe señala explícitamente la "carga de datos eficiente (poder pasar
  padrones completos a la herramienta)" como necesidad. De ahí la prioridad del
  padrón y del futuro escaneo de DNI (§4.3, §7).
- El formato impreso **no admite borrones ni enmendaduras** (Nota 2 del formato).
  De ahí el valor central: llenar en pantalla, corregir cuantas veces haga falta.
- El documento tiene **carácter de Declaración Jurada** (Art. 06 de la Ley 25035).
  El fraude o falsedad da inicio a acciones penales.

### Usuaria objetivo

Dirigente de olla común o comedor. Puede tener poca familiaridad con software,
usar principalmente celular, y trabajar con conexión intermitente. La interfaz va
en español peruano, con el mismo vocabulario del formato en papel (no se
renombran los campos a términos "más claros": la usuaria coteja pantalla contra
papel).

### Fases

| Fase | Módulo | Estado |
|---|---|---|
| 1 | Formato B-1: llenado y validación de datos | **hecha** |
| 2 | Padrón, raciones con precio de menú y asistencia nominal | **hecha** |
| 3 | Calendario de entregas y cuenta regresiva | **hecha** |
| 4 | Vista previa de superposición en pantalla (coordenadas estimadas) | siguiente |
| 5 | Impresión real sobre la plantilla oficial | **bloqueada** — falta la plantilla física (§12.2) |
| 6 | Insumos e histórico de precios de compra | planificado |
| 7 | Consumo de insumos por origen de fondo | planificado |

Las fases 1, 2 y 3 están construidas y verificadas en navegador. La fase 4 existe
porque **no hay plantilla física**: permite ver y corregir la disposición de los
datos en pantalla sin gastar hojas ni esperar a tenerla. La fase 5 solo cambia
números en un archivo de coordenadas (§8.2); todo lo demás ya estará hecho.

**Preparado para el futuro, no implementado ahora:** la inscripción al padrón se
hará escaneando el código de barras del DNI. Eso no se construye en esta fase,
pero el modelo de datos y la arquitectura del padrón deben admitirlo sin
rehacerse (§7).

---

## 2. Principio rector: la app calcula, sugiere y valida; nunca rellena sola ni estima

**Este es el principio no negociable del proyecto.** El documento es una
declaración jurada firmada por la presidenta y la tesorera; cualquier dato que la
app invente es una falsedad con consecuencias legales para ellas.

### Dónde sí se estima y dónde no — distinción crítica

En este proyecto la palabra "estimar" aparece en dos contextos que no tienen nada
que ver, y confundirlos rompería el producto:

| Se estima | No se estima jamás |
|---|---|
| **Coordenadas de impresión** (dónde cae un dato en el papel). Es geometría, se corrige mirando una hoja, y no afecta la veracidad de ningún dato. | **Datos de la rendición y del padrón**: montos, cantidades, precios, fechas, RUC, DNI, nombres, raciones. |

Estimar una coordenada en milímetros es trabajo de maquetación. Estimar un monto
es falsificar una declaración jurada. La fase 4 estima lo primero. Nada en este
proyecto estima lo segundo.

### Qué significa "asistente de autocompletado" aquí

El producto se describe como un asistente de autocompletado, y eso es compatible
con el principio **bajo una definición estricta**:

> Autocompletar = proponer, a partir de datos que la propia usuaria ingresó
> antes en este mismo dispositivo, o que transcribió de un documento que tiene
> delante, un valor que ella acepta con un gesto explícito.

De ahí se derivan cuatro reglas que todo código de sugerencia debe cumplir:

1. **Origen interno o documental.** Una sugerencia solo puede venir de datos que
   la usuaria guardó antes, o de un documento físico leído en ese momento (§7).
   Nunca de un servicio externo, un promedio de mercado, un valor "típico" o una
   constante puesta por el programador.
2. **Procedencia visible.** Toda sugerencia dice de dónde sale: *"última compra:
   S/ 6.50 el 12-09-26, Mercado Nuevo Progreso"*, *"leído del DNI"*. Un dato sin
   procedencia no se muestra.
3. **Aceptación explícita.** La sugerencia aparece **fuera** del campo (no como
   texto gris dentro, no preseleccionada, no aplicada al perder el foco). Entra al
   campo solo si la usuaria la toca o la elige. Un formulario recién abierto tiene
   sus campos vacíos.
4. **Reversible y distinguible.** Un valor que vino de una sugerencia o de un
   escaneo se marca como tal hasta que la usuaria lo confirma o lo edita, y se
   puede deshacer.

### La app **nunca** puede

- Inventar, deducir o "completar razonablemente" un dato faltante.
- Estimar un precio, una cantidad, un monto, una fecha, una ración o un nombre.
- Rellenar un RUC, un número de boleta, un DNI o un celular a partir de nada.
- Corregir silenciosamente un dato que la usuaria escribió. Se avisa; decide ella.
- Sustituir un valor ingresado por uno calculado sin decirlo de forma visible.
- Enviar nada a ningún servidor, ni consultar servicios externos (SUNAT, RENIEC,
  padrones MIDIS, precios de mercado) para "verificar" o "traer" datos.
- Dar por bueno un dato leído por escáner sin que una persona lo confirme.

Regla operativa para el código: **si un campo está vacío, se muestra e imprime
vacío.** Un espacio en blanco es un campo que la usuaria debe llenar; un campo
inventado es un delito.

Excepciones explícitas, todas acotadas y verificables:

1. **Los tres totales del pie del formato** (§6.1) — aritmética sobre lo ingresado.
2. **El grupo etario derivado de una fecha de nacimiento** (§6.3) — aritmética
   sobre una fecha que la propia persona dio.
3. **Las raciones de un día, contadas de la asistencia marcada** (§6.5) — contar
   casillas, no estimar.
4. **El precio del menú copiado desde la configuración a un día nuevo** (§6.5).
   Esta es la única que escribe un valor en un campo, y solo se sostiene con tres
   condiciones, que el código debe cumplir: el valor **lo fijó la usuaria** en la
   configuración; la copia queda **marcada** (`precioTomadoDeConfig`) y la
   interfaz dice de dónde vino; y es **editable** en ese día sin tocar la
   configuración. No es una estimación: es su propia instrucción permanente
   aplicada a un registro nuevo. Si alguna de las tres condiciones se cae, la
   excepción deja de valer.

---

## 3. Stack y restricciones técnicas

- **HTML, CSS y JavaScript puros.** Nada más.
- **Cero dependencias.** Sin npm, sin `package.json`, sin bundler, sin
  transpilador, sin framework, sin librería de utilidades, sin CDN, sin fuentes
  remotas, sin analítica, sin Service Worker de terceros. **Esto incluye las
  librerías de decodificación de códigos de barras** (§7.2).
- **Sin backend.** Ninguna llamada de red en tiempo de ejecución: ni `fetch`, ni
  `XMLHttpRequest`, ni `WebSocket`, ni `sendBeacon`, ni `<img>` a dominios
  externos. La app debe funcionar completa con el cable desconectado.
- **Persistencia: `localStorage`.** Único mecanismo de almacenamiento. Todo lo que
  se guarda vive en el navegador de la usuaria.
- **Despliegue: GitHub Pages.** Sitio estático servido desde el repositorio.
  - Todas las rutas son **relativas** (`./estilos.css`, no `/estilos.css`), porque
    el sitio se sirve bajo un subdirectorio `usuario.github.io/repo/`.
  - No hay paso de build. Lo que está en el repositorio es lo que se publica.
  - GitHub Pages sirve por HTTPS, lo cual es requisito para el acceso a cámara del
    escaneo futuro (§7.2).
- **JavaScript moderno del navegador** (ES2020+, módulos ES nativos vía
  `<script type="module">`). Sin polyfills. Objetivo: navegadores actualizados de
  escritorio y móvil.
- **APIs nativas del navegador sí, librerías no.** `BarcodeDetector`,
  `getUserMedia`, `Intl`, `crypto.randomUUID` son parte del navegador y no violan
  "cero dependencias". Siempre con detección de soporte y degradación limpia.
- **Sin tooling de test que requiera instalación.** Las pruebas son una página
  HTML que corre aserciones en el navegador y muestra resultados en pantalla.
- Archivos con nombres en español, sin espacios, en minúsculas y con guiones.
- El código y los comentarios en español.

### Estructura esperada del repositorio

```
index.html              formulario B-1                              (fase 1)
padron.html             padrón, raciones y asistencia               (fase 2)
calendario.html         entregas y cuenta regresiva                 (fase 3)
vista-previa.html       superposición en pantalla                   (fase 4)
calibrar.html           calibración de impresión                    (fase 5)
insumos.html            catálogo e histórico de precios             (fase 6)
pruebas.html            aserciones en navegador

estilos.css             estilos de pantalla
superposicion.css       capa de datos posicionada en mm        (fases 4 y 5)

js/modelo.js            forma de los datos, dinero, fechas, localStorage, migraciones
js/calculos.js          totales, grupo etario, raciones, asistencia  (puro)
js/validaciones.js      reglas de validación                        (puro)
js/alertas.js           fechas de entrega y cuenta regresiva        (puro)
js/sugerencias.js       propuestas desde datos propios              (puro)
js/escaneo-dni.js       parser de la cadena del código de barras    (puro)
js/casos-prueba.js      aserciones, compartidas por pruebas.html    (puro)
js/plantilla-b1.js      mapa de coordenadas en mm                   (fase 4)

js/ui.js                ayudas de DOM compartidas
js/pagina-b1.js         controlador de index.html
js/pagina-padron.js     controlador de padron.html
js/pagina-calendario.js controlador de calendario.html

AGENTS.md               este archivo
```

Los módulos marcados **(puro)** no tocan el DOM, no guardan estado y no hacen red:
reciben datos y devuelven números, hallazgos o propuestas. Eso es lo que permite
probarlos sin navegador, y es además una defensa del principio rector: una
función que no tiene DOM **no puede escribir sola en un campo**, aunque quisiera.


`calculos.js`, `validaciones.js`, `sugerencias.js`, `escaneo-dni.js` y
`alertas.js` deben ser **funciones puras sin DOM**: reciben datos, devuelven
números, listas de hallazgos o listas de propuestas. Esto es lo que hace posible
probarlas, y lo que impide que una sugerencia o un escaneo escriban solos en un
campo: no tienen con qué.

---

## 4. Modelo de datos

Los montos se guardan en **céntimos, como enteros** (`20000` = S/ 200.00) para
evitar errores de punto flotante; la conversión a soles ocurre solo al mostrar.
Las fechas se guardan en **ISO `AAAA-MM-DD`** y se muestran en **`DD-MM-AA`**,
como en el papel.

`localStorage` guarda cinco claves independientes, cada una con su versión:

```
b1.rendiciones.v1
b1.padron.v1
b1.insumos.v1
b1.calendario.v1
b1.config.v1
```

**El nombre de la clave no cambia nunca.** El sufijo `.v1` identifica el
contenedor, no el esquema: la versión del esquema vive **dentro**, en el campo
`version` del objeto guardado, y es la que dispara la migración (§4.2). Así, un
padrón escrito con el esquema v1 se encuentra, se migra en el sitio y se vuelve a
guardar bajo la misma clave. Si el nombre de la clave cambiara con cada esquema,
los datos viejos quedarían huérfanos bajo una clave que ya nadie lee, que es la
forma más silenciosa de perder el trabajo de alguien.

Se separan a propósito: un padrón corrupto no debe impedir llenar una rendición,
ni al revés.

### 4.1 Rendición (fase 1)

```js
{
  version: 1,
  id: "uuid",
  actualizadoEn: "2026-09-14T…",

  // --- Encabezado ---
  tipoCentro: "olla_comun",      // "comedor" | "olla_comun" — exactamente uno
  nombreCentro: "",              // campo ÚNICO; cubre las dos líneas del papel
  codigoPca: "",                 // dígitos, tal como figura en el padrón
  periodo: {
    tipo: "mensual",             // "semanal" | "quincenal" | "mensual"
    inicio: "",                  // ISO — primer día del periodo rendido
    fin: "",                     // ISO — último día del periodo rendido
    etiqueta: ""                 // lo que se escribe en "MES DE RENDICION"
  },
  fechaRendicion: "",            // ISO — fecha de presentación
  nombrePresidenta: "",
  dniPresidenta: "",             // 8 dígitos
  celular: "",                   // 9 dígitos

  // --- Ingresos ---
  montoSubsidioCent: null,       // entero en céntimos, o null si no ingresado
  fechaAsignacion: "",           // ISO

  // --- Egresos ---
  egresos: [
    {
      id: "uuid",
      fechaCompra: "",           // ISO
      descripcion: "",
      insumoId: null,            // enlace opcional al catálogo (fase 6)
      cantidad: null,            // número, o null
      cantidadVarios: false,     // true ⇒ se muestra "varios"
      unidadMedida: "",          // "Kg" | "L" | "unid" | "saco" | … | "varios"
      rucProveedor: "",          // 11 dígitos
      proveedorNombre: "",       // solo para sugerencias; NO va al formato
      boletaSerie: "",           // p. ej. "E001", "0001"
      boletaCorrelativo: "",     // p. ej. "143", "000080"
      precioUnitarioCent: null,  // entero en céntimos, o null
      precioUnitarioVarios: false, // true ⇒ se muestra "varios"
      montoTotalCent: null,      // entero en céntimos — SIEMPRE obligatorio
      origenFondo: "subsidio"    // "subsidio" | "ayuda_social" | "aporte_propio"
    }
  ],

  // --- Firmas ---
  nombrePresidentaFirma: "",
  dniPresidentaFirma: "",
  nombreTesorera: "",
  dniTesorera: ""
}
```

#### Notas del modelo, derivadas del formato real

- **El valor `varios` es un enum, no texto libre.** En el ejemplar llenado a mano,
  la fila de "carne" trae `varios` en cantidad, unidad y precio unitario, con un
  monto total de S/ 141.85 que agrupa una boleta con varios ítems. Esto es
  legítimo y frecuente: el precio de la carne varía mucho de un día a otro y de un
  puesto a otro, y una sola boleta puede cubrir cortes distintos. Se representa
  con banderas booleanas (`cantidadVarios`, `precioUnitarioVarios`) y
  `unidadMedida: "varios"`, no con la cadena `"varios"` metida en un campo
  numérico. La UI **no debe** obligar a desglosar la compra: sería pedir un dato
  que la boleta no tiene.
- **`montoTotalCent` es el dato duro de cada fila.** Es lo que la boleta dice y lo
  único que entra en las sumas. `precioUnitarioCent × cantidad` es, a lo sumo, una
  *comprobación* (§5), nunca la fuente del monto total.
- **`nombreCentro` es un solo campo.** El papel tiene dos rótulos ("CENTRO DE
  ATENCION" y "NOMBRE DEL CENTRO DE ATENCION") pero en la práctica se escribe un
  solo nombre cruzando ambas líneas.
- **`periodo` reemplaza al mes.** Los formatos se presentan semanal, quincenal o
  mensualmente. `etiqueta` es lo que se escribe literalmente en el renglón "MES DE
  RENDICION"; `inicio` y `fin` son las fechas que usan las validaciones. Al elegir
  el tipo, la app **propone** las tres cosas y la usuaria las acepta o las cambia:

  | `tipo` | Etiqueta propuesta |
  |---|---|
  | `semanal` | `Entrega semanal` |
  | `quincenal` | `Quincenal` |
  | `mensual` | el nombre del mes (`Setiembre`), **o** `Mensual` |

  Para `mensual` se ofrecen las dos opciones y la usuaria elige: el ejemplar
  llenado a mano dice `Setiembre`, y esa es la única evidencia directa de cómo se
  rotula en la práctica. El campo siempre queda editable.
- **`proveedorNombre` no va al formato.** El B-1 solo pide RUC. Se guarda para
  proponer el RUC cuando la usuaria vuelva a comprarle al mismo proveedor.
- Los tres totales del pie **no se guardan**: se derivan en cada render (§6.1).
  Guardar un total es arriesgarse a que quede desfasado del detalle.
- Los campos del recuadro "Recibido por la Municipalidad Distrital de Villa María
  del Triunfo" (Nombres y Apellidos, DNI, Observaciones) **no existen en el
  modelo**. Los llena el personal municipal a mano al recepcionar.

### 4.2 Padrón, asistencia y raciones (fase 2) — esquema v3, clave `b1.padron.v1`

```js
{
  version: 3,

  afiliados: [
    {
      id: "uuid",
      apellidoPaterno: "", apellidoMaterno: "", nombres: "",

      numeroDocumento: "",       // OBLIGATORIO (§9)
      tipoDocumento: "dni",      // "dni" | "ce"

      fechaNacimiento: "",       // ISO. Opcional; si está, deriva grupoEtario
      grupoEtarioManual: null,   // OBLIGATORIO si no hay fechaNacimiento

      sexo: "",                  // "" | "F" | "M" — opcional
      tipoAfiliado: "",          // OBLIGATORIO: "habitual" | "caso_social"

      activo: true,
      altaEn: "", bajaEn: "", motivoBaja: "",

      origenDato: "manual",      // "manual" | "escaneo_dni" | "importado"
      verificadoPor: "", nota: ""
    }
  ],

  atenciones: [
    {
      id: "uuid",
      fecha: "",                        // ISO

      // LA fuente de las raciones. Se marca quién vino; las raciones se cuentan.
      asistencias: [ { afiliadoId: "uuid", tipoMenu: "normal" } ],

      // Copia del precio configurado al crear el día (§2, excepción 4).
      precioMenuNormalCent: null,
      precioMenuAyudaSocialCent: null,
      precioTomadoDeConfig: true,

      // Solo en días migrados de la v2, que traían cuentas escritas a mano.
      legado: null,                     // | { racionesNormales, racionesAyudaSocial }

      nota: ""
    }
  ]
}
```

#### Decisiones del padrón

- **El nombre va en tres campos, no en uno.** Es como lo trae el DNI, como lo
  piden los padrones municipales, y es lo que permite que un escaneo futuro llene
  los campos sin que nadie tenga que partir una cadena a mano.
- **Son obligatorios `numeroDocumento`, el grupo etario y `tipoAfiliado`.** Los
  tres juntos son lo que permite llenar un formato de padrón sin volver a
  preguntar nada, y marcar la asistencia rápido. `tipoAfiliado` además decide qué
  menú le toca por defecto a esa persona cuando se la marca (§6.5).
  La obligatoriedad del documento invierte la minimización de la v1: ver §9.
- **`fechaNacimiento` es la fuente preferida del grupo etario**, porque el grupo
  cambia con el tiempo y un valor fijo se desactualiza solo. `grupoEtarioManual`
  existe para quien no quiera o no pueda dar su fecha. Si hay fecha, el grupo se
  **calcula** (§6.3) y el campo manual se ignora.
- **Las raciones no se escriben: se cuentan de la asistencia.** La comida se
  prepara el mismo día según quién viene, así que marcar la lista *es* contar las
  raciones. No hay ningún campo de raciones que llenar, y por eso tampoco hay
  forma de que el total y su desglose dejen de cuadrar.
- **El precio sí está fijado de antemano**, en la configuración, y se copia a cada
  día nuevo (§2, excepción 4). Editable por día si ese día fue distinto.
- **`legado`** guarda las cuentas escritas a mano de los días registrados con la
  v2. No se puede reconstruir quién vino aquel día sin inventárselo, así que esas
  cifras se conservan tal cual, siguen sumando, y la interfaz dice de dónde salen.
  En cuanto alguien marca asistencia en ese día, el legado se descarta y las
  raciones pasan a contarse de la lista.
- **`origenDato` es trazabilidad, no decoración.** Permite saber qué filas
  entraron a mano y cuáles por escáner, que es justo lo que hay que revisar
  primero si algo sale mal.
- **Las bajas no borran.** `activo: false` con `bajaEn` y `motivoBaja`. El borrado
  definitivo existe y pide confirmación.

#### Migraciones

`migrarPadron()` lleva cualquier versión anterior a la v3, sin inventar un dato:

| De | A | Qué hace |
|---|---|---|
| v1 | v2 | `racionesServidas` − `racionesCasoSocial` → normales y ayuda social |
| v2 | v3 | esas cuentas pasan a `legado`; los precios se conservan |
| cualquiera | v3 | `tipoAfiliado` ausente queda vacío (hay que elegirlo); `tipoDocumento: "sin_documento"` pasa a `"dni"` |

Los precios que nunca existieron **quedan en `null`**. La usuaria los completa, o
esos días quedan fuera del promedio y la app lo dice. La migración es idempotente
y tolera entradas corruptas.

### 4.3 Insumos e histórico de precios (fase 6)

```js
{
  version: 1,
  insumos: [
    {
      id: "uuid",
      nombre: "Papa blanca",       // creado por la usuaria
      unidadBase: "Kg",
      umbralVariacionPct: 40,      // §6.4; editable por insumo
      activo: true
    }
  ]
}
```

El histórico **no es una tabla aparte**: se deriva de los egresos que tienen
`insumoId`, `precioUnitarioCent` y `cantidad`. Es deliberado. Guardar precios por
separado abriría la puerta a que existan precios que nunca correspondieron a una
compra real; derivarlos garantiza que todo precio tiene una boleta detrás.

### 4.4 Calendario de entregas (fase 3) — `b1.calendario.v1`

```js
{
  version: 1,
  periodicidad: "mensual",       // "semanal" | "quincenal" | "mensual"
  fechaLimiteBase: "",           // UNA fecha de entrega que la usuaria conoce
  diasDeAviso: [7, 3, 1],
  entregas: [
    { id: "uuid", fechaLimite: "", estado: "pendiente", nota: "" }
    // estado: "pendiente" | "entregada" | "observada" | "conforme"
  ]
}
```

La app **no conoce el calendario oficial de la Municipalidad y no lo finge**. Todo
sale de dos datos que escribe la usuaria: cada cuánto entrega, y una fecha de
entrega que ya sabe —pasada o futura, da igual cuál—. Desde ahí se cuentan las
demás hacia adelante y hacia atrás (§6.7). Si la Municipalidad mueve una fecha, la
usuaria la corrige.

`entregas` solo guarda las fechas que la usuaria tocó para marcar su estado. Las
demás se calculan al vuelo: no hay una tabla de fechas que mantener sincronizada.

### 4.5 Config (transversal)

```js
{
  version: 1,
  calibracion: { offsetXmm: 0, offsetYmm: 0 },   // §8.4
  ultimoCentro: { /* encabezado de la última rendición, para sugerir */ },

  // Precio del menú que el centro ya tiene fijado. Se copia a cada día nuevo.
  precioMenuNormalCent: null,
  precioMenuAyudaSocialCent: null
}
```

### 4.6 Almacenamiento

- Guardado automático mientras se escribe, con *debounce*. Nunca se pierde trabajo
  por cerrar la pestaña.
- Toda lectura de `localStorage` va envuelta en `try/catch` y tolera datos
  ausentes, corruptos o de otra versión: ante duda, se arranca vacío y se avisa,
  jamás se borra en silencio lo que había.
- Migraciones por clave y por `version`, con la versión anterior conservada en una
  clave `.respaldo` hasta que la migración se confirme.
- Exportar/importar como archivo `.json` mediante `Blob` + `URL.createObjectURL`
  (descarga local; no hay subida a ningún lado).

---

## 5. Validaciones

Dos severidades, y la distinción importa:

- **Error**: algo que la Municipalidad rechazaría con certeza.
- **Advertencia**: algo probablemente equivocado, que la usuaria puede tener
  razones legítimas para dejar así.

Toda validación **señala y explica**; ninguna corrige sola. El mensaje dice qué
está mal y qué se espera, en lenguaje llano y sin jerga técnica. Ninguna
severidad impide seguir escribiendo ni guardar.

### 5.1 Encabezado del B-1

| Regla | Severidad |
|---|---|
| `tipoCentro` tiene exactamente un valor (comedor **o** olla común) | Error |
| `nombreCentro`, `codigoPca`, `periodo.etiqueta`, `fechaRendicion`, `nombrePresidenta`, `dniPresidenta`, `celular` no vacíos | Error |
| `periodo.inicio` y `periodo.fin` presentes y `inicio ≤ fin` | Error |
| Duración de `[inicio, fin]` coherente con `periodo.tipo` (7 / 14–16 / 28–31 días) | Advertencia |
| `dniPresidenta`: exactamente 8 dígitos | Error |
| `celular`: exactamente 9 dígitos y empieza en `9` | Error |
| `codigoPca`: solo dígitos | Advertencia |

### 5.2 Ingresos

| Regla | Severidad |
|---|---|
| `montoSubsidioCent` presente y mayor que 0 | Error |
| `fechaAsignacion` presente | Error |
| `fechaAsignacion` ≤ `fechaRendicion` | Error |
| `fechaAsignacion` dentro de `[periodo.inicio, periodo.fin]` o hasta 30 días antes de `periodo.inicio` | Advertencia |

### 5.3 Egresos (por fila)

| Regla | Severidad |
|---|---|
| Al menos una fila con datos | Error |
| `fechaCompra`, `descripcion`, `rucProveedor`, boleta y `montoTotalCent` presentes en toda fila que tenga cualquier dato | Error |
| `montoTotalCent` > 0 | Error |
| `rucProveedor`: 11 dígitos | Error |
| `rucProveedor`: empieza en `10`, `15`, `17` o `20` | Advertencia |
| `fechaAsignacion` ≤ `fechaCompra` ≤ `fechaRendicion` | Error |
| `fechaCompra` dentro de `[periodo.inicio, periodo.fin]` | Advertencia |
| Misma combinación serie + correlativo repetida en dos filas | Advertencia |
| `cantidad` y `precioUnitarioCent` numéricos **y** `cantidad × precioUnitario ≠ montoTotal` (tolerancia ±1 céntimo) | Advertencia |
| `precioUnitarioCent` se aparta de la mediana del insumo más de `umbralVariacionPct` (§6.4) | Advertencia |

Las dos últimas reglas son de las más valiosas y también las más delicadas: al
detectar el descuadre o la desviación, la app **muestra los números y pregunta**;
no reescribe nada. Si la fila usa `varios`, ninguna de las dos aplica.

### 5.4 Conjunto del B-1

| Regla | Severidad |
|---|---|
| `gastosConSubsidio + aporteCentroAtencion === totalRendicionGastos` | Error interno (indica bug; se registra visiblemente) |
| `Σ gastoPorOrigen === totalRendicionGastos` | Error interno |
| `totalRendicionGastos < montoSubsidioCent` (queda saldo sin rendir) | Advertencia |
| `Σ` de egresos con `origenFondo: "subsidio"` > `montoSubsidioCent` | Advertencia |
| `nombrePresidentaFirma` / `dniPresidentaFirma` distintos de los del encabezado | Advertencia |
| `nombreTesorera` y `dniTesorera` vacíos | Advertencia (el formato exige dos firmas) |
| `dniTesorera`: 8 dígitos si está presente | Error |
| Filas con datos > `FILAS_EGRESOS` (§7.3) | Advertencia, con aviso de segunda hoja |

### 5.5 Padrón

| Regla | Severidad |
|---|---|
| `apellidoPaterno` y `nombres` no vacíos | Error |
| **`numeroDocumento` vacío** | **Error** |
| `numeroDocumento`: 8 dígitos si `tipoDocumento === "dni"` | Error |
| `numeroDocumento`: 8–12 alfanuméricos si `tipoDocumento === "ce"` | Error |
| `numeroDocumento` repetido en dos afiliados activos | Error |
| **Sin grupo de edad** (ni por fecha de nacimiento ni elegido) | **Error** |
| `grupoEtarioManual` que no es uno de los cuatro tramos | Error |
| **`tipoAfiliado` no es `habitual` ni `caso_social`** | **Error** |
| Afiliado duplicado por nombre completo normalizado | Advertencia |
| `fechaNacimiento` en el futuro, o anterior a 120 años | Error |
| `altaEn` posterior a hoy | Error |
| `bajaEn` anterior a `altaEn` | Error |
| Afiliado con `origenDato: "escaneo_dni"` y `verificadoPor` vacío | Advertencia |

El grupo de edad y el tipo son errores y no advertencias porque sin ellos no se
puede llenar un formato de padrón ni marcar la asistencia con el menú correcto:
son justo los dos datos que hacen rápido todo lo demás.

### 5.6 Asistencia y raciones del día

| Regla | Severidad |
|---|---|
| Falta la fecha | Error |
| Hay raciones de un tipo de menú y **falta su precio** | Error |
| Nadie marcado en la asistencia (el día cuenta cero raciones) | Advertencia |
| El menú de ayuda social cuesta más que el normal | Advertencia |
| Misma persona marcada dos veces el mismo día | Error |
| Asistencia de alguien que ya no está en el padrón | Advertencia |
| Asistencia de alguien que no estaba activo esa fecha | Advertencia |
| Dos atenciones con la misma fecha | Advertencia |
| El día trae raciones heredadas de la v2 (`legado`) | Advertencia, explicando el origen |

Que falte un precio es **error** y no advertencia porque sin él el promedio del
periodo queda incompleto, y un promedio incompleto que no se anuncia es peor que
ninguno. Ya no existe la advertencia de «asistentes ≠ raciones»: no puede haber
descuadre, porque las raciones *son* la asistencia.

### 5.7 Precio del menú (configuración)

| Regla | Severidad |
|---|---|
| Falta el precio del menú normal | Advertencia (sin él no hay promedio) |
| Precio del menú normal ≤ 0 | Error |
| Precio del menú de ayuda social negativo | Error |

Cero es un precio válido para el menú de ayuda social: puede ser gratuito.

### 5.8 Calendario de entregas

| Regla | Severidad |
|---|---|
| `periodicidad` no es semanal, quincenal ni mensual | Error |
| `fechaLimiteBase` con formato inválido | Error |
| `fechaLimiteBase` vacía | Advertencia (sin ella no hay cuenta regresiva) |

### 5.9 Presentación de los hallazgos

- Un panel de resumen persistente con el conteo de errores y advertencias, y un
  enlace que lleva al campo afectado.
- Marca visual junto a cada campo con problema. **Nunca** solo color: también
  ícono y texto, por accesibilidad.
- El panel es de pantalla; no forma parte de la superposición (§8).

---

## 6. Reglas de cálculo

### 6.1 Totales del Formato B-1

Tres renglones al pie de la tabla de egresos. Verificados contra el ejemplar
llenado a mano (subsidio S/ 200.00; filas de S/ 68.00 y S/ 141.85; pie 200.00 /
9.85 / 209.85).

```
totalRendicionGastos = Σ montoTotalCent de todas las filas de egresos
gastosConSubsidio    = min(montoSubsidioCent, totalRendicionGastos)
aporteCentroAtencion = max(0, totalRendicionGastos − montoSubsidioCent)
```

Invariante que el código debe garantizar y `pruebas.html` debe verificar:

```
gastosConSubsidio + aporteCentroAtencion === totalRendicionGastos
```

Reglas complementarias:

- Toda la aritmética en **enteros de céntimos**. Sin `float`. El redondeo solo
  ocurre al formatear a texto: dos decimales, separador decimal `.`.
- Las filas vacías (sin `montoTotalCent`) no suman y no rompen el cálculo.
- Si `montoSubsidioCent` es `null`, los tres totales se muestran **vacíos**, no
  cero. Un cero donde falta un dato es un dato inventado.
- **`aporteCentroAtencion` queda vacío cuando es 0.** El formato dice "(Registrar
  de corresponder)": si el centro no puso dinero propio, el renglón va vacío, no
  con "0.00".
- **`min(subsidio, total)` no está verificado y no puede verificarse por ahora.**
  La fórmula se dedujo de un único ejemplar, en el que el total (209.85) superaba
  al subsidio (200.00). Reproduce ese caso con exactitud, pero el tramo en que el
  total es **menor** que el subsidio no tiene evidencia detrás. Se adopta como
  provisional, lleva un comentario `// DECISIÓN ABIERTA: sin verificar` en
  `calculos.js`, y se revisa en cuanto aparezca un ejemplar de ese tipo. Ningún
  módulo posterior debe asumirla como confirmada.
- Si `totalRendicionGastos < montoSubsidioCent` hay subsidio no gastado. El
  formato **no tiene** renglón para ese saldo. En ese caso
  `gastosConSubsidio = totalRendicionGastos` y la app emite una **advertencia**.
  La app no inventa un renglón que el papel no tiene.
- **`origenFondo` no altera estas tres fórmulas.** Sirve al módulo de consumo
  (§6.8) y a la advertencia de §5.4.
- Los totales se recalculan en cada cambio y son de **solo lectura**. No se pueden
  editar a mano: si el total no cuadra, lo que está mal es el detalle.

### 6.2 Afiliados activos

```
afiliadosActivos(fecha) = afiliados con activo = true,
                          altaEn ≤ fecha,
                          y (bajaEn vacío o bajaEn > fecha)
```

### 6.3 Grupo etario

```
edad(fechaNacimiento, fechaRef) = años cumplidos entre ambas fechas
grupoEtario(afiliado, fechaRef) =
  si fechaNacimiento está presente → por edad en fechaRef
  si no                            → grupoEtarioManual
  si tampoco                       → null (no se adivina)
```

Tramos, tomados de las **etapas de vida del MINSA**, Documento Técnico del Modelo
de Cuidado Integral de Salud por Curso de Vida (RM 030-2020-MINSA):

| Grupo | Edad | Correspondencia MINSA |
|---|---|---|
| `nino` | 0 a 11 años | Niña/niño |
| `adolescente` | 12 a 17 años | Adolescente |
| `adulto` | 18 a 59 años | Adulto joven (18–29) + Adulto (30–59) |
| `adulto_mayor` | 60 a más | Adulto mayor |

Se usan cuatro grupos, no los cinco del MINSA, porque son los que pide el padrón:
«adulto» reúne al adulto joven y al adulto. **Ninguna frontera se mueve**, así que
si un formato municipal llegara a pedir «joven» aparte, basta partir en 29/30.

- El grupo **se calcula siempre respecto a una fecha de referencia** (hoy, o el
  fin del periodo rendido), nunca se congela al momento del alta. Una persona que
  cumple 60 pasa de grupo sin que nadie tenga que acordarse.
- Es la segunda y última excepción al principio rector: aritmética pura sobre una
  fecha que la propia persona dio.
- Si no hay fecha ni grupo manual, el resultado es `null` y la UI lo muestra como
  *"sin dato"*. No se asume `adulto`.

### 6.4 Estadísticas de precio de compra (fase 6)

Para un insumo, sobre las compras que tienen `insumoId`, `cantidad` numérica y
`precioUnitarioCent`, ordenadas por `fechaCompra` descendente:

```
ultimoPrecio     = precioUnitarioCent de la compra más reciente
ultimaFecha      = fechaCompra de esa compra
medianaReciente  = mediana de las últimas 10 compras
minReciente      = mínimo de esas mismas
maxReciente      = máximo de esas mismas
nMuestras        = cuántas compras entraron al cálculo
```

- Con menos de 3 muestras **no se muestra mediana ni rango**, solo el último
  precio con su fecha. Una mediana de dos datos no es información, es ruido.
- `nMuestras` siempre se muestra junto a la estadística.
- Las compras con `precioUnitarioVarios` quedan fuera. No se deriva un precio
  dividiendo `montoTotal / cantidad` cuando la fila dice `varios`: ese cociente no
  es el precio de nada.
- Estas cifras son **referencia en pantalla**. No entran al formato.
- **Desviación:** si la usuaria ingresa un `precioUnitarioCent` que se aparta de
  `medianaReciente` en más de `umbralVariacionPct` (por defecto 40 %, editable por
  insumo), se emite una **advertencia** que muestra ambos números. Nunca un error,
  nunca un bloqueo, nunca una corrección: en el Perú el precio de la carne, el
  pollo y la verdura se mueve así de verdad, y la advertencia existe para atrapar
  un dedazo, no para discutirle el mercado a quien fue a comprar.

### 6.5 Asistencia, raciones y promedio

**Las raciones no se escriben: se cuentan.** La comida se prepara el mismo día
según quién viene, así que marcar la lista de asistencia *es* contar las raciones.
El precio, en cambio, está fijado de antemano y se copia a cada día nuevo.

```
desgloseDelDia(at)
    si hay asistencias → normal       = asistencias con tipoMenu ≠ ayuda_social
                         ayudaSocial  = asistencias con tipoMenu = ayuda_social
                         origen       = "asistencia"
    si no y hay legado → las cifras heredadas de la v2, origen = "legado"
    si no              → 0, origen = "asistencia"

racionesDelDia(at)      = desglose.total

recaudacionDelDia(at)   = Σ raciones_tipo × precio_tipo, sobre los tipos con raciones > 0
                          ⇒ null si falta el precio de un tipo que SÍ tuvo raciones

racionesPeriodo         = Σ racionesDelDia dentro de [inicio, fin]
recaudacionPeriodo      = Σ recaudacionDelDia de los días que la tienen
racionesConPrecio       = Σ racionesDelDia de esos mismos días
precioPromedioRacion    = round(recaudacionPeriodo / racionesConPrecio)
diasSinPrecio           = días excluidos por falta de precio
diasDeLegado            = días cuyas raciones vienen heredadas
```

- **El menú por defecto de cada persona sale de su `tipoAfiliado`**: `caso_social`
  → menú de ayuda social, `habitual` → menú normal. Es su propio dato de
  inscripción, y se puede cambiar ese día sin tocar su ficha.
- **El promedio es ponderado por ración, no promedio de precios.** 90 raciones a
  S/ 3.00 y 10 a S/ 1.00 dan S/ 2.80, no S/ 2.00. Promediar los dos precios sin
  pesarlos daría un número que no le corresponde a nadie.
- **Un día sin precio no se estima: se excluye y se cuenta.** `diasSinPrecio` se
  muestra siempre junto al promedio. Las raciones de ese día **sí** entran en
  `racionesPeriodo`: faltó el precio, no la comida.
- Si ningún día tiene precio, el promedio es `null` y la pantalla queda vacía con
  una explicación. Nunca cero.
- `diasDeLegado` también se muestra, para que un periodo que mezcla días contados
  y días heredados no se lea como si todos fueran iguales.
- `costoPorRacion = totalRendicionGastos / racionesPeriodo` sigue existiendo como
  referencia: lo que **costó** cada ración frente a lo que se **cobró**. Ninguno de
  los dos es un indicador oficial.

### 6.6 Asistencia acumulada y reporte del padrón

```
asistenciaPorAfiliado(padron, inicio, fin)
    = por persona: días marcados, separados en normal / ayuda social,
      ordenado de más a menos días

afiliadosSinAsistencia(padron, inicio, fin)
    = personas activas al fin del periodo que no figuran ni un día

filasPadron(padron, fechaRef)
    = afiliados activos, ordenados por apellido con criterio español,
      numerados desde 1, con documento, grupo etario, edad y tipo
```

- `filasPadron` **solo ordena y numera lo ya ingresado**. No completa un campo
  vacío, no deduce una edad sin fecha de nacimiento, no reparte a nadie en un
  grupo que no eligió. Una celda vacía en el reporte es una celda vacía en la
  ficha, y se señala como error en el panel.
- Alimenta la tabla en pantalla, la copia al portapapeles (TSV) y la descarga CSV.
  Las tres salen de la misma función, así que no pueden discrepar.
- La lista de quienes no asistieron es informativa. **No** es una lista de bajas
  ni una propuesta de darlas: la app no sugiere sacar a nadie del padrón, no
  ordena por «menos asistencia» para señalar, y no calcula ninguna puntuación.

### 6.7 Fechas de entrega y cuenta regresiva

```
avanzarPeriodo(fecha, periodicidad)
    semanal   → + 7 días
    quincenal → + 15 días
    mensual   → mismo día del mes siguiente, ajustado al último día si no existe
                (31 de enero → 28 de febrero)

fechasDeEntrega(cal, hoy, n)
    desde fechaLimiteBase, retrocede o avanza hasta la primera fecha ≥ hoy,
    y devuelve esa y las n-1 siguientes

nivelPorDias(dias, diasDeAviso)
    dias < 0                      → vencida
    dias = 0                      → hoy
    dias ≤ segundo aviso más bajo → urgente
    dias ≤ aviso más alto         → proxima
    resto                         → lejana
```

- Sin `fechaLimiteBase` **no hay cuenta regresiva y no se inventa una fecha**: la
  franja dice que falta configurarlo y enlaza a la página de entregas.
- **Una entrega vencida y sin marcar pesa más que la siguiente.** Mientras la
  anterior siga en `pendiente`, la franja muestra el atraso, no la próxima fecha.
- El corte de «urgente» es el **segundo** aviso más bajo, para que el aviso más
  temprano no se trague a los demás; con un solo aviso configurado, ese mismo.
- Las alertas se ven **solo con la aplicación abierta**. No hay notificaciones con
  la app cerrada, y la interfaz lo dice en texto en vez de dar una falsa sensación
  de cobertura. Conseguirlo exigiría Service Worker o backend, ambos fuera de
  alcance (§10).

### 6.8 Consumo por origen de fondo (fase 7)

```
gastoPorOrigen[o] = Σ montoTotalCent de egresos con origenFondo === o
```

- La suma de los tres orígenes debe igualar `totalRendicionGastos`.
- **No es un inventario.** No se modela stock, entradas y salidas de almacén ni
  mermas (§10): un inventario que la usuaria no alcance a mantener al día produce
  números falsos, que es exactamente lo que este proyecto existe para evitar.

## 7. Inscripción al padrón por código de barras del DNI

**No se implementa ahora.** Lo que sí es obligatorio desde ya: que el modelo y la
arquitectura del padrón lo admitan sin rehacerse. Esta sección fija ese contrato.

### 7.1 Por qué escanear no viola el principio rector

El escáner **transcribe un documento que la persona entregó y que está presente
en el momento**. No deduce, no estima, no consulta a nadie. Es la misma clase de
acto que teclear el DNI mirándolo, con menos errores de tipeo.

Las condiciones que lo mantienen dentro del principio:

1. **Confirmación obligatoria.** Lo leído se muestra en un formulario de revisión
   antes de guardarse. Nadie entra al padrón sin que una persona apruebe los
   datos. `verificadoPor` registra quién lo hizo.
2. **Campo ilegible = campo vacío.** Si el parser no puede leer un campo con
   certeza, lo devuelve vacío y lo lista en `camposNoLeidos`. Nunca rellena con lo
   más parecido.
3. **Procedencia marcada.** `origenDato: "escaneo_dni"` queda en la fila y se ve
   en la UI.
4. **La cadena cruda no se persiste jamás.** Se parsea en memoria y se descarta en
   el mismo *tick*. No entra a `localStorage`, ni a una exportación, ni a un log,
   ni al DOM (§9).

### 7.2 Vías de entrada — ambas sin dependencias

El DNI peruano lleva un código de barras **PDF417** en el reverso. Decodificarlo
en JavaScript con una librería (ZXing u otra) **violaría "cero dependencias"**
(§3). Hay dos caminos que no la violan, y el diseño debe soportar ambos:

**a) Lector físico tipo HID (recomendado).**
El escáner de mano se comporta como un teclado: enfoca un `<input>` y "escribe"
la cadena decodificada, normalmente terminada en Enter. Cero código de
decodificación, cero dependencias, funciona en cualquier navegador y sistema. El
único trabajo de la app es reconocer que una ráfaga de teclas muy rápida
terminada en Enter es un escaneo y no tecleo humano.

**b) Cámara + `BarcodeDetector` (nativo del navegador).**
API del propio navegador, admite el formato `pdf417`, no es una librería. Se usa
con `getUserMedia` y requiere HTTPS — GitHub Pages ya lo sirve. Soporte desigual
(hoy sobre todo Chrome en Android). Obligatorio: **detección de soporte**
(`'BarcodeDetector' in window` y consulta de formatos admitidos); si no está, el
botón de cámara **no se muestra** y queda la vía (a) y el tecleo manual. El
fotograma de la cámara no se guarda ni se muestra fuera del visor en vivo.

Lo que no se hace, bajo ninguna circunstancia: incluir una librería de
decodificación, ni cargarla desde un CDN, ni enviar una foto a un servicio de
reconocimiento.

### 7.3 Contrato de `js/escaneo-dni.js`

Función pura, sin DOM, sin estado, probada en `pruebas.html`:

```js
parsearCadenaDni(cadena) => {
  tipoDocumento: "dni" | "ce" | null,
  numeroDocumento: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  nombres: "",
  fechaNacimiento: "",        // ISO, o ""
  sexo: "",                   // "F" | "M" | ""
  camposNoLeidos: [],         // nombres de los campos que no se pudieron leer
  confianza: "alta" | "baja" | "desconocida"
}
```

- Devuelve **siempre** el objeto completo, con cadenas vacías donde no pudo leer.
  Nunca lanza por una cadena malformada: devuelve todo vacío y
  `confianza: "desconocida"`.
- **El formato exacto de codificación del PDF417 del DNI peruano no está
  verificado** y no se va a adivinar. Hasta tener muestras reales, la función es
  un stub documentado que devuelve `confianza: "desconocida"` y deja todo vacío, y
  la UI cae al ingreso manual. Escribir un parser contra un formato supuesto
  produciría exactamente el tipo de dato inventado que este proyecto prohíbe
  (§12.2).
- Cuando haya muestras, se escriben **primero** los casos de prueba con cadenas
  reales anonimizadas (dígitos sustituidos), y después el parser.
- Separación estricta: `escaneo-dni.js` solo parsea. Capturar la cadena (teclado o
  cámara), mostrar la revisión y guardar es trabajo de `ui.js`.

### 7.4 Lo que el modelo ya deja preparado

| Pieza de §4.2 | Para qué sirve al escaneo |
|---|---|
| Nombre en tres campos | El DNI los trae separados; no hay que partir cadenas |
| `tipoDocumento` | Distinguir DNI de carné de extranjería |
| `fechaNacimiento` | Viene en el código; de ahí sale el grupo etario (§6.3) |
| `sexo` | Viene en el código; opcional en la app |
| `origenDato` | Trazabilidad de qué entró por escáner |
| `verificadoPor` | Quién confirmó lo leído |

---

## 8. Superposición: vista previa (fase 4) e impresión (fase 5)

**La app no dibuja el formato. Lo llena.** La usuaria coloca en la bandeja de la
impresora la hoja preimpresa del Formato B-1 que le entrega la Municipalidad, y
la app imprime **únicamente los datos**, posicionados para que caigan en los
espacios en blanco de esa hoja.

Como todavía **no hay plantilla física** para medir, el trabajo se parte en dos:

- **Fase 4 — vista previa en pantalla.** Se construye toda la maquinaria de
  posicionamiento con coordenadas **estimadas**, y se mira en pantalla. Permite
  ver cómo quedan los datos, detectar textos que no entran, y afinar la
  disposición sin gastar una sola hoja. No imprime.
- **Fase 5 — impresión real.** Cuando aparezca la plantilla, se miden las
  coordenadas y se reemplazan los números en `plantilla-b1.js`. **Nada más
  cambia.** Ese es todo el motivo de separar las fases.

### 8.1 Reglas de la capa de superposición

Valen igual en pantalla y en papel:

- **Solo datos.** Ni un rótulo, ni una línea, ni un recuadro, ni el escudo, ni la
  NOTA, ni el párrafo de Declaración Jurada. Todo eso ya está en el papel.
  Reproducirlo encima produce texto doble ilegible.
- **A4 vertical, márgenes cero.** `@page { size: A4 portrait; margin: 0 }`.
  Cualquier margen del navegador desplaza todo y descalibra la hoja.
- **Posicionamiento absoluto en milímetros** sobre un contenedor de
  `210mm × 297mm`. Nada de flujo normal, nada de tablas, nada de flexbox en esta
  capa. Cada dato es una caja `position: absolute` con `left`, `top`, `width` y
  `height` en `mm`.
- **Fuente de ancho controlado**, tamaño fijo en `pt`, sin `line-height`
  heredado. El texto que no entra en su caja se comprime con `letter-spacing`
  negativo hasta un mínimo legible y luego se trunca **con aviso en pantalla**;
  nunca se desborda a la celda vecina.
- **Monocromo, negro puro.** Sin fondos, sin bordes, sin sombras.
- **Campo vacío = nada en esa posición.**

### 8.2 `js/plantilla-b1.js` — única fuente de coordenadas

Un objeto con una entrada por campo. Recalibrar es editar números aquí, nunca
cirugía de CSS.

```js
export const PLANTILLA_B1 = {
  // ESTIMADO: medido sobre una foto en ángulo, no sobre la plantilla física.
  // Toda coordenada de este archivo es provisional hasta la fase 5.
  estimado: true,
  hoja: { anchoMm: 210, altoMm: 297 },
  campos: {
    nombreCentro: { xMm: 62,  yMm: 51, anchoMm: 78, altoMm: 5, align: "left" },
    codigoPca:    { xMm: 150, yMm: 48, anchoMm: 52, altoMm: 5, align: "left" },
    // …
  },
  egresos: {
    primeraFilaYMm: 112,
    altoFilaMm: 5.2,
    filas: 17,                 // FILAS_EGRESOS
    columnas: {
      fechaCompra: { xMm: 14,  anchoMm: 22, align: "center" },
      descripcion: { xMm: 37,  anchoMm: 42, align: "left"   },
      // …
      montoTotal:  { xMm: 172, anchoMm: 26, align: "right"  }
    }
  }
};
```

Mientras `estimado` sea `true`, la app **muestra un aviso visible** de que la
disposición no está calibrada contra el papel y de que no debe imprimirse sobre
hoja oficial.

### 8.3 Vista previa en pantalla (fase 4)

`vista-previa.html` renderiza el mismo contenedor de 210×297 mm, escalado al
ancho de la pantalla, con los datos en sus posiciones.

- **Guía de fondo opcional.** La usuaria puede cargar una foto o escaneo de la
  plantilla en blanco desde su dispositivo (`<input type="file">`) para verla
  detrás de los datos. Se mantiene en memoria mediante `URL.createObjectURL`, no
  se guarda en `localStorage`, no se sube a ninguna parte, **no se versiona en el
  repositorio** y **nunca se imprime**. Es una ayuda de pantalla, nada más.
- Control de opacidad de la guía y un conmutador para ocultarla.
- Señala en rojo todo texto que no entre en su caja.
- Un panel lateral de pantalla permite ajustar coordenadas en vivo y **copiar el
  objeto `PLANTILLA_B1` resultante** al portapapeles, para pegarlo en el archivo.
  Las coordenadas vivas no se persisten solas: se copian y se pegan a mano, para
  que el archivo siga siendo la única fuente de verdad.

### 8.4 Impresión real (fase 5)

No empieza hasta tener la plantilla física.

- `calibrar.html` imprime una **regla de calibración** sobre hoja en blanco:
  cruces y marcas numeradas en mm en los bordes, más un recuadro de posición
  conocida. La usuaria la superpone con la plantilla oficial a contraluz, lee
  cuántos milímetros sobran o faltan, e ingresa `offsetXmm` y `offsetYmm`. Se
  guardan en `b1.config.v1` y se aplican como una traslación única a todo el
  contenedor. Es por dispositivo e impresora; la app lo dice y permite volver a
  cero.
- Botón de **prueba en blanco**: imprime los datos reales sobre hoja común, para
  cotejar contra la plantilla antes de gastar una hoja oficial.
- La usuaria debe desactivar "Encabezados y pies de página" y poner la escala en
  **100 % / Tamaño real** en el diálogo del navegador. La app **no puede hacerlo
  por ella**: lo indica con instrucciones visibles justo antes de imprimir, con el
  nombre de la opción en Chrome y en Firefox.
- **Imprimir siempre está permitido**, con errores pendientes o sin ellos. Si los
  hay, la app lo advierte antes de abrir el diálogo, pero no se lo impide.
- `FILAS_EGRESOS` es una constante única en `plantilla-b1.js`. Valor provisional:
  **17**. Si hay más egresos que filas, se imprime una **segunda hoja** con las
  restantes sobre otra plantilla en blanco; se repite el encabezado y **solo la
  última hoja lleva los tres totales**.
- Queda en blanco: el recuadro "Recibido por la Municipalidad…", que llena el
  personal municipal, y las firmas y sellos, que se estampan a mano. La app pone
  los nombres y DNI bajo las líneas de firma, no la firma.

---

## 9. Privacidad

La app maneja datos personales de personas reales: nombres, DNI y celular de la
presidenta y la tesorera, RUC de proveedores, el **padrón de personas afiliadas**
con su número de documento, y el **registro de qué días vino cada una**,
que es información sobre población en situación de vulnerabilidad. Ese padrón
eleva el estándar de cuidado de todo el proyecto, y el escaneo de DNI (§7) lo
eleva otra vez.

- **Los datos no salen del dispositivo. Punto.** Sin servidor, sin telemetría, sin
  analítica, sin *error reporting*, sin fuentes ni scripts remotos, sin píxeles,
  sin iframes de terceros. El repositorio no debe contener ninguna URL externa en
  tiempo de ejecución.
- `localStorage` es el único almacén, y es local al navegador y al dispositivo.

**Dos decisiones que aumentan el dato recogido, y por qué constan aquí**

La v1 de esta especificación minimizaba al máximo: documento opcional y ninguna
asistencia nominal. El equipo revirtió ambas cosas, por razones operativas
concretas. Quedan registradas con su motivo, porque una decisión así se toma una
vez y se respeta, pero no se olvida.

1. **El número de documento es obligatorio.** Motivo: los padrones que recibe la
   Municipalidad lo exigen, y un padrón sin documentos no sirve para el trámite,
   que es justo lo que esta app existe para destrabar.
2. **Se registra la asistencia nominal por día.** Motivo: es la única forma de
   verificar las raciones servidas contra las personas registradas, que es un
   requisito de la rendición.

**Lo que se hace a cambio.** Recoger más obliga a cuidar más:

- Marcar asistencia es **opcional por día**. Un día sin asistencia marcada es
  válido y la app no insiste.
- La asistencia guarda **solo el `afiliadoId` y el tipo de menú**. Ni hora, ni
  cantidad, ni observación por persona.
- La lista de quienes no asistieron es **informativa**. La app no sugiere dar de
  baja a nadie, no ordena por «menos asistencia» para señalar, y no calcula
  ninguna puntuación de comportamiento.
- Borrar un día de atención borra su asistencia con él, y el diálogo lo dice.
- Dar de baja a una persona la saca de las listas de asistencia futuras sin tocar
  su historial.

**Minimización que sigue en pie:**

- No se registra dirección, teléfono, condición de salud, ingresos ni composición
  familiar.
- No se guarda fotografía, firma ni ningún dato biométrico.
- No se cruza el padrón con nada externo: no hay a qué cruzarlo, porque no hay red.
- `fechaNacimiento` y `sexo` siguen siendo **opcionales**.
- El texto visible de la app dice qué se guarda y dónde, sin enterrarlo en un
  enlace.

**Reglas específicas del escaneo de DNI (§7):**

- Del código de barras se conservan **únicamente los campos declarados en §7.3**.
  Todo lo demás que venga en la cadena se descarta.
- **La cadena cruda nunca se persiste**: ni en `localStorage`, ni en una
  exportación, ni en un atributo del DOM, ni en `console.log`. Se parsea en
  memoria y se descarta.
- Si se usa la cámara, el fotograma **no se guarda** y la pista de vídeo se
  detiene (`track.stop()`) en cuanto se obtiene la lectura o se cierra el visor.
- Nada biométrico: ni foto, ni firma, ni huella, aunque el documento las lleve.
- La app ofrece una frase corta que la dirigente puede leerle a la persona antes
  de escanear, explicando qué se guarda y dónde. Escanear exige un gesto
  deliberado; nunca ocurre de fondo.
- Toda persona puede figurar en el padrón **sin escanear nada**. El escaneo es una
  comodidad, nunca un requisito.

**Repositorio y respaldos:**

- Exportar a `.json` es descarga local, con aviso claro de que el archivo contiene
  nombres, números de documento y el registro de qué días vino cada persona, y que
  no debería compartirse por canales abiertos (WhatsApp, correo sin cifrar).
- Botón de **borrar todo** con confirmación que nombra lo que se borra, y borrado
  por módulo.
- **Nunca** se suben al repositorio datos reales: ni en ejemplos, ni en pruebas,
  ni en capturas, ni en comentarios. Los datos de demostración usan nombres
  ficticios y DNI/RUC claramente falsos (p. ej. `00000001`) que además **fallen**
  las validaciones de formato.
- Las dos fotos del formato que originaron esta especificación (una en blanco, una
  llena con datos reales de personas identificables) **no se versionan**: van en
  `.gitignore` antes del primer commit. Lo mismo vale para cualquier guía de fondo
  que se cargue en la vista previa (§8.3).
- Sin cuentas, sin login, sin identificadores de usuario, sin cookies.

---

## 10. Fuera de alcance

Lo siguiente **no** se construye, y una propuesta de construirlo requiere
modificar antes este archivo:

- Backend, base de datos, API, sincronización entre dispositivos, multiusuario.
- Autenticación, cuentas, roles, permisos.
- Envío del formato a la Municipalidad por cualquier canal. El trámite sigue
  siendo presencial y en papel.
- Firma digital o electrónica. Se firma a mano sobre el impreso.
- **Librerías de decodificación de códigos de barras** (§7.2). Solo lector HID o
  `BarcodeDetector` nativo.
- OCR de boletas, de documentos o del anverso del DNI.
- Consulta a servicios externos (SUNAT, RENIEC, padrones MIDIS, índices de
  precios) para validar o traer datos. Las validaciones son **de formato**, no de
  existencia, y los precios son **los propios**, no los del mercado.
- Verificación de identidad, cotejo biométrico, almacenamiento de fotos del
  documento.
- Generación de PDF por librería. Se usa la impresión nativa del navegador.
- **Dibujar el formato completo.** Es superposición sobre la plantilla (§8).
- Otros formatos del PCA distintos del B-1 (Acta de Asamblea, fichas técnicas).
- **Inventario de almacén**: stock, entradas y salidas, mermas, kardex. El módulo
  de consumo es una clasificación del gasto por origen de fondo (§6.8).
- Planificación de menús, cálculo de valor nutricional, gramajes por grupo etario.
- Puntuación, ranking o evaluación de personas por su asistencia.
- Cobro, caja o control de pagos individuales. Se registra el precio del menú del
  día, no quién pagó cuánto.
- Proyección, presupuesto a futuro o flujo de caja estimado. La app registra lo
  ocurrido; no pronostica.
- Notificaciones fuera de la app (push, correo, SMS, WhatsApp). Las alertas se ven
  al abrir la app y nada más (§12.1).
- Instalación como PWA, Service Worker.
- Internacionalización. Español peruano únicamente.
- Modo oscuro o temas.

---

## 11. Criterios de aceptación

### Fase 1 — Formato B-1: llenado y validación · **cumplida**

1. Los datos del ejemplar llenado a mano se ingresan completos sin forzar ningún
   campo, incluida la fila con `varios` en cantidad, unidad y precio unitario.
2. Con esos datos la app calcula exactamente `200.00`, `9.85` y `209.85`.
3. Los tres tipos de periodo se registran y su etiqueta propuesta es editable.
4. Un formulario recién abierto tiene todos sus campos vacíos; ninguna sugerencia
   se aplica sola.
5. Toda sugerencia indica su procedencia y la fecha del dato de origen.
6. Los tres totales son de solo lectura.
7. Ninguna validación modifica el contenido de un campo.
8. `pruebas.html` en verde: suma de egresos; total menor, igual y mayor que el
   subsidio; filas vacías; subsidio ausente; invariante `gastos + aporte ===
   total`; ausencia de error de coma flotante.
9. Todos los montos internos son enteros de céntimos.
10. `calculos.js` lleva el comentario `// DECISIÓN ABIERTA: sin verificar` sobre
    `min(subsidio, total)` (§6.1).
11. Cada regla de §5.1–§5.4 se dispara con su severidad correcta.
12. Ningún error impide seguir escribiendo ni guardar.

### Fase 2 — Padrón, asistencia y raciones · **cumplida**

13. Se registra, edita, da de baja y reactiva a una persona afiliada, y hay un
    formulario de alta rápida con los cinco datos obligatorios a la vista.
14. **Obligatorios y señalados como error si faltan**: número de documento, grupo
    de edad y tipo (habitual / ayuda social).
15. Los cuatro grupos de edad son los del MINSA (RM 030-2020): 0–11 / 12–17 /
    18–59 / 60+, sin mover ninguna frontera.
16. Con fecha de nacimiento, el grupo se calcula respecto a una fecha de
    referencia y cambia solo al cruzar el cumpleaños; el selector manual queda
    deshabilitado. Sin fecha, el grupo manual es obligatorio.
17. **Las raciones se cuentan de la asistencia**: no existe ningún campo donde
    escribirlas, y el total no puede discrepar de su desglose.
18. La asistencia es un checklist de las personas activas **a esa fecha**, con
    buscador, «marcar todos» y «quitar todos».
19. Al marcar a alguien, su menú sale de su `tipoAfiliado`, y se puede cambiar
    ese día sin tocar su ficha.
20. El precio del menú se fija una vez y se copia a cada día nuevo, **marcado**
    como tomado de la configuración y editable por día.
21. El precio promedio por ración es **ponderado**, y se muestra junto al número
    de raciones que lo respaldan, los días excluidos por falta de precio y los
    días heredados.
22. Sin ningún precio anotado no hay promedio: vacío con explicación, no cero.
23. Falta de precio con raciones de ese tipo → **error**.
24. La tabla de asistencia muestra días por persona separados por tipo de menú, y
    lista a quienes no asistieron, sin sugerir darlos de baja.
25. El reporte del padrón numera y ordena por apellido las personas activas, con
    documento, grupo, edad y tipo; se copia al portapapeles y se descarga en CSV,
    los tres desde la misma función.
26. `migrarPadron()` lleva v1 y v2 a v3 conservando las raciones escritas a mano
    como `legado`, dejando los precios en `null`, y es idempotente y a prueba de
    basura.
27. `escaneo-dni.js` existe con la firma de §7.3, devuelve el objeto completo con
    `confianza: "desconocida"`, y no lanza nunca.

### Fase 3 — Calendario de entregas · **cumplida**

28. Con periodicidad y una fecha conocida, la app cuenta las entregas hacia
    adelante y hacia atrás, incluida la mensual con ajuste a fin de mes.
29. Sin fecha base no se inventa ninguna: la franja dice que falta configurarlo.
30. La franja muestra los días que faltan y cambia de nivel según `diasDeAviso`.
31. Una entrega vencida y sin marcar desplaza a la siguiente en la franja.
32. Cada fecha se puede marcar pendiente / entregada / observada / conforme.
33. La interfaz dice explícitamente que no avisa con la aplicación cerrada.

### Fase 4 — Vista previa de superposición

34. `vista-previa.html` muestra los datos sobre un lienzo de 210×297 mm.
35. La salida contiene **únicamente datos**: ningún rótulo ni recuadro del formato.
36. Un campo vacío no dibuja nada en su posición.
37. Todo texto que no entra en su caja se marca visiblemente.
38. La guía de fondo se carga desde el dispositivo, no se guarda, no se versiona y
    no se imprime.
39. Con `PLANTILLA_B1.estimado === true` hay un aviso visible de que no está
    calibrado contra papel.

### Fase 5 — Impresión real

No empieza hasta tener la plantilla física (§12.2).

40. `calibrar.html` imprime una regla legible y sus offsets se aplican.
41. Impresa sobre la plantilla a escala 100 % con offset calibrado, cada dato cae
    dentro de su espacio, verificado a ojo sobre papel.
42. Un formulario con errores puede imprimirse igual, tras un aviso.

### Transversal · **cumplida**

43. El repositorio no tiene `package.json`, ni `node_modules`, ni paso de build.
44. Búsqueda de `fetch(`, `XMLHttpRequest`, `//` en `src`/`href` y `@import`
    remoto: cero resultados.
45. La app carga y funciona completa sin red.
46. Con rutas relativas, todo resuelve bajo un subdirectorio de GitHub Pages.
47. Recargar conserva lo escrito. `localStorage` corrupto o ausente no rompe el
    arranque y no borra lo que había.
48. Utilizable en una pantalla de 360 px de ancho, sin scroll horizontal.
49. Los errores nunca se comunican solo por color.
50. Ningún dato real de personas figura en el repositorio, ni las fotos del
    formato.

### Fase 6 — Precios de compra

51. El histórico de un insumo se deriva de egresos reales.
52. Con menos de 3 muestras no se muestra mediana ni rango.
53. Las filas con `varios` quedan fuera de las estadísticas.
54. Un precio desviado más del umbral produce advertencia con ambos números
    visibles, y el valor ingresado permanece intacto.

### Fase 7 — Consumo

55. `Σ gastoPorOrigen === totalRendicionGastos` se verifica en `pruebas.html`.
56. No existe ninguna pantalla de stock, kardex ni mermas.

## 12. Decisiones

### 12.1 Cerradas

Confirmadas con el equipo. No se reabren sin una decisión explícita.

- **La impresión es superposición.** Se imprimen únicamente los datos sobre la
  plantilla oficial cargada en la bandeja. La app no dibuja el formato (§8).
- **Sin plantilla física, se trabaja con coordenadas estimadas y vista previa en
  pantalla.** La estimación es de **geometría**, nunca de datos (§2).
- **El número de documento es obligatorio** en el padrón. Revierte la
  minimización de la v1; motivo y contrapartidas en §9.
- **Se registra asistencia nominal por día.** Revierte la prohibición explícita de
  la v1; motivo y contrapartidas en §9. Es opcional por día y guarda solo persona
  y tipo de menú.
- **Las raciones se cuentan de la asistencia marcada**, no se escriben: la comida
  se prepara el mismo día según quién viene.
- **El precio del menú se fija una vez** en la configuración y se copia a cada día
  nuevo, marcado y editable (§2, excepción 4).
- **Grupo de edad y tipo (habitual / ayuda social) son obligatorios** al inscribir:
  son los dos datos que permiten llenar el padrón y marcar la asistencia rápido.
- **Los grupos de edad son los del MINSA** (RM 030-2020-MINSA), reducidos a cuatro
  sin mover ninguna frontera (§6.3).
- **La asistencia es un checklist**, con el menú propuesto desde el tipo de cada
  persona.
- **El padrón es núcleo**, a la par del B-1.
- **La inscripción por escaneo del código de barras del DNI es el destino.** No se
  implementa ahora; el modelo y la arquitectura ya la admiten (§7).
- **Nada de librerías de códigos de barras.** Solo lector HID o `BarcodeDetector`
  nativo (§7.2).
- **Alertas solo con la app abierta.** Notificar con la app cerrada exigiría
  Service Worker o backend, ambos fuera de alcance (§10). La app lo dice.
- **Segunda hoja de continuación: permitida**, con encabezado repetido y totales
  solo en la última.
- **`nombreCentro` es un solo campo**, aunque el papel tenga dos rótulos.
- **`varios` es un valor válido** de cantidad, unidad y precio unitario, como enum.
- **Etiqueta del periodo:** `Entrega semanal`, `Quincenal`, `Mensual` — propuestas
  y editables; para el caso mensual se ofrece además el nombre del mes (§4.1).
- **Tres controladores de página** (`pagina-b1.js`, `pagina-padron.js`,
  `pagina-calendario.js`) junto a `ui.js`, en lugar de un `ui.js` único. Un solo
  archivo pasaría de 1 000 líneas.

### 12.2 Abiertas

El código toma la opción provisional indicada y deja un comentario
`// DECISIÓN ABIERTA:` en el punto correspondiente.

- **Coordenadas de `plantilla-b1.js` y `FILAS_EGRESOS`.** *Bloquea la fase 5, no
  la 4.* Provisional: 17 filas y coordenadas estimadas de una foto en ángulo, con
  `estimado: true` y aviso visible. Se cierra midiendo la plantilla física con
  regla, o con un escaneo plano a 300 dpi.
- **Formato del código de barras del DNI peruano.** *Bloquea el parser, no el
  resto del padrón.* No se conoce con certeza la codificación del PDF417 y no se
  va a suponer. `parsearCadenaDni` queda como stub documentado hasta tener
  muestras reales anonimizadas, contra las que se escriben primero las pruebas.
- **`gastosConSubsidio = min(subsidio, total)`.** *No verificable por ahora.*
  Derivado de un único ejemplar en el que el total superaba al subsidio. Hace
  falta un ejemplar con total **menor** que el subsidio. Marcada como no
  confirmada en `calculos.js`.
- **Saldo de subsidio no gastado.** Sin confirmar, ligado al punto anterior.
  Provisional: advertencia en pantalla, nada impreso.
- **El paso quincenal son 15 días corridos**, no «dos veces al mes en días fijos».
  Con base el 30 de setiembre, la serie da 15-10, 30-10, 14-11… y se desplaza. Si
  la Municipalidad usa días fijos (p. ej. 15 y último de cada mes), hay que
  cambiar `avanzarPeriodo`. Se cierra preguntando en la Subgerencia.
- **¿Pide el PCA los mismos tramos que el MINSA?** Los cuatro grupos siguen la
  norma del MINSA, que es la referencia oficial de etapas de vida, pero no está
  confirmado que la Subgerencia use esos mismos cortes en sus padrones. Si usa
  otros, cambian las fronteras de `TRAMOS_ETARIOS` y nada más.
- **El formato de padrón de la Municipalidad.** El reporte actual lleva los campos
  que suelen pedir estos formatos (N.º, apellidos, nombres, documento, grupo
  etario, edad, tipo, días asistidos), pero **no está calcado de ningún formato
  real**, porque todavía no hay uno a la vista. Cuando llegue, se mapean columnas:
  el modelo ya tiene los datos.
- **Quien come sin estar inscrito no tiene dónde anotarse.** Al contar las
  raciones de la asistencia, un visitante no registrado no suma. Si eso pasa en la
  práctica, hace falta decidir si se inscribe a esa persona o si se agrega una
  cuenta aparte de raciones no nominales.
- **`umbralVariacionPct` por defecto: 40 %.** Número puesto a ojo. Se cierra con
  histórico real, en la fase 6.

## 13. Cómo trabajar en este repositorio (modo plan automático)

Este proyecto se desarrolla con el modo de plan automático de Claude Code. El
agente entra en modo plan por su cuenta antes de tocar archivos; estas reglas
definen qué debe contener ese plan y cuándo puede salir de él.

### Antes de escribir código

Todo plan que se presente para aprobación debe decir, de forma explícita:

1. **Qué archivos** crea o modifica, uno por uno. Sin "y archivos relacionados".
2. **Qué fase** de §1 corresponde. Trabajo de una fase posterior mientras la
   anterior no cumple sus criterios de aceptación: se señala y se pregunta.
3. **Qué sección de este AGENTS.md** justifica cada cambio. Si un cambio no tiene
   respaldo aquí, el plan lo marca como ampliación de alcance y pregunta antes de
   incluirlo.
4. **Si toca cálculo o validación**, los casos de prueba que se agregan a
   `pruebas.html`, con sus valores esperados.
5. **Si toca superposición**, qué coordenadas de `plantilla-b1.js` cambia, y que
   `estimado` sigue en `true` mientras no haya plantilla medida.
   Si toca el modelo guardado, **qué migración escribe** y cómo la prueba.
6. **Si toca sugerencias o escaneo**, cómo cumple las cuatro reglas de §2 y, para
   el escaneo, las cuatro condiciones de §7.1.
7. **Qué queda fuera** de ese plan y por qué.

### Cuándo detenerse y preguntar en vez de decidir

- Cualquier cosa que implique que la app escriba un **dato** que la usuaria no
  escribió ni transcribió, o que aplique una sugerencia sin gesto explícito.
  (Estimar **coordenadas** no entra aquí: eso está autorizado, §2.)
- Cualquier dependencia, CDN, fuente remota o llamada de red, incluida cualquier
  librería de códigos de barras.
- Cualquier cambio en las fórmulas de §6 o en la severidad de una regla de §5.
- Cualquier intento de escribir el parser del DNI sin muestras reales.
- Cualquier impresión real antes de tener la plantilla medida.
- Cualquier campo nuevo de datos personales, sobre todo en el padrón, y cualquier
  uso de la asistencia que vaya más allá de contar días (rankings, puntuaciones,
  sugerencias de baja).
- Cualquier ítem de §10 (fuera de alcance).
- Cualquier decisión de §12.2 que el trabajo obligue a cerrar.

En estos casos el plan **no** propone una opción y sigue: se detiene y pregunta.

### Qué no requiere plan largo

Correcciones de estilo CSS de pantalla, textos de ayuda, ajustes de accesibilidad,
renombrado interno de variables y adición de casos de prueba: se hacen directo,
sin ceremonia.

### Al terminar una tarea

- Correr `pruebas.html` y reportar el resultado real, aunque falle.
- Nombrar explícitamente lo que quedó sin hacer.
- No dar por verificado lo que no se verificó: si la disposición no se comparó
  contra la plantilla física, se dice.
- No modificar este archivo como efecto secundario de otra tarea. Cambiar la
  especificación es una tarea propia, con su propia aprobación.
