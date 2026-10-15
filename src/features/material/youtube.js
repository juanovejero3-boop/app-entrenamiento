// Detecta links de YouTube para abrirlos en el modal de video en lugar de una pestaña nueva.

/** Devuelve el ID de 11 caracteres del video si el link es de YouTube (watch?v= o youtu.be/), o null. */
export function materialEsYouTube(link) {
  if (!link) return null;
  const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}
