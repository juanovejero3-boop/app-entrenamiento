// Jornadas de llamadas del coach. Cada una es un día concreto ya generado:
// fecha, rango, duración y descanso de después. No hay días de la semana fijos.
// Se ofrece un inicio cada `duracionMin`. Al reservar, la llamada más el descanso
// ocupan ese tramo y se sacan los inicios que se le pisan, de cualquier agenda.

/** @typedef {{ agendaId: string, fecha: string, desde: string, hasta: string, duracionMin: number, descansoMin: number }} Jornada */
/** @typedef {{ agendaId: string, fecha: string, hora: string }} Turno */

/** Lo que el formulario propone antes de generar. */
export function valoresIniciales() {
  return {
    primera: {
      id: 'primera',
      nombre: 'Primera llamada',
      duracionMin: 20,
      descansoMin: 0,
      desde: '14:00',
      hasta: '20:00',
    },
    seguimiento: {
      id: 'seguimiento',
      nombre: 'Seguimiento',
      duracionMin: 30,
      descansoMin: 30,
      desde: '08:30',
      hasta: '19:30',
    },
  };
}

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

const aHora = (minutos) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/** [inicio, fin) de la llamada más el descanso de después. */
function bloque(jornada, hora) {
  const inicio = aMinutos(hora);
  return [inicio, inicio + jornada.duracionMin + jornada.descansoMin];
}

const sePisan = ([a0, a1], [b0, b1]) => a0 < b1 && b0 < a1;

/**
 * Horarios de inicio de una jornada ya generada.
 * `turnos` ocupan al coach ese día; `jornadas` dice cuánto dura cada uno.
 * @param {Jornada} jornada
 * @param {Turno[]} turnos
 * @param {Jornada[]} jornadas
 * @returns {string[]}
 */
export function huecosDeJornada(jornada, turnos, jornadas) {
  const paso = jornada.duracionMin;
  if (paso <= 0) return [];

  const delDia = jornadas.filter((otra) => otra.fecha === jornada.fecha);
  const ocupados = [];
  for (const turno of turnos) {
    if (turno.fecha !== jornada.fecha) continue;
    const de = delDia.find((otra) => otra.agendaId === turno.agendaId);
    if (de) ocupados.push(bloque(de, turno.hora));
  }

  const abre = aMinutos(jornada.desde);
  const cierra = aMinutos(jornada.hasta);
  const huecos = [];
  for (let minuto = abre; minuto + jornada.duracionMin <= cierra; minuto += paso) {
    const hora = aHora(minuto);
    if (ocupados.some((ocupado) => sePisan(bloque(jornada, hora), ocupado))) continue;
    huecos.push(hora);
  }
  return huecos;
}
