// Repositorio local de planes: guarda en el localStorage del navegador del entrenador.
// Es la implementación provisoria hasta que el entrenador apruebe la integración y los
// planes pasen a Supabase; la interfaz es asíncrona para que ese cambio no afecte a quien la usa.
import { normalizarRegistro } from '../alumno/registro.js';
import { normalizarPlan } from '../entrenamiento/plan.js';

const PREFIJO = 'pp:v1';
const claveEntrenamiento = (alumnoId) => `${PREFIJO}:entrenamiento:${alumnoId}`;
const claveRegistro = (alumnoId) => `${PREFIJO}:registro:${alumnoId}`;

function exigirAlumno(alumnoId) {
  if (!alumnoId) throw new Error('Falta el alumnoId');
}

/**
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} [storage]
 */
export function crearRepoLocal(storage = localStorage) {
  return {
    /** @returns {Promise<import('../entrenamiento/plan.js').PlanEntrenamiento | null>} */
    async cargarPlanEntrenamiento(alumnoId) {
      exigirAlumno(alumnoId);
      const crudo = storage.getItem(claveEntrenamiento(alumnoId));
      if (crudo === null) return null;
      try {
        return normalizarPlan(JSON.parse(crudo));
      } catch (error) {
        // No se borra el dato: queda en localStorage para poder recuperarlo a mano
        console.error(`Plan de entrenamiento ilegible para el alumno ${alumnoId}`, error);
        return null;
      }
    },

    /** Guarda (o reemplaza) el plan del alumno. Falla si el navegador no tiene espacio. */
    async guardarPlanEntrenamiento(alumnoId, plan) {
      exigirAlumno(alumnoId);
      storage.setItem(claveEntrenamiento(alumnoId), JSON.stringify(plan));
    },

    async eliminarPlanEntrenamiento(alumnoId) {
      exigirAlumno(alumnoId);
      storage.removeItem(claveEntrenamiento(alumnoId));
    },

    /** Lo que anotó el alumno al entrenar (kg, reps y check por serie). Vacío si no hay nada. */
    async cargarRegistro(alumnoId) {
      exigirAlumno(alumnoId);
      const crudo = storage.getItem(claveRegistro(alumnoId));
      if (crudo === null) return {};
      try {
        return normalizarRegistro(JSON.parse(crudo));
      } catch (error) {
        // No se borra: queda en localStorage para poder recuperarlo a mano
        console.error(`Registro de entrenamiento ilegible para el alumno ${alumnoId}`, error);
        return {};
      }
    },

    async guardarRegistro(alumnoId, registro) {
      exigirAlumno(alumnoId);
      storage.setItem(claveRegistro(alumnoId), JSON.stringify(registro));
    },
  };
}
