// Vista previa de un PDF en un modal, con zoom y botones para abrirlo, descargarlo o cerrar.
// Las páginas se dibujan con pdf.js (paginasPdf.js) en un área que se desplaza: el visor de
// PDF de los celulares no funciona bien dentro de una página (iPhone muestra solo la primera
// página fija). Zoom: botones − / +, pellizco con dos dedos o Ctrl + rueda del mouse.
// Si no se pueden dibujar las páginas, se ofrece abrirlo o descargarlo.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';

const ID = 'pdf-vista-previa';
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;
const PASO_ZOOM = 0.25;

/**
 * @type {{
 *   url: string, nombreArchivo: string, alTeclear: (e: KeyboardEvent) => void,
 *   zoom: number, controlador: { dibujar: () => Promise<void>, destruir: () => void } | null,
 *   redibujo: number | null
 * } | null}
 */
let abierta = null;

/** Por defecto dibuja con pdf.js (se carga recién la primera vez). */
async function dibujarConPdfJs(blob, hoja) {
  const { dibujarPaginasPdf } = await import('./paginasPdf.js');
  return dibujarPaginasPdf(blob, hoja);
}

const claseBoton = (primario) =>
  `flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition whitespace-nowrap ${
    primario
      ? 'neon-glow-button text-white'
      : 'bg-cyberCarbon border border-gray-700 text-gray-300 hover:border-neonRed hover:text-neonRed'
  }`;
const boton = (accion, icono, texto, primario = false) =>
  `<button data-click="${accion}" class="${claseBoton(primario)}"><i class="fa-solid ${icono} mr-1"></i>${texto}</button>`;
const botonZoom = (accion, contenido, titulo) =>
  `<button data-click="${accion}" title="${titulo}" class="min-w-9 px-2 py-1 rounded bg-cyberCarbon border border-gray-700 text-gray-200 text-xs font-bold hover:border-neonRed">${contenido}</button>`;

/**
 * @param {{
 *   blob: Blob, nombreArchivo: string, titulo: string,
 *   dibujarPaginas?: (blob: Blob, hoja: HTMLElement) => Promise<{ dibujar: () => Promise<void>, destruir: () => void } | void>
 * }} opciones
 */
export async function abrirVistaPrevia({ blob, nombreArchivo, titulo, dibujarPaginas = dibujarConPdfJs }) {
  cerrarVistaPrevia();
  const url = URL.createObjectURL(blob);
  const alTeclear = (e) => {
    if (e.key === 'Escape') cerrarVistaPrevia();
  };
  const esta = { url, nombreArchivo, alTeclear, zoom: 1, controlador: null, redibujo: null };
  abierta = esta;
  document.addEventListener('keydown', alTeclear);

  const overlay = document.createElement('div');
  overlay.id = ID;
  overlay.dataset.click = 'vistaPreviaFondo';
  // En el celular ocupa toda la pantalla; desde sm, un recuadro centrado
  overlay.className = 'fixed inset-0 z-[10030] bg-black/80 backdrop-blur-sm flex items-center justify-center sm:p-3';
  overlay.innerHTML = `
    <div class="bg-cyberCard sm:border border-gray-700 sm:rounded-2xl w-full max-w-4xl h-full sm:h-[90vh] flex flex-col gap-2 p-3 shadow-2xl">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="basis-full sm:basis-auto sm:flex-1 min-w-0 truncate font-black text-white uppercase tracking-wide text-sm">${esc(titulo)}</h3>
        <div class="flex w-full sm:w-auto gap-2">
          ${boton('vistaPreviaAbrir', 'fa-up-right-from-square', 'Abrir')}
          ${boton('vistaPreviaDescargar', 'fa-download', 'Descargar', true)}
          ${boton('vistaPreviaCerrar', 'fa-xmark', 'Cerrar')}
        </div>
      </div>
      <div class="flex items-center justify-end gap-1">
        ${botonZoom('vistaPreviaZoomMenos', '<i class="fa-solid fa-minus"></i>', 'Alejar')}
        ${botonZoom('vistaPreviaZoomReset', '<span data-zoom-texto>100%</span>', 'Volver al 100 %')}
        ${botonZoom('vistaPreviaZoomMas', '<i class="fa-solid fa-plus"></i>', 'Acercar')}
      </div>
      <div data-paginas class="flex-1 min-h-0 overflow-auto overflow-y-auto overscroll-contain bg-neutral-800 rounded-lg p-2" style="touch-action: pan-x pan-y">
        <div data-hoja class="space-y-2 mx-auto" style="width: 100%">
          <p class="text-center text-sm text-gray-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando vista previa...</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const contenedor = overlay.querySelector('[data-paginas]');
  const hoja = overlay.querySelector('[data-hoja]');
  activarGestosDeZoom(contenedor);
  try {
    const controlador = await dibujarPaginas(blob, hoja);
    if (abierta !== esta) return controlador?.destruir();
    esta.controlador = controlador || null;
  } catch (error) {
    console.error('No se pudo dibujar la vista previa del PDF', error);
    if (abierta !== esta) return; // se cerró mientras se dibujaba
    contenedor.outerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center gap-3 text-center text-sm text-gray-300 p-6">
        <i class="fa-solid fa-file-pdf text-5xl text-neonRed"></i>
        <p class="font-bold break-all">${esc(nombreArchivo)}</p>
        <p class="text-xs text-gray-500">No se pudo mostrar la vista previa: abrilo o descargalo con los botones de arriba.</p>
      </div>`;
  }
}

export function cerrarVistaPrevia() {
  if (!abierta) return;
  document.getElementById(ID)?.remove();
  document.removeEventListener('keydown', abierta.alTeclear);
  clearTimeout(abierta.redibujo);
  abierta.controlador?.destruir();
  URL.revokeObjectURL(abierta.url);
  abierta = null;
}

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

/**
 * Cambia el zoom manteniendo en el centro lo que se estaba mirando. El ancho de la hoja cambia
 * al instante (se agranda la imagen) y las páginas se vuelven a dibujar nítidas al rato.
 */
function aplicarZoom(nuevo, { redibujar = true } = {}) {
  if (!abierta) return;
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevo));
  const contenedor = document.querySelector(`#${ID} [data-paginas]`);
  const hoja = document.querySelector(`#${ID} [data-hoja]`);
  if (!contenedor || !hoja) return;

  const centroX = (contenedor.scrollLeft + contenedor.clientWidth / 2) / (contenedor.scrollWidth || 1);
  const centroY = (contenedor.scrollTop + contenedor.clientHeight / 2) / (contenedor.scrollHeight || 1);
  abierta.zoom = zoom;
  hoja.style.width = `${zoom * 100}%`;
  contenedor.scrollLeft = centroX * contenedor.scrollWidth - contenedor.clientWidth / 2;
  contenedor.scrollTop = centroY * contenedor.scrollHeight - contenedor.clientHeight / 2;
  const texto = document.querySelector(`#${ID} [data-zoom-texto]`);
  if (texto) texto.textContent = `${Math.round(zoom * 100)}%`;

  if (redibujar) {
    clearTimeout(abierta.redibujo);
    const controlador = abierta.controlador;
    abierta.redibujo = setTimeout(() => controlador?.dibujar(), 250);
  }
}

/** Pellizco con dos dedos (celular) y Ctrl + rueda del mouse (compu). */
function activarGestosDeZoom(contenedor) {
  let inicio = null; // { distancia, zoom }
  const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  contenedor.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 2) inicio = { distancia: distancia(e.touches), zoom: abierta?.zoom ?? 1 };
    },
    { passive: true },
  );
  contenedor.addEventListener(
    'touchmove',
    (e) => {
      if (!inicio || e.touches.length !== 2) return;
      e.preventDefault(); // el pellizco es zoom, no desplazamiento
      aplicarZoom(inicio.zoom * (distancia(e.touches) / inicio.distancia), { redibujar: false });
    },
    { passive: false },
  );
  contenedor.addEventListener('touchend', (e) => {
    if (inicio && e.touches.length < 2) {
      inicio = null;
      aplicarZoom(abierta?.zoom ?? 1); // al soltar se redibuja nítido
    }
  });
  contenedor.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      aplicarZoom((abierta?.zoom ?? 1) * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false },
  );
}

function enlace(atributos) {
  const a = document.createElement('a');
  a.href = abierta.url;
  Object.entries(atributos).forEach(([k, v]) => a.setAttribute(k, v));
  a.click();
}

registrarAcciones({
  vistaPreviaDescargar: () => enlace({ download: abierta.nombreArchivo }),
  vistaPreviaAbrir: () => enlace({ target: '_blank', rel: 'noopener' }),
  vistaPreviaCerrar: () => cerrarVistaPrevia(),
  vistaPreviaZoomMas: () => aplicarZoom((abierta?.zoom ?? 1) + PASO_ZOOM),
  vistaPreviaZoomMenos: () => aplicarZoom((abierta?.zoom ?? 1) - PASO_ZOOM),
  vistaPreviaZoomReset: () => aplicarZoom(1),
  // Tocar el fondo oscuro (no el recuadro) cierra
  vistaPreviaFondo: (el, e) => {
    if (e.target === el) cerrarVistaPrevia();
  },
});
