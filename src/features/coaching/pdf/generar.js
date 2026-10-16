// Genera un PDF en memoria (Blob) en el navegador. pdfmake y su tipografía (~2 MB) se cargan
// recién la primera vez que se usa, para no hacer más pesada la carga de la app.

let pdfMake = null;

async function cargarPdfMake() {
  if (!pdfMake) {
    const [motor, fuentes] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
    pdfMake = motor.default ?? motor;
    pdfMake.addVirtualFileSystem(fuentes.default ?? fuentes);
  }
  return pdfMake;
}

/** @returns {Promise<Blob>} el PDF de esa definición de documento */
export async function generarPdfBlob(documento) {
  const motor = await cargarPdfMake();
  return motor.createPdf(documento).getBlob();
}
