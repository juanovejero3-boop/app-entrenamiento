// Última marca de un ejercicio: lo que el alumno hizo la última vez que entrenó ese ejercicio dentro del ciclo,
// para que sepa con qué peso arrancar. Se busca hacia atrás desde el día que está mirando (sin contar ese día ni
// los siguientes), así que si no entrenó la semana pasada se muestra la última vez que sí lo hizo, aunque haya
// sido otro día. Cada semana tiene sus propios ids de ejercicio, por eso se reconoce por nombre.
import { plano } from '../../../lib/texto.js';

/**
 * @typedef {{
 *   semana: string, dia: string, primera: { n: number, kg: string }, ultima: { n: number, kg: string }, cantidad: number
 * }} Marca
 */

/** Las series que se hicieron con peso, en orden. Los pesos que quedaron copiados en series sin hacer no cuentan. */
function seriesConPeso(registro, ejercicioId) {
  return Object.entries(registro[ejercicioId] ?? {})
    .map(([n, serie]) => ({ n: Number(n), kg: String(serie?.kg ?? '').trim(), hecha: serie?.done === true }))
    .filter((serie) => serie.hecha && serie.kg)
    .sort((a, b) => a.n - b.n);
}

/**
 * @param {{ weeks: { name: string, days: { name: string, blocks: { exercises: { id: string, name: string }[] }[] }[] }[] }} plan
 * @param {Record<string, Record<string, { kg?: string, done?: boolean }>>} registro
 * @param {{ w: number, d: number }} posicion  semana y día que se están mirando
 * @param {{ name: string }} ejercicio
 * @returns {Marca | null}
 */
export function ultimaMarca(plan, registro, posicion, ejercicio) {
  const buscado = plano(ejercicio.name ?? '');
  if (!buscado) return null;
  for (let s = posicion.w; s >= 0; s--) {
    const dias = plan.weeks[s]?.days ?? [];
    for (let d = s === posicion.w ? posicion.d - 1 : dias.length - 1; d >= 0; d--) {
      for (const candidato of dias[d].blocks.flatMap((b) => b.exercises)) {
        if (plano(candidato.name ?? '') !== buscado) continue;
        const series = seriesConPeso(registro, candidato.id);
        if (series.length) {
          const [primera] = series;
          const ultima = series[series.length - 1];
          return {
            semana: plan.weeks[s].name,
            dia: dias[d].name,
            primera: { n: primera.n, kg: primera.kg },
            ultima: { n: ultima.n, kg: ultima.kg },
            cantidad: series.length,
          };
        }
      }
    }
  }
  return null;
}

/** La frase que se le muestra al alumno. */
export function textoUltimaMarca(marca) {
  if (!marca) return 'Aún no registras marcas de este ejercicio en el ciclo actual';
  const donde = `${marca.semana} · ${marca.dia}`;
  const { primera, ultima, cantidad } = marca;
  if (primera.kg !== ultima.kg) {
    return `${donde}: empezaste con ${primera.kg} kg y cerraste la serie ${ultima.n} con ${ultima.kg} kg`;
  }
  return cantidad === 1
    ? `${donde}: usaste ${primera.kg} kg en la serie ${primera.n}`
    : `${donde}: usaste ${primera.kg} kg en ${cantidad} series`;
}
