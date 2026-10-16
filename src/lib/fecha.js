// Fechas en formato AAAA-MM-DD, en la hora local del navegador.

/** AAAA-MM-DD de una fecha que existe en el calendario (rechaza 2026-02-30, 2026-13-01...). */
export function esFechaValida(fecha) {
  const m = typeof fecha === 'string' && fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  return real.getUTCFullYear() === anio && real.getUTCMonth() === mes - 1 && real.getUTCDate() === dia;
}

/** La fecha de hoy (AAAA-MM-DD). */
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
