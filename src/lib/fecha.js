// Fechas en formato AAAA-MM-DD, en la hora local del navegador.

/** La fecha de hoy (AAAA-MM-DD). */
export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
