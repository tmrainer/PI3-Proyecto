package io.github.tmrainer.asistencia;

import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Complemento propio, sin paquete npm: leer el texto del DNI (ver LectorTextoPlugin).
        registerPlugin(LectorTextoPlugin.class);
        super.onCreate(savedInstanceState);
        // Mientras la página carga, el WebView se veía negro un instante entre
        // la pantalla de inicio y la app. Con el fondo de la app (claro u
        // oscuro, según el teléfono: res/values*/fondo.xml) el paso es parejo.
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.fondo_app));
    }
}
