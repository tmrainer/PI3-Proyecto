// camara-trasera.js — abre la cámara de atrás que ENFOCA SOLA.
//
// Teléfonos con varias cámaras atrás (Samsung A, Xiaomi, moto) pueden entregar
// la gran angular o la macro cuando se pide «la de atrás». Esas tienen foco
// fijo: un DNI o un QR de cerca sale borroso siempre. Si la cámara que llegó
// no tiene enfoque continuo, se prueban las otras de atrás y se queda la
// primera que lo tenga; si ninguna, se vuelve a la de siempre.

/** true si la cámara enfoca sola, o si el teléfono no dice cómo enfoca. */
function enfocaSola(flujo) {
  try {
    const pista = flujo.getVideoTracks()[0];
    const modos = pista.getCapabilities && pista.getCapabilities().focusMode;
    return !Array.isArray(modos) || modos.includes('continuous');
  } catch (e) { return true; }
}

// Enfoque continuo si la cámara lo permite (de cerca, el fijo suele quedar
// borroso). Si no se puede, sigue igual.
function enfocarSolo(flujo) {
  try {
    const pista = flujo.getVideoTracks()[0];
    const modos = (pista.getCapabilities && pista.getCapabilities().focusMode) || [];
    if (modos.includes('continuous')) pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  } catch (e) { /* sin control de enfoque */ }
}

const parar = (flujo) => flujo.getTracks().forEach((t) => t.stop());

/**
 * @param {number} ancho  tamaño ideal del video, en px
 * @param {number} alto
 * @returns {Promise<MediaStream>}  lanza si no hay permiso o cámara
 */
export async function abrirCamaraTrasera(ancho, alto) {
  const pedir = (cual) => navigator.mediaDevices.getUserMedia({
    audio: false, video: { ...cual, width: { ideal: ancho }, height: { ideal: alto } }
  });
  const deAtras = { facingMode: { ideal: 'environment' } };
  let flujo = await pedir(deAtras);

  if (!enfocaSola(flujo)) {
    let otras = [];
    try {
      const actual = flujo.getVideoTracks()[0].getSettings().deviceId;
      otras = (await navigator.mediaDevices.enumerateDevices()).filter((d) =>
        d.kind === 'videoinput' && d.deviceId && d.deviceId !== actual && !/front|frontal|user/i.test(d.label));
    } catch (e) { /* sin lista de cámaras */ }
    if (otras.length) {
      // Muchos teléfonos no abren dos cámaras a la vez: se suelta la primera.
      parar(flujo);
      flujo = null;
      for (const d of otras) {
        let f;
        try { f = await pedir({ deviceId: { exact: d.deviceId } }); } catch (e) { continue; }
        const lado = f.getVideoTracks()[0].getSettings().facingMode;
        if (lado !== 'user' && enfocaSola(f)) { flujo = f; break; }
        parar(f);
      }
      if (!flujo) flujo = await pedir(deAtras);
    }
  }
  enfocarSolo(flujo);
  return flujo;
}
