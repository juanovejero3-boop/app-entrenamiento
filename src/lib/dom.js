// Helpers para armar HTML con template strings.

/** Escapa un valor para usarlo dentro de un atributo HTML (ej. data-id="${escapeAttr(id)}"). */
export function escapeAttr(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
