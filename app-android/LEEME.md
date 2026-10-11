# App Android (APK)

La misma aplicación web de la raíz del repositorio, empaquetada con
[Capacitor](https://capacitorjs.com) para instalarla como app. Lo único que
suma es **avisar de la próxima entrega aunque la app esté cerrada**: el teléfono
se programa los avisos a sí mismo, sin internet y sin servidor.

- El código de la app **no se duplica**: `copiar-web.mjs` copia a `www/` los
  archivos que lista `ARCHIVOS` en `../sw.js` (la misma lista que ya comprueba
  `herramientas/humo.mjs`).
- La app web sigue sin librerías. Capacitor y sus complementos (avisos y voz)
  viven solo aquí (`package.json`). Dentro del APK, la app los encuentra en
  `window.Capacitor`; ver `../js/avisos-nativos.js` y `decir()` en
  `../js/ui.js`. En el navegador no hacen nada.
- Leer en voz alta: el WebView de Android no trae `speechSynthesis`, así que en
  el APK la voz es la del teléfono, con `@capacitor-community/text-to-speech`.
- Los datos del APK **no son los de Chrome**: cada uno guarda por separado.
  Para pasarse: en Chrome, «Guardar una copia»; en el APK, «Recuperar una copia».

## Lo que hace falta

- Node 22 o más, y npm.
- Java 21 (`brew install openjdk@21`).
- El SDK de Android de línea de comandos en `~/Android/Sdk` (Android Studio no
  hace falta). Gradle baja solo la plataforma y las build-tools que pide.

```bash
export JAVA_HOME=/home/linuxbrew/.linuxbrew/opt/openjdk@21/libexec
export ANDROID_HOME=$HOME/Android/Sdk
```

## Armar el APK de prueba

```bash
cd app-android
npm install          # la primera vez
npm run apk          # copia la app web, sincroniza y compila
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Instalarlo en un teléfono conectado por USB (depuración USB activada):

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Cada cambio en la app web necesita `npm run apk` y volver a instalar: el APK
lleva su propia copia de los archivos.

## Versión final (firmada)

El APK de prueba está firmado con una clave de depuración que no sirve para
repartir. Para la versión final:

1. Crear la clave **una sola vez** y guardarla con respaldo, **fuera del
   repositorio**. Si se pierde, la app ya no se puede actualizar: habría que
   publicar otra y reinstalarla en cada teléfono.

   ```bash
   keytool -genkeypair -v -keystore ~/claves/asistencia.jks -alias asistencia \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Crear `app-android/firma.properties` (está en `.gitignore`):

   ```properties
   archivo=/home/<usuario>/claves/asistencia.jks
   clave=<contraseña del almacén>
   alias=asistencia
   claveAlias=<contraseña de la clave>
   ```

3. `cd android && ./gradlew assembleRelease` →
   `android/app/build/outputs/apk/release/app-release.apk`.

Antes de cada versión nueva, subir `versionCode` (y `versionName`) en
`android/app/build.gradle`: Android no instala encima una versión con el mismo
número.

## Íconos

`recursos/` tiene los SVG de los que salen el ícono, la pantalla de inicio y el
ícono blanco de la notificación. Para regenerarlos: `bash recursos/generar.sh`
(necesita ImageMagick 7).

## Permisos que pide

| Permiso | Para qué |
|---|---|
| Notificaciones | Los avisos de entrega. Se pide desde Entregas, con un botón |
| Alarmas y arranque | Que el aviso llegue a su hora y vuelva a programarse si se reinicia el teléfono |
| Internet | Lo exige el visor web de Android para abrir la app; la app no se conecta a nada |
