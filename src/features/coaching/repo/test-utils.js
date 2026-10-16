// Atajos para los tests de pantallas: trabajan con "el ciclo activo" de un alumno sobre el repo de
// prueba (src/test-setup.js).
import { cicloActivo } from '../ciclos/ciclos.js';
import { crearPlan } from '../entrenamiento/plan.js';
import { repo } from './index.js';

/** Deja `plan` como el ciclo activo del alumno (lo crea si no tiene uno). @returns {Promise<string>} el id del ciclo */
export async function sembrarPlan(alumnoId, plan = crearPlan({ fechaInicio: '2026-10-19' })) {
  const activo = cicloActivo(await repo.listarCiclos(alumnoId));
  if (activo) {
    await repo.guardarPlanDelCiclo(activo.id, plan);
    return activo.id;
  }
  return (await repo.crearCiclo(alumnoId, plan, 'activo')).id;
}

/** @returns {Promise<string>} */
async function idActivo(alumnoId) {
  const activo = cicloActivo(await repo.listarCiclos(alumnoId));
  if (!activo) throw new Error(`El alumno ${alumnoId} no tiene un ciclo activo`);
  return activo.id;
}

export async function planActivoDe(alumnoId) {
  return cicloActivo(await repo.listarCiclos(alumnoId))?.plan ?? null;
}
export const registroDe = async (alumnoId) => repo.cargarRegistroDelCiclo(await idActivo(alumnoId));
export const sesionesDe = async (alumnoId) => repo.cargarSesionesDelCiclo(await idActivo(alumnoId));
export const guardarRegistroDe = async (alumnoId, registro) =>
  repo.guardarRegistroDelCiclo(await idActivo(alumnoId), registro);
export const guardarSesionesDe = async (alumnoId, sesiones) =>
  repo.guardarSesionesDelCiclo(await idActivo(alumnoId), sesiones);
