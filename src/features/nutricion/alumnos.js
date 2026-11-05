// Nutrición por alumno (una subpestaña de Nutrición): el coach busca a un alumno y le calcula sus objetivos de
// calorías y macros. Los parámetros se guardan por alumno en el navegador (ver repoLocal.js).
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { plano } from '../../lib/texto.js';
import { mostrarProcesando, ocultarProcesando, toast } from '../../lib/ui.js';
import { nombreDelAlumno } from '../coaching/pdf/alumno.js';
import { cantidadParaMostrar, compararConObjetivos, macrosDelDia, ordenadasPorHora } from './comidas.js';
import { actualizarObjetivosDeComidas, montarComidas } from './comidasVista.js';
import { sugerirComidas } from './ia.js';
import { mostrarPdfAlimentacion } from './mostrarPdf.js';
import { ACTIVIDADES, calcularObjetivos, parametrosIniciales, validarParametros } from './objetivos.js';
import { MAX_NOTAS, repoNutricion } from './repoLocal.js';

const ALUMNOS_POR_PAGINA = 3; // igual que las otras listas de alumnos
const MAX_INDICACIONES = 500;

/**
 * @type {{
 *   content: HTMLElement, repo: typeof repoNutricion, alumnos: { id: string, name?: string, email?: string }[],
 *   filtro: string, pagina: number, alumno: { id: string, name?: string, email?: string } | null,
 *   comidas: import('./comidas.js').Comida[], sugerir: typeof sugerirComidas, pdf: typeof mostrarPdfAlimentacion,
 *   sugerencia: { comidas: import('./comidas.js').Comida[], avisos: string[] } | null
 * } | null}
 */
let actual = null;

/**
 * @param {HTMLElement} content
 * @param {{
 *   repo?: typeof repoNutricion, alumnos: { id: string, name?: string, email?: string }[],
 *   sugerir?: typeof sugerirComidas, pdf?: typeof mostrarPdfAlimentacion
 * }} opciones  sugerir y pdf se pueden reemplazar en los tests
 */
export function mostrarAlumnosDeNutricion(
  content,
  { repo = repoNutricion, alumnos, sugerir = sugerirComidas, pdf = mostrarPdfAlimentacion },
) {
  actual = { content, repo, alumnos, filtro: '', pagina: 0, alumno: null, comidas: [], sugerir, pdf, sugerencia: null };
  dibujar();
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

// Campos de 16 px: así el celular no hace zoom al tocarlos
const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2.5 text-base text-white outline-none focus:border-neonRed';

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
  const totalPaginas = Math.max(1, Math.ceil(coinciden.length / ALUMNOS_POR_PAGINA));
  actual.pagina = Math.min(actual.pagina, totalPaginas - 1);
  const desde = actual.pagina * ALUMNOS_POR_PAGINA;
  const visibles = coinciden.slice(desde, desde + ALUMNOS_POR_PAGINA);

  content.querySelector('[data-alumnos-cantidad]').textContent =
    `${coinciden.length} ${coinciden.length === 1 ? 'alumno' : 'alumnos'}`;

  const claseNavegar =
    'min-h-10 px-4 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition';
  const paginacion =
    coinciden.length > ALUMNOS_POR_PAGINA
      ? `<div class="flex items-center justify-between pt-2">
          <button data-click="nutricionCambiarPagina" data-dir="-1" ${actual.pagina === 0 ? 'disabled' : ''} class="${claseNavegar}">Anterior</button>
          <span data-pagina class="text-[11px] text-gray-500">Página ${actual.pagina + 1} de ${totalPaginas}</span>
          <button data-click="nutricionCambiarPagina" data-dir="1" ${actual.pagina >= totalPaginas - 1 ? 'disabled' : ''} class="${claseNavegar}">Siguiente</button>
        </div>`
      : '';

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
        .join('') + paginacion
    : `<div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">${
        alumnos.length ? 'Ningún alumno coincide con la búsqueda.' : 'Todavía no hay alumnos.'
      }</div>`;
}

function dibujarFicha() {
  const { content, alumno, repo } = actual;
  const plan = repo.cargarPlan(alumno.id);
  const p = plan?.parametros ?? parametrosIniciales(alumno);
  actual.comidas = plan?.comidas ?? [];
  actual.sugerencia = null;
  const campo = (nombre, etiqueta, atributos = '') => `
    <label class="block">
      <span class="text-[10px] text-gray-400 uppercase font-bold">${etiqueta}</span>
      <input name="${nombre}" type="number" value="${esc(p[nombre])}" ${atributos} data-input="nutricionCalcular" data-change="nutricionGuardar" class="${claseInput}">
    </label>`;
  const opcionesActividad = ACTIVIDADES.map(
    (a) => `<option value="${a.valor}">${a.valor} - ${esc(a.nombre)}</option>`,
  ).join('');
  const seccion = (id, titulo, cuerpo, abierta = true) => `
    <section data-seccion="${id}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <button type="button" data-click="nutricionSeccion" aria-expanded="${abierta}" class="w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left">
        <h3 class="flex-1 font-bold text-neonRed uppercase tracking-wide text-sm">${titulo}</h3>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform ${abierta ? 'rotate-180' : ''}"></i>
      </button>
      <div data-seccion-cuerpo ${abierta ? '' : 'hidden'} class="p-4 border-t border-gray-800">${cuerpo}</div>
    </section>`;

  content.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button data-click="nutricionVolverAlumnos" class="w-10 h-10 shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-neonRed" title="Volver a los alumnos" aria-label="Volver a los alumnos">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-black text-white uppercase tracking-wide truncate">${esc(nombreDelAlumno(alumno))}</h3>
          <p class="text-xs text-gray-400 truncate">Objetivos de nutrición</p>
        </div>
        <button data-click="nutricionPdf" class="shrink-0 min-h-10 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed transition"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>
      </div>
      ${seccion(
        'parametros',
        'Parámetros',
        `<form data-plan-form data-submit="nutricionEnviar" class="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      ${seccion(
        'ia',
        'Sugerir comidas con IA',
        `<div class="space-y-3">
          <p class="text-xs text-gray-400">La IA propone comidas con los alimentos de tu biblioteca y el sistema ajusta las cantidades a los objetivos. Primero ves una vista previa: nada se guarda hasta que lo apliques.</p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-[10px] text-gray-400 uppercase font-bold">Comidas por día</span>
              <select data-ia-comidas class="${claseInput}">${[2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
            </label>
            <label class="block">
              <span class="text-[10px] text-gray-400 uppercase font-bold">Opciones por comida</span>
              <select data-ia-opciones class="${claseInput}">${[1, 2, 3].map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
            </label>
          </div>
          <label class="block">
            <span class="text-[10px] text-gray-400 uppercase font-bold">Indicaciones (opcional)</span>
            <textarea data-ia-indicaciones maxlength="${MAX_INDICACIONES}" rows="3" placeholder="Ej: Entrena a las 18 hs. No come lácteos. Le gustan las milanesas al horno." class="${claseInput}"></textarea>
          </label>
          <button data-click="nutricionIASugerir" class="w-full min-h-11 neon-glow-button text-white rounded-lg text-xs font-bold uppercase tracking-wider"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Sugerir comidas</button>
          <div data-ia-vista></div>
        </div>`,
        false,
      )}
      ${seccion('comidas', 'Comidas', '<div data-comidas></div>')}
      ${seccion('linea', 'Línea de tiempo', '<div data-linea></div>')}
      ${seccion(
        'aclaraciones',
        'Aclaraciones para el alumno',
        `<textarea data-notas data-change="nutricionGuardar" maxlength="${MAX_NOTAS}" rows="4" placeholder="Ej: tomar 2 litros de agua por día, no saltear el desayuno…" class="${claseInput}"></textarea>
        <p class="text-[11px] text-gray-500 mt-1">El alumno las ve al final de su plan de alimentación.</p>`,
      )}
    </div>
  `;
  // Los selects y el texto se fijan por código (en vez de dejarlos en el HTML) para que siempre queden en lo guardado
  const campos = content.querySelector('[data-plan-form]').elements;
  campos.sexo.value = p.sexo;
  campos.actividad.value = String(p.actividad);
  content.querySelector('[data-notas]').value = plan?.notas ?? '';
  content.querySelector('[data-ia-comidas]').value = '4';
  content.querySelector('[data-ia-opciones]').value = '2';
  montarComidas({
    contenedor: content.querySelector('[data-comidas]'),
    lineaDeTiempo: content.querySelector('[data-linea]'),
    comidas: actual.comidas,
    alimentos: repo.cargarAlimentos(),
    objetivos: null, // se completa enseguida con los de la calculadora
    alCambiar: guardarComidas,
  });
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
  // el tablero de las comidas compara contra estos mismos objetivos
  const objetivos = calcularObjetivos(parametros);
  actualizarObjetivosDeComidas(objetivos && { kcal: objetivos.kcal, p: objetivos.p, c: objetivos.c, f: objetivos.f });
}

function dibujarResultados(parametros) {
  const error = validarParametros(parametros);
  if (error) return `<p data-parametros-error class="text-sm text-amber-300">${esc(error)}</p>`;
  const r = calcularObjetivos(parametros);
  const macro = (clave, nombre, gramos, color) => `
    <div class="bg-cyberDark rounded-lg border border-gray-800 p-3 text-center">
      <p class="text-[10px] uppercase font-bold ${color}">${nombre}</p>
      <p data-macro-${clave} class="text-sm font-black text-white">${gramos} g <span class="block text-[11px] font-bold text-gray-400">${r.porcentajes[clave]}%</span></p>
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
  actual.pagina = 0; // una búsqueda nueva empieza por la primera página
  dibujarLista();
}

function cambiarPagina(direccion) {
  actual.pagina = Math.max(0, actual.pagina + direccion); // dibujarLista no deja pasarse de la última
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

/** Guarda el plan del alumno (parámetros, comidas y aclaraciones juntos, para que guardar uno no pise a los otros). */
function guardarPlan(comidas) {
  try {
    const notas = actual.content.querySelector('[data-notas]').value;
    actual.repo.guardarPlan(actual.alumno.id, { parametros: leerParametros(), comidas, notas });
    return true;
  } catch (error) {
    toast(error.message, false);
    return false;
  }
}

/** Al confirmar un cambio en los parámetros (salir del campo) se guarda el plan. */
function guardar() {
  actualizarResultados();
  guardarPlan(actual.comidas);
}

/** Cada cambio en las comidas se guarda al instante; si no se pudo, la pantalla de comidas no lo muestra. */
function guardarComidas(comidas) {
  if (!guardarPlan(comidas)) return false;
  actual.comidas = comidas;
  return true;
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

// ---------------------------------------------------------------------------
// Asistente de IA y PDF
// ---------------------------------------------------------------------------

const ESTADOS = { bajo: 'text-amber-300', ok: 'text-emerald-300', alto: 'text-amber-300' };

function dibujarSugerencia() {
  const vista = actual.content.querySelector('[data-ia-vista]');
  const { comidas, avisos } = actual.sugerencia ?? {};
  if (!comidas) {
    vista.innerHTML = '';
    return;
  }
  const r = calcularObjetivos(leerParametros());
  const total = macrosDelDia(comidas);
  const comparacion = compararConObjetivos(total, r && { kcal: r.kcal, p: r.p, c: r.c, f: r.f });
  const dibujarOpcion = (opcion, numero, varias) => `
    <div class="space-y-1">
      ${varias ? `<p class="text-[10px] uppercase font-bold text-gray-400">Opción ${numero}</p>` : ''}
      <ul class="text-xs text-gray-200 space-y-0.5">${opcion.items
        .map(
          (i) =>
            `<li data-ia-alimento>${esc(i.nombre)} — <b class="text-neonRed">${esc(cantidadParaMostrar(i.porcion, i.porciones))}</b></li>`,
        )
        .join('')}</ul>
    </div>`;
  vista.innerHTML = `
    <div data-ia-sugerencia class="space-y-3 border-t border-gray-800 pt-3">
      <p class="text-[10px] uppercase font-bold text-amber-300"><i class="fa-solid fa-eye mr-1"></i>Vista previa · todavía no se guardó</p>
      ${ordenadasPorHora(comidas)
        .map(
          (c) => `
        <div data-ia-comida class="bg-cyberDark rounded-lg border border-gray-800 p-3 space-y-2">
          <p class="text-sm font-bold text-white">${c.hora ? `<span class="text-neonRed">${esc(c.hora)}</span> · ` : ''}<span data-ia-comida-nombre>${esc(c.nombre)}</span></p>
          ${c.opciones.map((o, i) => dibujarOpcion(o, i + 1, c.opciones.length > 1)).join('')}
        </div>`,
        )
        .join('')}
      <p data-ia-total class="text-xs text-gray-300">Total del día (opción 1): <b class="text-white">${total.kcal} kcal</b> · P ${total.p} g · C ${total.c} g · G ${total.f} g${
        comparacion
          ? ` <span class="${ESTADOS[comparacion.kcal.estado]}">(objetivo ${comparacion.kcal.objetivo} kcal)</span>`
          : ''
      }</p>
      ${avisos.length ? `<ul data-ia-avisos class="text-[11px] text-amber-300 list-disc pl-4">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      ${actual.comidas.length ? `<p data-ia-reemplaza class="text-[11px] text-amber-300">Al aplicar se reemplaza lo que ya tiene cargado (${actual.comidas.length} ${actual.comidas.length === 1 ? 'comida' : 'comidas'}).</p>` : ''}
      <div class="flex gap-2">
        <button data-click="nutricionIADescartar" class="flex-1 min-h-11 rounded-lg text-xs font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:border-neonRed hover:text-neonRed transition">Descartar</button>
        <button data-click="nutricionIAAplicar" class="flex-1 min-h-11 neon-glow-button text-white rounded-lg text-xs font-bold uppercase tracking-wider">Aplicar al plan</button>
      </div>
    </div>`;
}

async function sugerirConIA() {
  const { content, alumno, repo } = actual;
  const r = calcularObjetivos(leerParametros());
  if (!r) {
    toast('Completá los parámetros del alumno para que la IA conozca sus objetivos.', false);
    return;
  }
  mostrarProcesando('Consultando a la IA...');
  try {
    const sugerencia = await actual.sugerir({
      alimentos: repo.cargarAlimentos(),
      objetivos: { kcal: r.kcal, p: r.p, c: r.c, f: r.f },
      cantidadComidas: Number(content.querySelector('[data-ia-comidas]').value),
      cantidadOpciones: Number(content.querySelector('[data-ia-opciones]').value),
      indicaciones: content.querySelector('[data-ia-indicaciones]').value,
    });
    if (actual?.alumno?.id !== alumno.id) return; // el coach ya salió de esta ficha
    actual.sugerencia = sugerencia;
    dibujarSugerencia();
  } catch (error) {
    toast(error.message, false);
  } finally {
    ocultarProcesando();
  }
}

function aplicarSugerencia() {
  if (!actual.sugerencia || !guardarComidas(actual.sugerencia.comidas)) return;
  dibujarFicha(); // vuelve a dibujar las comidas, el tablero y la línea de tiempo con lo aplicado
  toast('Comidas aplicadas al plan.');
}

function descartarSugerencia() {
  actual.sugerencia = null;
  dibujarSugerencia();
}

function bajarPdf() {
  const plan = actual.repo.cargarPlan(actual.alumno.id);
  if (!plan?.comidas.some((c) => c.opciones.some((o) => o.items.length))) {
    toast('Armá al menos una comida con alimentos para bajar el PDF.', false);
    return;
  }
  actual.pdf(plan, actual.alumno);
}

registrarAcciones({
  nutricionIASugerir: () => sugerirConIA(),
  nutricionIAAplicar: () => aplicarSugerencia(),
  nutricionIADescartar: () => descartarSugerencia(),
  nutricionPdf: () => bajarPdf(),
  nutricionBuscarAlumno: (el) => buscar(el.value),
  nutricionCambiarPagina: (el) => cambiarPagina(Number(el.dataset.dir)),
  nutricionAlumno: (el) => abrirAlumno(el.dataset.id),
  nutricionVolverAlumnos: () => volver(),
  nutricionCalcular: () => actualizarResultados(),
  nutricionGuardar: () => guardar(),
  nutricionSeccion: (el) => alternarSeccion(el),
  nutricionEnviar: (_el, e) => e.preventDefault(), // Enter en un campo no debe recargar la página
});
