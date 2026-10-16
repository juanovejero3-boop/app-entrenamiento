// Registro del alumno: lo que anota al entrenar (kg, reps y check de cada serie).
// Se guarda aparte del plan, indexado por el id del ejercicio y el número de serie:
//   { [ejercicioId]: { [numeroDeSerie]: { kg: '80', reps: '8', done: true } } }
// Las operaciones son puras e inmutables, igual que las del plan.

/** @typedef {{ kg: string, reps: string, done: boolean }} Serie */
/** @typedef {Record<string, Record<string, Serie>>} Registro */

const SERIE_VACIA = Object.freeze({ kg: '', reps: '', done: false });

/** Filas de registro de un ejercicio: el primer número de `sets` ("3-4" -> 3), o 1 si no hay. */
export function cantidadDeSeries(ejercicio) {
  return parseInt(ejercicio.sets, 10) || 1;
}

/** @returns {Serie} */
export function serieDe(registro, ejercicioId, numero) {
  return { ...SERIE_VACIA, ...registro[ejercicioId]?.[numero] };
}

/** Aplica `cambios` (kg, reps, done) a una serie y devuelve el registro nuevo. */
export function actualizarSerie(registro, ejercicioId, numero, cambios) {
  const serie = { ...serieDe(registro, ejercicioId, numero), ...cambios };
  return { ...registro, [ejercicioId]: { ...registro[ejercicioId], [numero]: serie } };
}

/** Series marcadas como hechas sobre el total de series del día (todos sus bloques). */
export function progresoDelDia(dia, registro) {
  let hechas = 0;
  let total = 0;
  for (const bloque of dia.blocks) {
    for (const ejercicio of bloque.exercises) {
      const series = cantidadDeSeries(ejercicio);
      total += series;
      for (let n = 1; n <= series; n++) if (serieDe(registro, ejercicio.id, n).done) hechas++;
    }
  }
  return { hechas, total };
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
      limpio[ejercicioId][numero] = { kg: texto(serie.kg), reps: texto(serie.reps), done: Boolean(serie.done) };
    }
  }
  return limpio;
}
