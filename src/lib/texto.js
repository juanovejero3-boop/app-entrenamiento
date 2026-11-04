// Helpers de texto.

/** Minúsculas y sin tildes ni espacios en los extremos, para comparar y buscar sin que importe cómo se escribió. */
export const plano = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
