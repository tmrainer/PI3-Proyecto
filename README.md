# Rendición B-1 y padrón — Ollas comunes y comedores

Aplicación web para las dirigentes de ollas comunes y comedores del Programa de
Complementación Alimentaria (PCA) de la **Municipalidad Distrital de Villa María
del Triunfo**.

Ayuda a llenar y validar el **Formato B-1** (Balance de Centros de Atención
Subsidiados), a llevar el **padrón de personas afiliadas** con su asistencia
diaria, y a no perder de vista **cuándo toca la siguiente entrega**.

El formato tiene carácter de declaración jurada, así que la aplicación **calcula,
sugiere y valida, pero nunca rellena ni estima un dato por su cuenta**. Si un
campo está vacío, se queda vacío.

---

## Cómo ejecutarlo en local

Hace falta **un navegador y un servidor estático**. Nada más: no hay `npm install`,
ni compilación, ni base de datos, ni servidor de aplicación.

### Con Python (lo más probable que ya tengas)

```bash
git clone git@github.com:tmrainer/PI3-Proyecto.git
cd PI3-Proyecto
python3 -m http.server 8000
```

Abre **<http://localhost:8000>** en el navegador. `Ctrl-C` para detenerlo.

### Otras formas, si prefieres

```bash
npx serve .          # Node.js
php -S localhost:8000   # PHP
```

En VS Code también sirve la extensión **Live Server**: clic derecho sobre
`index.html` → *Open with Live Server*.

### No abras los archivos con doble clic

Abrir `index.html` directamente (`file:///…`) **no funciona**. La aplicación usa
módulos ES (`<script type="module">`), que el navegador bloquea por política de
mismo origen cuando la página viene de `file://`. La pantalla saldrá en blanco o a
medias.

Siempre a través de `http://localhost`, aunque el servidor sea tu propia máquina.

---

## Qué hay en cada página

| Página | Para qué |
|---|---|
| `index.html` | Formato B-1: centro, periodo, subsidio, compras y los tres totales |
| `padron.html` | Precio del menú, inscripción de personas, **asistencia de hoy**, carga de un padrón desde Excel o CSV, y reporte del padrón |
| `calendario.html` | Periodicidad de entrega y cuenta regresiva hasta la próxima |
| `pruebas.html` | 63 aserciones sobre los módulos de cálculo y validación |

Las pruebas se ejecutan **en el navegador**, sin instalar nada: abre
<http://localhost:8000/pruebas.html> y deben salir todas en verde.

### Pasar lista

«Asistencia de hoy» está siempre arriba del padrón y apunta a la fecha del día.
Se toca la fila de quien vino: las raciones se cuentan solas, no hay nada que
escribir. El menú de cada persona sale del tipo con el que se inscribió; si ese
día come otro, se toca la etiqueta de la derecha.

El día solo se guarda cuando se marca a la primera persona, así que abrir la
aplicación no crea días de atención vacíos.

### Cargar un padrón que ya existe

En `padron.html`, la sección **Cargar un padrón desde Excel o CSV** admite pegar
las filas o elegir un archivo. Hace falta la fila de títulos (`Apellido paterno`,
`Nombres`, `DNI`, `Grupo de edad`, `Tipo`…). Antes de guardar nada se muestra la
tabla de lo que entraría, con el motivo de cada omisión.

---

## Dónde se guardan los datos

Todo vive en el **`localStorage` del navegador**, en el dispositivo donde escribes.
No hay servidor: la aplicación funciona con el wifi apagado y no tiene a dónde
enviar nada.

Eso tiene dos consecuencias que conviene conocer:

- Los datos **se pierden** si borras los datos de navegación, si usas una ventana
  de incógnito, o si abres la aplicación en otro equipo o navegador.
- El `localStorage` es **por origen**. Lo guardado en `localhost:8000` no es lo
  mismo que lo guardado en la versión publicada en GitHub Pages: son dos almacenes
  distintos.

Por eso cada página tiene **Exportar respaldo** e **Importar respaldo**, que
descargan y leen un `.json` local. Es la única forma de mover datos entre
dispositivos o de recuperarlos después de un borrado.

Ese archivo contiene nombres, números de documento y el registro de qué días vino
cada persona. **No lo compartas por WhatsApp ni por correo sin cifrar.**

---

## Estructura

```
index.html  padron.html  calendario.html  pruebas.html
estilos.css

js/modelo.js            datos, dinero en céntimos, fechas, localStorage, migraciones
js/calculos.js          totales, grupo etario, raciones, asistencia      ← puro
js/validaciones.js      reglas de error y advertencia                    ← puro
js/alertas.js           fechas de entrega y cuenta regresiva             ← puro
js/sugerencias.js       propuestas a partir de datos ya ingresados       ← puro
js/escaneo-dni.js       lectura del código de barras del DNI (pendiente) ← puro
js/importar.js          lectura de un padrón pegado o en CSV             ← puro
js/casos-prueba.js      las aserciones de pruebas.html                   ← puro

js/ui.js                ayudas de DOM compartidas
js/pagina-b1.js         controlador de index.html
js/pagina-padron.js     controlador de padron.html
js/pagina-calendario.js controlador de calendario.html
```

Los módulos marcados **← puro** no tocan el DOM, no guardan estado y no hacen red:
reciben datos y devuelven números o listas. Por eso se pueden probar, y por eso no
pueden escribir solos en ningún campo del formulario.

---

## Publicar en GitHub Pages

En el repositorio: **Settings → Pages → Source: Deploy from a branch → `main` /
`(root)`**.

Queda en <https://tmrainer.github.io/PI3-Proyecto/>. Todas las rutas del proyecto
son relativas, así que funciona bajo ese subdirectorio sin cambiar nada.

---

## Restricciones técnicas

Son deliberadas, no una etapa provisional:

- **HTML, CSS y JavaScript puros.** Sin framework, sin bundler, sin CDN.
- **Cero dependencias** y **sin paso de build**: lo que está en el repositorio es
  lo que se publica.
- **Sin backend y sin red.** Ni `fetch`, ni peticiones a dominios externos.
- **`localStorage`** como único almacenamiento.

El motivo es el contexto de uso: conexión intermitente, sin presupuesto para
hosting ni mantenimiento, y datos de familias en situación de vulnerabilidad que
no deben salir del dispositivo.
