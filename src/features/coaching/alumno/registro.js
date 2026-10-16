// Registro del alumno: lo que anota al entrenar en cada serie (kg, reps y su estado).
// Se guarda aparte del plan, indexado por el id del ejercicio y el número de serie:
//   { [ejercicioId]: { [numeroDeSerie]: { kg: '80', reps: '8', done: true, skipped: false } } }
// Una serie está pendiente (ni done ni skipped), hecha (done) u omitida (skipped: "no la hice");
// hecha y omitida son excluyentes. Las operaciones son puras e inmutables, igual que las del plan.

/** @typedef {{ kg: string, reps: string, done: boolean, skipped: boolean }} Serie */
/** @typedef {Record<string, Record<string, Serie>>} Registro */

const SERIE_VACIA = Object.freeze({ kg: '', reps: '', done: false, skipped: false });

/**
 * Filas de registro de un ejercicio: el máximo de `sets` ("4" -> 4, "3-4" -> 4, "3 a 4" -> 4),
 * o 1 si no tiene un número (ej. "al fallo"). Con un rango, la última fila es opcional: la
 * puede omitir.
 */
export function cantidadDeSeries(ejercicio) {
  const numeros = String(ejercicio.sets ?? '').match(/^\s*(\d+)(?:\s*(?:[-–—]|a)\s*(\d+))?/);
  if (!numeros) return 1;
  return Math.max(Number(numeros[1]), Number(numeros[2] ?? 0)) || 1;
}

/** @returns {Serie} */
export function serieDe(registro, ejercicioId, numero) {
  return { ...SERIE_VACIA, ...registro[ejercicioId]?.[numero] };
}

/**
 * Aplica `cambios` (kg, reps, done, skipped) a una serie y devuelve el registro nuevo.
 * Marcarla como hecha la saca de omitidas, y al revés.
 */
export function actualizarSerie(registro, ejercicioId, numero, cambios) {
  const serie = { ...serieDe(registro, ejercicioId, numero), ...cambios };
  if (cambios.done) serie.skipped = false;
  else if (cambios.skipped) serie.done = false;
  return { ...registro, [ejercicioId]: { ...registro[ejercicioId], [numero]: serie } };
}

/** Series hechas y omitidas sobre el total de series del día (todos sus bloques). */
export function progresoDelDia(dia, registro) {
  let hechas = 0;
  let omitidas = 0;
  let total = 0;
  for (const bloque of dia.blocks) {
    for (const ejercicio of bloque.exercises) {
      const series = cantidadDeSeries(ejercicio);
      total += series;
      for (let n = 1; n <= series; n++) {
        const serie = serieDe(registro, ejercicio.id, n);
        if (serie.done) hechas++;
        else if (serie.skipped) omitidas++;
      }
    }
  }
  return { hechas, omitidas, total };
}

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v) => (v === undefined || v === null ? '' : String(v));

/** Valida un registro que viene de afuera (localStorage): descarta lo que no tiene la forma esperada. */
export function normalizarRegistro(dato) {
  if (!esObjeto(dato)) return {};
  /** @type {Registro} */
  const limpio = {};
  for (const [ejercicioId, series] of Object.entries(dato)) {
    if (!esObjeto(series)) continue;
    for (const [numero, serie] of Object.entries(series)) {
      if (!/^\d+$/.test(numero) || !esObjeto(serie)) continue;
      limpio[ejercicioId] ??= {};
      const done = Boolean(serie.done);
      limpio[ejercicioId][numero] = {
        kg: texto(serie.kg),
        reps: texto(serie.reps),
        done,
        skipped: Boolean(serie.skipped) && !done,
      };
    }
  }
  return limpio;
}
