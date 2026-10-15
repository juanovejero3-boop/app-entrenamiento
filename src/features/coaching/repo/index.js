// Punto de entrada único para guardar y cargar planes. Las pantallas importan `repo`
// desde acá y no saben dónde viven los datos.
//
// Hoy: localStorage del navegador del entrenador (mientras aprueba la integración).
// Después: una implementación con Supabase con las mismas funciones; el cambio es esta línea.
import { crearRepoLocal } from './local.js';

export const repo = crearRepoLocal();
