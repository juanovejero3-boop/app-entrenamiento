// Genera el PDF del plan de alimentación y lo muestra en la vista previa (con descargar y abrir).
import { hoyISO } from '../../lib/fecha.js';
import { mostrarProcesando, ocultarProcesando, toast } from '../../lib/ui.js';
import { generarPdfBlob } from '../coaching/pdf/generar.js';
import { nombreArchivo } from '../coaching/pdf/nombre.js';
import { abrirVistaPrevia } from '../coaching/pdf/vistaPrevia.js';
import { docPlanDeAlimentacion } from './pdfAlimentacion.js';

/**
 * @param {{ parametros: object, comidas: import('./comidas.js').Comida[], notas: string }} plan
 * @param {{ name?: string, email?: string }} alumno
 */
export async function mostrarPdfAlimentacion(plan, alumno) {
  const fecha = hoyISO();
  mostrarProcesando('Generando PDF...');
  try {
    const blob = await generarPdfBlob(docPlanDeAlimentacion(plan, alumno, { fecha }));
    await abrirVistaPrevia({
      blob,
      nombreArchivo: nombreArchivo('alimentacion', alumno, fecha),
      titulo: 'PDF del plan de alimentación',
    });
  } catch (error) {
    console.error('No se pudo generar el PDF', error);
    toast('No se pudo generar el PDF', false);
  } finally {
    ocultarProcesando();
  }
}
