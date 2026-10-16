// Sesiones: los días que el alumno terminó, con la fecha en que los entrenó.
// Se guardan aparte del plan y del registro, indexadas por el id del día (único por plan):
//   { [diaId]: { fecha: '2026-10-16', terminadaEn: '2026-10-16T21:30:00.000Z', estado: 'hecha' } }
// `estado` es 'hecha' (entrenó) u 'omitida' (el día no se entrenó; la fecha es la que el alumno indica).
// Con la fecha se pueden armar después los reportes (adherencia, carga por fecha).
// Las operaciones son puras e inmutables, igual que las del plan y las del registro.

import { esFechaValida } from '../../../lib/fecha.js';

/** @typedef {'hecha' | 'omitida'} EstadoSesion */
/** @typedef {{ fecha: string, terminadaEn: string, estado: EstadoSesion }} Sesion */
/** @typedef {Record<string, Sesion>} Sesiones */

const ESTADOS = ['hecha', 'omitida'];

/** @returns {Sesion | null} la sesión de ese día, o null si no está terminado */
export function sesionDe(sesiones, diaId) {
  return sesiones[diaId] ?? null;
}

/**
 * Marca el día como terminado en `fecha` (AAAA-MM-DD). `terminadaEn` es el momento exacto (ISO).
 * `estado` 'omitida' marca un día que no se entrenó. Terminar de nuevo un día reemplaza su sesión.
 */
export function terminarSesion(sesiones, diaId, { fecha, terminadaEn, estado = 'hecha' }) {
  if (!esFechaValida(fecha)) throw new RangeError(`Fecha inválida: ${fecha}`);
  if (!ESTADOS.includes(estado)) throw new RangeError(`Estado inválido: ${estado}`);
  return { ...sesiones, [diaId]: { fecha, terminadaEn, estado } };
}

/** Quita la sesión del día (volver a editarlo). */
export function reabrirSesion(sesiones, diaId) {
  const { [diaId]: _quitada, ...resto } = sesiones; // eslint-disable-line no-unused-vars
  return resto;
}

/**
 * Días de la semana entrenados sobre los marcados (entrenados o no entrenados), no sobre los pendientes:
 * 3 días entrenados dan 3/3 y, si se marca también uno no entrenado, 3/4.
 */
export function diasTerminados(semana, sesiones) {
  const marcados = semana.days
    .filter((dia) => dia.blocks.some((b) => b.exercises.length))
    .map((dia) => sesionDe(sesiones, dia.id))
    .filter(Boolean);
  return { hechos: marcados.filter((sesion) => sesion.estado === 'hecha').length, total: marcados.length };
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
      estado: sesion.estado === 'omitida' ? 'omitida' : 'hecha',
    };
  }
  return limpio;
}
