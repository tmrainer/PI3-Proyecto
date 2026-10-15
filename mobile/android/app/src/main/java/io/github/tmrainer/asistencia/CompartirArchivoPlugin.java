package io.github.tmrainer.asistencia;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Abre el menú «Compartir» de Android con un archivo que arma la app web (el
 * PDF del B-1, la copia de los datos). Dentro del WebView no existe
 * navigator.share, y una descarga no llega a ninguna parte.
 *
 * El archivo se escribe en la caché de la app (compartido/), que Android puede
 * borrar cuando quiera; solo vive para que la app elegida lo lea. Se comparte
 * con FileProvider (res/xml/file_paths.xml, «cache-path») y permiso de lectura
 * solo para esa app. Nada sale del teléfono hasta que la persona elige a dónde.
 */
@CapacitorPlugin(name = "CompartirArchivo")
public class CompartirArchivoPlugin extends Plugin {

    private static final String[] WHATSAPP = { "com.whatsapp", "com.whatsapp.w4b" };

    @PluginMethod
    public void compartir(PluginCall call) {
        String nombre = call.getString("nombre");
        String tipo = call.getString("tipo", "application/octet-stream");
        String datos = call.getString("base64");
        String titulo = call.getString("titulo", "Compartir");
        String app = call.getString("app");
        if (nombre == null || datos == null || !nombre.matches("[\\w.\\- ]{1,80}")) {
            call.reject("Falta el archivo o el nombre no es válido");
            return;
        }
        File carpeta = new File(getContext().getCacheDir(), "compartido");
        if (!carpeta.isDirectory() && !carpeta.mkdirs()) {
            call.reject("No se pudo preparar el archivo");
            return;
        }
        // Lo compartido antes ya no hace falta: la caché no se llena.
        File[] viejos = carpeta.listFiles();
        if (viejos != null) for (File f : viejos) f.delete();
        File archivo = new File(carpeta, nombre);
        try (FileOutputStream salida = new FileOutputStream(archivo)) {
            salida.write(Base64.decode(datos, Base64.DEFAULT));
        } catch (IOException | IllegalArgumentException e) {
            call.reject("No se pudo escribir el archivo");
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", archivo);
        Intent enviar = new Intent(Intent.ACTION_SEND);
        enviar.setType(tipo);
        enviar.putExtra(Intent.EXTRA_STREAM, uri);
        enviar.putExtra(Intent.EXTRA_SUBJECT, titulo);
        enviar.setClipData(ClipData.newRawUri(nombre, uri));
        enviar.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            if (app != null && !app.isEmpty()) {
                enviar.setPackage(app);
                getActivity().startActivity(enviar);
            } else {
                getActivity().startActivity(Intent.createChooser(enviar, titulo));
            }
        } catch (ActivityNotFoundException e) {
            call.reject("No hay una app para abrirlo", "SIN_APP");
            return;
        }
        call.resolve();
    }

    /** Qué WhatsApp hay instalado (el normal o el de negocios), o nada. */
    @PluginMethod
    public void whatsapp(PluginCall call) {
        JSObject r = new JSObject();
        PackageManager pm = getContext().getPackageManager();
        for (String paquete : WHATSAPP) {
            try {
                pm.getPackageInfo(paquete, 0);
                r.put("paquete", paquete);
                break;
            } catch (PackageManager.NameNotFoundException e) {
                // no está: se prueba el siguiente
            }
        }
        call.resolve(r);
    }
}
