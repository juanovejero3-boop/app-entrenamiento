// Helpers de texto.

/** Minúsculas y sin tildes ni espacios en los extremos, para comparar y buscar sin que importe cómo se escribió. */
export const plano = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Emojis, tono de piel, selector de variación y secuencias unidas. Roboto no los puede dibujar. */
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\u20E3/gu;

/** Quita los emojis de un texto. El resto queda igual, incluidos los espacios. */
export const sinEmojis = (texto) => String(texto ?? '').replace(EMOJI, '');

/** La misma limpieza en cada string de un documento de pdfmake. Las funciones (el pie de página) siguen. */
export function valoresSinEmojis(valor) {
  if (typeof valor === 'string') return sinEmojis(valor);
  if (Array.isArray(valor)) return valor.map(valoresSinEmojis);
  if (typeof valor === 'function' || !valor || typeof valor !== 'object') return valor;
  return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, valoresSinEmojis(v)]));
}
