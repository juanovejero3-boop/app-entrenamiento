// Escribir en una serie sin que el campo quede tapado. En el celular, con el teclado abierto, queda poco lugar:
// arriba hay encabezados fijos (la barra de semanas y días, y la cabecera del ejercicio) y abajo el teclado.
// El navegador centra el campo en la pantalla sin tener en cuenta los encabezados fijos, así que puede quedar
// debajo de ellos. Acá se mide lo que de verdad queda libre y se scrollea para que el campo se vea; y si queda muy
// poco lugar, la cabecera del ejercicio deja de ser fija mientras se escribe (la barra de arriba sí sigue).
//
// Se marca con `data-area-chica` en el contenedor: el CSS (main.css) suelta ahí la cabecera.

const MARGEN = 8; // aire entre el campo y lo que lo rodea
const ESPACIO_MINIMO = 200; // con menos de esto libre, la cabecera del ejercicio se suelta
const ESPERA_MS = 350; // lo que tarda en aparecer el teclado
const VENTANA_DEL_TECLADO_MS = 1200; // después de tocar un campo, el área visible puede seguir cambiando mientras sube el teclado
const PASADAS = 3; // al scrollear, las cabeceras fijas se acomodan: se vuelve a medir

/**
 * Cuánto hay que scrollear (positivo = hacia abajo) para dejar el campo centrado en el espacio libre.
 * 0 si ya se ve entero.
 * @param {{ top: number, bottom: number }} campo
 * @param {{ arriba: number, abajo: number }} libre  borde de arriba (debajo de los encabezados) y de abajo (sobre el teclado)
 */
export function desplazamientoParaVer(campo, libre) {
  if (campo.top >= libre.arriba + MARGEN && campo.bottom <= libre.abajo - MARGEN) return 0;
  const alto = campo.bottom - campo.top;
  const centrado = libre.arriba + (libre.abajo - libre.arriba - alto) / 2;
  return Math.round(campo.top - centrado);
}

/** ¿Las cabeceras fijas dejan muy poco lugar para escribir? `tapa` es lo que ocupan juntas. */
export const faltaEspacio = ({ areaVisible, tapa }) => areaVisible - tapa < ESPACIO_MINIMO;

const vigilados = new WeakSet();

/**
 * Cuida los campos de las series de `content`: al tocar uno, lo deja a la vista aunque haya encabezados fijos y
 * teclado. Se puede llamar muchas veces con el mismo contenedor.
 * @param {HTMLElement} content
 */
export function vigilarTeclado(content) {
  if (vigilados.has(content)) return;
  vigilados.add(content);
  let temporizador = null;
  let ultimoFoco = -Infinity;

  const esCampo = (el) => el instanceof HTMLElement && el.matches('[data-serie] input') && content.contains(el);

  /** El área que ve el alumno: la pantalla menos el teclado. */
  function areaVisible() {
    const viewport = window.visualViewport;
    return viewport
      ? { arriba: viewport.offsetTop, abajo: viewport.offsetTop + viewport.height }
      : { arriba: 0, abajo: window.innerHeight };
  }

  function acomodar() {
    const campo = document.activeElement;
    if (!esCampo(campo)) return;
    const barra = content.querySelector('[data-barra-fija]');
    const cabecera = campo.closest('article')?.querySelector('[data-ej-cabecera]');
    const area = areaVisible();

    const tapa = (barra?.offsetHeight ?? 0) + (cabecera?.offsetHeight ?? 0);
    if (faltaEspacio({ areaVisible: area.abajo - area.arriba, tapa })) content.dataset.areaChica = '';
    else delete content.dataset.areaChica;

    for (let pasada = 0; pasada < PASADAS; pasada++) {
      const fija = cabecera && getComputedStyle(cabecera).position === 'sticky';
      const bordes = [barra?.getBoundingClientRect().bottom ?? 0, fija ? cabecera.getBoundingClientRect().bottom : 0];
      const libre = { arriba: Math.max(area.arriba, ...bordes), abajo: area.abajo };
      const mover = desplazamientoParaVer(campo.getBoundingClientRect(), libre);
      if (!mover) break;
      window.scrollBy(0, mover);
    }
  }

  const programar = (espera = ESPERA_MS) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(acomodar, espera);
  };

  content.addEventListener('focusin', (e) => {
    if (!esCampo(e.target)) return;
    ultimoFoco = Date.now();
    programar();
  });
  // Si el alumno empieza a scrollear, no se le pelea: se cancela cualquier corrección pendiente
  content.addEventListener('touchmove', () => clearTimeout(temporizador), { passive: true });
  content.addEventListener('focusout', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      // al pasar de un campo al siguiente no se sueltan y vuelven a poner las cabeceras
      if (!esCampo(document.activeElement)) delete content.dataset.areaChica;
    }, 100);
  });
  // El teclado suele terminar de subir después del foco: en ese momento se vuelve a acomodar. Fuera de esa ventana
  // no: al scrollear con el teclado abierto el navegador esconde y muestra su barra de direcciones y eso también
  // cambia el área visible; corregir ahí le pelearía el scroll al alumno.
  window.visualViewport?.addEventListener('resize', () => {
    if (esCampo(document.activeElement) && Date.now() - ultimoFoco < VENTANA_DEL_TECLADO_MS) programar(100);
  });
}
