// Llamadas en Supabase (call_openings, call_bookings, group_calls).
// RLS decide quién ve el teléfono: el coach ve todos, el alumno solo el suyo,
// y quien reserva ve los horarios ocupados sin nombre ni teléfono.

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

/** Los datos propios pisan el hueco ocupado, que no trae nombre ni teléfono. */
export function combinarTurnos(ocupados, propios) {
  const mapa = new Map(ocupados.map((turno) => [clave(turno), turno]));
  for (const propio of propios) mapa.set(clave(propio), propio);
  return [...mapa.values()];
}

/** @param {{ from: (tabla: string) => any, rpc: (fn: string) => Promise<any> }} cliente */
export function crearRepoLlamadas(cliente) {
  return {
    async leer(rol) {
      const aperturas = datos(await cliente.from('call_openings').select('agenda, fecha, desde, hasta, duracion_min, descanso_min'));
      const grupales =
        rol === 'anon'
          ? []
          : datos(await cliente.from('group_calls').select('id, fecha, hora, enlace'));
      if (rol === 'admin') {
        const turnos = datos(
          await cliente
            .from('call_bookings')
            .select('agenda, fecha, hora, duracion_min, descanso_min, nombre, email, telefono, notas'),
        );
        return { jornadas: aperturas.map(aJornada), turnos: turnos.map(aTurno), grupales: grupales.map(aGrupal) };
      }
      const ocupados = datos(await cliente.rpc('call_occupancy')).map(aTurno);
      const propios =
        rol === 'alumno'
          ? datos(
              await cliente
                .from('call_bookings')
                .select('agenda, fecha, hora, duracion_min, descanso_min, nombre, email, telefono, notas'),
            ).map(aTurno)
          : [];
      return {
        jornadas: aperturas.map(aJornada),
        turnos: combinarTurnos(ocupados, propios),
        grupales: grupales.map(aGrupal),
      };
    },

    async guardarJornadas(jornadas) {
      const filas = jornadas.map((jornada) => ({
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

    async leerScript() {
      const fila = datos(await cliente.from('call_settings').select('script_url, coach_email').eq('id', 'coach').maybeSingle());
      return { url: fila?.script_url || '', coachEmail: fila?.coach_email || '' };
    },

    async guardarScript(url, coachEmail) {
      datos(await cliente.from('call_settings').upsert({ id: 'coach', script_url: url, coach_email: coachEmail }));
    },
  };
}
