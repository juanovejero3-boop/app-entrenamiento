// Repo de nutrición guardado en el navegador del coach (localStorage). Es el prototipo: la pantalla usa solo
// esta interfaz (`cargarAlimentos` / `guardarAlimentos`), así que pasar a Supabase es cambiar el repo.
import { alimentosIniciales, normalizarAlimentos } from './alimentos.js';
import { normalizarComidas } from './comidas.js';
import { normalizarParametros } from './objetivos.js';

export const CLAVE_ALIMENTOS = 'pp:v1:nutricion:alimentos';
export const claveDelPlan = (alumnoId) => `pp:v1:nutricion:plan:${alumnoId}`;

/** @typedef {{ parametros: import('./objetivos.js').Parametros, comidas: import('./comidas.js').Comida[] }} PlanDeNutricion */

/**
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} [obtenerAlmacen]  se pide recién al usarlo: en algunos
 *   navegadores (cookies bloqueadas) hasta acceder a `window.localStorage` tira un error
 */
export function crearRepoNutricionLocal(obtenerAlmacen = () => window.localStorage) {
  const guardar = (clave, dato) => {
    try {
      obtenerAlmacen().setItem(clave, JSON.stringify(dato));
    } catch (error) {
      throw new Error(`No se pudo guardar en este navegador (${error.message}).`, { cause: error });
    }
  };

  return {
    /** Los alimentos guardados; la primera vez (o si lo guardado no sirve) arranca con la base del coach. */
    cargarAlimentos() {
      try {
        const lista = normalizarAlimentos(JSON.parse(obtenerAlmacen().getItem(CLAVE_ALIMENTOS)));
        if (lista) return lista;
      } catch {
        // sin datos, datos rotos o almacenamiento bloqueado: se arranca de cero
      }
      const base = alimentosIniciales();
      try {
        obtenerAlmacen().setItem(CLAVE_ALIMENTOS, JSON.stringify(base)); // para que los ids no cambien en cada carga
      } catch {
        // se usa la base en memoria
      }
      return base;
    },

    /** @throws {Error} si el navegador no deja guardar (por ejemplo, sin espacio o en modo privado) */
    guardarAlimentos(lista) {
      guardar(CLAVE_ALIMENTOS, lista);
    },

    /** El plan de nutrición del alumno, o null si todavía no tiene (o lo guardado no sirve). */
    cargarPlan(alumnoId) {
      try {
        const dato = JSON.parse(obtenerAlmacen().getItem(claveDelPlan(alumnoId)));
        if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) return null;
        return { parametros: normalizarParametros(dato.parametros), comidas: normalizarComidas(dato.comidas) };
      } catch {
        return null;
      }
    },

    /** @throws {Error} si el navegador no deja guardar */
    guardarPlan(alumnoId, plan) {
      guardar(claveDelPlan(alumnoId), plan);
    },
  };
}

export const repoNutricion = crearRepoNutricionLocal();
