// Biblioteca de alimentos del coach (una subpestaña de Nutrición): se pueden crear, editar y borrar alimentos,
// agrupados por categoría de intercambio y plegables. Se guarda en el navegador del coach (ver repoLocal.js).
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { toast } from '../../lib/ui.js';
import {
  actualizarAlimento,
  agregarAlimento,
  agruparPorCategoria,
  CATEGORIAS,
  crearAlimento,
  quitarAlimento,
  validarAlimento,
} from './alimentos.js';
import { repoNutricion } from './repoLocal.js';

/**
 * @type {{
 *   content: HTMLElement, repo: ReturnType<typeof import('./repoLocal.js').crearRepoNutricionLocal>,
 *   alimentos: import('./alimentos.js').Alimento[], filtro: string, abiertas: Set<string>,
 *   formulario: { id: string | null, valores: ValoresDelFormulario, error: string | null } | null
 * } | null}
 */
let actual = null;

/** @typedef {{ nombre: string, porcion: string, categoria: string, gluten: boolean, lacteo: boolean }} ValoresDelFormulario */

/** @param {HTMLElement} content @param {{ repo?: typeof repoNutricion }} [opciones] */
export function mostrarBibliotecaDeAlimentos(content, { repo = repoNutricion } = {}) {
  actual = { content, repo, alimentos: repo.cargarAlimentos(), filtro: '', abiertas: new Set(), formulario: null };
  dibujar();
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

// Los botones miden al menos 40 px de alto para tocarlos bien con el dedo, y los campos usan 16 px para que el
// celular no haga zoom al tocarlos
const claseBoton =
  'min-h-10 min-w-10 inline-flex items-center justify-center text-[11px] font-bold uppercase tracking-wider px-3 rounded-lg border transition whitespace-nowrap';
const claseNeutro = `${claseBoton} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed`;
const clasePeligro = `${claseBoton} border-red-900 text-red-400 hover:bg-red-950`;
const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2.5 text-base text-white outline-none focus:border-neonRed';

function dibujar() {
  const { content, filtro } = actual;
  content.innerHTML = `
    <div class="space-y-4">
      <div class="flex gap-2">
        <input data-nutricion-filtro data-input="nutricionFiltrar" type="search" value="${esc(filtro)}" placeholder="Buscar alimento, porción o categoría..." class="${claseInput}">
        <button data-click="alimentoNuevo" class="shrink-0 neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider px-3">
          <i class="fa-solid fa-plus mr-1"></i>Nuevo
        </button>
      </div>
      <div data-nuevo>${actual.formulario?.id === null ? dibujarFormulario() : ''}</div>
      <div class="flex items-center justify-between gap-2">
        <p data-cantidad class="text-[11px] text-gray-500"></p>
        <div class="flex gap-2">
          <button data-click="categoriasTodas" data-abrir="true" class="${claseNeutro}">Abrir todo</button>
          <button data-click="categoriasTodas" data-abrir="false" class="${claseNeutro}">Plegar todo</button>
        </div>
      </div>
      <div data-lista class="space-y-4"></div>
    </div>
  `;
  dibujarLista();
}

/** Redibuja solo la lista (y la cuenta): así el campo de búsqueda no pierde el foco mientras se escribe. */
function dibujarLista() {
  const { content, alimentos, filtro } = actual;
  const grupos = agruparPorCategoria(alimentos, filtro);
  const cantidad = grupos.reduce((suma, g) => suma + g.alimentos.length, 0);
  content.querySelector('[data-cantidad]').textContent =
    `${cantidad} ${cantidad === 1 ? 'alimento' : 'alimentos'}${filtro.trim() ? ` de ${alimentos.length}` : ''}`;
  content.querySelector('[data-lista]').innerHTML = grupos.length
    ? grupos.map(dibujarGrupo).join('')
    : `<div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">${
        alimentos.length
          ? `Ningún alimento coincide con «${esc(filtro.trim())}».`
          : 'Todavía no hay alimentos. Creá el primero con «Nuevo».'
      }</div>`;
}

/** Una categoría está abierta si el coach la abrió o si se está buscando (así se ven las coincidencias). */
const estaAbierta = (id) => actual.filtro.trim() !== '' || actual.abiertas.has(id);

function dibujarGrupo({ categoria, alimentos }) {
  const { kcal, p, c, f } = categoria.macros;
  const abierta = estaAbierta(categoria.id);
  return `
    <section data-categoria="${esc(categoria.id)}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <button data-click="categoriaToggle" data-id="${esc(categoria.id)}" aria-expanded="${abierta}" class="w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left">
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-neonRed uppercase tracking-wide text-sm">${esc(categoria.nombre)}
            <span class="text-gray-500 font-bold normal-case tracking-normal">(${alimentos.length})</span>
          </h3>
          <p class="text-[11px] text-gray-400">${kcal} kcal · P ${p} · C ${c} · G ${f} por porción</p>
        </div>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform ${abierta ? 'rotate-180' : ''}"></i>
      </button>
      <div data-categoria-cuerpo ${abierta ? '' : 'hidden'} class="divide-y divide-gray-800 border-t border-gray-800">${alimentos.map(dibujarAlimento).join('')}</div>
    </section>
  `;
}

function dibujarAlimento(alimento) {
  if (actual.formulario?.id === alimento.id) return `<div class="p-3">${dibujarFormulario()}</div>`;
  const marca = (texto, clase) =>
    `<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${clase}">${texto}</span>`;
  const id = esc(alimento.id);
  return `
    <div data-alimento="${id}" class="flex items-center gap-3 px-4 py-3">
      <div class="flex-1 min-w-0">
        <p data-nombre class="text-sm font-bold text-white break-words">${esc(alimento.nombre)}</p>
        <p class="text-xs text-gray-400 flex flex-wrap items-center gap-1.5">
          <span>${esc(alimento.porcion)}</span>
          ${alimento.gluten ? marca('Gluten', 'border-amber-700 text-amber-300') : ''}
          ${alimento.lacteo ? marca('Lácteo', 'border-sky-700 text-sky-300') : ''}
        </p>
      </div>
      <button data-click="alimentoEditar" data-id="${id}" class="${claseNeutro}" title="Editar"><i class="fa-solid fa-pen"></i></button>
      <button data-click="alimentoEliminar" data-id="${id}" class="${clasePeligro}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
    </div>
  `;
}

function dibujarFormulario() {
  const { id, valores, error } = actual.formulario;
  const opciones = CATEGORIAS.map(
    (c) => `<option value="${esc(c.id)}" ${c.id === valores.categoria ? 'selected' : ''}>${esc(c.nombre)}</option>`,
  ).join('');
  const casilla = (nombre, texto, marcada) =>
    `<label class="flex items-center gap-2 min-h-10 text-sm text-gray-300"><input type="checkbox" name="${nombre}" ${marcada ? 'checked' : ''} class="w-5 h-5 accent-neonRed"> ${texto}</label>`;
  return `
    <form data-alimento-form data-submit="alimentoGuardar" class="bg-cyberCard p-4 rounded-xl border border-dashed border-neonRed/60 space-y-3">
      <p class="text-[10px] text-gray-400 uppercase font-bold">${id ? 'Editar alimento' : 'Nuevo alimento'}</p>
      <label class="block">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Nombre</span>
        <input name="nombre" maxlength="80" value="${esc(valores.nombre)}" placeholder="Ej: Pechuga de pollo" class="${claseInput}">
      </label>
      <label class="block">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Porción</span>
        <input name="porcion" maxlength="60" value="${esc(valores.porcion)}" placeholder="Ej: 100 g" class="${claseInput}">
      </label>
      <label class="block">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Categoría</span>
        <select name="categoria" class="${claseInput}">${opciones}</select>
      </label>
      <div class="flex gap-4">${casilla('gluten', 'Tiene gluten', valores.gluten)}${casilla('lacteo', 'Tiene lácteo', valores.lacteo)}</div>
      ${error ? `<p data-alimento-error class="text-xs text-red-300">${esc(error)}</p>` : ''}
      <div class="flex gap-2">
        <button type="button" data-click="alimentoGuardar" class="flex-1 py-2.5 neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider">Guardar</button>
        <button type="button" data-click="alimentoCancelar" class="${claseNeutro}">Cancelar</button>
      </div>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

const valoresVacios = () => ({ nombre: '', porcion: '', categoria: CATEGORIAS[0].id, gluten: false, lacteo: false });

/** Lo que el coach lleva escrito en el formulario abierto (o null si no hay). */
function leerFormulario() {
  const form = actual.content.querySelector('[data-alimento-form]')?.elements;
  if (!form) return null;
  return {
    nombre: form.nombre.value,
    porcion: form.porcion.value,
    categoria: form.categoria.value,
    gluten: form.gluten.checked,
    lacteo: form.lacteo.checked,
  };
}

/** Antes de redibujar, se guarda lo escrito para no perderlo. */
function recordarFormulario() {
  const valores = leerFormulario();
  if (valores && actual.formulario) actual.formulario.valores = valores;
}

function abrirFormulario(id, valores) {
  actual.formulario = { id, valores, error: null };
  dibujar();
  actual.content.querySelector('[data-alimento-form] [name="nombre"]')?.focus();
}

function filtrar(texto) {
  recordarFormulario();
  actual.filtro = texto;
  dibujarLista();
}

/** Abre o pliega una categoría sin redibujar (se ve al instante y no se pierde nada de lo escrito). */
function alternarCategoria(boton) {
  const seccion = boton.closest('[data-categoria]');
  const cuerpo = seccion.querySelector('[data-categoria-cuerpo]');
  const abrir = cuerpo.hidden;
  cuerpo.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  seccion.querySelector('[data-chevron]').classList.toggle('rotate-180', abrir);
  if (abrir) actual.abiertas.add(boton.dataset.id);
  else actual.abiertas.delete(boton.dataset.id);
}

function abrirOPlegarTodo(abrir) {
  recordarFormulario();
  actual.abiertas = new Set(abrir ? CATEGORIAS.map((c) => c.id) : []);
  dibujarLista();
}

function editar(id) {
  const a = actual.alimentos.find((x) => x.id === id);
  if (!a) return;
  actual.abiertas.add(a.categoria); // para ver el formulario
  abrirFormulario(id, {
    nombre: a.nombre,
    porcion: a.porcion,
    categoria: a.categoria,
    gluten: a.gluten,
    lacteo: a.lacteo,
  });
}

function cancelar() {
  actual.formulario = null;
  dibujar();
}

/** Guarda la lista nueva en el repo; si el navegador no deja, avisa y la pantalla queda como estaba. */
function persistir(nueva) {
  try {
    actual.repo.guardarAlimentos(nueva);
  } catch (error) {
    toast(error.message, false);
    return false;
  }
  actual.alimentos = nueva;
  return true;
}

function guardar() {
  const { formulario, alimentos } = actual;
  if (!formulario) return;
  formulario.valores = leerFormulario() ?? formulario.valores;
  const datos = crearAlimento(formulario.valores);
  const candidato = formulario.id
    ? { ...alimentos.find((a) => a.id === formulario.id), ...datos, id: formulario.id }
    : datos;

  formulario.error = validarAlimento(candidato, alimentos);
  if (formulario.error) {
    dibujar();
    return;
  }
  const nueva = formulario.id
    ? actualizarAlimento(alimentos, formulario.id, datos)
    : agregarAlimento(alimentos, candidato);
  if (!persistir(nueva)) return;
  actual.formulario = null;
  actual.filtro = ''; // para que el alimento guardado se vea aunque hubiera una búsqueda
  actual.abiertas.add(candidato.categoria); // y en su categoría abierta
  dibujar();
  toast('Alimento guardado');
}

async function eliminar(id) {
  const alimento = actual.alimentos.find((a) => a.id === id);
  if (!alimento) return;
  const ok = await window.confirm(`¿Eliminar «${alimento.nombre}»? No se puede deshacer.`);
  if (!ok) return;
  recordarFormulario();
  if (!persistir(quitarAlimento(actual.alimentos, id))) return;
  if (actual.formulario?.id === id) actual.formulario = null;
  dibujarLista();
}

registrarAcciones({
  nutricionFiltrar: (el) => filtrar(el.value),
  alimentoNuevo: () => abrirFormulario(null, valoresVacios()),
  alimentoEditar: (el) => editar(el.dataset.id),
  alimentoEliminar: (el) => eliminar(el.dataset.id),
  alimentoGuardar: (_el, e) => {
    e.preventDefault(); // el formulario también se envía con Enter: que no recargue la página
    guardar();
  },
  alimentoCancelar: () => cancelar(),
  categoriaToggle: (el) => alternarCategoria(el),
  categoriasTodas: (el) => abrirOPlegarTodo(el.dataset.abrir === 'true'),
});
