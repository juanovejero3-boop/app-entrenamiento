// Vista previa de un PDF en un modal, con botones para abrirlo, descargarlo o cerrar.
// Las páginas se dibujan con pdf.js (paginasPdf.js) en una lista que se desplaza: el visor de
// PDF de los celulares no funciona bien dentro de una página (iPhone muestra solo la primera
// página fija). Si no se pueden dibujar, se ofrece abrirlo o descargarlo.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';

const ID = 'pdf-vista-previa';

/** @type {{ url: string, nombreArchivo: string, alTeclear: (e: KeyboardEvent) => void } | null} */
let abierta = null;

/** Por defecto dibuja con pdf.js (se carga recién la primera vez). */
async function dibujarConPdfJs(blob, contenedor) {
  const { dibujarPaginasPdf } = await import('./paginasPdf.js');
  await dibujarPaginasPdf(blob, contenedor);
}

const claseBoton = (primario) =>
  `flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition whitespace-nowrap ${
    primario
      ? 'neon-glow-button text-white'
      : 'bg-cyberCarbon border border-gray-700 text-gray-300 hover:border-neonRed hover:text-neonRed'
  }`;
const boton = (accion, icono, texto, primario = false) =>
  `<button data-click="${accion}" class="${claseBoton(primario)}"><i class="fa-solid ${icono} mr-1"></i>${texto}</button>`;

/**
 * @param {{
 *   blob: Blob, nombreArchivo: string, titulo: string,
 *   dibujarPaginas?: (blob: Blob, contenedor: HTMLElement) => Promise<void>
 * }} opciones
 */
export async function abrirVistaPrevia({ blob, nombreArchivo, titulo, dibujarPaginas = dibujarConPdfJs }) {
  cerrarVistaPrevia();
  const url = URL.createObjectURL(blob);
  const alTeclear = (e) => {
    if (e.key === 'Escape') cerrarVistaPrevia();
  };
  const esta = { url, nombreArchivo, alTeclear };
  abierta = esta;
  document.addEventListener('keydown', alTeclear);

  const overlay = document.createElement('div');
  overlay.id = ID;
  overlay.dataset.click = 'vistaPreviaFondo';
  // En el celular ocupa toda la pantalla; desde sm, un recuadro centrado
  overlay.className = 'fixed inset-0 z-[10030] bg-black/80 backdrop-blur-sm flex items-center justify-center sm:p-3';
  overlay.innerHTML = `
    <div class="bg-cyberCard sm:border border-gray-700 sm:rounded-2xl w-full max-w-4xl h-full sm:h-[90vh] flex flex-col gap-3 p-3 shadow-2xl">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="basis-full sm:basis-auto sm:flex-1 min-w-0 truncate font-black text-white uppercase tracking-wide text-sm">${esc(titulo)}</h3>
        <div class="flex w-full sm:w-auto gap-2">
          ${boton('vistaPreviaAbrir', 'fa-up-right-from-square', 'Abrir')}
          ${boton('vistaPreviaDescargar', 'fa-download', 'Descargar', true)}
          ${boton('vistaPreviaCerrar', 'fa-xmark', 'Cerrar')}
        </div>
      </div>
      <div data-paginas class="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-neutral-800 rounded-lg p-2 space-y-2">
        <p class="text-center text-sm text-gray-400 py-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando vista previa...</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const contenedor = overlay.querySelector('[data-paginas]');
  try {
    await dibujarPaginas(blob, contenedor);
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
  URL.revokeObjectURL(abierta.url);
  abierta = null;
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
  // Tocar el fondo oscuro (no el recuadro) cierra
  vistaPreviaFondo: (el, e) => {
    if (e.target === el) cerrarVistaPrevia();
  },
});
