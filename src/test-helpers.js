// Ayudas compartidas por los tests.

/** Deja terminar lo asíncrono pendiente (guardados, cargas, repos falsos) antes de seguir con las comprobaciones. */
export const asentar = () => new Promise((resolver) => globalThis.setImmediate(resolver));
