// Descarga de un PDF en el navegador. pdfmake y su tipografía (~2 MB) se cargan recién la
// primera vez que se usa, para no hacer más pesada la carga de la app.

let pdfMake = null;

async function cargarPdfMake() {
  if (!pdfMake) {
    const [motor, fuentes] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
    pdfMake = motor.default ?? motor;
    pdfMake.addVirtualFileSystem(fuentes.default ?? fuentes);
  }
  return pdfMake;
}

/** Genera el PDF a partir de la definición de documento y lo descarga con ese nombre. */
export async function descargarPdf(documento, nombreArchivo) {
  const motor = await cargarPdfMake();
  await motor.createPdf(documento).download(nombreArchivo);
}
