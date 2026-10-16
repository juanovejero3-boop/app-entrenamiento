// Vista previa de un PDF en un modal, con botones para descargarlo o cerrarlo.
// En navegadores sin visor de PDF embebido (la mayoría de los celulares) muestra "Abrir" y
// "Descargar" en lugar del visor, que quedaría en blanco.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';

const ID = 'pdf-vista-previa';

/** @type {{ url: string, nombreArchivo: string, alTeclear: (e: KeyboardEvent) => void } | null} */
let abierta = null;

/**
 * @param {{ blob: Blob, nombreArchivo: string, titulo: string, verEnLinea?: boolean }} opciones
 *   verEnLinea: si el navegador puede mostrar el PDF dentro de la página (por defecto lo detecta).
 */
export function abrirVistaPrevia({ blob, nombreArchivo, titulo, verEnLinea = navigator.pdfViewerEnabled !== false }) {
  cerrarVistaPrevia();
  const url = URL.createObjectURL(blob);
  const alTeclear = (e) => {
    if (e.key === 'Escape') cerrarVistaPrevia();
  };
  abierta = { url, nombreArchivo, alTeclear };
  document.addEventListener('keydown', alTeclear);

  const boton = (accion, icono, texto, primario = false) =>
    `<button data-click="${accion}" class="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
      primario
        ? 'neon-glow-button text-white'
        : 'bg-cyberCarbon border border-gray-700 text-gray-300 hover:border-neonRed hover:text-neonRed'
    }"><i class="fa-solid ${icono} mr-1"></i>${texto}</button>`;

  const cuerpo = verEnLinea
    ? `<object data="${esc(url)}" type="application/pdf" title="${esc(titulo)}" class="flex-1 w-full rounded-lg bg-white"></object>`
    : `<div class="flex-1 flex flex-col items-center justify-center gap-3 text-center text-sm text-gray-300 p-6">
         <i class="fa-solid fa-file-pdf text-5xl text-neonRed"></i>
         <p class="font-bold break-all">${esc(nombreArchivo)}</p>
         <p class="text-xs text-gray-500">Este navegador no muestra el PDF acá adentro: abrilo o descargalo.</p>
         ${boton('vistaPreviaAbrir', 'fa-up-right-from-square', 'Abrir')}
       </div>`;

  const overlay = document.createElement('div');
  overlay.id = ID;
  overlay.dataset.click = 'vistaPreviaFondo';
  overlay.className = 'fixed inset-0 z-[10030] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3';
  overlay.innerHTML = `
    <div class="bg-cyberCard border border-gray-700 rounded-2xl w-full max-w-4xl h-[90vh] flex flex-col gap-3 p-3 shadow-2xl">
      <div class="flex items-center gap-2">
        <h3 class="flex-1 min-w-0 truncate font-black text-white uppercase tracking-wide text-sm">${esc(titulo)}</h3>
        ${boton('vistaPreviaDescargar', 'fa-download', 'Descargar', true)}
        ${boton('vistaPreviaCerrar', 'fa-xmark', 'Cerrar')}
      </div>
      ${cuerpo}
    </div>
  `;
  document.body.appendChild(overlay);
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
