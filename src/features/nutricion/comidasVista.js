// Armado de las comidas de un alumno (la vista del coach): un tablero con lo que suma el plan contra los
// objetivos del alumno, las comidas con sus opciones y alimentos, y la línea de tiempo del día.
// El que la usa (alumnos.js) es quien guarda: cada cambio se le pasa a `alCambiar`, y si no se pudo guardar
// (devuelve false) la pantalla queda como estaba.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { CATEGORIAS } from './alimentos.js';
import {
  actualizarComida,
  actualizarPorciones,
  agregarComida,
  agregarItem,
  agregarOpcion,
  compararConObjetivos,
  crearComida,
  macrosDeOpcion,
  macrosDelDia,
  nombreSugerido,
  ordenadasPorHora,
  quitarComida,
  quitarItem,
  quitarOpcion,
} from './comidas.js';

/**
 * @type {{
 *   contenedor: HTMLElement, linea: HTMLElement, comidas: import('./comidas.js').Comida[],
 *   alimentos: import('./alimentos.js').Alimento[], objetivos: { kcal: number, p: number, c: number, f: number } | null,
 *   alCambiar: (comidas: import('./comidas.js').Comida[]) => boolean | void, abiertas: Set<string>
 * } | null}
 */
let vista = null;

/**
 * @param {{
 *   contenedor: HTMLElement, lineaDeTiempo: HTMLElement, comidas: import('./comidas.js').Comida[],
 *   alimentos: import('./alimentos.js').Alimento[], objetivos: { kcal: number, p: number, c: number, f: number } | null,
 *   alCambiar: (comidas: import('./comidas.js').Comida[]) => boolean | void
 * }} datos
 */
export function montarComidas({ contenedor, lineaDeTiempo, comidas, alimentos, objetivos, alCambiar }) {
  vista = { contenedor, linea: lineaDeTiempo, comidas, alimentos, objetivos, alCambiar, abiertas: new Set() };
  dibujar();
}

/** Los objetivos del alumno cambiaron (se está editando su calculadora): se actualiza solo el tablero. */
export function actualizarObjetivosDeComidas(objetivos) {
  if (!vista?.contenedor.isConnected) return;
  vista.objetivos = objetivos;
  vista.contenedor.querySelector('[data-consumo-panel]').innerHTML = dibujarConsumo();
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

const claseBoton =
  'text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border transition whitespace-nowrap';
const claseNeutro = `${claseBoton} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed`;
const clasePeligro = `${claseBoton} border-red-900 text-red-400 hover:bg-red-950`;
const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-neonRed';

const redondeados = (m) => ({ kcal: Math.round(m.kcal), p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f) });
const resumen = (m) => {
  const r = redondeados(m);
  return `${r.kcal} kcal · P ${r.p} · C ${r.c} · G ${r.f}`;
};

function dibujar() {
  const { contenedor, linea, comidas } = vista;
  contenedor.innerHTML = `
    <div class="space-y-4">
      <div data-consumo-panel>${dibujarConsumo()}</div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] text-gray-500">${comidas.length} ${comidas.length === 1 ? 'comida' : 'comidas'}</p>
        <button data-click="comidaNueva" class="neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider px-3 py-2">
          <i class="fa-solid fa-plus mr-1"></i>Agregar comida
        </button>
      </div>
      ${
        comidas.length
          ? `<div class="space-y-3">${comidas.map(dibujarComida).join('')}</div>`
          : '<div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">Todavía no armaste comidas. Agregá la primera y cargale alimentos de la biblioteca.</div>'
      }
    </div>
  `;
  linea.innerHTML = dibujarLinea();
}

const COLORES = { bajo: 'bg-amber-500', ok: 'bg-emerald-500', alto: 'bg-red-500' };

/** Lo que suma el plan frente a los objetivos del alumno: es la guía para ir armando las comidas. */
function dibujarConsumo() {
  const total = macrosDelDia(vista.comidas);
  const comparacion = compararConObjetivos(total, vista.objetivos);
  if (!comparacion) {
    return `
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-1">
        <p class="text-xs text-amber-300">Completá los parámetros del alumno (arriba) para ver cuánto falta contra su objetivo.</p>
        <p class="text-[11px] text-gray-400">El plan suma ${resumen(total)}</p>
      </div>`;
  }
  const fila = (clave, nombre, unidad) => {
    const { consumido, objetivo, restante, pct, estado } = comparacion[clave];
    const mensaje =
      estado === 'bajo'
        ? `Faltan ${restante} ${unidad}`
        : estado === 'alto'
          ? `Te pasás ${-restante} ${unidad}`
          : 'En el objetivo';
    return `
      <div data-consumo="${clave}" data-estado="${estado}" class="space-y-1">
        <div class="flex justify-between text-xs">
          <span class="font-bold text-gray-200">${nombre}</span>
          <span class="text-gray-300">${consumido} / ${objetivo} ${unidad}</span>
        </div>
        <div class="h-2 rounded-full bg-cyberDark overflow-hidden">
          <div class="h-full ${COLORES[estado]}" style="width:${Math.min(pct ?? 0, 100)}%"></div>
        </div>
        <p class="text-[10px] text-gray-500">${mensaje}</p>
      </div>`;
  };
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <p class="text-[10px] text-gray-400 uppercase font-bold">Lo que suma el plan contra el objetivo</p>
      ${fila('kcal', 'Calorías', 'kcal')}
      ${fila('p', 'Proteína', 'g')}
      ${fila('c', 'Carbohidratos', 'g')}
      ${fila('f', 'Grasas', 'g')}
    </div>`;
}

function dibujarComida(comida) {
  const abierta = vista.abiertas.has(comida.id);
  const id = esc(comida.id);
  const primera = comida.opciones[0];
  return `
    <section data-comida="${id}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <button data-click="comidaToggle" data-id="${id}" aria-expanded="${abierta}" class="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-white text-sm truncate">${esc(comida.nombre)}${comida.hora ? ` <span class="text-neonRed font-bold">· ${esc(comida.hora)}</span>` : ''}</h4>
          <p class="text-[11px] text-gray-400">${resumen(macrosDeOpcion(primera))}</p>
        </div>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform ${abierta ? 'rotate-180' : ''}"></i>
      </button>
      <div data-comida-cuerpo ${abierta ? '' : 'hidden'} class="p-4 space-y-4 border-t border-gray-800">
        <div class="grid grid-cols-3 gap-3">
          <label class="block col-span-2">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Nombre</span>
            <input data-comida-nombre data-change="comidaEditar" data-campo="nombre" data-id="${id}" maxlength="60" value="${esc(comida.nombre)}" class="${claseInput}">
          </label>
          <label class="block">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Hora</span>
            <input data-comida-hora data-change="comidaEditar" data-campo="hora" data-id="${id}" type="time" value="${esc(comida.hora)}" class="${claseInput}">
          </label>
        </div>
        ${comida.opciones.length > 1 ? '<p class="text-[11px] text-gray-500">Las opciones son alternativas entre sí: el total del día cuenta la primera opción.</p>' : ''}
        ${comida.opciones.map((opcion, i) => dibujarOpcion(comida, opcion, i)).join('')}
        <div class="flex gap-2 justify-between">
          <button data-click="opcionNueva" data-id="${id}" class="${claseNeutro}"><i class="fa-solid fa-plus mr-1"></i>Variante</button>
          <button data-click="comidaEliminar" data-id="${id}" class="${clasePeligro}"><i class="fa-solid fa-trash mr-1"></i>Eliminar comida</button>
        </div>
      </div>
    </section>`;
}

/** El selector de alimentos de la biblioteca, agrupados por categoría. */
function dibujarSelector() {
  const grupos = CATEGORIAS.map((categoria) => {
    const alimentos = vista.alimentos
      .filter((a) => a.categoria === categoria.id)
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
    return alimentos.length
      ? `<optgroup label="${esc(categoria.nombre)}">${alimentos.map((a) => `<option value="${esc(a.id)}">${esc(a.nombre)} → ${esc(a.porcion)}</option>`).join('')}</optgroup>`
      : '';
  }).join('');
  return `<select data-agregar-alimento ${vista.alimentos.length ? '' : 'disabled'} class="${claseInput}">
      <option value="">${vista.alimentos.length ? 'Elegí un alimento…' : 'No hay alimentos'}</option>${grupos}
    </select>`;
}

function dibujarOpcion(comida, opcion, indice) {
  const id = esc(comida.id);
  const opcionId = esc(opcion.id);
  const items = opcion.items
    .map(
      (item) => `
      <div data-item="${esc(item.id)}" class="flex items-center gap-2">
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white break-words">${esc(item.nombre)}</p>
          <p class="text-[11px] text-gray-400">${esc(item.porcion)}</p>
        </div>
        <input type="number" min="0" max="50" step="0.5" value="${item.porciones}" data-change="itemPorciones" data-id="${id}" data-opcion-id="${opcionId}" data-item-id="${esc(item.id)}" aria-label="Porciones" class="w-16 bg-cyberDark border border-gray-700 rounded-lg p-1.5 text-sm text-white text-center outline-none focus:border-neonRed">
        <button data-click="itemQuitar" data-id="${id}" data-opcion-id="${opcionId}" data-item-id="${esc(item.id)}" class="text-gray-500 hover:text-red-400 px-1" title="Quitar"><i class="fa-solid fa-xmark"></i></button>
      </div>`,
    )
    .join('');
  return `
    <div data-opcion="${opcionId}" class="bg-cyberDark/60 rounded-lg border border-gray-800 p-3 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-[10px] text-gray-400 uppercase font-bold">Opción ${indice + 1}</p>
          <p data-opcion-macros class="text-[11px] text-gray-300">${resumen(macrosDeOpcion(opcion))}</p>
        </div>
        ${comida.opciones.length > 1 ? `<button data-click="opcionEliminar" data-id="${id}" data-opcion-id="${opcionId}" class="${clasePeligro}" title="Eliminar opción"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
      ${items || '<p class="text-[11px] text-gray-500">Sin alimentos todavía.</p>'}
      <div class="space-y-2">
        ${dibujarSelector()}
        <div class="flex gap-2">
          <input data-agregar-porciones type="number" min="0.5" max="50" step="0.5" value="1" aria-label="Porciones a agregar" class="w-16 bg-cyberDark border border-gray-700 rounded-lg p-1.5 text-sm text-white text-center outline-none focus:border-neonRed">
          <button data-click="itemAgregar" data-id="${id}" data-opcion-id="${opcionId}" class="${claseNeutro} flex-1" ${vista.alimentos.length ? '' : 'disabled'}>Agregar</button>
        </div>
      </div>
      ${vista.alimentos.length ? '' : '<p class="text-[11px] text-amber-300">La biblioteca de alimentos está vacía: cargá alimentos en la subpestaña Alimentos.</p>'}
    </div>`;
}

/** Las comidas del día en orden de horario, con lo que aporta cada una. */
function dibujarLinea() {
  const { comidas } = vista;
  if (!comidas.length) {
    return '<p class="text-xs text-gray-500">Todavía no hay comidas para mostrar en la línea de tiempo.</p>';
  }
  const conHora = ordenadasPorHora(comidas).filter((c) => c.hora);
  const sinHora = comidas.filter((c) => !c.hora);
  return `
    <div class="space-y-4">
      ${
        conHora.length
          ? `<ol class="relative border-l border-gray-700 ml-2 space-y-4">${conHora
              .map(
                (c) => `
          <li data-linea-comida="${esc(c.id)}" class="ml-4">
            <span class="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-neonRed"></span>
            <p class="text-sm font-bold text-white"><span class="text-neonRed">${esc(c.hora)}</span> · ${esc(c.nombre)}</p>
            <p class="text-[11px] text-gray-400">${resumen(macrosDeOpcion(c.opciones[0]))}</p>
          </li>`,
              )
              .join('')}</ol>`
          : '<p class="text-xs text-gray-500">Ponele horario a las comidas para verlas ordenadas acá.</p>'
      }
      ${
        sinHora.length
          ? `<div data-linea-sinhora class="text-[11px] text-gray-400"><p class="font-bold uppercase text-gray-500">Sin horario</p><p>${sinHora.map((c) => esc(c.nombre)).join(' · ')}</p></div>`
          : ''
      }
    </div>`;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Pide guardar las comidas nuevas; solo si se pudo, la pantalla las muestra. */
function aplicar(nuevas, { abrir = null } = {}) {
  if (vista.alCambiar(nuevas) === false) return false;
  vista.comidas = nuevas;
  if (abrir) vista.abiertas.add(abrir);
  dibujar();
  return true;
}

function alternarComida(boton) {
  const seccion = boton.closest('[data-comida]');
  const cuerpo = seccion.querySelector('[data-comida-cuerpo]');
  const abrir = cuerpo.hidden;
  cuerpo.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  seccion.querySelector('[data-chevron]').classList.toggle('rotate-180', abrir);
  if (abrir) vista.abiertas.add(boton.dataset.id);
  else vista.abiertas.delete(boton.dataset.id);
}

function nuevaComida() {
  const comida = crearComida({ nombre: nombreSugerido(vista.comidas) });
  aplicar(agregarComida(vista.comidas, comida), { abrir: comida.id });
}

function editarComida(el) {
  aplicar(actualizarComida(vista.comidas, el.dataset.id, { [el.dataset.campo]: el.value }));
}

async function eliminarComida(id) {
  const comida = vista.comidas.find((c) => c.id === id);
  if (!comida) return;
  if (!(await window.confirm(`¿Eliminar «${comida.nombre}» con todas sus opciones? No se puede deshacer.`))) return;
  vista.abiertas.delete(id);
  aplicar(quitarComida(vista.comidas, id));
}

async function eliminarOpcion(comidaId, opcionId) {
  const opcion = vista.comidas.find((c) => c.id === comidaId)?.opciones.find((o) => o.id === opcionId);
  if (!opcion) return;
  if (opcion.items.length && !(await window.confirm('¿Eliminar esta opción con sus alimentos? No se puede deshacer.')))
    return;
  aplicar(quitarOpcion(vista.comidas, comidaId, opcionId));
}

function agregarAlimentoDesde(boton) {
  const opcionEl = boton.closest('[data-opcion]');
  const alimento = vista.alimentos.find((a) => a.id === opcionEl.querySelector('[data-agregar-alimento]').value);
  const porciones = Number(opcionEl.querySelector('[data-agregar-porciones]').value);
  if (!alimento || !(porciones > 0)) return;
  aplicar(agregarItem(vista.comidas, boton.dataset.id, boton.dataset.opcionId, alimento, porciones));
}

registrarAcciones({
  comidaNueva: () => nuevaComida(),
  comidaToggle: (el) => alternarComida(el),
  comidaEditar: (el) => editarComida(el),
  comidaEliminar: (el) => eliminarComida(el.dataset.id),
  opcionNueva: (el) => aplicar(agregarOpcion(vista.comidas, el.dataset.id)),
  opcionEliminar: (el) => eliminarOpcion(el.dataset.id, el.dataset.opcionId),
  itemAgregar: (el) => agregarAlimentoDesde(el),
  itemPorciones: (el) =>
    aplicar(actualizarPorciones(vista.comidas, el.dataset.id, el.dataset.opcionId, el.dataset.itemId, el.value)),
  itemQuitar: (el) => aplicar(quitarItem(vista.comidas, el.dataset.id, el.dataset.opcionId, el.dataset.itemId)),
});
