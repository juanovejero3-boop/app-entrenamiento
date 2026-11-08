// El repo de nutrición que usa la app: junta dos fuentes.
// - Los planes de los alumnos viven en Supabase (repoPlanes.js): el coach los prepara y los muestra al alumno.
// - La biblioteca de alimentos sigue guardada en el navegador del coach (repoLocal.js) hasta que también pase a la nube.
// Mientras tanto, un plan que el coach armó cuando todo se guardaba en su navegador se sigue viendo (como borrador)
// hasta que lo guarda en su cuenta; desde ahí manda el de Supabase.
import { clienteSupabase } from '../coaching/repo/index.js';
import { crearRepoNutricionLocal } from './repoLocal.js';
import { crearRepoPlanes } from './repoPlanes.js';

/**
 * @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js
 * @param {ReturnType<typeof crearRepoNutricionLocal>} [local]
 */
export function crearRepoNutricion(cliente, local = crearRepoNutricionLocal()) {
  const planes = crearRepoPlanes(cliente);
  return {
    cargarAlimentos: () => local.cargarAlimentos(),
    guardarAlimentos: (lista) => local.guardarAlimentos(lista),

    async cargarPlan(alumnoId) {
      const guardado = await planes.cargarPlan(alumnoId);
      if (guardado) return guardado;
      const delNavegador = local.cargarPlan(alumnoId);
      return delNavegador ? { ...delNavegador, publicado: false } : null;
    },

    guardarPlan: (alumnoId, plan) => planes.guardarPlan(alumnoId, plan),
    publicarPlan: (alumnoId, publicado) => planes.publicarPlan(alumnoId, publicado),

    /** Qué alumnos tienen plan y si está publicado; suma los de `alumnoIds` que solo están en el navegador. */
    async listarPlanes(alumnoIds = []) {
      const lista = await planes.listarPlanes();
      const enLaNube = new Set(lista.map((p) => p.alumnoId));
      const soloLocales = alumnoIds
        .filter((id) => !enLaNube.has(id) && local.cargarPlan(id))
        .map((alumnoId) => ({ alumnoId, publicado: false }));
      return [...lista, ...soloLocales];
    },
  };
}

export const repoNutricion = crearRepoNutricion(clienteSupabase);
