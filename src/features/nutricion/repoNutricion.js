// El repo de nutrición que usa la app. Todo vive en Supabase:
// - Los planes de los alumnos (repoPlanes.js): el coach los prepara y los muestra al alumno.
// - La biblioteca de alimentos (repoAlimentos.js), compartida entre los coaches.
// El navegador (repoLocal.js) queda solo para pasar a la cuenta lo que el coach armó cuando todo se guardaba ahí:
// la biblioteca se suma una vez por navegador, y un plan de prueba se sigue viendo (como borrador) hasta que el
// coach lo guarda en su cuenta; desde ahí manda el de Supabase.
import { plano } from '../../lib/texto.js';
import { clienteSupabase } from '../coaching/repo/index.js';
import { crearRepoNutricionLocal } from './repoLocal.js';
import { crearRepoAlimentos } from './repoAlimentos.js';
import { crearRepoPlanes } from './repoPlanes.js';

/** Dos alimentos son el mismo si tienen la misma categoría y el mismo nombre (sin importar mayúsculas ni tildes). */
const clave = (a) => `${a.categoria}|${plano(a.nombre)}`;

/**
 * @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js
 * @param {ReturnType<typeof crearRepoNutricionLocal>} [local]
 */
export function crearRepoNutricion(cliente, local = crearRepoNutricionLocal()) {
  const planes = crearRepoPlanes(cliente);
  const alimentos = crearRepoAlimentos(cliente);
  return {
    /**
     * La biblioteca de los coaches. La primera vez en cada navegador suma lo que el coach tenía guardado ahí (o la
     * base inicial si no tenía nada), sin repetir alimentos; si no se puede, carga igual y lo reintenta la próxima vez.
     */
    async cargarAlimentos() {
      let lista = await alimentos.cargarAlimentos();
      if (local.alimentosSubidos()) return lista;
      try {
        const existentes = new Set(lista.map(clave));
        const faltan = local.cargarAlimentos().filter((a) => !existentes.has(clave(a)));
        if (faltan.length) {
          await alimentos.agregarAlimentos(faltan);
          lista = await alimentos.cargarAlimentos();
        }
        local.marcarAlimentosSubidos();
      } catch {
        // se muestra lo que ya hay y se vuelve a intentar la próxima vez
      }
      return lista;
    },

    guardarAlimentos: (lista) => alimentos.guardarAlimentos(lista),

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
