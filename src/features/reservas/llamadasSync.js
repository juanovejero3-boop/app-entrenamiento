// Puente entre la agenda de este navegador y Supabase.
// Si nadie conectó el repo (los tests), todo sigue en localStorage.
// Agendar en Google Calendar lo hace el servidor (función agendar-llamada), no el navegador.
import { state } from '../../state.js';
import { guardarAgenda, guardarGrupales } from './reservaLocal.js';

let repo = null;
let script = { url: '', coachEmail: '', propio: true };
/** Por qué falló la última lectura ('' si anduvo, o si no hay repo). */
let errorDeLectura = '';

/** @param {ReturnType<import('./llamadasRepo.js').crearRepoLlamadas> | null} siguiente */
export function conectarLlamadas(siguiente) {
  repo = siguiente;
}

function rol() {
  if (!state.currentUser) return 'anon';
  return state.userProfile?.role === 'admin' ? 'admin' : 'alumno';
}

/** Baja jornadas, turnos y grupales. Devuelve false si no hay repo o falló la lectura. */
export async function traerLlamadas() {
  if (!repo) return false;
  const quien = rol();
  try {
    const datos = await repo.leer(quien);
    guardarAgenda(datos.jornadas, datos.turnos);
    guardarGrupales(datos.grupales);
    errorDeLectura = '';
    if (quien === 'admin') {
      try {
        script = await repo.leerScript(state.currentUser?.id);
      } catch (error) {
        console.warn('No se pudo leer el script del calendario.', error);
      }
    }
    return true;
  } catch (error) {
    console.warn('No se pudieron leer las llamadas.', error);
    errorDeLectura = error?.message || 'Error desconocido';
    return false;
  }
}

/** Por qué no se pudieron leer las llamadas la última vez ('' si se leyeron bien). */
export function errorAlTraer() {
  return errorDeLectura;
}

export function guardarJornadasRemotas(jornadas) {
  if (!repo) return Promise.resolve();
  return repo.guardarJornadas(jornadas, state.currentUser?.id ?? null);
}

export function anotarTurnoRemoto(turno, jornada) {
  if (!repo || !jornada) return Promise.resolve();
  return repo.anotar({
    ...turno,
    duracionMin: jornada.duracionMin,
    descansoMin: jornada.descansoMin,
  });
}

export function soltarTurnoRemoto(clave) {
  if (!repo) return Promise.resolve();
  return repo.soltar(clave);
}

export function publicarGrupalRemoto(grupal) {
  if (!repo) return Promise.resolve();
  return repo.publicarGrupal(grupal);
}

export function cancelarGrupalRemoto(id) {
  if (!repo) return Promise.resolve();
  return repo.cancelarGrupal(id);
}

export function urlScript() {
  return script.url;
}

/** Si el script que se usa lo cargó otro coach, su mail (el script es compartido); si es el propio, ''. */
export function scriptCompartidoDe() {
  return script.url && script.propio === false ? script.coachEmail : '';
}

/** Sin repo (tests) la agenda se ve. Con repo, solo si el coach ya guardó el script. */
export function scriptListo() {
  return !repo || Boolean(script.url.trim());
}

export function guardarScriptRemoto(url, coachEmail) {
  script = { url: (url || '').trim(), coachEmail: (coachEmail || '').trim(), propio: true };
  if (!repo) return Promise.resolve();
  return repo.guardarScript(script.url, script.coachEmail, state.currentUser?.id);
}

/**
 * Pide al servidor que agende el turno en el Google Calendar del coach. El turno ya está guardado: si esto falla,
 * queda marcado y el coach lo ve con su motivo para reintentar.
 * @returns {Promise<{ estado: string, error: string } | null>} null si no hay repo (tests)
 */
export async function agendarCalendario(turno) {
  if (!repo || !turno?.id) return null;
  try {
    return await repo.agendar(turno.id);
  } catch (error) {
    console.warn('No se pudo agendar en el calendario.', error);
    return { estado: 'error', error: error?.message || 'No se pudo agendar' };
  }
}
