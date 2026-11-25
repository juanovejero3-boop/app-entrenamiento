// Puente entre la agenda de este navegador y Supabase.
// Si nadie conectó el repo (los tests), todo sigue en localStorage.
import { state } from '../../state.js';
import { guardarAgenda, guardarGrupales } from './reservaLocal.js';

let repo = null;
let script = { url: '', coachEmail: '' };

/** Lo que hoy recibe el script, más el mail del coach para invitar a los dos. */
export function pedidoCalendario(turno, jornada, coachEmail) {
  const alumno = (turno.email || '').trim();
  const coach = (coachEmail || '').trim();
  return {
    id: Date.now(),
    service: turno.agendaId === 'primera' ? 'Evaluación Inicial & Onboarding' : 'Seguimiento Semanal de Progreso',
    date: turno.fecha,
    time: turno.hora,
    clientName: turno.nombre || '',
    clientEmail: alumno,
    coachEmail: coach,
    attendees: [alumno, coach].filter(Boolean),
    clientPhone: turno.telefono || '',
    notes: turno.notas || '',
    duracionMin: jornada?.duracionMin ?? 0,
  };
}

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
  try {
    const datos = await repo.leer(rol());
    guardarAgenda(datos.jornadas, datos.turnos);
    guardarGrupales(datos.grupales);
    try {
      script = await repo.leerScript();
    } catch (error) {
      console.warn('No se pudo leer el script del calendario.', error);
    }
    return true;
  } catch (error) {
    console.warn('No se pudieron leer las llamadas.', error);
    return false;
  }
}

export function guardarJornadasRemotas(jornadas) {
  if (!repo) return Promise.resolve();
  return repo.guardarJornadas(jornadas);
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

/** Sin repo (tests) la agenda se ve. Con repo, solo si el coach ya guardó el script. */
export function scriptListo() {
  return !repo || Boolean(script.url.trim());
}

export function guardarScriptRemoto(url, coachEmail) {
  script = { url: (url || '').trim(), coachEmail: (coachEmail || '').trim() };
  if (!repo) return Promise.resolve();
  return repo.guardarScript(script.url, script.coachEmail);
}

/** Avisa al script del coach. Si no hay URL o falla, el turno igual queda guardado. */
export async function avisarCalendario(turno, jornada) {
  if (repo) {
    try {
      script = await repo.leerScript();
    } catch {
      // Sigue con la URL que ya teníamos.
    }
  }
  if (!script.url) return false;
  try {
    await fetch(script.url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedidoCalendario(turno, jornada, script.coachEmail)),
    });
    return true;
  } catch (error) {
    console.warn('No se pudo agendar en el calendario.', error);
    return false;
  }
}
