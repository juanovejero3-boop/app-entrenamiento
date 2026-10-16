// Nombre de archivo de los PDF: <tipo>-<alumno>-<fecha>.pdf
import { nombreDelAlumno } from './alumno.js';

/** "Ana Pérez" -> "ana-perez" */
const slug = (texto) =>
  String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * @param {string} tipo  'lineamientos' | 'entrenamiento'
 * @param {{ name?: string, email?: string }} alumno
 * @param {string} fecha  AAAA-MM-DD
 */
export function nombreArchivo(tipo, alumno, fecha) {
  return `${tipo}-${slug(nombreDelAlumno(alumno))}-${fecha}.pdf`;
}
