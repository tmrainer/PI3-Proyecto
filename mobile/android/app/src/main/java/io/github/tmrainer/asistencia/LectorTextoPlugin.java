package io.github.tmrainer.asistencia;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Point;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.util.ArrayList;
import java.util.List;

/**
 * Reconocimiento de texto en el teléfono, para leer la zona de lectura
 * mecánica (MRZ) del DNI. La app web le pasa un fotograma de la cámara en
 * JPEG (base64) y recibe los pedazos de texto con su posición, de arriba abajo.
 *
 * Todo pasa en el teléfono, con el modelo de ML Kit que viene dentro del APK:
 * la imagen no se guarda ni sale del aparato. En el navegador este
 * complemento no existe y la app web solo ofrece el código de barras.
 */
@CapacitorPlugin(name = "LectorTexto")
public class LectorTextoPlugin extends Plugin {

    private TextRecognizer lector;

    @Override
    public void load() {
        lector = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    }

    @PluginMethod
    public void leer(PluginCall call) {
        String imagen = call.getString("imagen");
        if (imagen == null || imagen.isEmpty()) {
            call.reject("Falta la imagen");
            return;
        }
        Bitmap mapa;
        try {
            byte[] bytes = Base64.decode(imagen, Base64.DEFAULT);
            mapa = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("Imagen ilegible");
            return;
        }
        if (mapa == null) {
            call.reject("Imagen ilegible");
            return;
        }
        final Bitmap fotograma = mapa;
        lector.process(InputImage.fromBitmap(fotograma, 0))
            .addOnSuccessListener(resultado -> {
                // Cada línea con su posición: la MRZ a veces llega partida en
                // pedazos (donde hay muchos «<» seguidos) y la app web los une
                // por altura. Ordenadas de arriba abajo.
                List<Text.Line> lineas = new ArrayList<>();
                for (Text.TextBlock bloque : resultado.getTextBlocks()) lineas.addAll(bloque.getLines());
                lineas.sort((a, b) -> Integer.compare(caja(a).top, caja(b).top));
                JSArray fragmentos = new JSArray();
                for (Text.Line linea : lineas) {
                    Rect r = caja(linea);
                    JSObject f = new JSObject();
                    f.put("texto", linea.getText());
                    f.put("arriba", r.top);
                    f.put("abajo", r.bottom);
                    f.put("izquierda", r.left);
                    f.put("derecha", r.right);
                    f.put("angulo", angulo(linea));
                    fragmentos.put(f);
                }
                JSObject respuesta = new JSObject();
                respuesta.put("fragmentos", fragmentos);
                fotograma.recycle();
                call.resolve(respuesta);
            })
            .addOnFailureListener(e -> {
                fotograma.recycle();
                call.reject("No se pudo leer el texto");
            });
    }

    /** Inclinación de la línea en grados (negativa si sube hacia la derecha). */
    private static double angulo(Text.Line linea) {
        Point[] esquinas = linea.getCornerPoints();
        if (esquinas == null || esquinas.length < 2) return 0;
        return Math.toDegrees(Math.atan2(esquinas[1].y - esquinas[0].y, esquinas[1].x - esquinas[0].x));
    }

    private static Rect caja(Text.Line linea) {
        return linea.getBoundingBox() != null ? linea.getBoundingBox() : new Rect();
    }

    @Override
    protected void handleOnDestroy() {
        if (lector != null) lector.close();
    }
}
