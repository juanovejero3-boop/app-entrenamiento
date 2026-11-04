// Repo de nutrición guardado en el navegador del coach (localStorage). Es el prototipo: la pantalla usa solo
// esta interfaz (`cargarAlimentos` / `guardarAlimentos`), así que pasar a Supabase es cambiar el repo.
import { alimentosIniciales, normalizarAlimentos } from './alimentos.js';

export const CLAVE_ALIMENTOS = 'pp:v1:nutricion:alimentos';

/**
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} [obtenerAlmacen]  se pide recién al usarlo: en algunos
 *   navegadores (cookies bloqueadas) hasta acceder a `window.localStorage` tira un error
 */
export function crearRepoNutricionLocal(obtenerAlmacen = () => window.localStorage) {
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
      try {
        obtenerAlmacen().setItem(CLAVE_ALIMENTOS, JSON.stringify(lista));
      } catch (error) {
        throw new Error(`No se pudo guardar en este navegador (${error.message}).`, { cause: error });
      }
    },
  };
}

export const repoNutricion = crearRepoNutricionLocal();
