// Repositorio de la biblioteca de alimentos en Supabase: una sola biblioteca compartida por los coaches (tabla
// nutrition_foods, ver la migración 20261108000001_nutrition_foods.sql). Los permisos los resuelve RLS en la base:
// solo los coaches la leen y la escriben.
import { normalizarAlimentos } from './alimentos.js';

const COLUMNAS = 'id, categoria, nombre, porcion, gluten, lacteo';

/** Devuelve `data` o lanza el error de Supabase como un Error normal. */
function datos({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** Lo que identifica el contenido de un alimento (para saber si cambió respecto de lo que hay en la base). */
const contenido = (a) => [a.categoria, a.nombre, a.porcion, a.gluten, a.lacteo].join('|');

const aFila = (a) => ({
  id: a.id,
  categoria: a.categoria,
  nombre: a.nombre.trim().slice(0, 300),
  porcion: a.porcion.trim().slice(0, 120),
  gluten: a.gluten === true,
  lacteo: a.lacteo === true,
});

/** @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js */
export function crearRepoAlimentos(cliente) {
  /** Lo último que se sabe que está en la base (id → contenido): con eso se manda solo lo que cambió. */
  let conocidos = new Map();
  const recordar = (lista) => {
    conocidos = new Map(lista.map((a) => [a.id, contenido(a)]));
  };

  return {
    /** La biblioteca completa; descarta lo que no sirve (categoría desconocida, sin nombre). */
    async cargarAlimentos() {
      const filas = datos(await cliente.from('nutrition_foods').select(COLUMNAS));
      const lista = normalizarAlimentos(filas) ?? [];
      recordar(lista);
      return lista;
    },

    /**
     * Deja la biblioteca como `lista`, pero tocando solo lo que este coach cambió o quitó desde que la cargó: así no
     * pisa lo que otro coach haya agregado mientras tanto.
     */
    async guardarAlimentos(lista) {
      const ids = new Set(lista.map((a) => a.id));
      const cambiados = lista.filter((a) => conocidos.get(a.id) !== contenido(a));
      const quitados = [...conocidos.keys()].filter((id) => !ids.has(id));
      if (cambiados.length) {
        datos(await cliente.from('nutrition_foods').upsert(cambiados.map(aFila), { onConflict: 'id' }));
      }
      if (quitados.length) datos(await cliente.from('nutrition_foods').delete().in('id', quitados));
      recordar(lista);
    },

    /** Suma alimentos a la biblioteca sin tocar los que ya están (por id). */
    async agregarAlimentos(lista) {
      if (!lista.length) return;
      datos(
        await cliente.from('nutrition_foods').upsert(lista.map(aFila), { onConflict: 'id', ignoreDuplicates: true }),
      );
    },
  };
}
