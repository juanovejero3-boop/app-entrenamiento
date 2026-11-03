// Pie de página fijo y teclado del celular. Cuando se abre el teclado, el menú de abajo (position: fixed)
// salta por encima de él y, al scrollear, deja un fondo negro. Mientras se escribe en un campo de texto se
// esconde ese menú (con la clase `teclado-abierto` en <body>, que main.css usa para ocultar el <nav>) y vuelve
// al terminar. Solo en pantallas táctiles: en una compu no hay teclado en pantalla.

// Los campos que abren el teclado (no los checkbox, botones, fechas ni selects, que abren otros controles)
const CAMPOS_DE_TEXTO =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]):not([type=file]):not([type=date]):not([type=hidden]), textarea';
const esCampoDeTexto = (elemento) => Boolean(elemento?.matches?.(CAMPOS_DE_TEXTO));

const CLASE = 'teclado-abierto';
const ESPERA_AL_SALIR_MS = 100; // el foco pasa de un campo a otro: sin esto el menú parpadearía

/**
 * @param {{ esTactil?: () => boolean }} [opciones]
 * @returns {() => void} función para dejar de escuchar
 */
export function iniciarTeclado({ esTactil = () => window.matchMedia?.('(pointer: coarse)').matches ?? false } = {}) {
  /** El menú se esconde si y solo si hay un campo de texto enfocado: se calcula siempre desde ahí, nunca "pegado". */
  const sincronizar = () => {
    document.body.classList.toggle(CLASE, esTactil() && esCampoDeTexto(document.activeElement));
  };
  let espera = null;
  const sincronizarEnBreve = () => {
    clearTimeout(espera);
    espera = setTimeout(sincronizar, ESPERA_AL_SALIR_MS);
  };

  const alEnfocar = (evento) => {
    if (esTactil() && esCampoDeTexto(evento.target)) document.body.classList.add(CLASE);
  };
  // Si se borra un campo enfocado (por ejemplo al entrar, que reemplaza el formulario) el navegador no avisa
  // que perdió el foco: por eso también se revisa cuando cambia la pantalla y cuando se toca.
  const observador = new MutationObserver(sincronizarEnBreve);
  observador.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('focusin', alEnfocar);
  document.addEventListener('focusout', sincronizarEnBreve);
  document.addEventListener('pointerdown', sincronizarEnBreve);
  document.addEventListener('touchstart', sincronizarEnBreve, { passive: true });
  return () => {
    clearTimeout(espera);
    observador.disconnect();
    document.removeEventListener('focusin', alEnfocar);
    document.removeEventListener('focusout', sincronizarEnBreve);
    document.removeEventListener('pointerdown', sincronizarEnBreve);
    document.removeEventListener('touchstart', sincronizarEnBreve);
    document.body.classList.remove(CLASE);
  };
}
