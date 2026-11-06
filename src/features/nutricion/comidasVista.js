// Armado de las comidas de un alumno (la vista del coach): un tablero con lo que suma el plan contra los
// objetivos del alumno, las comidas con sus opciones y alimentos, y la línea de tiempo del día.
// Pensada primero para el celular: botones grandes, hora de 24 horas con selectores, y alimentos que se buscan
// escribiendo y se agregan con un toque.
// El que la usa (alumnos.js) es quien guarda: cada cambio se le pasa a `alCambiar`, y si no se pudo guardar
// (devuelve false) la pantalla queda como estaba.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { plano } from '../../lib/texto.js';
import { modalBase } from '../../lib/ui.js';
import { categoriaDe, CATEGORIAS } from './alimentos.js';
import {
  actualizarComida,
  actualizarPorciones,
  agregarComida,
  agregarItem,
  agregarOpcion,
  cantidadEquivalente,
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
  pintarConsumo();
}

/** Dibuja el tablero de nutrientes. Solo queda fijo arriba cuando hay objetivos contra los que comparar. */
function pintarConsumo() {
  const panel = vista.contenedor.querySelector('[data-consumo-panel]');
  panel.innerHTML = dibujarConsumo();
  panel.classList.toggle('sticky', Boolean(vista.objetivos));
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

// Los botones miden al menos 40 px de alto para tocarlos bien con el dedo
const claseBoton =
  'min-h-10 inline-flex items-center justify-center text-[11px] font-bold uppercase tracking-wider px-3 rounded-lg border transition whitespace-nowrap';
const claseNeutro = `${claseBoton} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed`;
const clasePeligro = `${claseBoton} border-red-900 text-red-400 hover:bg-red-950`;
const claseIcono =
  'w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-700 text-gray-300 hover:border-neonRed hover:text-neonRed disabled:opacity-30 disabled:hover:border-gray-700 disabled:hover:text-gray-300 transition';
// 16 px en los campos: así el celular no hace zoom al tocarlos
const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2.5 text-base text-white outline-none focus:border-neonRed';

const MAX_RESULTADOS = 8;
const MAX_PORCIONES = 50;
const PASO_PORCIONES = 0.5;

const redondeados = (m) => ({ kcal: Math.round(m.kcal), p: Math.round(m.p), c: Math.round(m.c), f: Math.round(m.f) });
const resumen = (m) => {
  const r = redondeados(m);
  return `${r.kcal} kcal · P ${r.p} · C ${r.c} · G ${r.f}`;
};
const coma = (numero) => String(numero).replace('.', ',');

function dibujar({ enfocar = null } = {}) {
  const { contenedor, linea, comidas } = vista;
  contenedor.innerHTML = `
    <div class="space-y-4">
      <div data-consumo-panel class="top-0 z-30"></div>
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] text-gray-500">${comidas.length} ${comidas.length === 1 ? 'comida' : 'comidas'}</p>
        <button data-click="comidaNueva" class="${claseBoton} border-transparent neon-glow-button text-white font-black">
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
  // Los selects de la hora se fijan por código (en vez de con `selected` en el HTML) para que siempre queden en el valor guardado
  for (const comida of comidas) fijarHora(comida);
  pintarConsumo();
  linea.innerHTML = dibujarLinea();
  if (enfocar) contenedor.querySelector(`[data-opcion="${enfocar}"] [data-buscar-alimento]`)?.focus();
}

// Cada nutriente tiene su color (el mismo que ve el alumno); si el plan se pasa del objetivo, la barra se pone roja
const NUTRIENTES = {
  kcal: { nombre: 'Calorías', unidad: 'kcal', texto: 'text-amber-300', barra: 'bg-amber-400' },
  p: { nombre: 'Proteína', unidad: 'g', texto: 'text-sky-300', barra: 'bg-sky-400' },
  c: { nombre: 'Carbos', unidad: 'g', texto: 'text-emerald-300', barra: 'bg-emerald-400' },
  f: { nombre: 'Grasas', unidad: 'g', texto: 'text-orange-300', barra: 'bg-orange-400' },
};
const COLOR_DEL_ESTADO = { bajo: 'text-gray-400', ok: 'text-emerald-300', alto: 'text-red-400' };

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
  const columna = (clave) => {
    const { nombre, unidad, texto, barra } = NUTRIENTES[clave];
    const { consumido, objetivo, restante, pct, estado } = comparacion[clave];
    const mensaje =
      estado === 'bajo'
        ? `Faltan ${restante} ${unidad}`
        : estado === 'alto'
          ? `Te pasás ${-restante} ${unidad}`
          : 'En el objetivo';
    return `
      <div data-consumo="${clave}" data-estado="${estado}" class="min-w-0 space-y-1">
        <p class="text-[10px] font-bold uppercase ${texto} truncate">${nombre}</p>
        <p class="text-[11px] text-gray-400 leading-tight whitespace-nowrap"><b class="text-xs text-white">${consumido}</b> / ${objetivo}</p>
        <div class="h-1.5 rounded-full bg-cyberDark overflow-hidden">
          <div class="h-full ${estado === 'alto' ? 'bg-red-500' : barra}" style="width:${Math.min(pct ?? 0, 100)}%"></div>
        </div>
        <p class="text-[10px] leading-tight ${COLOR_DEL_ESTADO[estado]}">${estado === 'ok' ? '<i class="fa-solid fa-check mr-0.5"></i>' : ''}${mensaje}</p>
      </div>`;
  };
  return `
    <div class="bg-cyberCard p-3 rounded-xl border border-gray-800 shadow-lg shadow-black/60">
      <div class="grid grid-cols-4 gap-2">${['kcal', 'p', 'c', 'f'].map(columna).join('')}</div>
    </div>`;
}

function dibujarComida(comida) {
  const abierta = vista.abiertas.has(comida.id);
  const id = esc(comida.id);
  const primera = comida.opciones[0];
  return `
    <section data-comida="${id}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <button data-click="comidaToggle" data-id="${id}" aria-expanded="${abierta}" class="w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left">
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-white text-sm truncate">${esc(comida.nombre)}${comida.hora ? ` <span class="text-neonRed font-bold">· ${esc(comida.hora)}</span>` : ''}</h4>
          <p class="text-[11px] text-gray-400">${resumen(macrosDeOpcion(primera))}</p>
        </div>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform ${abierta ? 'rotate-180' : ''}"></i>
      </button>
      <div data-comida-cuerpo ${abierta ? '' : 'hidden'} class="p-4 space-y-4 border-t border-gray-800">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Nombre</span>
            <input data-comida-nombre data-change="comidaEditar" data-id="${id}" maxlength="60" value="${esc(comida.nombre)}" class="${claseInput}">
          </label>
          <div>
            <span class="text-[10px] text-gray-400 uppercase font-bold">Hora (24 h)</span>
            ${dibujarHora(comida)}
          </div>
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

const dosDigitos = (n) => String(n).padStart(2, '0');

/** La hora en formato de 24 horas: dos selectores (hora de 00 a 23 y minutos de a 5), sin AM ni PM. */
function dibujarHora(comida) {
  const id = esc(comida.id);
  const minuto = comida.hora.split(':')[1];
  const minutos = Array.from({ length: 12 }, (_, i) => dosDigitos(i * 5));
  if (minuto && !minutos.includes(minuto)) minutos.push(minuto); // una hora que ya estaba guardada con otros minutos
  minutos.sort();
  const opciones = (valores) => valores.map((v) => `<option value="${v}">${v}</option>`).join('');
  return `
    <div data-comida-hora class="flex items-center gap-2">
      <select data-hora-h data-change="comidaHora" data-id="${id}" aria-label="Hora" class="${claseInput}">
        <option value="">--</option>${opciones(Array.from({ length: 24 }, (_, i) => dosDigitos(i)))}
      </select>
      <span class="font-bold text-gray-400">:</span>
      <select data-hora-m data-change="comidaHora" data-id="${id}" aria-label="Minutos" class="${claseInput}">${opciones(minutos)}</select>
    </div>`;
}

function fijarHora(comida) {
  const grupo = vista.contenedor.querySelector(`[data-comida="${CSS.escape(comida.id)}"] [data-comida-hora]`);
  if (!grupo) return;
  const [h = '', m = '00'] = comida.hora ? comida.hora.split(':') : [];
  grupo.querySelector('[data-hora-h]').value = h;
  grupo.querySelector('[data-hora-m]').value = m;
  grupo.querySelector('[data-hora-m]').disabled = !h; // sin hora no hay minutos que elegir
}

/** Alimentos de la biblioteca que coinciden con lo escrito (nombre, porción o categoría), sin importar tildes. */
function buscarAlimentos(texto) {
  const buscado = plano(texto);
  if (!buscado) return [];
  return vista.alimentos
    .filter((a) => plano(`${a.nombre} ${a.porcion} ${categoriaDe(a.categoria)?.nombre ?? ''}`).includes(buscado))
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
}

/** El buscador de alimentos de una opción: se escribe, aparecen los resultados y con un toque se agrega. */
function dibujarBuscador(comida, opcion) {
  const id = esc(comida.id);
  const hayAlimentos = vista.alimentos.length > 0;
  return `
    <form data-buscador data-submit="alimentoEnter" data-id="${id}" data-opcion-id="${esc(opcion.id)}" autocomplete="off" class="space-y-2">
      <div class="relative">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"></i>
        <input data-buscar-alimento data-input="alimentoBuscar" type="search" enterkeyhint="done" placeholder="Buscar alimento para agregar…" ${hayAlimentos ? '' : 'disabled'} class="${claseInput} pl-9">
      </div>
      <div data-resultados class="space-y-1.5"></div>
      ${dibujarCategorias(comida, opcion)}
      ${hayAlimentos ? '' : '<p class="text-[11px] text-amber-300">La biblioteca de alimentos está vacía: cargá alimentos en la subpestaña Alimentos.</p>'}
    </form>`;
}

/** Botones con las categorías de la biblioteca: al tocar una se abre un diálogo con todos sus alimentos. */
function dibujarCategorias(comida, opcion) {
  const botones = CATEGORIAS.map((categoria) => ({
    categoria,
    cantidad: vista.alimentos.filter((a) => a.categoria === categoria.id).length,
  }))
    .filter(({ cantidad }) => cantidad > 0)
    .map(
      ({ categoria }) =>
        `<button type="button" data-click="categoriaAbrir" data-id="${esc(comida.id)}" data-opcion-id="${esc(opcion.id)}" data-categoria="${esc(categoria.id)}" class="${claseNeutro} !normal-case !tracking-normal !text-xs">${esc(categoria.nombre)}</button>`,
    )
    .join('');
  return botones
    ? `<div data-categorias class="space-y-1.5"><p class="text-[10px] text-gray-400 uppercase font-bold">O elegí por categoría</p><div class="flex flex-wrap gap-2">${botones}</div></div>`
    : '';
}

function dibujarResultados(buscador, texto) {
  const coinciden = buscarAlimentos(texto);
  const visibles = coinciden.slice(0, MAX_RESULTADOS);
  const { id, opcionId } = buscador.dataset;
  buscador.querySelector('[data-resultados]').innerHTML = !texto.trim()
    ? ''
    : coinciden.length
      ? visibles
          .map(
            (a) => `
      <button type="button" data-click="alimentoElegir" data-id="${esc(id)}" data-opcion-id="${esc(opcionId)}" data-alimento-id="${esc(a.id)}" class="w-full min-h-12 flex items-center gap-3 text-left px-3 py-2 bg-cyberDark rounded-lg border border-gray-800 hover:border-neonRed transition">
        <div class="flex-1 min-w-0">
          <p data-resultado-nombre class="text-sm font-bold text-white break-words">${esc(a.nombre)}</p>
          <p class="text-[11px] text-gray-400">${esc(a.porcion)} · ${esc(categoriaDe(a.categoria)?.nombre ?? '')}</p>
        </div>
        <i class="fa-solid fa-plus text-neonRed"></i>
      </button>`,
          )
          .join('') +
        (coinciden.length > visibles.length
          ? `<p data-mas-resultados class="text-[11px] text-gray-500 px-1">Hay ${coinciden.length - visibles.length} más: seguí escribiendo para encontrar el que buscás.</p>`
          : '')
      : `<p class="text-xs text-gray-400 px-1">No hay ningún alimento que coincida con «${esc(texto.trim())}».</p>`;
}

function dibujarItem(comida, opcion, item) {
  const id = esc(comida.id);
  const datos = `data-id="${id}" data-opcion-id="${esc(opcion.id)}" data-item-id="${esc(item.id)}"`;
  const equivalencia = cantidadEquivalente(item.porcion, item.porciones);
  return `
    <div data-item="${esc(item.id)}" class="space-y-1.5 py-1">
      <div class="flex items-center gap-2">
        <p class="flex-1 min-w-0 text-sm font-bold text-white break-words">${esc(item.nombre)}</p>
        <button data-click="itemQuitar" ${datos} class="${claseIcono}" title="Quitar" aria-label="Quitar ${esc(item.nombre)}"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="flex items-center gap-2">
        <button data-click="itemMenos" ${datos} ${item.porciones <= PASO_PORCIONES ? 'disabled' : ''} class="${claseIcono}" aria-label="Menos porciones"><i class="fa-solid fa-minus"></i></button>
        <input type="number" inputmode="decimal" min="0" max="${MAX_PORCIONES}" step="${PASO_PORCIONES}" value="${item.porciones}" data-change="itemPorciones" ${datos} aria-label="Porciones" class="w-16 h-10 bg-cyberDark border border-gray-700 rounded-lg text-base text-white text-center outline-none focus:border-neonRed">
        <button data-click="itemMas" ${datos} ${item.porciones >= MAX_PORCIONES ? 'disabled' : ''} class="${claseIcono}" aria-label="Más porciones"><i class="fa-solid fa-plus"></i></button>
        <span class="text-xs text-gray-300">${item.porciones === 1 ? 'porción' : 'porciones'}</span>
      </div>
      <p class="text-[11px] text-gray-400">${equivalencia ? `${coma(item.porciones)} ${item.porciones === 1 ? 'porción' : 'porciones'} = ${esc(equivalencia)}` : `${coma(item.porciones)} × ${esc(item.porcion)}`}</p>
    </div>`;
}

function dibujarOpcion(comida, opcion, indice) {
  const id = esc(comida.id);
  return `
    <div data-opcion="${esc(opcion.id)}" class="bg-cyberDark/60 rounded-lg border border-gray-800 p-3 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-[10px] text-gray-400 uppercase font-bold">Opción ${indice + 1}</p>
          <p data-opcion-macros class="text-[11px] text-gray-300">${resumen(macrosDeOpcion(opcion))}</p>
        </div>
        ${comida.opciones.length > 1 ? `<button data-click="opcionEliminar" data-id="${id}" data-opcion-id="${esc(opcion.id)}" class="${claseIcono} border-red-900 text-red-400" title="Eliminar opción" aria-label="Eliminar opción"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
      ${opcion.items.map((item) => dibujarItem(comida, opcion, item)).join('') || '<p class="text-[11px] text-gray-500">Sin alimentos todavía.</p>'}
      ${dibujarBuscador(comida, opcion)}
    </div>`;
}

// ---------------------------------------------------------------------------
// Diálogo de una categoría
// ---------------------------------------------------------------------------

/** El diálogo que está abierto: a qué opción de qué comida se le agrega, y de qué categoría se elige. */
let dialogo = null;

const opcionDelDialogo = () =>
  vista.comidas.find((c) => c.id === dialogo.comidaId)?.opciones.find((o) => o.id === dialogo.opcionId);

function abrirDialogoDeCategoria({ comidaId, opcionId, categoriaId }) {
  const categoria = categoriaDe(categoriaId);
  if (!categoria) return;
  dialogo = { comidaId, opcionId, categoriaId };
  document.body.style.overflow = 'hidden'; // la página de atrás no se mueve mientras se elige
  const { kcal, p, c, f } = categoria.macros;
  const alimentos = vista.alimentos
    .filter((a) => a.categoria === categoriaId)
    .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
  const overlay = modalBase();
  overlay.innerHTML = `
    <div data-dialogo-categoria role="dialog" aria-modal="true" aria-label="${esc(categoria.nombre)}" class="bg-cyberCard border border-gray-700 rounded-2xl w-full max-w-md max-h-[85dvh] flex flex-col shadow-2xl">
      <div class="flex items-start gap-3 p-4 border-b border-gray-800">
        <div class="flex-1 min-w-0">
          <h4 class="font-black text-white uppercase tracking-wide text-sm">${esc(categoria.nombre)}</h4>
          <p class="text-[11px] text-gray-400">Cada porción: ${kcal} kcal · P ${p} · C ${c} · G ${f}</p>
        </div>
        <button data-click="categoriaCerrar" class="${claseIcono}" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="relative flex-1 min-h-0 flex flex-col">
      <div data-dialogo-lista class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 pb-8 space-y-1.5">
        ${alimentos
          .map(
            (a) => `
          <button type="button" data-click="categoriaAgregar" data-alimento-id="${esc(a.id)}" class="w-full min-h-14 flex items-center gap-3 text-left px-3 py-2 bg-cyberDark rounded-lg border border-gray-800 hover:border-neonRed transition">
            <div class="flex-1 min-w-0">
              <p data-dialogo-nombre class="text-sm font-bold text-white break-words">${esc(a.nombre)}</p>
              <p class="text-[11px] text-gray-400">${esc(a.porcion)}</p>
            </div>
            <span data-dialogo-cantidad hidden class="shrink-0 text-xs font-black px-2 py-1 rounded-md bg-red-950 border border-neonRed text-neonRed"></span>
            <i class="fa-solid fa-plus text-neonRed"></i>
          </button>`,
          )
          .join('')}
      </div>
      <div data-dialogo-degrade aria-hidden="true" class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-cyberCard to-transparent"></div>
      </div>
      <div class="p-3 border-t border-gray-800">
        <button data-click="categoriaCerrar" class="w-full min-h-11 neon-glow-button text-white rounded-lg text-xs font-bold uppercase tracking-wider">Listo</button>
      </div>
    </div>`;
  marcarLoAgregado();
}

/** Marca en cada alimento del diálogo cuántas porciones ya tiene la opción (así se ve qué se fue sumando). */
function marcarLoAgregado() {
  const opcion = dialogo && opcionDelDialogo();
  const lista = document.querySelector('#app-modal-overlay [data-dialogo-lista]');
  if (!opcion || !lista) return;
  for (const fila of lista.querySelectorAll('[data-click="categoriaAgregar"]')) {
    const alimento = vista.alimentos.find((a) => a.id === fila.dataset.alimentoId);
    const item = opcion.items.find((i) => i.categoria === alimento?.categoria && i.nombre === alimento?.nombre);
    const marca = fila.querySelector('[data-dialogo-cantidad]');
    marca.hidden = !item;
    marca.textContent = item ? `${coma(item.porciones)} × ` : '';
  }
}

/** Suma una porción del alimento tocado y deja el diálogo abierto para seguir eligiendo. */
function agregarDesdeElDialogo(alimentoId) {
  const alimento = vista.alimentos.find((a) => a.id === alimentoId);
  if (!dialogo || !alimento) return;
  aplicar(agregarItem(vista.comidas, dialogo.comidaId, dialogo.opcionId, alimento, 1));
  marcarLoAgregado();
}

function cerrarDialogoDeCategoria() {
  dialogo = null;
  document.body.style.overflow = '';
  const overlay = document.getElementById('app-modal-overlay');
  if (overlay) overlay.style.display = 'none';
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

/** Pide guardar las comidas nuevas; solo si se pudo, la pantalla las muestra. `enfocar`: opción cuyo buscador recupera el foco. */
function aplicar(nuevas, { abrir = null, enfocar = null } = {}) {
  if (vista.alCambiar(nuevas) === false) return false;
  vista.comidas = nuevas;
  if (abrir) vista.abiertas.add(abrir);
  dibujar({ enfocar });
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

function cambiarHora(el) {
  const grupo = el.closest('[data-comida-hora]');
  const h = grupo.querySelector('[data-hora-h]').value;
  const m = grupo.querySelector('[data-hora-m]').value || '00';
  aplicar(actualizarComida(vista.comidas, el.dataset.id, { hora: h ? `${h}:${m}` : '' }));
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
  if (
    opcion.items.length &&
    !(await window.confirm('¿Eliminar esta opción con sus alimentos? No se puede deshacer.'))
  ) {
    return;
  }
  aplicar(quitarOpcion(vista.comidas, comidaId, opcionId));
}

/** Agrega un alimento a una opción con 1 porción (después se ajusta con − y +). */
function agregarAlimentoElegido(comidaId, opcionId, alimento) {
  aplicar(agregarItem(vista.comidas, comidaId, opcionId, alimento, 1), { enfocar: opcionId });
}

/** Enter en el buscador agrega el primer resultado. */
function agregarPrimerResultado(buscador, evento) {
  evento.preventDefault();
  const [primero] = buscarAlimentos(buscador.querySelector('[data-buscar-alimento]').value);
  if (primero) agregarAlimentoElegido(buscador.dataset.id, buscador.dataset.opcionId, primero);
}

const itemDe = (el) =>
  vista.comidas
    .find((c) => c.id === el.dataset.id)
    ?.opciones.find((o) => o.id === el.dataset.opcionId)
    ?.items.find((i) => i.id === el.dataset.itemId);

/** Suma o resta media porción, sin pasarse de los límites. */
function moverPorciones(el, paso) {
  const item = itemDe(el);
  if (!item) return;
  const nuevas = Math.min(MAX_PORCIONES, Math.max(PASO_PORCIONES, item.porciones + paso));
  aplicar(actualizarPorciones(vista.comidas, el.dataset.id, el.dataset.opcionId, el.dataset.itemId, nuevas));
}

registrarAcciones({
  categoriaAbrir: (el) =>
    abrirDialogoDeCategoria({
      comidaId: el.dataset.id,
      opcionId: el.dataset.opcionId,
      categoriaId: el.dataset.categoria,
    }),
  categoriaAgregar: (el) => agregarDesdeElDialogo(el.dataset.alimentoId),
  categoriaCerrar: () => cerrarDialogoDeCategoria(),
  comidaNueva: () => nuevaComida(),
  comidaToggle: (el) => alternarComida(el),
  comidaEditar: (el) => aplicar(actualizarComida(vista.comidas, el.dataset.id, { nombre: el.value })),
  comidaHora: (el) => cambiarHora(el),
  comidaEliminar: (el) => eliminarComida(el.dataset.id),
  opcionNueva: (el) => aplicar(agregarOpcion(vista.comidas, el.dataset.id)),
  opcionEliminar: (el) => eliminarOpcion(el.dataset.id, el.dataset.opcionId),
  alimentoBuscar: (el) => dibujarResultados(el.closest('[data-buscador]'), el.value),
  alimentoElegir: (el) =>
    agregarAlimentoElegido(
      el.dataset.id,
      el.dataset.opcionId,
      vista.alimentos.find((a) => a.id === el.dataset.alimentoId),
    ),
  alimentoEnter: (el, e) => agregarPrimerResultado(el, e),
  itemPorciones: (el) =>
    aplicar(actualizarPorciones(vista.comidas, el.dataset.id, el.dataset.opcionId, el.dataset.itemId, el.value)),
  itemMas: (el) => moverPorciones(el, PASO_PORCIONES),
  itemMenos: (el) => moverPorciones(el, -PASO_PORCIONES),
  itemQuitar: (el) => aplicar(quitarItem(vista.comidas, el.dataset.id, el.dataset.opcionId, el.dataset.itemId)),
});
