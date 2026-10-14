# Arquitectura

Aplicación estática: HTML + módulos ES, sin servidor ni compilación. Todos los
datos viven en el `localStorage` del navegador, en el dispositivo de la usuaria.
Las páginas no se llaman entre sí: **se comunican solo a través de lo guardado**.

Las referencias `archivo:línea` corresponden al estado del código en el momento
de escribir este documento.

La app está en `web/` y las rutas de este documento (`js/…`, `sw.js`, las
páginas) son relativas a esa carpeta. El APK está en `mobile/` y las pruebas
de interfaz en `herramientas/`.

---

## a) Modelo de datos

Claves de almacenamiento (`js/modelo.js:4-11`):

| Clave               | Contenido                                       | Constructor                    |
|---------------------|-------------------------------------------------|--------------------------------|
| `b1.padron.v1`      | `{ version: 3, afiliados[], atenciones[] }`     | `padronVacio()` `modelo.js:249` |
| `b1.config.v1`      | precios vigentes del menú, calibración          | `configVacia()` `modelo.js:267` |
| `b1.calendario.v1`  | periodicidad y fechas de entrega                | `calendarioVacio()` `modelo.js:253` |
| `b1.rendiciones.v1` | lista de Formatos B-1                           | `nuevaRendicion()` `modelo.js:174` |
| `b1.insumos.v1`     | reservada para el catálogo de insumos (fase 6); hoy **sin uso** | —                |
| `b1.respaldo.v1`    | `{ ultimoEn }`: fecha del último respaldo exportado, para el recordatorio | `exportarTodo()` `ui.js:814` |

Si una clave no se puede leer, `leer()` copia lo ilegible a `<clave>.respaldo` y
arranca vacío (`modelo.js:502-525`).

**Afiliado** (`nuevoAfiliado()`, `modelo.js:197-217`): `id`, `apellidoPaterno`,
`apellidoMaterno`, `nombres`, `tipoDocumento` (`dni`|`ce`), `numeroDocumento`,
`fechaNacimiento` (opcional), `grupoEtarioManual` (solo si no hay fecha de
nacimiento), `sexo`, `tipoAfiliado` (`habitual`|`caso_social`), `activo`,
`altaEn`, `bajaEn`, `origenDato`.

**Atención** = un día de comedor (`nuevaAtencion()`, `modelo.js:236-247`):
`id`, `fecha`, `asistencias`, `precioMenuNormalCent`,
`precioMenuAyudaSocialCent` (copiados de la config al crear el día),
`precioTomadoDeConfig`, `legado`, `nota`.

**Asistencia** = un elemento de `atencion.asistencias`:
`{ afiliadoId, tipoMenu: 'normal' | 'ayuda_social' }` (`modelo.js:240`).
Esa es la forma en memoria, en los cálculos y en los respaldos. En
`localStorage` se guarda en **casillas** (`empacarPadron()`, `modelo.js:422`):
cada día lleva `marcas: { vino, social, fuera }`, donde `vino` y `social` tienen
una casilla por persona en el orden de `padron.afiliados` de la MISMA clave
guardada (6 por carácter; 300 personas = 50 caracteres) y `fuera` guarda tal
cual las marcas de quien ya no está en el padrón. Un año de 300 personas ocupa
~9 % del espacio. Al leer, `asistencias` vuelve en el orden del padrón, no en
el de los toques. `leer()` y `guardar()` traducen solos; `leer()` entiende los
formatos anteriores, y `guardar()` no escribe si el texto no cambió.
`usoAlmacenamiento()` (`modelo.js:491`) mide lo que ocupa la app; desde el 70 %
se avisa.

Las **raciones no se guardan**: se cuentan de `asistencias`
(`desgloseDelDia()`, `calculos.js:247-258`). La excepción son los días migrados
desde la v2, que conservan sus cifras escritas a mano en `legado`
(`migrarPadron()`, `modelo.js:288-332`).

La **edad y el grupo etario no se guardan** cuando hay fecha de nacimiento: se
calculan cada vez con `grupoEtario(afiliado, fechaRef)` (`calculos.js:133-139`).

Todo monto es un entero de céntimos (`modelo.js:51`).

---

## b) Quién escribe y quién lee

En memoria, cada página comparte un único objeto `estado`
(`js/estado.js:14-18`), cargado desde `localStorage` por `cargar()`
(`estado.js:20-29`).

### `atencion.asistencias`

**Escriben** (solo `js/ui-asistencia.js`):

| Acción                         | Dónde                         | Operación |
|--------------------------------|-------------------------------|-----------|
| Tocar el nombre de una persona | `filaToque()`, L80-84         | `push({ afiliadoId, tipoMenu })` o `filter()` para quitarla; pone `legado = null` |
| Cambiar su menú ese día        | `filaToque()`, L98            | muta `reg.tipoMenu` |
| «Marcar a todos» (días pasados)| `fichaAtencion()`, L264-272   | reemplaza el arreglo entero con `asistenciasConTodos()` (`calculos.js:215-220`), o lo vacía |
| «Marcar a todos» (hoy)         | `pintarAsistenciaDeHoy()`, L535-542 | igual |

**Leen**: todo pasa por `asistenciasDelDia(at)` (`calculos.js:191-193`), que
devuelve `[]` si el campo falta. La usan `asistio()`, `menuDe()`,
`desgloseDelDia()`, `asistenciasConTodos()`, `asistenciaPorAfiliado()` (`calculos.js:202-384`) y
`validarAtencion()` (`validaciones.js:387`).

**Lo que falta no es un error.** Cada hallazgo lleva `falta: true` cuando el
dato todavía no se escribió (`h()` en `validaciones.js`, por el texto: empieza
con «Falta…», «Compra N: falta…» o «No hay ningún…»). `pintarPanel()` los
cuenta aparte y en verde, «Faltan 12 datos», en vez de «12 errores» en rojo en
un formulario recién abierto. Sin hallazgos, el panel no se muestra.

**DNI sin el 0 de adelante.** Excel guarda `01234567` como el número
`1234567`. `prepararImportacion()` completa con ceros adelante los DNI de 5 a 7
cifras (marca `ceroAgregado`, lo cuenta en `resumen.conCero` y lo dice en la
fila). Es la única corrección que hace la importación; un DNI de otro largo no
se toca y queda incompleto. Así también se reconoce a quien ya estaba con el 0.

**B-1 por meses.** `rendiciones[0]` es el B-1 en curso y los demás son los de
meses anteriores, del más nuevo al más viejo (`pagina-b1.js`). «Empezar el B-1
del mes siguiente» agrega uno vacío adelante (solo copia cada cuánto se
entrega: el centro lo vuelve a proponer la sugerencia del encabezado). Uno
anterior se abre con `formato-b1.html?ver=<id>`; editarlo no cambia las
sugerencias (`config.ultimoCentro` sale solo del B-1 en curso). Entregas muestra
cómo va el B-1 en curso (`pintarEstadoB1()` en `pagina-calendario.js`).

**Quien come sin estar inscrito.** `atencion.sinInscribir = { normal,
ayudaSocial }` (opcional) se suma en `desgloseDelDia()` a las raciones, la
recaudación y el promedio; `sinInscribirDelDia()` lo lee. Se cuenta con los
botones −/+ de «Comieron sin estar en el padrón», hoy y en los días anteriores.

**Instalar** (`ui.js`, desde `montarCabecera()`). Si el navegador dispara
`beforeinstallprompt` (Chrome y Edge), la app ofrece su propio botón «Instalar»
arriba; «Ahora no» lo posterga 14 días.

**Dónde está cada cosa.** Separado por para qué sirve:

| Para qué | Dónde |
| --- | --- |
| El trabajo del día | La barra de abajo: Asistencia, Padrón, B-1, Entregas (y los atajos del Inicio) |
| Configurar ese trabajo | En su página, debajo de lo que se usa a diario: precio del menú (Asistencia), cada cuánto se entrega (Entregas, debajo de las próximas entregas), centro de atención (B-1, paso 1) |
| Reportes | En su página, después de lo que se configura: resumen por fechas (Asistencia), reporte para el padrón (Padrón), el B-1 |
| Traer y llevar datos | Tus datos: copia, pasar a otro teléfono por QR, traer un padrón de Excel (lleva a Padrón, donde se revisa), borrar todo. Atajo en Asistencia para juntar la lista de hoy |
| Cómo se ve la app y quién la usa | Ajustes |
| Ayuda | «¿Cómo se usa?», en el menú ⋮ de todas las páginas y en «Más» del Inicio (no en Ajustes: no es un ajuste) |

Tus datos, Ajustes y «¿Cómo se usa?» están en el menú ⋮ de todas las páginas y
en «Más», al pie del Inicio. Las secciones de cada página van en ese orden
(trabajo, configurar, reportes, traer datos); `humo.mjs` lo comprueba.

Criterios (de guías publicadas, no de gusto):
- La barra de abajo, solo destinos principales y entre 3 y 5 (Material 3:
  *navigation bar*); lo poco usado, en el menú ⋮ (Android: *overflow* para lo
  que no se necesita «pronto ni seguido»).
- Lo escondido en un menú se encuentra menos (NN/g, menús ocultos): por eso
  Tus datos, Ajustes y la ayuda también se ven, sin abrir nada, en el Inicio.
- Jerarquía plana, un solo nivel, y ayuda desde cualquier pantalla (guías
  SARAL para personas con poca lectura: G7 y G8).
- Una pantalla con varias entradas antes que el mismo control repetido en
  varios lugares; lo más usado arriba; lo que borra, aparte (guía de ajustes
  de Android).
- La acción va junto a lo que afecta: pasar la lista de hoy por QR, en la
  lista de hoy; inscribir con el DNI, en Inscribir.

**Tus datos** (`datos.html`, `pagina-datos.js`; desde el menú ⋮, el Inicio y
Ajustes). Todo lo que toca a los datos, separado de los ajustes, con las
acciones primero: la copia (guardar, con contraseña, recuperar, fecha de la
última) y qué va y qué no en ella; pasar a otro teléfono; traer un padrón de
Excel; «Dónde se guardan» (`lugaresDeLosDatos()` en `ui.js`: en el teléfono; en
el APK, también la copia de seguridad de Google del teléfono, porque
`allowBackup` sigue en `true` y se dice; en las copias que guarda la persona)
y, al final, «Borrar todo». `ajustes.html#copia` redirige aquí.

**Ajustes** (`ajustes.html`, `pagina-ajustes.js`; se llega desde el menú ⋮ y
desde el Inicio). Al final, un paso a Tus datos para quien busque ahí la copia,
y en «Acerca de», el enlace del equipo a `probar-dni.html`.
Lo que es del teléfono: quién lo usa, el modo
(automático, claro u oscuro), el tamaño de letra (normal 16 px, grande 18,
muy grande 20; todo el CSS va en rem), el botón 🔊 en la cabecera y la
velocidad de la voz. `js/preferencias.js` es un script
clásico en el `<head>` que aplica modo, letra y 🔊 antes del primer cuadro
(`data-tema` y clases en `<html>`); Ajustes vuelve a llamar a
`window.aplicarPreferencias()` tras cada cambio. Son preferencias del equipo
(`localStorage`, claves `pi3.tema`, `pi3.letra`, `pi3.voz.boton`,
`pi3.voz.velocidad`): no son datos de la olla y no van en los respaldos. El
`pi3.letraGrande` de antes se sigue leyendo.

**Diseño de app** (aprobado sobre una maqueta, probado en un Moto G77).
`index.html` es el **Inicio**: el día de un vistazo y botones por tarea; la
asistencia está en `asistencia.html`. `montarCabecera()` arma el menú de abajo
(ícono y palabra), la flecha para volver y el menú ⋮ (leer la pantalla en voz
alta con `speechSynthesis`, ¿cómo se usa?, Ajustes). El menú de abajo, la flecha
y el ⋮ vienen escritos en el HTML de cada página (así no parpadean en la
transición); `montarCabecera()` solo les agrega el comportamiento. En la
computadora y la tablet la app se ve igual que en el teléfono: el mismo menú
de abajo y una sola columna de 720 px como máximo. En `ui.js`
también: `avisoAbajo()` (aviso con «Deshacer», en vez de `confirm()`),
`avatarPersona()` (iniciales del color del grupo de edad) y
`mostrarBienvenida()` (primer uso). El B-1 va por pasos (`irAPaso()` en
`pagina-b1.js`; cada sección lleva `data-paso`) y Entregas abre con la cuenta
regresiva. Preferencias del equipo, fuera de los respaldos: las de Ajustes,
`pi3.bienvenidaVista`, `pi3.instalar.postergadoHasta`.

**Sistema visual** (`estilos.css`). Colores con nombre de uso (`--fondo`,
`--superficie`, `--superficie-2`, `--seleccion`, `--titulo`, `--acento`,
`--acento-texto`, `--marca`, `--contorno` y los de estado); el modo oscuro solo
redefine esos valores, bajo `prefers-color-scheme: dark` (si no se eligió
«Claro») y bajo `[data-tema="oscuro"]`. Espacios `--e1`…`--e6`
(4–32 px), esquinas `--r-s/m/l` (8/12/16) y redondeadas, sombras `--sombra-1/2`.
Una sola capa: secciones sobre el fondo y una superficie por lista (filas
separadas por una línea), sin rayas de color al costado. Entre páginas,
transición de vista (`@view-transition`) con la cabecera y el menú quietos; los
módulos de cada página cargan en el `<head>` con `blocking="render"` (fuera
del `<head>` no vale), para que se pinte de una vez y la transición capture la
página completa. En el APK: barra de estado con
íconos claros (`SystemBars`), pantalla de inicio de Android 12+
(`res/values-v31/styles.xml`: la figura del ícono y, abajo, el logo de UTEC
sin texto), ícono temático de Android 13 (`ic_launcher_monochrome`) y permiso
de vibración. Letra: Atkinson Hyperlegible Next en `fuentes/` (licencia en
`fuentes/OFL.txt`), precargada en cada página. Pantallas vacías con
`estadoVacio()` (`ui.js`): dibujo, qué es el lugar y un solo botón.

Teléfonos modestos (medido en un moto g77 con 300 personas y un año de días):
las filas de las listas largas llevan `content-visibility: auto` y solo se
dibujan las que están a la vista (por eso `.cabecera` tiene `z-index`: el menú
de abajo vive dentro y si no las filas se pintaban encima). La lista de hoy
se ordena una vez (`ORDEN_NOMBRES`, un `Intl.Collator`) y buscar o «ver los que
faltan» solo ocultan filas; se busca sin tildes y por DNI, como en el Padrón.
Los días pasados arman su contenido al abrirlos. Revisar todos los días va
600 ms después del último toque, y el guardado de arranque (`guardarYa()`)
cuando el teléfono queda libre. En el APK, el fondo de la ventana y del
WebView es el de la app (`res/values*/fondo.xml`, `MainActivity`), sin el
cuadro negro entre la pantalla de inicio y la primera pantalla.

**Perfil de quien usa el teléfono** (`perfil.js`, clave `pi3.perfil`, no va en
las copias): nombre, rol (presidenta, tesorera o apoyo) y, opcional, DNI y
celular. Se llena en Ajustes («Quién usa este teléfono»); el Inicio lo
sugiere una vez («Ahora no» lo descarta). El B-1 lo usa como otra fuente de
`sugerencias.js` (`sugerenciasPerfil`: se propone, no se aplica solo) y la
inscripción con DNI escribe ese nombre en «quién revisó».

**Pasar datos a otro teléfono por QR** (`compartir-qr.js` puro, `ui-compartir.js`,
`camara-qr.js`). Desde Tus datos se envía el padrón (sin notas; con el tipo,
habitual o caso social), la asistencia de los días que se marquen (cada marca con
su menú, normal o ayuda social; los precios del día y, si hay, cuántos comieron
sin estar en el padrón, por menú: esa cuenta no se suma a la de aquí, se elige
una, porque pueden ser las mismas personas) o las entregas (configuración y lo anotado de cada
una); desde Asistencia, la lista de hoy. El JSON va comprimido (deflate de
`CompressionStream`) y en base45, en modo alfanumérico del QR; cada código
lleva tipo, id del envío y parte/total, y si son varios se pasan a mano
(«Siguiente», cuando el otro teléfono vibró). Los QR de antes (`lista-qr.js`, solo cifras) se siguen
leyendo. **Quien recibe nunca guarda a ciegas:** `comparar*()` muestra qué se
agrega, qué ya estaba, qué queda solo aquí y qué no coincide; lo que no
coincide se queda como aquí salvo que se elija lo recibido (o que aquí esté
vacío). Se marcan aparte los posibles cruces: mismo DNI con otro nombre, y
mismo nombre con otro DNI (esa no se agrega sola). Las personas se emparejan
por documento; la asistencia de alguien que no está en el padrón de aquí no
se suma. `aplicar*()` devuelve objetos nuevos; se guarda en `localStorage` y
se puede deshacer. El QR lo dibuja `vendor/qrcode-generator.js`, la única
librería (MIT, autorizada; ver AGENTS.md §3), y se carga solo al mostrar uno.

**Lector de DNI (en fase de muestras).** `escaneo-dni.js` (puro) lee la zona
de lectura mecánica TD1 con sus dígitos de control y, sin verificar, el PDF417
del DNI azul. `camara-dni.js` abre la cámara y busca a la vez el PDF417
(`BarcodeDetector`, del navegador) y, en el APK, la MRZ (complemento nativo
`LectorTexto`, ML Kit). `probar-dni.html` es solo para el equipo: muestra lo
leído y copia una plantilla anónima. La inscripción lee el DNI «en prueba»
(solo APK, `montarLecturaDni()` en `ui-personas.js`): reverso y anverso, sin
el PDF417; llena el formulario, marca qué revisar, ofrece las dos opciones si
hay una letra dudosa y no inscribe sin «quién revisó» (`verificadoPor`,
`origenDato: 'escaneo_dni'`, más el sexo). Faltan muestras del DNI azul
(AGENTS.md §7.5). Asistencia sí: «Pasar
lista leyendo el DNI» (solo en el APK) abre la cámara en modo continuo
(`modo: 'asistencia'`), lee solo el reverso y marca a quien tenga ese número
en el padrón; usa solo el número, que lleva dígito de control y se exige igual
en dos lecturas.

**App Android y avisos con la app cerrada.** `mobile/` empaqueta la app
web con Capacitor (ver su `LEEME.md`); `copiar-web.mjs` copia los archivos de
`ARCHIVOS` de `sw.js`. Dentro del APK, `js/avisos-nativos.js` le pasa a Android
los avisos que calcula `programaDeAvisos()` (`alertas.js`, pura): uno por cada
día de anticipación y uno el mismo día, a las 9:00, sin las entregas ya
marcadas. Se reprograman al abrir cualquier página (`montarCabecera()`) y al
guardar Entregas. En el navegador el módulo no hace nada, y `montarCabecera()`
no registra el service worker ni ofrece instalar cuando corre en el APK.

**Validar sin recorrer todos contra todos.** `indicePadron()`
(`validaciones.js:258`) arma una vez por pasada mapas por id, documento,
nombre y fecha; `validarAfiliados()` y `validarAtenciones()` lo reciben y cada
página valida solo lo suyo. Antes, con 300 personas y un año, cada toque
tardaba segundos en un celular modesto; `humo.mjs` (6c) lo vigila.

En el **reporte del padrón**, la lectura es:
`pintarReportePadron()` → `asistenciaPorAfiliado(estado.padron, ctx.inicio, ctx.fin)`
(`ui-reportes.js:17-18`) → `atencionesDelPeriodo()` + `asistenciasDelDia(at)`
(`calculos.js:374-375`). Lo mismo hace `filasComoTexto()` para exportar
(`ui-reportes.js:83-84`).

### `padron.atenciones`

- **Escriben**: `asegurarHoyGuardado()` agrega el día de hoy recién cuando se
  marca a la primera persona (`ui-asistencia.js:344-349`, llamada en L371 y
  L441); el botón «agregar día» (`pagina-asistencia.js:119-121`); la migración
  (`modelo.js:301-330`).
- **Leen**: `atencionesDelPeriodo()` (`calculos.js:174-178`), `pintarOtrosDias()`
  (`ui-asistencia.js:321`), `pintarAsistenciaDeHoy()` (`ui-asistencia.js:360`).

### `padron.afiliados`

- **Escriben**: el alta y la edición (`js/ui-personas.js`), la importación de
  Excel/CSV (`js/importar.js`, `js/ui-importar.js`), la migración.
- **Leen**: `afiliadosActivos()` y `activoEn()` (`calculos.js:79-90`), que es la puerta de
  entrada de la lista de asistencia, del padrón y del reporte.

### Persistencia

| Quién                     | Qué guarda                                | Dónde |
|---------------------------|-------------------------------------------|-------|
| `guardarPronto()`         | `padron` y `config`, 400 ms después (debounce); marca que hay algo pendiente | `estado.js:37-64` |
| `guardarYa()`             | `padron` y `config`, de inmediato; devuelve si se pudo | `estado.js:76` |
| `vigilarPestanas()`       | lo pendiente, al ocultarse o cerrarse la página | `estado.js:103-118` |
| `pagina-calendario.js`    | `calendario` (no usa `estado.js`), 400 ms después; lo pendiente, al ocultarse | L22 |
| `pagina-b1.js`            | `rendiciones`, y de `config` solo `ultimoCentro`: relee lo guardado antes de escribir. También escribe lo pendiente al ocultarse | L30-65 |
| Restaurar un respaldo     | revisa qué trae (`revisarRespaldo()`, `modelo.js:576`), escribe **todas** las partes que trae (`restaurarRespaldo()`, `modelo.js:626`), descarta lo pendiente de la página y recarga. Igual desde cualquier página | `barraDatos()` `ui.js:658` |
| Fallo al guardar          | `guardar()` devuelve false; la página muestra «NO SE GUARDÓ» y un aviso con «Exportar respaldo» | `mostrarGuardado()` `ui.js:1064` |

**Varias pestañas.** Las páginas que usan `estado.js` (asistencia y padrón)
llaman a `vigilarPestanas()` al arrancar (`pagina-asistencia.js:129`,
`pagina-padron.js:106`). Cuando otra pestaña guarda el padrón, la config o el
calendario, el evento `storage` las recarga y repinta; así no guardan después
su copia vieja encima. El repintado pasa por `repintarConservandoVista()`
(`ui.js:1152-1182`), que vuelve a abrir las fichas abiertas y devuelve el foco y
el cursor. El B-1 relee la config justo antes de guardarla, y si otra pestaña
guarda la rendición, se recarga entera (`pagina-b1.js:71-75`). Límite: si dos
pestañas cambian algo dentro de los mismos 400 ms, gana la que guardó la otra.
Lo comprueba `herramientas/humo.mjs`.

**Sin internet.** `sw.js` es un service worker propio: guarda una copia
completa de los archivos de la aplicación (HTML, CSS, JS, íconos) en el Cache
Storage y la sirve siempre desde ahí, con o sin señal. Las novedades se
revalidan aparte (ETag, cada 30 min como mucho) y solo si llegaron todas se
arma una copia nueva y se reemplaza la vieja de una vez: nunca se mezcla un
HTML nuevo con un JS viejo. La página avisa «Hay una versión nueva». Los datos
no pasan por él: siguen en `localStorage`. Lo registra `montarCabecera()` (`ui.js:427`), que también pide
`navigator.storage.persist()` (`ui.js:522`) para que el navegador no borre los
datos por su cuenta (Safari los borra tras 7 días sin abrir el sitio, salvo que
la app esté instalada). Al agregar un archivo a la app hay que sumarlo a
`ARCHIVOS` en `sw.js`, o no abrirá sin conexión.

**Recordatorio de respaldo.** Con datos y sin respaldo en 14 días, una franja
arriba lo pide (`ui.js:1122`). `exportarTodo()` (`ui.js:814`) abre el menú del
sistema para guardarlo en un celular y lo descarga en la computadora.

---

## c) Flujo: de la asistencia al reporte exportado

```
asistencia.html (pagina-asistencia.js)
  pintarAsistenciaDeHoy()            ui-asistencia.js:351
    busca la atención de hoy o crea una nueva sin guardarla   L306-310
    filaToque() por persona activa                            L414
      clic → at.asistencias.push / filter                     L66-73
      alCambiar() → asegurarHoyGuardado()                     L372-373
      ctx.onCambio() → guardarPronto()                        pagina-asistencia.js:27
        ↓ 400 ms (o antes, si la página se oculta)
  guardar('b1.padron.v1', estado.padron)  (compacta)         estado.js:42
        ↓
  localStorage
        ↓  (otra página, otra carga)
padron.html (pagina-padron.js)
  cargar()                                                    estado.js:20
  refrescar() → pintarReportePadron(caja, ctx)                pagina-padron.js:54
    filasPadron(padron, ctx.fechaRef)       activos + edad + grupo    ui-reportes.js:16
    asistenciaPorAfiliado(padron, ctx.inicio, ctx.fin)  días asistidos  ui-reportes.js:18
    afiliadosSinAsistencia(padron, ctx.inicio, ctx.fin, ctx.fechaRef) ui-reportes.js:71
        ↓
  «Descargar CSV»  → filasComoTexto(ctx, ',')  → descargarTexto()   ui-reportes.js:118
  «Copiar»         → filasComoTexto(ctx, '\t') → portapapeles       ui-reportes.js:122-124
```

Dos detalles que conviene saber:

- La asistencia y el reporte usan **dos rangos distintos**: las filas son los
  activos a `ctx.fechaRef`, y los días asistidos se cuentan entre `ctx.inicio`
  y `ctx.fin` (por defecto, el mes en curso: `periodoPorDefecto()`,
  `estado.js:129-132`).
- La lista de «personas sin ninguna asistencia» toma las activas a
  `ctx.fechaRef`, igual que la tabla (`ui-reportes.js:71`): son exactamente las
  filas con 0 días. Fuera del reporte, `afiliadosSinAsistencia()` sigue mirando
  las activas al cierre del periodo si no se le pasa la fecha
  (`calculos.js:393-397`).

---

## d) Fecha de referencia para la edad y el grupo etario

| Pantalla | Fecha usada | Dónde |
|----------|-------------|-------|
| Asistencia (hoy y días pasados) | la fecha del día de atención, `at.fecha`; si falta, `ctx.fechaRef` = hoy | `ui-asistencia.js:26`, `pagina-asistencia.js:25` |
| Padrón: lista de personas | `ctx.fechaRef`, editable en el campo `#fechaRef`; por defecto hoy | `ui-personas.js:256-257`, `pagina-padron.js:30`, L78-80 |
| Padrón: resumen por grupos | `ctx.fechaRef` | `ui-personas.js:365` |
| Padrón: reporte y CSV | `ctx.fechaRef` (no el periodo `inicio`/`fin`) | `ui-reportes.js:16`, L81 → `calculos.js:422-432` |
| Alta de afiliados | hoy (`hoyIso()`), tanto en la pista como en la validación | `ui-personas.js:39`, L73; `validaciones.js:317` |
| Importación | **ninguna**. Con fecha de nacimiento, se guarda la fecha y el grupo se calcula después en cada pantalla. Con solo una columna «edad», el grupo se calcula con `grupoPorEdad(edad)` y se **guarda fijo** en `grupoEtarioManual`: no cambia cuando la persona cumple años. La revisión de la importación lo avisa en esa fila | `importar.js:259-272`, `calculos.js:122-126` |

Si no se pasa una fecha válida, `grupoEtario()`, `afiliadosActivos()` y
`filasPadron()` usan hoy por defecto (`calculos.js:88`, L133, L403).

---

## e) Dependencias entre módulos

Capas, de abajo hacia arriba. Ningún módulo importa a uno de una capa superior.

```
modelo.js        forma de los datos, dinero, fechas, localStorage. Sin imports.
escaneo-dni.js   parser del DNI (stub). Sin imports.
xlsx.js          primera hoja de un .xlsx como texto con tabuladores. Sin imports.
   ↑
calculos.js      funciones puras                         ← modelo
alertas.js       fechas de entrega y avisos              ← modelo
avisos-nativos.js avisos del teléfono, solo en el APK    ← modelo, alertas
sugerencias.js                                            ← modelo
estado.js        estado en memoria + guardado            ← modelo
ui.js            DOM compartido: buscar, crearElemento   ← modelo, avisos-nativos
   ↑
validaciones.js                                           ← modelo, calculos
importar.js      lectura de Excel/CSV                    ← modelo, calculos
   ↑
ui-asistencia.js                                          ← modelo, calculos, estado, ui
ui-personas.js                                            ← modelo, calculos, validaciones, estado, ui
ui-reportes.js                                            ← modelo, calculos, importar, estado, ui
ui-importar.js                                            ← modelo, calculos, importar, xlsx, estado, ui
   ↑
pagina-inicio.js      (index.html)       ← modelo, calculos, alertas, ui
pagina-asistencia.js  (asistencia.html)  ← modelo, calculos, validaciones, alertas, estado, ui-asistencia, ui
pagina-padron.js      (padron.html)      ← modelo, validaciones, alertas, estado, ui-personas,
                                           ui-importar, ui-reportes, ui
pagina-b1.js          (formato-b1.html)  ← modelo, calculos, validaciones, sugerencias, alertas, ui
pagina-calendario.js  (calendario.html)  ← modelo, alertas, validaciones, ui
casos-prueba.js       (pruebas.html)     ← modelo, calculos, validaciones, alertas, importar,
                                           escaneo-dni, sugerencias
```

`pagina-b1.js` y `pagina-calendario.js` no usan `estado.js`: leen y guardan sus
claves directamente.

`sw.js` (raíz de `web/`) no importa nada: solo conoce la lista de archivos de la app.
`js/errores.js` es un script clásico, no un módulo, y carga antes que todos: si
un módulo falla, ninguno corre, y su aviso igual aparece.
`js/pagina-pruebas.js` pinta `pruebas.html` (fuera del HTML por la CSP).

`herramientas/humo.mjs` no es parte de la app: es la prueba de humo que abre
las páginas en un Chromium sin ventana (ver README, «Pruebas»).

---

## f) Pendiente / no implementado

- **Lector del código de barras PDF417 del DNI.** `js/escaneo-dni.js` es un stub
  deliberado (L4): devuelve todo vacío. Mientras no funcione, la interfaz no lo
  menciona (antes una sección entera explicaba que no estaba disponible). Falta
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
- **Fórmula de «gastos con el subsidio»** sin verificar. La RM D000064-2026-MIDIS
  (12-03-2026) dice que el subsidio es «exclusivamente» para comprar alimentos y
  que la rendición va a la municipalidad, pero no publica el formato: el B-1 y
  sus totales los define la Municipalidad de Villa María del Triunfo. Hay que
  confirmarlo con su PCA (`calculos.js:17-28`).
