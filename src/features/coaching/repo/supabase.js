// Repositorio de entrenamiento en Supabase.
// Un alumno tiene N ciclos (training_cycles); el registro de series y las sesiones cuelgan de cada
// ciclo. Los permisos los resuelve RLS en la base (ver la migración 20261016000000_training_tables.sql):
// el alumno solo ve sus ciclos activos y finalizados y anota solo en el activo; acá no se confía en
// nada del cliente.
import { normalizarRegistro } from '../alumno/registro.js';
import { normalizarSesiones } from '../alumno/sesiones.js';
import { normalizarPlan } from '../entrenamiento/plan.js';

/** @typedef {'borrador' | 'activo' | 'finalizado'} EstadoCiclo */
/**
 * @typedef {{
 *   id: string, alumnoId: string, estado: EstadoCiclo,
 *   plan: import('../entrenamiento/plan.js').PlanEntrenamiento,
 *   finalizadoEn: string | null, creadoEn: string
 * }} Ciclo
 */

const COLUMNAS_CICLO = 'id, student_id, status, plan, finished_at, created_at';

function exigir(valor, nombre) {
  if (!valor) throw new Error(`Falta el ${nombre}`);
}

/** Devuelve `data` o lanza el error de Supabase como un Error normal. */
function datos({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** Filas a mandar y claves a borrar para pasar de `antes` a `despues` (ambos indexados por clave). */
function diferencias(antes, despues) {
  const cambiadas = Object.keys(despues).filter((k) => JSON.stringify(despues[k]) !== JSON.stringify(antes[k]));
  const borradas = Object.keys(antes).filter((k) => !(k in despues));
  return { cambiadas, borradas };
}

/** Aplana el registro { ejercicio: { n: serie } } a { 'ejercicio|n': { ejercicio, n, ...serie } }. */
function aplanarRegistro(registro) {
  const plano = {};
  for (const [ejercicio, series] of Object.entries(registro)) {
    for (const [n, serie] of Object.entries(series)) plano[`${ejercicio}|${n}`] = { ejercicio, n: Number(n), ...serie };
  }
  return plano;
}

/** @returns {Ciclo} */
function aCiclo(fila) {
  return {
    id: fila.id,
    alumnoId: fila.student_id,
    estado: fila.status,
    plan: normalizarPlan(fila.plan),
    finalizadoEn: fila.finished_at ?? null,
    creadoEn: fila.created_at,
  };
}

/**
 * @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js
 */
export function crearRepoSupabase(cliente) {
  /** A qué alumno pertenece cada ciclo (hace falta para escribir sus series y sesiones). */
  const alumnoDelCiclo = new Map();
  /** Lo último que se sabe que está en la base, para mandar solo lo que cambió. */
  const registros = new Map();
  const sesiones = new Map();

  async function alumnoDe(cicloId) {
    exigir(cicloId, 'cicloId');
    if (!alumnoDelCiclo.has(cicloId)) {
      const fila = datos(await cliente.from('training_cycles').select('student_id').eq('id', cicloId).maybeSingle());
      if (!fila) throw new Error('El ciclo no existe o no tenés permiso para verlo');
      alumnoDelCiclo.set(cicloId, fila.student_id);
    }
    return alumnoDelCiclo.get(cicloId);
  }

  /** Actualiza el ciclo; si la base no tocó ninguna fila (sin permiso o ciclo inexistente) lo avisa. */
  async function actualizarCiclo(cicloId, cambios) {
    exigir(cicloId, 'cicloId');
    const filas = datos(await cliente.from('training_cycles').update(cambios).eq('id', cicloId).select('id'));
    if (!filas.length) throw new Error('No se pudo actualizar el ciclo (no existe o no tenés permiso)');
  }

  return {
    // -----------------------------------------------------------------------
    // Ciclos
    // -----------------------------------------------------------------------

    /**
     * Los ciclos del alumno, del más viejo al más nuevo. El admin ve todos; el alumno, solo los
     * activos y finalizados (lo decide la base).
     * @returns {Promise<Ciclo[]>}
     */
    async listarCiclos(alumnoId) {
      exigir(alumnoId, 'alumnoId');
      const filas = datos(
        await cliente
          .from('training_cycles')
          .select(COLUMNAS_CICLO)
          .eq('student_id', alumnoId)
          .order('created_at', { ascending: true }),
      );
      for (const f of filas) alumnoDelCiclo.set(f.id, f.student_id);
      return filas.map(aCiclo);
    },

    /**
     * Crea un ciclo para el alumno. Nace en borrador (el alumno no lo ve) salvo que se pida otro estado.
     * @returns {Promise<Ciclo>}
     */
    async crearCiclo(alumnoId, plan, estado = 'borrador') {
      exigir(alumnoId, 'alumnoId');
      const fila = datos(
        await cliente
          .from('training_cycles')
          .insert({ student_id: alumnoId, status: estado, plan })
          .select(COLUMNAS_CICLO)
          .single(),
      );
      alumnoDelCiclo.set(fila.id, alumnoId);
      return aCiclo(fila);
    },

    /** Reemplaza el plan del ciclo. */
    async guardarPlanDelCiclo(cicloId, plan) {
      await actualizarCiclo(cicloId, { plan });
    },

    /**
     * Cambia el estado del ciclo: 'activo' lo muestra al alumno, 'borrador' lo oculta y 'finalizado'
     * lo cierra (guarda cuándo). La base permite un solo ciclo activo por alumno: hay que
     * finalizar u ocultar el otro antes.
     */
    async cambiarEstadoDelCiclo(cicloId, estado) {
      await actualizarCiclo(cicloId, {
        status: estado,
        finished_at: estado === 'finalizado' ? new Date().toISOString() : null,
      });
    },

    /** Borra el ciclo y, con él, todo lo que el alumno anotó (series y sesiones). No se puede deshacer. */
    async eliminarCiclo(cicloId) {
      exigir(cicloId, 'cicloId');
      const filas = datos(await cliente.from('training_cycles').delete().eq('id', cicloId).select('id'));
      if (!filas.length) throw new Error('No se pudo eliminar el ciclo (no existe o no tenés permiso)');
      alumnoDelCiclo.delete(cicloId);
      registros.delete(cicloId);
      sesiones.delete(cicloId);
    },

    // -----------------------------------------------------------------------
    // Lo que anota el alumno en un ciclo
    // -----------------------------------------------------------------------

    /** Kg, reps y estado por serie. Vacío si no anotó nada. */
    async cargarRegistroDelCiclo(cicloId) {
      exigir(cicloId, 'cicloId');
      const filas = datos(await cliente.from('training_set_logs').select('*').eq('cycle_id', cicloId));
      const crudo = {};
      for (const f of filas) {
        crudo[f.exercise_id] = {
          ...crudo[f.exercise_id],
          [f.set_n]: { kg: f.kg, reps: f.reps, done: f.done, skipped: f.skipped },
        };
      }
      const registro = normalizarRegistro(crudo);
      registros.set(cicloId, structuredClone(registro));
      return registro;
    },

    /** Guarda el registro mandando solo las series que cambiaron desde la última carga o guardado. */
    async guardarRegistroDelCiclo(cicloId, registro) {
      const alumnoId = await alumnoDe(cicloId);
      const antes = aplanarRegistro(registros.get(cicloId) ?? {});
      const despues = aplanarRegistro(registro);
      const { cambiadas, borradas } = diferencias(antes, despues);

      if (cambiadas.length) {
        const ahora = new Date().toISOString();
        const filas = cambiadas.map((k) => {
          const { ejercicio, n, kg, reps, done, skipped } = despues[k];
          return {
            cycle_id: cicloId,
            student_id: alumnoId,
            exercise_id: ejercicio,
            set_n: n,
            kg,
            reps,
            done,
            skipped,
            updated_at: ahora,
          };
        });
        datos(await cliente.from('training_set_logs').upsert(filas, { onConflict: 'cycle_id,exercise_id,set_n' }));
      }
      for (const k of borradas) {
        const { ejercicio, n } = antes[k];
        datos(
          await cliente
            .from('training_set_logs')
            .delete()
            .eq('cycle_id', cicloId)
            .eq('exercise_id', ejercicio)
            .eq('set_n', n),
        );
      }
      registros.set(cicloId, structuredClone(registro));
    },

    /** Los días terminados (o no entrenados), indexados por id de día. Vacío si no hay ninguno. */
    async cargarSesionesDelCiclo(cicloId) {
      exigir(cicloId, 'cicloId');
      const filas = datos(await cliente.from('training_sessions').select('*').eq('cycle_id', cicloId));
      const crudo = {};
      for (const f of filas) crudo[f.day_id] = { fecha: f.fecha, terminadaEn: f.terminada_en, estado: f.estado };
      const lista = normalizarSesiones(crudo);
      sesiones.set(cicloId, structuredClone(lista));
      return lista;
    },

    async guardarSesionesDelCiclo(cicloId, lista) {
      const alumnoId = await alumnoDe(cicloId);
      const antes = sesiones.get(cicloId) ?? {};
      const { cambiadas, borradas } = diferencias(antes, lista);

      if (cambiadas.length) {
        const filas = cambiadas.map((dia) => ({
          cycle_id: cicloId,
          student_id: alumnoId,
          day_id: dia,
          fecha: lista[dia].fecha,
          estado: lista[dia].estado,
          terminada_en: lista[dia].terminadaEn || new Date().toISOString(),
        }));
        datos(await cliente.from('training_sessions').upsert(filas, { onConflict: 'cycle_id,day_id' }));
      }
      if (borradas.length) {
        datos(await cliente.from('training_sessions').delete().eq('cycle_id', cicloId).in('day_id', borradas));
      }
      sesiones.set(cicloId, structuredClone(lista));
    },
  };
}
