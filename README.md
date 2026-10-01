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
`asistencia.html` → *Open with Live Server*.

### No abras los archivos con doble clic

Abrir `asistencia.html` directamente (`file:///…`) **no funciona**. La aplicación
usa módulos ES, que el navegador bloquea por política de mismo origen cuando la
página viene de `file://`. La pantalla saldrá en blanco o a medias.

Siempre a través de `http://localhost`, aunque el servidor sea tu propia máquina.

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

### Por decidir

- [ ] **Quien come sin estar inscrito no tiene dónde anotarse.** Las raciones se
      cuentan de la asistencia, así que un visitante no registrado suma cero.
      ¿Se le inscribe, o hace falta una cuenta aparte?
- [ ] La raíz del sitio abre el Formato B-1, pero la tarea diaria es pasar lista.
      ¿Debería abrir `asistencia.html`?

### Probar con una usuaria real

- [ ] Nada de lo construido se ha usado en una olla común. Hace falta ver a una
      dirigente pasar lista, inscribir a alguien e importar su padrón.
