// Dibuja las páginas de un PDF como canvas con pdf.js (Mozilla), al ancho del contenedor.
// Se usa la versión "legacy" de pdf.js, compatible con navegadores de celular más viejos.
// Este módulo (y pdf.js, ~0,5 MB + worker de ~1,3 MB) se carga solo al abrir una vista previa.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import urlWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;

// Tope de ancho de cada canvas en píxeles: con zoom alto evita usar demasiada memoria
const ANCHO_MAXIMO = 3000;

/**
 * Dibuja todas las páginas dentro de `hoja` (cada una ocupa el 100 % de su ancho) y devuelve un
 * controlador para volver a dibujarlas a la resolución actual (después de un zoom) y para liberar
 * el documento al cerrar.
 * @param {Blob} blob  @param {HTMLElement} hoja
 */
export async function dibujarPaginasPdf(blob, hoja) {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const documento = await tarea.promise;
  const paginas = [];
  for (let n = 1; n <= documento.numPages; n++) paginas.push({ pagina: await documento.getPage(n), canvas: null });

  let version = 0; // si llega un zoom nuevo mientras se dibuja, la tanda anterior se abandona

  async function dibujar() {
    const miVersion = ++version;
    const densidad = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = hoja.clientWidth;
    for (const [i, p] of paginas.entries()) {
      const base = p.pagina.getViewport({ scale: 1 });
      const anchoPixeles = Math.min(ancho * densidad, ANCHO_MAXIMO);
      if (p.canvas && Math.abs(p.canvas.width - anchoPixeles) < 2) continue; // ya está a esa resolución
      const viewport = p.pagina.getViewport({ scale: anchoPixeles / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = 'block w-full h-auto bg-white rounded shadow';
      canvas.setAttribute('aria-label', `Página ${i + 1} de ${paginas.length}`);
      await p.pagina.render({ canvas, viewport }).promise;
      if (miVersion !== version) return;
      // Se reemplaza recién cuando la nueva está lista, así no parpadea
      if (p.canvas) p.canvas.replaceWith(canvas);
      p.canvas = canvas;
    }
    if (!hoja.querySelector('canvas')) hoja.replaceChildren(...paginas.map((p) => p.canvas));
  }

  await dibujar();
  return {
    dibujar,
    destruir: () => tarea.destroy(), // libera el worker y la memoria del documento
  };
}
