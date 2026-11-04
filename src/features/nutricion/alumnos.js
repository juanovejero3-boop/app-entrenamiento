// Nutrición por alumno (una subpestaña de Nutrición): el coach busca a un alumno y le calcula sus objetivos de
// calorías y macros. Los parámetros se guardan por alumno en el navegador (ver repoLocal.js).
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { plano } from '../../lib/texto.js';
import { toast } from '../../lib/ui.js';
import { nombreDelAlumno } from '../coaching/pdf/alumno.js';
import { ACTIVIDADES, calcularObjetivos, parametrosIniciales, validarParametros } from './objetivos.js';
import { repoNutricion } from './repoLocal.js';

const ALUMNOS_VISIBLES = 8;

/**
 * @type {{
 *   content: HTMLElement, repo: typeof repoNutricion, alumnos: { id: string, name?: string, email?: string }[],
 *   filtro: string, alumno: { id: string, name?: string, email?: string } | null
 * } | null}
 */
let actual = null;

/**
 * @param {HTMLElement} content
 * @param {{ repo?: typeof repoNutricion, alumnos: { id: string, name?: string, email?: string }[] }} opciones
 */
export function mostrarAlumnosDeNutricion(content, { repo = repoNutricion, alumnos }) {
  actual = { content, repo, alumnos, filtro: '', alumno: null };
  dibujar();
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-neonRed';

function dibujar() {
  if (actual.alumno) dibujarFicha();
  else dibujarBuscador();
}

function dibujarBuscador() {
  actual.content.innerHTML = `
    <div class="space-y-3">
      <input data-alumno-filtro data-input="nutricionBuscarAlumno" type="search" value="${esc(actual.filtro)}" placeholder="Buscar alumno por nombre o correo..." class="${claseInput}">
      <p data-alumnos-cantidad class="text-[11px] text-gray-500"></p>
      <div data-alumnos-lista class="space-y-2"></div>
    </div>
  `;
  dibujarLista();
}

/** Redibuja solo la lista: así el campo de búsqueda no pierde el foco mientras se escribe. */
function dibujarLista() {
  const { content, alumnos, filtro, repo } = actual;
  const buscado = plano(filtro);
  const coinciden = alumnos.filter(
    (a) => !buscado || plano(`${nombreDelAlumno(a)} ${a.email ?? ''}`).includes(buscado),
  );
  const visibles = coinciden.slice(0, ALUMNOS_VISIBLES);

  content.querySelector('[data-alumnos-cantidad]').textContent =
    coinciden.length > visibles.length
      ? `Mostrando ${visibles.length} de ${coinciden.length} alumnos. Escribí para buscar a los demás.`
      : `${coinciden.length} ${coinciden.length === 1 ? 'alumno' : 'alumnos'}`;

  content.querySelector('[data-alumnos-lista]').innerHTML = visibles.length
    ? visibles
        .map(
          (a) => `
        <button data-click="nutricionAlumno" data-id="${esc(a.id)}" class="w-full flex items-center gap-3 text-left bg-cyberCard p-3 rounded-xl border border-gray-800 hover:border-neonRed transition">
          <div class="flex-1 min-w-0">
            <p data-nombre class="text-sm font-bold text-white truncate">${esc(nombreDelAlumno(a))}</p>
            <p class="text-xs text-gray-400 truncate">${esc(a.email ?? '')}</p>
          </div>
          ${repo.cargarPlan(a.id) ? '<span class="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-emerald-700 text-emerald-300">Con plan</span>' : ''}
          <i class="fa-solid fa-chevron-right text-gray-500"></i>
        </button>`,
        )
        .join('')
    : `<div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">${
        alumnos.length ? 'Ningún alumno coincide con la búsqueda.' : 'Todavía no hay alumnos.'
      }</div>`;
}

function dibujarFicha() {
  const { content, alumno, repo } = actual;
  const p = repo.cargarPlan(alumno.id)?.parametros ?? parametrosIniciales(alumno);
  const campo = (nombre, etiqueta, atributos = '') => `
    <label class="block">
      <span class="text-[10px] text-gray-400 uppercase font-bold">${etiqueta}</span>
      <input name="${nombre}" type="number" value="${esc(p[nombre])}" ${atributos} data-input="nutricionCalcular" data-change="nutricionGuardar" class="${claseInput}">
    </label>`;
  const opcionesActividad = ACTIVIDADES.map(
    (a) => `<option value="${a.valor}">${a.valor} - ${esc(a.nombre)}</option>`,
  ).join('');
  const seccion = (id, titulo, cuerpo) => `
    <section data-seccion="${id}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <button type="button" data-click="nutricionSeccion" aria-expanded="true" class="w-full flex items-center gap-3 px-4 py-3 text-left">
        <h3 class="flex-1 font-bold text-neonRed uppercase tracking-wide text-sm">${titulo}</h3>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform rotate-180"></i>
      </button>
      <div data-seccion-cuerpo class="p-4 border-t border-gray-800">${cuerpo}</div>
    </section>`;

  content.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button data-click="nutricionVolverAlumnos" class="text-gray-400 hover:text-neonRed" title="Volver a los alumnos">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-black text-white uppercase tracking-wide truncate">${esc(nombreDelAlumno(alumno))}</h3>
          <p class="text-xs text-gray-400 truncate">Objetivos de nutrición</p>
        </div>
      </div>
      ${seccion(
        'parametros',
        'Parámetros',
        `<form data-plan-form data-submit="nutricionEnviar" class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Sexo</span>
            <select name="sexo" data-input="nutricionCalcular" data-change="nutricionGuardar" class="${claseInput}">
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </label>
          ${campo('edad', 'Edad (años)', 'min="10" max="100"')}
          ${campo('peso', 'Peso (kg)', 'step="0.1" min="30" max="300"')}
          ${campo('altura', 'Altura (cm)', 'step="0.1" min="100" max="250"')}
          <label class="block col-span-2">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Actividad</span>
            <select name="actividad" data-input="nutricionCalcular" data-change="nutricionGuardar" class="${claseInput}">${opcionesActividad}</select>
          </label>
          <label class="block col-span-2">
            <span data-ajuste-etiqueta class="text-[10px] text-gray-400 uppercase font-bold"></span>
            <input name="ajuste" type="range" min="65" max="165" step="1" value="${esc(p.ajuste)}" data-input="nutricionCalcular" data-change="nutricionGuardar" class="w-full accent-neonRed">
          </label>
          ${campo('proteinaGKg', 'Proteína (g por kg)', 'step="0.1" min="1" max="4"')}
          ${campo('grasaPct', 'Grasa (% de las calorías)', 'step="1" min="10" max="60"')}
        </form>`,
      )}
      ${seccion('objetivos', 'Objetivos', '<div data-resultados></div>')}
    </div>
  `;
  // Los selects se fijan por código (en vez de con `selected` en el HTML) para que siempre queden en el valor guardado
  const campos = content.querySelector('[data-plan-form]').elements;
  campos.sexo.value = p.sexo;
  campos.actividad.value = String(p.actividad);
  actualizarResultados();
}

/** Los parámetros tal como están escritos en el formulario. */
function leerParametros() {
  const f = actual.content.querySelector('[data-plan-form]').elements;
  return {
    sexo: f.sexo.value,
    edad: f.edad.value,
    peso: f.peso.value,
    altura: f.altura.value,
    actividad: f.actividad.value,
    ajuste: f.ajuste.value,
    proteinaGKg: f.proteinaGKg.value,
    grasaPct: f.grasaPct.value,
  };
}

const etiquetaDelAjuste = (ajuste) =>
  `Ajuste calórico: ${ajuste < 100 ? 'Déficit' : ajuste > 100 ? 'Superávit' : 'Mantenimiento'} (${ajuste}%)`;

/** Recalcula y dibuja los objetivos sin tocar el formulario (el campo que se está escribiendo conserva el foco). */
function actualizarResultados() {
  const { content } = actual;
  const parametros = leerParametros();
  content.querySelector('[data-ajuste-etiqueta]').textContent = etiquetaDelAjuste(Number(parametros.ajuste));
  content.querySelector('[data-resultados]').innerHTML = dibujarResultados(parametros);
}

function dibujarResultados(parametros) {
  const error = validarParametros(parametros);
  if (error) return `<p data-parametros-error class="text-sm text-amber-300">${esc(error)}</p>`;
  const r = calcularObjetivos(parametros);
  const macro = (clave, nombre, gramos, color) => `
    <div class="bg-cyberDark rounded-lg border border-gray-800 p-3 text-center">
      <p class="text-[10px] uppercase font-bold ${color}">${nombre}</p>
      <p data-macro-${clave} class="text-sm font-black text-white">${gramos} g · ${r.porcentajes[clave]}%</p>
    </div>`;
  return `
    <div class="space-y-3">
      <div class="text-center">
        <p data-kcal class="text-3xl font-black text-white">${r.kcal} <span class="text-sm text-gray-400">kcal</span></p>
        <p class="text-[11px] text-gray-400">
          Gasto diario <span data-tdee class="font-bold text-gray-200">${r.tdee} kcal</span> ·
          Metabolismo basal <span data-tmb class="font-bold text-gray-200">${r.tmb} kcal</span>
        </p>
      </div>
      <div class="flex h-3 rounded-full overflow-hidden" role="img" aria-label="Distribución de macros">
        <div class="bg-sky-500" style="width:${r.porcentajes.p}%"></div>
        <div class="bg-emerald-500" style="width:${r.porcentajes.c}%"></div>
        <div class="bg-orange-500" style="width:${r.porcentajes.f}%"></div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        ${macro('p', 'Proteína', r.p, 'text-sky-300')}
        ${macro('c', 'Carbohidratos', r.c, 'text-emerald-300')}
        ${macro('f', 'Grasas', r.f, 'text-orange-300')}
      </div>
      ${r.advertencia ? `<p data-advertencia class="text-xs text-amber-300">${esc(r.advertencia)}</p>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

function buscar(texto) {
  actual.filtro = texto;
  dibujarLista();
}

function abrirAlumno(id) {
  const alumno = actual.alumnos.find((a) => a.id === id);
  if (!alumno) return;
  actual.alumno = alumno;
  dibujar();
}

function volver() {
  actual.alumno = null;
  dibujar();
}

/** Al confirmar un cambio (salir del campo) se guarda el plan del alumno. */
function guardar() {
  actualizarResultados();
  try {
    actual.repo.guardarPlan(actual.alumno.id, { parametros: leerParametros() });
  } catch (error) {
    toast(error.message, false);
  }
}

/** Abre o pliega una sección sin redibujar (no se pierde lo escrito). */
function alternarSeccion(boton) {
  const seccion = boton.closest('[data-seccion]');
  const cuerpo = seccion.querySelector('[data-seccion-cuerpo]');
  const abrir = cuerpo.hidden;
  cuerpo.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  seccion.querySelector('[data-chevron]').classList.toggle('rotate-180', abrir);
}

registrarAcciones({
  nutricionBuscarAlumno: (el) => buscar(el.value),
  nutricionAlumno: (el) => abrirAlumno(el.dataset.id),
  nutricionVolverAlumnos: () => volver(),
  nutricionCalcular: () => actualizarResultados(),
  nutricionGuardar: () => guardar(),
  nutricionSeccion: (el) => alternarSeccion(el),
  nutricionEnviar: (_el, e) => e.preventDefault(), // Enter en un campo no debe recargar la página
});
