// Pie de página fijo y teclado del celular. El menú de abajo es `position: fixed; bottom: 0`, pero cuando se
// abre el teclado algunos navegadores (sobre todo Safari en iPhone) no achican la pantalla: el menú queda
// tapado o flotando en el medio y al scrollear se ve el fondo negro. Acá se mide cuánto ocupa el teclado
// (la diferencia entre la pantalla y lo que realmente se ve, `visualViewport`) y se publica en la variable
// CSS `--teclado`, que main.css usa para subir el menú esa altura: así siempre es lo último que se ve.
// Los navegadores que sí achican la pantalla (ver `interactive-widget` en index.html) dan 0 y no suman de más.

const VARIABLE = '--teclado';

/**
 * @param {{ visor?: VisualViewport, ventana?: { innerHeight: number } }} [opciones]
 * @returns {() => void} función para dejar de escuchar
 */
export function iniciarPieFijo({ visor = window.visualViewport, ventana = window } = {}) {
  if (!visor) return () => {};

  const raiz = document.documentElement;
  const actualizar = () => {
    const tapado = ventana.innerHeight - visor.height - visor.offsetTop;
    raiz.style.setProperty(VARIABLE, `${Math.max(0, Math.round(tapado))}px`);
  };

  actualizar();
  visor.addEventListener('resize', actualizar);
  visor.addEventListener('scroll', actualizar);
  return () => {
    visor.removeEventListener('resize', actualizar);
    visor.removeEventListener('scroll', actualizar);
    raiz.style.removeProperty(VARIABLE);
  };
}
