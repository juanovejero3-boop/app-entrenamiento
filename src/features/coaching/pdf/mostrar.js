// Genera uno de los PDF de un plan ('lineamientos' o 'entrenamiento') y lo muestra en la
// vista previa. Lo usan el constructor del coach y la vista del alumno.
import { hoyISO } from '../../../lib/fecha.js';
import { mostrarProcesando, ocultarProcesando, toast } from '../../../lib/ui.js';
import { docEntrenamiento } from './entrenamiento.js';
import { generarPdfBlob } from './generar.js';
import { docLineamientos } from './lineamientos.js';
import { nombreArchivo } from './nombre.js';
import { abrirVistaPrevia } from './vistaPrevia.js';

const TITULOS = { lineamientos: 'PDF de lineamientos', entrenamiento: 'PDF del entrenamiento' };

/**
 * @param {'lineamientos' | 'entrenamiento'} tipo
 * @param {import('../entrenamiento/plan.js').PlanEntrenamiento} plan
 * @param {{ name?: string, email?: string }} alumno
 */
export async function mostrarPdf(tipo, plan, alumno) {
  const armar = tipo === 'lineamientos' ? docLineamientos : docEntrenamiento;
  const fecha = hoyISO();
  mostrarProcesando('Generando PDF...');
  try {
    const blob = await generarPdfBlob(armar(plan, alumno, { fecha }));
    await abrirVistaPrevia({ blob, nombreArchivo: nombreArchivo(tipo, alumno, fecha), titulo: TITULOS[tipo] });
  } catch (error) {
    console.error('No se pudo generar el PDF', error);
    toast('No se pudo generar el PDF', false);
  } finally {
    ocultarProcesando();
  }
}
