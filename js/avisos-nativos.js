// avisos-nativos.js — avisos de entrega con la app cerrada, solo en el APK.
//
// En el navegador no hace nada: un aviso con la app cerrada necesitaría un
// servidor, y la app no tiene (AGENTS.md §3). Dentro del APK (Capacitor),
// Android se programa los avisos a sí mismo, sin red. El complemento lo deja el
// propio APK en window.Capacitor.Plugins: aquí no se importa ninguna librería.
//
// Qué avisos y cuándo lo decide programaDeAvisos() (alertas.js), que es pura y
// tiene sus pruebas. Este módulo solo los entrega a Android.

import { hoyIso } from './modelo.js';
import { programaDeAvisos } from './alertas.js';

const HORA_DEL_AVISO = 9;   // 9 de la mañana

function complemento() {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
  return (C.Plugins && C.Plugins.LocalNotifications) || null;
}

/** ¿Corre dentro del APK, con avisos del teléfono disponibles? */
export function hayAvisosNativos() {
  return !!complemento();
}

/** ¿Corre dentro del APK? (con o sin el complemento de avisos) */
export function esAppNativa() {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
}

/** 'granted', 'denied' o 'prompt'; null fuera del APK. */
export async function permisoDeAvisos() {
  const LN = complemento();
  if (!LN) return null;
  try { return (await LN.checkPermissions()).display; } catch (e) { return null; }
}

/** Pide el permiso (Android 13+ lo exige). Devuelve el estado final. */
export async function pedirPermisoDeAvisos() {
  const LN = complemento();
  if (!LN) return null;
  try { return (await LN.requestPermissions()).display; } catch (e) { return null; }
}

/**
 * Borra los avisos programados y vuelve a programar los del calendario. Se
 * llama al abrir cualquier página (por si se recuperó una copia o cambió el
 * día) y cada vez que se guarda Entregas.
 * @param {Object} calendario  b1.calendario.v1
 * @returns {Promise<number>}  cuántos quedaron programados (0 sin permiso)
 */
export async function reprogramarAvisos(calendario) {
  const LN = complemento();
  if (!LN) return 0;
  try {
    if ((await LN.checkPermissions()).display !== 'granted') return 0;
    const pendientes = (await LN.getPending()).notifications || [];
    if (pendientes.length) await LN.cancel({ notifications: pendientes.map((n) => ({ id: n.id })) });
    const avisos = programaDeAvisos(calendario, hoyIso());
    if (!avisos.length) return 0;
    await LN.schedule({
      notifications: avisos.map((a) => {
        const [y, m, d] = a.fecha.split('-').map(Number);
        return {
          id: a.id,
          title: a.titulo,
          body: a.texto,
          schedule: { at: new Date(y, m - 1, d, HORA_DEL_AVISO, 0, 0), allowWhileIdle: true },
          extra: { abrir: './calendario.html' }
        };
      })
    });
    return avisos.length;
  } catch (e) {
    return 0;   // sin avisos la app funciona igual: la franja sigue al abrir
  }
}

/** Tocar un aviso abre Entregas. */
export function abrirEntregasAlTocarAviso() {
  const LN = complemento();
  if (!LN || typeof LN.addListener !== 'function') return;
  LN.addListener('localNotificationActionPerformed', (accion) => {
    const destino = accion && accion.notification && accion.notification.extra && accion.notification.extra.abrir;
    if (destino && !location.pathname.endsWith('calendario.html')) location.href = destino;
  });
}
