// Constructor de planes de entrenamiento (vista admin).
// Se abre desde la lista de ciclos del alumno. Cada cambio se guarda al instante en el
// repositorio (Supabase). Las ediciones de texto no redibujan la pantalla entera
// (para no perder el foco al pasar de un campo a otro): solo actualizan el mapa de semanas.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';
import { nombreDelAlumno } from '../pdf/alumno.js';
import { llamarIA } from '../ia/gemini.js';
import { cargarBiblioteca } from '../ia/biblioteca.js';
import { proponerProgresion } from '../ia/progresion.js';
import { mostrarPdf } from '../pdf/mostrar.js';
import { repo } from '../repo/index.js';
import { DESCANSOS, FASES, GRUPOS_SUPERSERIE, TECNICAS, TIPOS_BLOQUE, TIPOS_INTENSIDAD } from './catalogos.js';
import {
  actualizarBloque,
  actualizarDia,
  actualizarEjercicio,
  actualizarPrioridad,
  actualizarReporte,
  actualizarSemana,
  agregarBloque,
  agregarDia,
  agregarEjercicio,
  agregarPrioridad,
  agregarSemana,
  contarSeries,
  duplicarSemana,
  eliminarBloque,
  eliminarDia,
  eliminarEjercicio,
  eliminarPrioridad,
  eliminarSemana,
  etiquetasSuperserie,
  fechasDeSemana,
  generarEstructura,
  propagarDia,
  propagarEjercicio,
} from './plan.js';

/** @type {{ content: HTMLElement, alumno: { id: string, name?: string, email?: string }, ciclo: import('../repo/supabase.js').Ciclo | null, plan: import('./plan.js').PlanEntrenamiento | null, alVolver: () => void } | null} */
let actual = null;

/**
 * Abre el constructor para un ciclo de un alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ cicloId: string, alVolver: () => void }} opciones  qué ciclo editar y qué hacer al tocar "Volver"
 */
export async function abrirConstructorDePlanes(content, alumno, { cicloId, alVolver }) {
  actual = { content, alumno, ciclo: null, plan: null, semana: 0, alVolver, ia: estadoIAInicial() };
  prepararCatalogoEjercicios(); // no se espera: el autocompletado aparece cuando termina de cargar
  const ciclos = await repo.listarCiclos(alumno.id);
  actual.ciclo = ciclos.find((c) => c.id === cicloId) ?? null;
  actual.plan = actual.ciclo?.plan ?? null;
  dibujar();
}

// ---------------------------------------------------------------------------
// Autocompletado de ejercicios (base de ~4000 ejercicios con video, src/data/exercises.json)
// ---------------------------------------------------------------------------

const ID_CATALOGO = 'ejercicios-catalogo';
let catalogo = null;

async function prepararCatalogoEjercicios() {
  if (document.getElementById(ID_CATALOGO)) return;
  const lista = document.createElement('datalist');
  lista.id = ID_CATALOGO;
  document.body.appendChild(lista);
  catalogo ??= (await import('../../../data/exercises.json')).default;
  lista.innerHTML = catalogo.map((ej) => `<option value="${esc(ej.n)}"></option>`).join('');
}

// ---------------------------------------------------------------------------
// Guardado
// ---------------------------------------------------------------------------

/** Reemplaza el plan, lo guarda y redibuja todo o solo el mapa de semanas. */
async function aplicar(nuevoPlan, { redibujar = true } = {}) {
  actual.plan = nuevoPlan;
  if (redibujar) dibujar();
  else actualizarResumenes();
  try {
    await repo.guardarPlanDelCiclo(actual.ciclo.id, nuevoPlan);
    marcarEstado('Guardado', true);
  } catch (error) {
    console.error('No se pudo guardar el plan', error);
    marcarEstado('No se pudo guardar: ' + error.message, false);
  }
}

function marcarEstado(texto, ok) {
  const el = actual.content.querySelector('[data-estado-guardado]');
  if (!el) return;
  el.textContent = texto;
  el.className = `text-[10px] uppercase tracking-wider ${ok ? 'text-emerald-400' : 'text-red-400'}`;
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-neonRed';
const claseBotonChico =
  'text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border transition whitespace-nowrap';

/** Posición de la semana que se está editando (siempre una que exista). */
function semanaElegida() {
  const ultima = actual.plan.weeks.length - 1;
  actual.semana = Math.max(0, Math.min(actual.semana, ultima));
  return actual.semana;
}

function dibujar() {
  const { content, alumno, plan } = actual;
  const elegida = plan?.weeks.length ? semanaElegida() : 0;
  content.innerHTML = `
    <div class="space-y-4 pb-24">
      <div class="flex items-center gap-3">
        <button data-click="constructorDePlanesVolver" class="text-gray-400 hover:text-neonRed" title="Volver a los ciclos">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-black text-white uppercase tracking-wide truncate">Plan de entrenamiento</h2>
          <p class="text-xs text-gray-400 truncate">${esc(nombreDelAlumno(alumno))}</p>
        </div>
        <span data-estado-guardado class="text-[10px] uppercase tracking-wider text-gray-500">${plan ? 'Guardado' : ''}</span>
      </div>
      ${plan ? dibujarAvisoDeEstado(actual.ciclo.estado) + dibujarBotonesPdf() + dibujarCabecera(plan) + dibujarLineamientos(plan) : dibujarCicloNoEncontrado()}
      ${plan && !plan.weeks.length ? dibujarCicloVacio() : ''}
      ${plan ? dibujarGenerador(plan) : ''}
      ${plan?.weeks.length ? dibujarAsistenteIA() : ''}
      ${plan ? dibujarMapa(plan, elegida) : ''}
      ${plan?.weeks.length ? dibujarSemana(plan, plan.weeks[elegida], elegida) : ''}
      ${plan ? `<button data-click="semanaAgregar" class="w-full py-3 bg-cyberCard border-2 border-dashed border-gray-700 text-gray-400 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition"><i class="fa-solid fa-plus mr-2"></i>Agregar semana</button>` : ''}
    </div>
  `;
}

function dibujarBotonesPdf() {
  const boton = (accion, icono, texto) =>
    `<button data-click="${accion}" class="${claseBotonChico} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed"><i class="fa-solid ${icono} mr-1"></i>${texto}</button>`;
  return `
    <div class="flex flex-wrap gap-2 justify-end">
      ${boton('pdfLineamientos', 'fa-file-lines', 'PDF de lineamientos')}
      ${boton('pdfEntrenamiento', 'fa-file-pdf', 'PDF del entrenamiento')}
    </div>
  `;
}

function dibujarCicloNoEncontrado() {
  return `
    <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">
      <i class="fa-solid fa-dumbbell text-2xl text-neonRed mb-2 block"></i>
      No se encontró ese ciclo. Volvé y elegí otro.
    </div>
  `;
}

function dibujarCicloVacio() {
  return `
    <div data-ciclo-vacio class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">
      <i class="fa-solid fa-dumbbell text-2xl text-neonRed mb-2 block"></i>
      Este ciclo todavía no tiene semanas. Generá la estructura para empezar.
    </div>
  `;
}

const AVISO_DE_ESTADO = {
  borrador: ['border-gray-700 text-gray-300', 'Borrador: el alumno no lo ve hasta que lo muestres.'],
  activo: ['border-emerald-800 text-emerald-200', 'Activo: el alumno ve lo que cambies (al recargar la página).'],
  finalizado: ['border-amber-800 text-amber-200', 'Finalizado: lo que cambies queda en el historial que ve el alumno.'],
};

function dibujarAvisoDeEstado(estado) {
  const [clase, texto] = AVISO_DE_ESTADO[estado];
  return `<p data-aviso-estado class="border rounded-xl px-3 py-2 text-xs ${clase}">${texto}</p>`;
}

function dibujarCabecera(plan) {
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label class="md:col-span-2 block">
          <span class="text-[10px] text-gray-400 uppercase font-bold">Nombre del macrociclo</span>
          <input data-change="planCampo" data-campo="macroName" value="${esc(plan.macroName)}" class="${claseInput} font-bold">
        </label>
        <label class="block">
          <span class="text-[10px] text-gray-400 uppercase font-bold">Fecha de inicio</span>
          <input type="date" data-change="planCampo" data-campo="startDate" value="${esc(plan.startDate)}" class="${claseInput}">
        </label>
      </div>
    </div>
  `;
}

const etiqueta = (texto) => `<span class="text-[10px] text-gray-400 uppercase font-bold">${texto}</span>`;

/** Objetivos y lineamientos del ciclo: es lo que va al PDF de lineamientos para el alumno. */
function dibujarLineamientos(plan) {
  const { report } = plan;
  const texto = (campo, titulo, filas, placeholder) => `
    <label class="block">
      ${etiqueta(titulo)}
      <textarea data-change="reporteCampo" data-campo="${campo}" rows="${filas}" placeholder="${placeholder}" class="${claseInput} resize-y">${esc(report[campo])}</textarea>
    </label>`;
  const prioridades = report.priorities
    .map(
      (p, i) => `
      <div class="flex flex-col md:flex-row gap-2 items-stretch">
        <input data-change="prioridadCampo" data-i="${i}" data-campo="target" value="${esc(p.target)}" placeholder="Ejercicio o músculo" class="${claseInput} md:w-1/3 font-bold">
        <input data-change="prioridadCampo" data-i="${i}" data-campo="progression" value="${esc(p.progression)}" placeholder="Cómo progresar (ej: +2,5 kg por semana manteniendo RIR 2)" class="${claseInput} flex-1">
        <button data-click="prioridadEliminar" data-i="${i}" title="Quitar prioridad" class="${claseBotonChico} border-red-900 text-red-400 hover:bg-red-950"><i class="fa-solid fa-xmark"></i></button>
      </div>`,
    )
    .join('');
  return `
    <section class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <h3 class="font-bold text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2 text-sm">Objetivos y lineamientos del ciclo</h3>
      ${texto('objective', 'Objetivo del macrociclo', 2, 'Qué buscamos en este ciclo')}
      <div class="space-y-2">
        ${etiqueta('Ejercicios / músculos prioritarios y cómo progresar')}
        ${prioridades}
        <button data-click="prioridadAgregar" class="${claseBotonChico} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed"><i class="fa-solid fa-plus mr-1"></i>Agregar prioridad</button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${texto('focus', 'Foco biomecánico', 2, '')}
        ${texto('evaluation', 'Método de evaluación', 2, '')}
      </div>
      ${texto('guidelines', 'Lineamientos generales', 3, 'Descanso, alimentación, técnica, lo que el alumno tenga que saber')}
    </section>
  `;
}

function dibujarGenerador(plan) {
  const tieneSemanas = plan?.weeks.length > 0;
  // Muestra la estructura actual para que regenerar parta de ella
  const semanas = plan?.weeks.length || 4;
  const dias = plan?.weeks[0]?.days.length || 4;
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-dashed border-neonRed/60 flex flex-wrap items-end gap-3">
      <label class="flex-1 min-w-[90px]">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Semanas</span>
        <input id="gen-semanas" type="number" min="1" value="${semanas}" class="${claseInput} text-center font-bold">
      </label>
      <label class="flex-1 min-w-[90px]">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Días por semana</span>
        <input id="gen-dias" type="number" min="1" max="7" value="${dias}" class="${claseInput} text-center font-bold">
      </label>
      <button data-click="planGenerar" class="flex-[2] min-w-[180px] py-2.5 neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider">
        <i class="fa-solid fa-bolt mr-1"></i> ${tieneSemanas ? 'Regenerar estructura' : 'Generar estructura'}
      </button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Asistente de IA: el coach escribe una instrucción, ve qué cambiaría y recién ahí la aplica
// ---------------------------------------------------------------------------

const estadoIAInicial = () => ({ instruccion: '', pensando: false, propuesta: null, error: null });

const ETIQUETAS_CAMPO = {
  sets: 'Series',
  reps: 'Reps',
  intensityType: 'Tipo de intensidad',
  intensityValue: 'Intensidad',
  rest: 'Descanso',
};
const MAXIMO_CAMBIOS_VISIBLES = 80;

function dibujarAsistenteIA() {
  return `
    <div data-ia-panel class="bg-cyberCard p-4 rounded-xl border border-dashed border-purple-500/60 space-y-3">
      ${contenidoIA()}
    </div>
  `;
}

function contenidoIA() {
  const { instruccion, pensando, propuesta, error } = actual.ia;
  return `
    <h3 class="text-xs font-black uppercase tracking-wider text-purple-300"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Asistente de progresión (IA)</h3>
    <p class="text-[11px] text-gray-400">Armá la primera semana y escribí qué querés: que progrese el ciclo ("+2 reps por semana"), que agregue ejercicios o que complete días. La IA completa las demás semanas y antes de aplicar ves qué cambia.</p>
    <textarea data-ia-instruccion data-input="iaInstruccion" rows="2" placeholder="Ej: sube 1 punto de RPE por semana y la semana 4 es de descarga" class="${claseInput} resize-none">${esc(instruccion)}</textarea>
    <button data-click="iaProponer" ${pensando ? 'disabled' : ''} class="w-full py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-black text-xs rounded-lg uppercase tracking-wider disabled:opacity-60 transition">
      ${pensando ? '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Pensando...' : '<i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Proponer cambios'}
    </button>
    ${error ? `<p data-ia-error class="text-xs text-red-300 bg-red-950/30 border border-red-900 rounded-lg p-3">${esc(error)}</p>` : ''}
    ${propuesta ? dibujarPropuestaIA(propuesta) : ''}
  `;
}

function dibujarPropuestaIA({ cambios, copiadas, avisos }) {
  const semanas = actual.plan.weeks;
  const copiadasTexto = copiadas.length
    ? `<p class="text-xs text-gray-200">Se copia la primera semana cargada a: <b>${copiadas.map((i) => esc(semanas[i].name)).join(', ')}</b>.</p>`
    : '';
  const agregados = cambios.filter((c) => c.agregado);
  const valores = cambios.filter((c) => !c.agregado);
  const visibles = valores.slice(0, MAXIMO_CAMBIOS_VISIBLES);
  const lista = visibles
    .map(
      (c) =>
        `<li data-ia-cambio class="text-xs text-gray-300"><span class="text-gray-500">${esc(c.semana)} · ${esc(c.dia)} ·</span> ${esc(c.ejercicio)}: ${ETIQUETAS_CAMPO[c.campo]} <span class="text-gray-500 line-through">${esc(c.antes)}</span> → <b class="text-white">${esc(c.despues)}</b></li>`,
    )
    .join('');
  const resto = valores.length - visibles.length;
  const visiblesAgregados = agregados.slice(0, MAXIMO_CAMBIOS_VISIBLES);
  const listaAgregados = visiblesAgregados
    .map(
      (c) =>
        `<li data-ia-agregado class="text-xs text-gray-300"><span class="text-emerald-400 font-bold">+</span> <b class="text-white">${esc(c.ejercicio)}</b> <span class="text-gray-400">${esc(c.despues)}</span> <span class="text-gray-500">· ${esc(c.semana)} · ${esc(c.dia)}</span>${c.fueraDeBiblioteca ? ' <span class="text-amber-300">(no está en la biblioteca, no tiene video)</span>' : ''}</li>`,
    )
    .join('');
  const restoAgregados = agregados.length - visiblesAgregados.length;
  const hayAlgo = cambios.length > 0 || copiadas.length > 0;
  return `
    <div data-ia-propuesta class="space-y-2 border-t border-gray-700 pt-3">
      <p class="text-xs font-bold uppercase tracking-wider text-purple-300">Propuesta de la IA</p>
      ${copiadasTexto}
      ${agregados.length ? `<p class="text-xs text-gray-200">Completa días vacíos con <b>${agregados.length}</b> ${agregados.length === 1 ? 'ejercicio' : 'ejercicios'}:</p><ul class="space-y-1 max-h-64 overflow-y-auto">${listaAgregados}</ul>${restoAgregados > 0 ? `<p class="text-[11px] text-gray-500">y ${restoAgregados} más</p>` : ''}` : ''}
      ${valores.length ? `<p class="text-xs text-gray-200"><b>${valores.length}</b> ${valores.length === 1 ? 'cambio' : 'cambios'} de valores:</p><ul class="space-y-1 max-h-64 overflow-y-auto">${lista}</ul>${resto > 0 ? `<p class="text-[11px] text-gray-500">y ${resto} más</p>` : ''}` : ''}
      ${hayAlgo ? '' : '<p class="text-xs text-gray-300">La IA no propone ningún cambio con esa instrucción.</p>'}
      ${avisos.length ? `<div data-ia-avisos class="text-xs text-amber-200 bg-amber-950/30 border border-amber-900 rounded-lg p-3 space-y-1"><p class="font-bold uppercase tracking-wider">Ojo</p><ul class="list-disc pl-4 space-y-0.5">${avisos.map((a) => `<li data-ia-aviso>${esc(a)}</li>`).join('')}</ul></div>` : ''}
      <div class="flex gap-2">
        ${hayAlgo ? `<button data-click="iaAplicar" class="flex-1 py-2.5 neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider">Aplicar</button>` : ''}
        <button data-click="iaDescartar" class="${claseBotonChico} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed px-4">Descartar</button>
      </div>
    </div>
  `;
}

/** Actualiza solo el panel del asistente (no la pantalla entera, para no perder el scroll ni lo escrito). */
function repintarIA() {
  const panel = actual.content.querySelector('[data-ia-panel]');
  if (panel) panel.innerHTML = contenidoIA();
}

async function proponerConIA() {
  const sesion = actual;
  if (sesion.ia.pensando) return;
  const instruccion = sesion.content.querySelector('[data-ia-instruccion]')?.value ?? sesion.ia.instruccion;
  if (!instruccion.trim()) return window.alert('Escribí qué querés que haga la IA.');

  const base = sesion.plan; // la propuesta vale solo para este plan: si cambia, hay que pedirla de nuevo
  sesion.ia = { instruccion, pensando: true, propuesta: null, error: null };
  repintarIA();
  try {
    // La biblioteca de ejercicios es lo que le permite a la IA completar días vacíos; si no carga, sigue sin ella
    const biblioteca = await cargarBiblioteca().catch(() => []);
    sesion.ia.propuesta = { ...(await proponerProgresion(llamarIA, base, instruccion, { biblioteca })), base };
  } catch (error) {
    console.error('La IA no pudo proponer cambios', error);
    sesion.ia.error = error.message;
  }
  sesion.ia.pensando = false;
  if (actual === sesion) repintarIA(); // si el coach ya salió del constructor, no hay nada que repintar
}

async function aplicarPropuestaIA() {
  const { propuesta } = actual.ia;
  if (!propuesta) return;
  if (propuesta.base !== actual.plan) {
    actual.ia = { ...actual.ia, propuesta: null, error: 'El plan cambió mientras tanto. Pedile de nuevo a la IA.' };
    return repintarIA();
  }
  actual.ia = estadoIAInicial();
  await aplicar(propuesta.plan);
}

function descartarPropuestaIA() {
  actual.ia = { ...actual.ia, propuesta: null, error: null };
  repintarIA();
}

/** El mapa del macrociclo: una pestaña por semana. Tocar una la abre para editarla. */
function dibujarMapa(plan, elegida) {
  if (!plan.weeks.length) return '';
  const clase = (w) =>
    w === elegida ? 'bg-red-950/30 border-neonRed' : 'bg-cyberCard border-gray-800 hover:border-gray-500';
  return `
    <div>
      <p class="text-[10px] text-gray-500 uppercase font-bold mb-2">Mapa del macrociclo · tocá una semana para editarla</p>
      <div data-mapa class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        ${plan.weeks.map((semana, w) => `<button type="button" data-click="semanaElegir" data-w="${w}" data-resumen-semana="${w}" ${w === elegida ? 'aria-current="true"' : ''} class="min-w-[150px] text-left border rounded-lg p-3 text-xs space-y-1 transition ${clase(w)}">${contenidoResumen(plan, semana, w)}</button>`).join('')}
      </div>
    </div>
  `;
}

function contenidoResumen(plan, semana, w) {
  return `
    <span class="block font-black text-white uppercase truncate">${esc(semana.name)}</span>
    <span class="block text-gray-400">📅 ${esc(fechasDeSemana(plan.startDate, w))}</span>
    <span class="block ${semana.objective ? 'text-neonRed font-bold' : 'text-gray-600 italic'}">${esc(semana.objective || 'Fase sin asignar')}</span>
    ${semana.targetVolume ? `<span class="block text-gray-400 border-t border-dashed border-gray-700 pt-1">🎯 ${esc(semana.targetVolume)}</span>` : ''}
    <span class="inline-block mt-1 px-2 py-0.5 rounded bg-red-950/40 border border-red-900 text-neonRed font-bold">💪 ${contarSeries(semana)} series</span>
  `;
}

function dibujarSemana(plan, semana, w) {
  const opcionesFase = ['', ...FASES]
    .map(
      (f) =>
        `<option value="${esc(f)}" ${semana.objective === f ? 'selected' : ''}>${f ? esc(f) : '— Asignar fase —'}</option>`,
    )
    .join('');
  return `
    <section data-semana="${w}" class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
      <div class="bg-cyberCarbon p-3 border-b border-gray-800 space-y-2">
        <div class="flex items-center gap-2">
          <input data-change="semanaCampo" data-w="${w}" data-campo="name" value="${esc(semana.name)}" class="flex-1 min-w-0 bg-transparent text-white font-black uppercase tracking-wide outline-none border-b border-transparent focus:border-neonRed">
          <span data-fechas-semana="${w}" class="text-[10px] text-gray-400 bg-black px-2 py-1 rounded border border-gray-800 whitespace-nowrap">${esc(fechasDeSemana(plan.startDate, w))}</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select data-change="semanaCampo" data-w="${w}" data-campo="objective" class="bg-cyberDark text-neonRed text-xs font-bold border border-gray-700 rounded p-1.5 outline-none">${opcionesFase}</select>
          <input data-change="semanaCampo" data-w="${w}" data-campo="targetVolume" value="${esc(semana.targetVolume)}" placeholder="Volumen obj. (ej: Espalda 12s)" class="flex-1 min-w-[140px] bg-cyberDark text-xs text-sky-400 border border-gray-700 rounded p-1.5 outline-none">
          <button data-click="semanaDuplicar" data-w="${w}" class="${claseBotonChico} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed"><i class="fa-solid fa-copy mr-1"></i>Duplicar</button>
          <button data-click="semanaEliminar" data-w="${w}" class="${claseBotonChico} border-red-900 text-red-400 hover:bg-red-950"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="p-3 space-y-3">
        ${semana.days.map((dia, d) => dibujarDia(dia, w, d)).join('')}
        <button data-click="diaAgregar" data-w="${w}" class="w-full py-2 bg-cyberDark border border-dashed border-gray-700 text-gray-400 text-[11px] font-bold rounded-lg uppercase hover:border-neonRed hover:text-neonRed transition"><i class="fa-solid fa-plus mr-1"></i>Día</button>
      </div>
    </section>
  `;
}

function dibujarDia(dia, w, d) {
  return `
    <div data-dia="${w}-${d}" class="bg-cyberDark rounded-lg border border-gray-800 p-3 space-y-2">
      <div class="flex items-center gap-2">
        <input data-change="diaCampo" data-w="${w}" data-d="${d}" value="${esc(dia.name)}" class="flex-1 min-w-0 bg-transparent text-white font-bold text-sm outline-none border-b border-transparent focus:border-neonRed">
        <button data-click="diaPropagar" data-w="${w}" data-d="${d}" title="Copiar este día a las semanas siguientes" class="${claseBotonChico} border-sky-800 text-sky-400 hover:bg-sky-950">Propagar ➔</button>
        <button data-click="diaEliminar" data-w="${w}" data-d="${d}" class="${claseBotonChico} border-red-900 text-red-400 hover:bg-red-950"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${dia.blocks.map((bloque, b) => dibujarBloque(bloque, w, d, b)).join('')}
      <button data-click="bloqueAgregar" data-w="${w}" data-d="${d}" class="w-full py-1.5 bg-cyberCarbon border border-gray-700 text-gray-300 text-[11px] font-bold rounded uppercase hover:border-neonRed hover:text-neonRed transition"><i class="fa-solid fa-plus mr-1"></i>Bloque</button>
    </div>
  `;
}

function dibujarBloque(bloque, w, d, b) {
  const tipo = TIPOS_BLOQUE[bloque.type] ?? { label: bloque.type, color: '#888' };
  const opciones = Object.entries(TIPOS_BLOQUE)
    .map(([clave, t]) => `<option value="${clave}" ${bloque.type === clave ? 'selected' : ''}>${esc(t.label)}</option>`)
    .join('');
  const pos = `data-w="${w}" data-d="${d}" data-b="${b}"`;
  const etiquetas = etiquetasSuperserie(bloque);
  return `
    <div data-bloque="${w}-${d}-${b}" class="bg-cyberCard rounded p-2 space-y-2 border-l-4" style="border-left-color: ${esc(tipo.color)}">
      <div class="flex items-center justify-between gap-2">
        <select data-change="bloqueCampo" ${pos} data-campo="type" class="bg-transparent font-bold text-xs outline-none" style="color: ${esc(tipo.color)}">${opciones}</select>
        <button data-click="bloqueEliminar" ${pos} class="text-[10px] text-red-400 hover:text-red-300 uppercase font-bold">Quitar bloque</button>
      </div>
      ${bloque.exercises.map((ej, e) => dibujarEjercicio(ej, w, d, b, e, etiquetas[e])).join('')}
      <button data-click="ejercicioAgregar" ${pos} class="px-3 py-1 bg-cyberCarbon border border-gray-700 text-gray-300 text-[11px] font-bold rounded hover:border-neonRed hover:text-neonRed transition"><i class="fa-solid fa-plus mr-1"></i>Ejercicio</button>
    </div>
  `;
}

const opcionesDe = (valores, actualValor, vacio) =>
  valores
    .map((v) => `<option value="${esc(v)}" ${actualValor === v ? 'selected' : ''}>${esc(v || vacio)}</option>`)
    .join('');

function dibujarEjercicio(ej, w, d, b, e, etiqueta) {
  const pos = `data-w="${w}" data-d="${d}" data-b="${b}" data-e="${e}"`;
  const campo = (nombre) => `data-change="ejercicioCampo" ${pos} data-campo="${nombre}"`;
  const claseCampo =
    'w-full bg-black border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed';
  const descansos = ['', ...DESCANSOS];
  const color = GRUPOS_SUPERSERIE[ej.group] ?? '#9ca3af';
  const grupos = ['', ...Object.keys(GRUPOS_SUPERSERIE)];
  return `
    <div data-ejercicio="${w}-${d}-${b}-${e}" class="bg-cyberDark rounded p-2 space-y-2 border ${ej.group ? 'border-dashed' : 'border-gray-800'}" ${ej.group ? `style="border-color: ${color}"` : ''}>
      <div class="flex items-center gap-2">
        ${etiqueta ? `<span data-etiqueta class="shrink-0 min-w-[2rem] text-center text-xs font-black px-1.5 py-1 rounded" style="color: ${color}; background: ${color}22; border: 1px solid ${color}">${esc(etiqueta)}</span>` : ''}
        <input ${campo('name')} list="${ID_CATALOGO}" value="${esc(ej.name)}" placeholder="Nombre del ejercicio" class="${claseCampo} font-bold">
        <button data-click="ejercicioPropagar" ${pos} title="Agregar este ejercicio a las semanas siguientes" class="${claseBotonChico} border-sky-800 text-sky-400 hover:bg-sky-950">Propagar ➔</button>
        <button data-click="ejercicioEliminar" ${pos} class="${claseBotonChico} border-red-900 text-red-400 hover:bg-red-950"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2">
        <label><span class="text-[9px] text-gray-500 uppercase">Series</span><input ${campo('sets')} value="${esc(ej.sets)}" class="${claseCampo}"></label>
        <label><span class="text-[9px] text-gray-500 uppercase">Reps</span><input ${campo('reps')} value="${esc(ej.reps)}" class="${claseCampo}"></label>
        <label class="col-span-2 md:col-span-1"><span class="text-[9px] text-gray-500 uppercase">Intensidad</span>
          <div class="flex gap-1">
            <select ${campo('intensityType')} class="${claseCampo} !w-auto">${opcionesDe(TIPOS_INTENSIDAD, ej.intensityType)}</select>
            <input ${campo('intensityValue')} value="${esc(ej.intensityValue)}" placeholder="2" class="${claseCampo}">
          </div>
        </label>
        <label><span class="text-[9px] text-gray-500 uppercase">Descanso</span><select ${campo('rest')} class="${claseCampo}">${opcionesDe(descansos, ej.rest, '-')}</select></label>
        <label><span class="text-[9px] text-gray-500 uppercase">Técnica</span><select ${campo('tech')} class="${claseCampo}">${opcionesDe(TECNICAS, ej.tech, 'Ninguna')}</select></label>
      </div>
      <div class="flex items-center gap-2">
        <input ${campo('notes')} value="${esc(ej.notes)}" placeholder="Notas" class="${claseCampo}">
        <label class="flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap" title="Los ejercicios del bloque con la misma letra forman la superserie (A1, A2, A3...)">
          Superserie
          <select ${campo('group')} class="bg-black border border-gray-700 rounded p-1 text-xs font-bold outline-none" style="color: ${color}">${opcionesDe(grupos, ej.group, '—')}</select>
        </label>
      </div>
    </div>
  `;
}

/** Actualiza el mapa y las fechas de cada semana sin redibujar los campos que se están editando. */
function actualizarResumenes() {
  const { content, plan } = actual;
  plan.weeks.forEach((semana, w) => {
    const resumen = content.querySelector(`[data-resumen-semana="${w}"]`);
    if (resumen) resumen.innerHTML = contenidoResumen(plan, semana, w);
    const fechas = content.querySelector(`[data-fechas-semana="${w}"]`);
    if (fechas) fechas.textContent = fechasDeSemana(plan.startDate, w);
  });
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

const indice = (el, clave) => Number(el.dataset[clave]);

async function generar() {
  const semanas = parseInt(actual.content.querySelector('#gen-semanas').value, 10);
  const dias = parseInt(actual.content.querySelector('#gen-dias').value, 10);
  if (!(semanas >= 1) || !(dias >= 1)) {
    window.alert('Indicá una cantidad válida de semanas y de días (mínimo 1).');
    return;
  }
  if (actual.plan?.weeks.length) {
    const ok = await window.confirm(
      'Este ciclo ya tiene semanas armadas. Si generás una estructura nueva se reemplazan. ¿Continuar?',
    );
    if (!ok) return;
  }
  actual.semana = 0;
  await aplicar(generarEstructura(actual.plan, semanas, dias));
}

function cambiarCampoPlan(el) {
  const nuevo = structuredClone(actual.plan);
  nuevo[el.dataset.campo] = el.value;
  return aplicar(nuevo, { redibujar: false });
}

async function eliminarSemanaConfirmando(w) {
  const semana = actual.plan.weeks[w];
  const ok = await window.confirm(`¿Eliminar "${semana.name}" y todo su contenido?`);
  if (ok) await aplicar(eliminarSemana(actual.plan, w));
}

async function eliminarBloqueConfirmando(w, d, b) {
  const bloque = actual.plan.weeks[w].days[d].blocks[b];
  if (bloque.exercises.length) {
    const ok = await window.confirm('¿Quitar el bloque y sus ejercicios?');
    if (!ok) return;
  }
  await aplicar(eliminarBloque(actual.plan, w, d, b));
}

function cambiarCampoEjercicio(el) {
  const [w, d, b, e] = ['w', 'd', 'b', 'e'].map((k) => indice(el, k));
  const campo = el.dataset.campo;
  // Cambiar el grupo renumera las etiquetas (A1, A2...) del bloque: ahí sí se redibuja
  return aplicar(actualizarEjercicio(actual.plan, w, d, b, e, { [campo]: el.value }), { redibujar: campo === 'group' });
}

async function eliminarDiaConfirmando(w, d) {
  const dia = actual.plan.weeks[w].days[d];
  if (dia.blocks.length) {
    const ok = await window.confirm(`¿Eliminar "${dia.name}" y sus ejercicios?`);
    if (!ok) return;
  }
  await aplicar(eliminarDia(actual.plan, w, d));
}

registrarAcciones({
  constructorDePlanesVolver: () => actual.alVolver(),
  iaInstruccion: (el) => {
    actual.ia.instruccion = el.value;
  },
  iaProponer: () => proponerConIA(),
  iaAplicar: () => aplicarPropuestaIA(),
  iaDescartar: () => descartarPropuestaIA(),
  planGenerar: () => generar(),
  planCampo: (el) => cambiarCampoPlan(el),
  pdfLineamientos: () => mostrarPdf('lineamientos', actual.plan, actual.alumno),
  pdfEntrenamiento: () => mostrarPdf('entrenamiento', actual.plan, actual.alumno),
  reporteCampo: (el) => aplicar(actualizarReporte(actual.plan, { [el.dataset.campo]: el.value }), { redibujar: false }),
  prioridadAgregar: () => aplicar(agregarPrioridad(actual.plan)),
  prioridadCampo: (el) =>
    aplicar(actualizarPrioridad(actual.plan, Number(el.dataset.i), { [el.dataset.campo]: el.value }), {
      redibujar: false,
    }),
  prioridadEliminar: (el) => aplicar(eliminarPrioridad(actual.plan, Number(el.dataset.i))),
  semanaElegir: (el) => {
    actual.semana = indice(el, 'w');
    dibujar();
  },
  semanaAgregar: () => {
    actual.semana = actual.plan.weeks.length; // la semana nueva queda abierta
    return aplicar(agregarSemana(actual.plan));
  },
  semanaCampo: (el) =>
    aplicar(actualizarSemana(actual.plan, indice(el, 'w'), { [el.dataset.campo]: el.value }), { redibujar: false }),
  semanaDuplicar: (el) => {
    actual.semana = indice(el, 'w') + 1; // la copia queda abierta
    return aplicar(duplicarSemana(actual.plan, indice(el, 'w')));
  },
  semanaEliminar: (el) => eliminarSemanaConfirmando(indice(el, 'w')),
  diaAgregar: (el) => aplicar(agregarDia(actual.plan, indice(el, 'w'))),
  diaCampo: (el) =>
    aplicar(actualizarDia(actual.plan, indice(el, 'w'), indice(el, 'd'), { name: el.value }), { redibujar: false }),
  diaEliminar: (el) => eliminarDiaConfirmando(indice(el, 'w'), indice(el, 'd')),
  diaPropagar: (el) => aplicar(propagarDia(actual.plan, indice(el, 'w'), indice(el, 'd'))),
  bloqueAgregar: (el) => aplicar(agregarBloque(actual.plan, indice(el, 'w'), indice(el, 'd'))),
  // El tipo cambia el color del bloque: se redibuja
  bloqueCampo: (el) =>
    aplicar(actualizarBloque(actual.plan, indice(el, 'w'), indice(el, 'd'), indice(el, 'b'), { type: el.value })),
  bloqueEliminar: (el) => eliminarBloqueConfirmando(indice(el, 'w'), indice(el, 'd'), indice(el, 'b')),
  ejercicioAgregar: (el) => aplicar(agregarEjercicio(actual.plan, indice(el, 'w'), indice(el, 'd'), indice(el, 'b'))),
  ejercicioCampo: (el) => cambiarCampoEjercicio(el),
  ejercicioEliminar: (el) => aplicar(eliminarEjercicio(actual.plan, ...['w', 'd', 'b', 'e'].map((k) => indice(el, k)))),
  ejercicioPropagar: (el) => aplicar(propagarEjercicio(actual.plan, ...['w', 'd', 'b', 'e'].map((k) => indice(el, k)))),
});
