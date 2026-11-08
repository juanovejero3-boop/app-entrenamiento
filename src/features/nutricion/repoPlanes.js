// Repositorio de los planes de nutrición en Supabase: un plan por alumno (tabla nutrition_plans, ver la
// migración 20261108000000_nutrition_plans.sql). Los permisos los resuelve RLS en la base: el coach lee y
// escribe todos y el alumno solo lee el suyo y solo si el coach lo publicó; acá no se confía en nada del cliente.
import { normalizarComidas } from './comidas.js';
import { normalizarParametros } from './objetivos.js';

export const MAX_NOTAS = 2000;

/**
 * @typedef {{
 *   parametros: import('./objetivos.js').Parametros, comidas: import('./comidas.js').Comida[],
 *   notas: string
 * }} PlanDeNutricion  notas: las aclaraciones del coach para el alumno
 * @typedef {PlanDeNutricion & { publicado: boolean }} PlanGuardado
 */

const COLUMNAS = 'student_id, parametros, comidas, notas, published';

/** Devuelve `data` o lanza el error de Supabase como un Error normal. */
function datos({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** @returns {PlanGuardado} el plan de una fila, con lo guardado normalizado (por si no sirve) */
function aPlan(fila) {
  return {
    parametros: normalizarParametros(fila.parametros),
    comidas: normalizarComidas(fila.comidas),
    notas: typeof fila.notas === 'string' ? fila.notas.slice(0, MAX_NOTAS) : '',
    publicado: fila.published === true,
  };
}

/** @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js */
export function crearRepoPlanes(cliente) {
  return {
    /** El plan del alumno, o null si todavía no tiene (o, siendo alumno, todavía no se lo publicaron). */
    async cargarPlan(alumnoId) {
      const fila = datos(
        await cliente.from('nutrition_plans').select(COLUMNAS).eq('student_id', alumnoId).maybeSingle(),
      );
      return fila ? aPlan(fila) : null;
    },

    /** Guarda el plan sin tocar si está publicado o no. */
    async guardarPlan(alumnoId, plan) {
      datos(
        await cliente.from('nutrition_plans').upsert(
          {
            student_id: alumnoId,
            parametros: plan.parametros,
            comidas: plan.comidas,
            notas: plan.notas.slice(0, MAX_NOTAS),
          },
          { onConflict: 'student_id' },
        ),
      );
    },

    /** Muestra (o esconde) el plan al alumno. @throws {Error} si el alumno todavía no tiene un plan guardado */
    async publicarPlan(alumnoId, publicado) {
      const filas = datos(
        await cliente
          .from('nutrition_plans')
          .update({ published: publicado, published_at: publicado ? new Date().toISOString() : null })
          .eq('student_id', alumnoId)
          .select('student_id'),
      );
      if (!filas?.length) throw new Error('Este alumno todavía no tiene un plan guardado');
    },

    /** Qué alumnos tienen plan y si está publicado (una sola consulta, para la lista de alumnos). */
    async listarPlanes() {
      const filas = datos(await cliente.from('nutrition_plans').select('student_id, published'));
      return filas.map((f) => ({ alumnoId: f.student_id, publicado: f.published === true }));
    },
  };
}
