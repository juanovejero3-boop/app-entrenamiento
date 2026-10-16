// Repositorio de planes en Supabase: misma interfaz que el repo local.
// El "plan del alumno" es su ciclo activo (training_cycles, status 'activo'); el registro de series y
// las sesiones cuelgan de ese ciclo. Los permisos los resuelve RLS en la base (ver la migración
// 20261016000000_training_tables.sql); acá no se confía en nada del cliente.
import { normalizarRegistro } from '../alumno/registro.js';
import { normalizarSesiones } from '../alumno/sesiones.js';
import { normalizarPlan } from '../entrenamiento/plan.js';

function exigirAlumno(alumnoId) {
  if (!alumnoId) throw new Error('Falta el alumnoId');
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

/**
 * @param {{ from: (tabla: string) => any }} cliente  el cliente de supabase-js
 */
export function crearRepoSupabase(cliente) {
  /** id del ciclo activo por alumno (solo se guardan los que existen). */
  const ciclos = new Map();
  /** Lo último que se sabe que está en la base, para mandar solo lo que cambió. */
  const registros = new Map();
  const sesiones = new Map();

  async function buscarCicloActivo(alumnoId) {
    const fila = datos(
      await cliente
        .from('training_cycles')
        .select('id, plan')
        .eq('student_id', alumnoId)
        .eq('status', 'activo')
        .maybeSingle(),
    );
    if (fila) ciclos.set(alumnoId, fila.id);
    else ciclos.delete(alumnoId);
    return fila;
  }

  async function cicloId(alumnoId) {
    return ciclos.get(alumnoId) ?? (await buscarCicloActivo(alumnoId))?.id ?? null;
  }

  async function cicloIdObligatorio(alumnoId) {
    const id = await cicloId(alumnoId);
    if (!id) throw new Error('El alumno no tiene un plan activo donde guardar');
    return id;
  }

  return {
    /** @returns {Promise<import('../entrenamiento/plan.js').PlanEntrenamiento | null>} */
    async cargarPlanEntrenamiento(alumnoId) {
      exigirAlumno(alumnoId);
      const fila = await buscarCicloActivo(alumnoId);
      return fila ? normalizarPlan(fila.plan) : null;
    },

    /** Guarda (o reemplaza) el plan del ciclo activo; si el alumno no tiene uno, lo crea. */
    async guardarPlanEntrenamiento(alumnoId, plan) {
      exigirAlumno(alumnoId);
      const id = await cicloId(alumnoId);
      if (id) {
        datos(await cliente.from('training_cycles').update({ plan }).eq('id', id));
        return;
      }
      const creado = datos(
        await cliente
          .from('training_cycles')
          .insert({ student_id: alumnoId, status: 'activo', plan })
          .select('id')
          .single(),
      );
      ciclos.set(alumnoId, creado.id);
    },

    /** Lo que anotó el alumno al entrenar (kg, reps y estado por serie). Vacío si no hay nada. */
    async cargarRegistro(alumnoId) {
      exigirAlumno(alumnoId);
      const id = await cicloId(alumnoId);
      if (!id) {
        registros.delete(alumnoId);
        return {};
      }
      const filas = datos(await cliente.from('training_set_logs').select('*').eq('cycle_id', id));
      const crudo = {};
      for (const f of filas) {
        crudo[f.exercise_id] = {
          ...crudo[f.exercise_id],
          [f.set_n]: { kg: f.kg, reps: f.reps, done: f.done, skipped: f.skipped },
        };
      }
      const registro = normalizarRegistro(crudo);
      registros.set(alumnoId, structuredClone(registro));
      return registro;
    },

    async guardarRegistro(alumnoId, registro) {
      exigirAlumno(alumnoId);
      const id = await cicloIdObligatorio(alumnoId);
      const antes = aplanarRegistro(registros.get(alumnoId) ?? {});
      const despues = aplanarRegistro(registro);
      const { cambiadas, borradas } = diferencias(antes, despues);

      if (cambiadas.length) {
        const ahora = new Date().toISOString();
        const filas = cambiadas.map((k) => {
          const { ejercicio, n, kg, reps, done, skipped } = despues[k];
          return {
            cycle_id: id,
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
            .eq('cycle_id', id)
            .eq('exercise_id', ejercicio)
            .eq('set_n', n),
        );
      }
      registros.set(alumnoId, structuredClone(registro));
    },

    /** Los días que el alumno terminó (o no entrenó), indexados por id de día. Vacío si no hay ninguno. */
    async cargarSesiones(alumnoId) {
      exigirAlumno(alumnoId);
      const id = await cicloId(alumnoId);
      if (!id) {
        sesiones.delete(alumnoId);
        return {};
      }
      const filas = datos(await cliente.from('training_sessions').select('*').eq('cycle_id', id));
      const crudo = {};
      for (const f of filas) crudo[f.day_id] = { fecha: f.fecha, terminadaEn: f.terminada_en, estado: f.estado };
      const lista = normalizarSesiones(crudo);
      sesiones.set(alumnoId, structuredClone(lista));
      return lista;
    },

    async guardarSesiones(alumnoId, lista) {
      exigirAlumno(alumnoId);
      const id = await cicloIdObligatorio(alumnoId);
      const antes = sesiones.get(alumnoId) ?? {};
      const { cambiadas, borradas } = diferencias(antes, lista);

      if (cambiadas.length) {
        const filas = cambiadas.map((dia) => ({
          cycle_id: id,
          student_id: alumnoId,
          day_id: dia,
          fecha: lista[dia].fecha,
          estado: lista[dia].estado,
          terminada_en: lista[dia].terminadaEn || new Date().toISOString(),
        }));
        datos(await cliente.from('training_sessions').upsert(filas, { onConflict: 'cycle_id,day_id' }));
      }
      if (borradas.length) {
        datos(await cliente.from('training_sessions').delete().eq('cycle_id', id).in('day_id', borradas));
      }
      sesiones.set(alumnoId, structuredClone(lista));
    },
  };
}
