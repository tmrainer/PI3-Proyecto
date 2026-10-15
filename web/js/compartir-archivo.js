// compartir-archivo.js — entregar un archivo que arma la app (PDF del B-1,
// copia de los datos): el menú «Compartir» del teléfono o, si no hay, una
// descarga.
//
// En el APK, el WebView no tiene navigator.share y una descarga no llega a
// ninguna parte: se usa el complemento propio «CompartirArchivo» (mobile/,
// CompartirArchivoPlugin.java), que abre el menú de Android con WhatsApp,
// Drive, Gmail… En el navegador del celular, navigator.share; en la
// computadora, la descarga de siempre. Nada sale del teléfono hasta que la
// persona elige a dónde mandarlo.

function complemento() {
  const C = window.Capacitor;
  return C && C.isPluginAvailable && C.isPluginAvailable('CompartirArchivo') ? C.Plugins.CompartirArchivo : null;
}

function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function descargar(nombre, tipo, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * ¿Se puede mandar directo a WhatsApp? Solo en el APK y si está instalado.
 * @returns {Promise<?string>}  el paquete de WhatsApp, o null
 */
export async function paqueteWhatsapp() {
  const c = complemento();
  if (!c) return null;
  try { return (await c.whatsapp()).paquete || null; } catch (e) { return null; }
}

/**
 * @param {{nombre: string, tipo: string, bytes: Uint8Array, titulo: string, app?: ?string}} archivo
 *   app: un paquete de Android (p. ej. el de paqueteWhatsapp()) para ir directo a esa app
 * @returns {Promise<'compartido'|'descargado'|'cancelado'>}
 */
export async function compartirArchivo({ nombre, tipo, bytes, titulo, app = null }) {
  const c = complemento();
  if (c) {
    await c.compartir({ nombre, tipo, titulo, base64: aBase64(bytes), app });
    return 'compartido';
  }
  if (typeof File !== 'undefined' && navigator.canShare && matchMedia('(pointer: coarse)').matches) {
    const archivo = new File([bytes], nombre, { type: tipo });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: titulo });
        return 'compartido';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelado';
      }
    }
  }
  descargar(nombre, tipo, bytes);
  return 'descargado';
}
