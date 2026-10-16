// Utilidades puras sobre los ciclos de un alumno (el repo los devuelve del más viejo al más nuevo).

const MS_POR_DIA = 86_400_000;

/** Suma `dias` (puede ser negativo) a una fecha AAAA-MM-DD, por día calendario (sin horario de verano). */
export function sumarDias(fecha, dias) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Último día del plan (AAAA-MM-DD), o null si no tiene fecha de inicio o no tiene semanas. */
export function fechaFinDelPlan(plan) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate || '') || !plan.weeks.length) return null;
  return sumarDias(plan.startDate, plan.weeks.length * 7 - 1);
}

/** El día siguiente al fin del ciclo que termina más tarde; sin ninguno con fecha de fin, `hoy`. */
export function fechaInicioSugerida(ciclos, hoy) {
  const fines = ciclos.map((c) => fechaFinDelPlan(c.plan)).filter(Boolean);
  return fines.length ? sumarDias(fines.sort().at(-1), 1) : hoy;
}

/** El ciclo que ve el alumno ahora, o null. */
export function cicloActivo(ciclos) {
  return ciclos.find((c) => c.estado === 'activo') ?? null;
}

/** Los ciclos finalizados, del más reciente al más viejo. */
export function ciclosAnteriores(ciclos) {
  return ciclos
    .filter((c) => c.estado === 'finalizado')
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0));
}

/** Copia de un plan para arrancar otro ciclo: misma estructura, nueva fecha de inicio y nombre "(copia)". */
export function planCopiado(plan, fechaInicio) {
  return { ...structuredClone(plan), startDate: fechaInicio, macroName: `${plan.macroName} (copia)` };
}
