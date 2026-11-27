// Llamadas en Supabase (call_openings, call_bookings, group_calls, call_coaches).
// RLS decide quién ve el teléfono: el coach ve todos, el alumno solo el suyo,
// y quien reserva ve los horarios ocupados sin nombre ni teléfono.
// Agendar en Google Calendar lo hace la función `agendar-llamada` del servidor: la dirección del
// script del coach no llega al navegador, y el resultado queda guardado en cada turno.

const horaCorta = (hora) => String(hora || '').slice(0, 5);

function datos({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

function aJornada(fila) {
  return {
    agendaId: fila.agenda,
    fecha: fila.fecha,
    desde: horaCorta(fila.desde),
    hasta: horaCorta(fila.hasta),
    duracionMin: fila.duracion_min,
    descansoMin: fila.descanso_min,
  };
}

function aTurno(fila) {
  return {
    ...(fila.id ? { id: fila.id } : {}),
    ...(fila.calendario_estado
      ? { calendarioEstado: fila.calendario_estado, calendarioError: fila.calendario_error || '' }
      : {}),
    agendaId: fila.agenda,
    fecha: fila.fecha,
    hora: horaCorta(fila.hora),
    nombre: fila.nombre || '',
    email: fila.email || '',
    telefono: fila.telefono || '',
    notas: fila.notas || '',
    duracionMin: fila.duracion_min,
    descansoMin: fila.descanso_min,
  };
}

function aGrupal(fila) {
  return { id: fila.id, fecha: fila.fecha, hora: horaCorta(fila.hora), enlace: fila.enlace };
}

const clave = (turno) => `${turno.agendaId}|${turno.fecha}|${turno.hora}`;

const COLUMNAS_TURNO =
  'id, agenda, fecha, hora, duracion_min, descanso_min, nombre, email, telefono, notas, calendario_estado, calendario_error';

/** El mensaje que mandó la función del servidor (si lo hay) o el del propio error. */
async function mensajeDeError(error) {
  try {
    const detalle = await error.context?.json?.();
    if (detalle?.error) return detalle.error;
  } catch {
    // la respuesta no era JSON: se usa el mensaje del error
  }
  return error.message;
}

/** Los datos propios pisan el hueco ocupado, que no trae nombre ni teléfono. */
export function combinarTurnos(ocupados, propios) {
  const mapa = new Map(ocupados.map((turno) => [clave(turno), turno]));
  for (const propio of propios) mapa.set(clave(propio), propio);
  return [...mapa.values()];
}

/** @param {{ from: (tabla: string) => any, rpc: (fn: string) => Promise<any>, functions: { invoke: Function } }} cliente */
export function crearRepoLlamadas(cliente) {
  return {
    async leer(rol) {
      const aperturas = datos(
        await cliente.from('call_openings').select('agenda, fecha, desde, hasta, duracion_min, descanso_min'),
      );
      const grupales = rol === 'anon' ? [] : datos(await cliente.from('group_calls').select('id, fecha, hora, enlace'));
      if (rol === 'admin') {
        const turnos = datos(await cliente.from('call_bookings').select(COLUMNAS_TURNO));
        return { jornadas: aperturas.map(aJornada), turnos: turnos.map(aTurno), grupales: grupales.map(aGrupal) };
      }
      const ocupados = datos(await cliente.rpc('call_occupancy')).map(aTurno);
      const propios =
        rol === 'alumno' ? datos(await cliente.from('call_bookings').select(COLUMNAS_TURNO)).map(aTurno) : [];
      return {
        jornadas: aperturas.map(aJornada),
        turnos: combinarTurnos(ocupados, propios),
        grupales: grupales.map(aGrupal),
      };
    },

    /** Deja publicadas exactamente estas jornadas; las nuevas quedan a nombre de `coachId`. */
    async guardarJornadas(jornadas, coachId = null) {
      const filas = jornadas.map((jornada) => ({
        ...(coachId ? { coach_id: coachId } : {}),
        agenda: jornada.agendaId,
        fecha: jornada.fecha,
        desde: jornada.desde,
        hasta: jornada.hasta,
        duracion_min: jornada.duracionMin,
        descanso_min: jornada.descansoMin,
      }));
      if (filas.length) datos(await cliente.from('call_openings').upsert(filas, { onConflict: 'agenda,fecha' }));
      const actuales = datos(await cliente.from('call_openings').select('id, agenda, fecha'));
      const claves = new Set(jornadas.map((jornada) => `${jornada.agendaId}|${jornada.fecha}`));
      const sobran = actuales.filter((fila) => !claves.has(`${fila.agenda}|${fila.fecha}`)).map((fila) => fila.id);
      if (sobran.length) datos(await cliente.from('call_openings').delete().in('id', sobran));
    },

    async anotar(turno) {
      datos(
        await cliente.from('call_bookings').insert({
          ...(turno.id ? { id: turno.id } : {}),
          agenda: turno.agendaId,
          fecha: turno.fecha,
          hora: turno.hora,
          duracion_min: turno.duracionMin,
          descanso_min: turno.descansoMin,
          nombre: turno.nombre,
          email: turno.email,
          telefono: turno.telefono || '',
          notas: turno.notas || '',
        }),
      );
    },

    async soltar({ agendaId, fecha, hora }) {
      datos(await cliente.from('call_bookings').delete().eq('agenda', agendaId).eq('fecha', fecha).eq('hora', hora));
    },

    async publicarGrupal(grupal) {
      datos(
        await cliente.from('group_calls').insert({
          id: grupal.id,
          fecha: grupal.fecha,
          hora: grupal.hora,
          enlace: grupal.enlace,
        }),
      );
    },

    async cancelarGrupal(id) {
      datos(await cliente.from('group_calls').delete().eq('id', id));
    },

    /** El script de Google Calendar del coach `coachId` (solo lo puede leer un coach). */
    async leerScript(coachId) {
      const fila = datos(
        await cliente.from('call_coaches').select('script_url, coach_email').eq('coach_id', coachId).maybeSingle(),
      );
      return { url: fila?.script_url || '', coachEmail: fila?.coach_email || '' };
    },

    async guardarScript(url, coachEmail, coachId) {
      datos(await cliente.from('call_coaches').upsert({ coach_id: coachId, script_url: url, coach_email: coachEmail }));
    },

    /** Pide al servidor que agende el turno en el Google Calendar de su coach. @returns {Promise<{ estado: string, error: string }>} */
    async agendar(id) {
      const { data, error } = await cliente.functions.invoke('agendar-llamada', { body: { id } });
      if (error) throw new Error(await mensajeDeError(error));
      return { estado: data?.estado ?? 'error', error: data?.error ?? '' };
    },
  };
}
