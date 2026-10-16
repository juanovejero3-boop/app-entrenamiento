// Dibuja las páginas de un PDF como canvas con pdf.js (Mozilla), ajustadas al ancho del contenedor.
// Se usa la versión "legacy" de pdf.js, compatible con navegadores de celular más viejos.
// Este módulo (y pdf.js, ~0,5 MB + worker de ~1,3 MB) se carga solo al abrir una vista previa.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import urlWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = urlWorker;

/** @param {Blob} blob  @param {HTMLElement} contenedor */
export async function dibujarPaginasPdf(blob, contenedor) {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const documento = await tarea.promise;
  const estilo = getComputedStyle(contenedor);
  const ancho = contenedor.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  // Resolución según la pantalla (nítido en celulares), con tope para no usar demasiada memoria
  const densidad = Math.min(window.devicePixelRatio || 1, 2);

  const lienzos = [];
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const escala = ancho / pagina.getViewport({ scale: 1 }).width;
    const viewport = pagina.getViewport({ scale: escala * densidad });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.className = 'block w-full h-auto bg-white rounded shadow';
    canvas.setAttribute('aria-label', `Página ${n} de ${documento.numPages}`);
    await pagina.render({ canvas, viewport }).promise;
    lienzos.push(canvas);
  }
  contenedor.replaceChildren(...lienzos);
  await tarea.destroy(); // libera el worker y la memoria del documento
}
