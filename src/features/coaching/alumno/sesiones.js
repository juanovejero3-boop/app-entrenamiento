// Sesiones: los días que el alumno terminó, con la fecha en que los entrenó.
// Se guardan aparte del plan y del registro, indexadas por el id del día (único por plan):
//   { [diaId]: { fecha: '2026-10-16', terminadaEn: '2026-10-16T21:30:00.000Z' } }
// Con la fecha se pueden armar después los reportes (adherencia, carga por fecha).
// Las operaciones son puras e inmutables, igual que las del plan y las del registro.

/** @typedef {{ fecha: string, terminadaEn: string }} Sesion */
/** @typedef {Record<string, Sesion>} Sesiones */

/** AAAA-MM-DD de una fecha que existe en el calendario (rechaza 2026-02-30, 2026-13-01...). */
function esFechaValida(fecha) {
  const m = typeof fecha === 'string' && fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  return real.getUTCFullYear() === anio && real.getUTCMonth() === mes - 1 && real.getUTCDate() === dia;
}

/** @returns {Sesion | null} la sesión de ese día, o null si no está terminado */
export function sesionDe(sesiones, diaId) {
  return sesiones[diaId] ?? null;
}

/**
 * Marca el día como terminado en `fecha` (AAAA-MM-DD). `terminadaEn` es el momento exacto (ISO).
 * Terminar de nuevo un día reemplaza su sesión.
 */
export function terminarSesion(sesiones, diaId, { fecha, terminadaEn }) {
  if (!esFechaValida(fecha)) throw new RangeError(`Fecha inválida: ${fecha}`);
  return { ...sesiones, [diaId]: { fecha, terminadaEn } };
}

/** Quita la sesión del día (volver a editarlo). */
export function reabrirSesion(sesiones, diaId) {
  const { [diaId]: _quitada, ...resto } = sesiones; // eslint-disable-line no-unused-vars
  return resto;
}

/** Días de la semana terminados sobre los que tienen ejercicios (los demás no se pueden terminar). */
export function diasTerminados(semana, sesiones) {
  const conEjercicios = semana.days.filter((dia) => dia.blocks.some((b) => b.exercises.length));
  return { hechos: conEjercicios.filter((dia) => sesionDe(sesiones, dia.id)).length, total: conEjercicios.length };
}

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida las sesiones que vienen de afuera (localStorage): descarta las que no tienen fecha válida. */
export function normalizarSesiones(dato) {
  if (!esObjeto(dato)) return {};
  /** @type {Sesiones} */
  const limpio = {};
  for (const [diaId, sesion] of Object.entries(dato)) {
    if (!esObjeto(sesion) || !esFechaValida(sesion.fecha)) continue;
    limpio[diaId] = {
      fecha: sesion.fecha,
      terminadaEn: typeof sesion.terminadaEn === 'string' ? sesion.terminadaEn : '',
    };
  }
  return limpio;
}
