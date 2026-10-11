# Sistema de Asistencia

Aplicación web para las dirigentes de ollas comunes y comedores del Programa de
Complementación Alimentaria (PCA) de la Municipalidad Distrital de Villa María
del Triunfo.

---

## En línea

Ya está desplegada en GitHub Pages:

**<https://tmrainer.github.io/PI3-Proyecto/>**

No hace falta instalar nada: se abre en el navegador del celular o de la
computadora.

### Instalarla en el celular

Desde el navegador del celular: menú → **Instalar aplicación** (Android) o
**Compartir → Agregar a pantalla de inicio** (iPhone). Queda un ícono como el de
cualquier app, y desde entonces:

- **Abre sin internet.** La primera vez hace falta conexión; después, la app
  guarda sus archivos (`sw.js`) y abre al instante aunque no haya señal. Con
  señal, baja las novedades aparte y avisa «Hay una versión nueva».
- **No se borran los datos.** Safari borra lo guardado por un sitio que no se
  abre en 7 días si no está instalado en la pantalla de inicio.

Igual conviene exportar un respaldo cada cierto tiempo: la app lo recuerda a los
14 días.

---

## Levantarla en local

Hace falta un navegador y un servidor estático. No hay `npm install`, ni
compilación, ni base de datos.

```bash
git clone git@github.com:tmrainer/PI3-Proyecto.git
cd PI3-Proyecto
python3 -m http.server 8000
```

Abre **<http://localhost:8000>**. `Ctrl-C` para detenerlo.

### Otras formas

```bash
npx serve .             # Node.js
php -S localhost:8000   # PHP
```

En VS Code también sirve la extensión **Live Server**: clic derecho sobre
`index.html` → *Open with Live Server*.

### No abras los archivos con doble clic

Abrir `index.html` directamente (`file:///…`) **no funciona**. La aplicación
usa módulos ES, que el navegador bloquea por política de mismo origen cuando la
página viene de `file://`. La pantalla saldrá en blanco o a medias.

Siempre a través de `http://localhost`, aunque el servidor sea tu propia máquina.

### Ver tus cambios

La app se sirve desde la copia que guarda su *service worker* (`sw.js`), para
abrir sin internet. Al editar un archivo, la primera recarga todavía muestra la
copia anterior y aparece «Hay una versión nueva»: recarga otra vez, o pulsa
«Usar la versión nueva». En `localhost` se revisa en cada carga. Para saltarte
la copia mientras programas: DevTools → Application → Service workers →
*Update on reload*.

---

## Pruebas

- **Cálculos y validaciones**: abre `http://localhost:8000/pruebas.html`. Las
  aserciones corren en el navegador, sin instalar nada.
- **Prueba de humo de la interfaz**: con Node 22 o más y un Chromium,

  ```bash
  node herramientas/humo.mjs
  ```

  Abre las cinco páginas en un Chromium sin ventana, vacías y con un padrón
  ficticio, y falla si hay errores de consola. También comprueba que no se
  pierda lo último marcado al salir de la página, que dos pestañas abiertas
  no se pisen los datos, que en un celular la lista se vea al abrir, que la
  app abra con el servidor apagado y tome una versión nueva entera, que con el
  almacenamiento lleno avise en vez de decir «Guardado», que un respaldo con
  contraseña no se abra con otra y que la política de contenido (CSP) bloquee
  scripts inyectados. Usa un perfil temporal: no toca tus datos. Si no
  encuentra Chromium, indícale la ruta con `CHROME=/ruta/a/chrome`.

  GitHub la corre sola en cada push y en cada pull request
  (`.github/workflows/pruebas.yml`).

---

## Pendientes

### Hace falta datos para continuar

- [ ] **Medir la plantilla física del Formato B-1** con regla, o escanearla plana
      a 300 dpi. Sin eso no se puede imprimir sobre la hoja oficial.
- [ ] **Conseguir un ejemplar del B-1 donde el total sea menor que el subsidio**,
      para verificar la fórmula del renglón «gastos con el subsidio».
- [ ] **Conseguir el formato de padrón que pide la Municipalidad**, para mapear
      las columnas del reporte.
- [ ] **Averiguar el formato del código de barras (PDF417) del DNI**, con
      muestras reales, antes de escribir el lector.
      **PENDIENTE, aún no implementado**: el lector no existe todavía.
      `js/escaneo-dni.js` es solo un esqueleto que devuelve los campos vacíos, y
      la inscripción se hace a mano.

### Por preguntar

- [ ] ¿La entrega quincenal son 15 días corridos o días fijos (15 y fin de mes)?
- [ ] ¿El PCA usa los mismos tramos de edad que el MINSA (0-11 / 12-17 / 18-59 / 60+)?
- [ ] ¿Acepta una segunda hoja de continuación cuando hay más de 17 compras?
- [ ] ¿Qué se hace cuando queda saldo del subsidio sin gastar? El formato no tiene
      renglón para eso.

### Por construir

- [ ] **Vista previa de impresión**: ver los datos colocados sobre un lienzo A4,
      para corregir posiciones sin gastar hojas. No está bloqueada.
- [ ] **Impresión sobre la plantilla oficial** y página de calibración.
- [ ] **Histórico de precios de compra** por insumo, con aviso de desviación.
- [ ] **Consumo por origen de fondo**: el dato ya se captura, falta la pantalla.
- [ ] **Lector del código de barras del DNI** para inscribir sin teclear.
      **PENDIENTE, aún no implementado.**

### Por decidir

- [ ] **Quien come sin estar inscrito no tiene dónde anotarse.** Las raciones se
      cuentan de la asistencia, así que un visitante no registrado suma cero.
      ¿Se le inscribe, o hace falta una cuenta aparte?

### Probar con una usuaria real

- [ ] Nada de lo construido se ha usado en una olla común. Hace falta ver a una
      dirigente pasar lista, inscribir a alguien e importar su padrón.
