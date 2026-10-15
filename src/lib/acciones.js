// Sistema de acciones: reemplaza los handlers inline (onclick="...") del HTML.
//
// El HTML declara qué acción dispara cada evento y le pasa los argumentos como data-*:
//   <button data-click="materialMoverItem" data-id="${escapeAttr(id)}" data-dir="-1">
// y el módulo registra la acción:
//   registrarAcciones({ materialMoverItem: (el) => materialMoverItem(el.dataset.id, Number(el.dataset.dir)) });
//
// Un único listener por tipo de evento en `document` busca el elemento con data-<tipo>
// y llama a la acción con (elemento, evento). Así no hace falta exponer funciones en
// window ni armar código JavaScript dentro de strings de HTML.

/** @typedef {(el: HTMLElement, e: Event) => unknown} Accion */

/** @type {Map<string, Accion>} */
const acciones = new Map();

/** Registra acciones por nombre. Falla si el nombre ya existe (evita pisadas silenciosas). */
export function registrarAcciones(/** @type {Record<string, Accion>} */ mapa) {
  for (const [nombre, fn] of Object.entries(mapa)) {
    if (acciones.has(nombre)) throw new Error(`Acción duplicada: ${nombre}`);
    acciones.set(nombre, fn);
  }
}

const TIPOS = ['click', 'input', 'change', 'submit'];

for (const tipo of TIPOS) {
  document.addEventListener(tipo, (e) => {
    const selector = `[data-${tipo}]`;
    let el = e.target instanceof Element ? e.target.closest(selector) : null;
    // Recorre los ancestros con acción para imitar el burbujeo de los handlers inline
    // (ej. la "x" de una pestaña dentro del botón de la pestaña). Respeta stopPropagation.
    while (el && !e.cancelBubble) {
      // Un botón deshabilitado no dispara su onclick inline: tampoco su acción
      if (!el.disabled) {
        const nombre = el.dataset[tipo];
        const accion = acciones.get(nombre);
        if (accion) accion(el, e);
        else console.error(`Acción no registrada: ${nombre}`);
      }
      el = el.parentElement?.closest(selector) ?? null;
    }
  });
}
