// Constructor de planes de entrenamiento (vista admin).
// Se abre desde la ficha del alumno en Planilla. Cada cambio se guarda al instante en el
// repositorio (hoy localStorage). Las ediciones de texto no redibujan la pantalla entera
// (para no perder el foco al pasar de un campo a otro): solo actualizan el mapa de semanas.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';
import { repo } from '../repo/index.js';
import { FASES } from './catalogos.js';
import {
  actualizarDia,
  actualizarSemana,
  agregarDia,
  agregarSemana,
  contarSeries,
  crearPlan,
  duplicarSemana,
  eliminarDia,
  eliminarSemana,
  fechasDeSemana,
  generarEstructura,
  propagarDia,
} from './plan.js';

/** @type {{ content: HTMLElement, alumno: { id: string, name?: string, email?: string }, plan: import('./plan.js').PlanEntrenamiento | null, alVolver: () => void } | null} */
let actual = null;

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Abre el constructor para un alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ alVolver: () => void }} opciones  qué hacer al tocar "Volver"
 */
export async function abrirConstructorDePlanes(content, alumno, { alVolver }) {
  actual = { content, alumno, plan: null, alVolver };
  actual.plan = await repo.cargarPlanEntrenamiento(alumno.id);
  dibujar();
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
    await repo.guardarPlanEntrenamiento(actual.alumno.id, nuevoPlan);
    marcarEstado('Guardado (local)', true);
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

function dibujar() {
  const { content, alumno, plan } = actual;
  content.innerHTML = `
    <div class="space-y-4 pb-24">
      <div class="flex items-center gap-3">
        <button data-click="constructorDePlanesVolver" class="text-gray-400 hover:text-neonRed" title="Volver a la planilla">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-black text-white uppercase tracking-wide truncate">Plan de entrenamiento</h2>
          <p class="text-xs text-gray-400 truncate">${esc(alumno.name || alumno.email || 'Alumno')}</p>
        </div>
        <span data-estado-guardado class="text-[10px] uppercase tracking-wider text-gray-500">${plan ? 'Guardado (local)' : ''}</span>
      </div>
      ${plan ? dibujarCabecera(plan) : dibujarSinPlan()}
      ${dibujarGenerador(plan)}
      ${plan ? dibujarMapa(plan) : ''}
      ${plan ? plan.weeks.map((semana, w) => dibujarSemana(plan, semana, w)).join('') : ''}
      ${plan ? `<button data-click="semanaAgregar" class="w-full py-3 bg-cyberCard border-2 border-dashed border-gray-700 text-gray-400 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition"><i class="fa-solid fa-plus mr-2"></i>Agregar semana</button>` : ''}
    </div>
  `;
}

function dibujarSinPlan() {
  return `
    <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">
      <i class="fa-solid fa-dumbbell text-2xl text-neonRed mb-2 block"></i>
      Este alumno todavía no tiene un plan en la app. Generá la estructura para empezar.
    </div>
  `;
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
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-[10px] text-gray-400 uppercase font-bold">Foco biomecánico</span>
          <textarea data-change="planCampo" data-campo="focus" rows="2" class="${claseInput} resize-none">${esc(plan.report.focus)}</textarea>
        </label>
        <label class="block">
          <span class="text-[10px] text-gray-400 uppercase font-bold">Método de evaluación</span>
          <textarea data-change="planCampo" data-campo="evaluation" rows="2" class="${claseInput} resize-none">${esc(plan.report.evaluation)}</textarea>
        </label>
      </div>
    </div>
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

function dibujarMapa(plan) {
  if (!plan.weeks.length) return '';
  return `
    <div>
      <p class="text-[10px] text-gray-500 uppercase font-bold mb-2">Mapa del macrociclo</p>
      <div data-mapa class="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        ${plan.weeks.map((semana, w) => `<div data-resumen-semana="${w}" class="min-w-[150px] bg-cyberCard border border-gray-800 rounded-lg p-3 text-xs space-y-1">${contenidoResumen(plan, semana, w)}</div>`).join('')}
      </div>
    </div>
  `;
}

function contenidoResumen(plan, semana, w) {
  return `
    <div class="font-black text-white uppercase truncate">${esc(semana.name)}</div>
    <div class="text-gray-400">📅 ${esc(fechasDeSemana(plan.startDate, w))}</div>
    <div class="${semana.objective ? 'text-neonRed font-bold' : 'text-gray-600 italic'}">${esc(semana.objective || 'Fase sin asignar')}</div>
    ${semana.targetVolume ? `<div class="text-gray-400 border-t border-dashed border-gray-700 pt-1">🎯 ${esc(semana.targetVolume)}</div>` : ''}
    <div class="inline-block mt-1 px-2 py-0.5 rounded bg-red-950/40 border border-red-900 text-neonRed font-bold">💪 ${contarSeries(semana)} series</div>
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
      'Este alumno ya tiene semanas armadas. Si generás una estructura nueva se reemplazan. ¿Continuar?',
    );
    if (!ok) return;
  }
  const base = actual.plan ?? crearPlan({ fechaInicio: hoy() });
  await aplicar(generarEstructura(base, semanas, dias));
}

function cambiarCampoPlan(el) {
  const campo = el.dataset.campo;
  const nuevo = structuredClone(actual.plan);
  if (campo === 'focus' || campo === 'evaluation') nuevo.report[campo] = el.value;
  else nuevo[campo] = el.value;
  return aplicar(nuevo, { redibujar: false });
}

async function eliminarSemanaConfirmando(w) {
  const semana = actual.plan.weeks[w];
  const ok = await window.confirm(`¿Eliminar "${semana.name}" y todo su contenido?`);
  if (ok) await aplicar(eliminarSemana(actual.plan, w));
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
  planGenerar: () => generar(),
  planCampo: (el) => cambiarCampoPlan(el),
  semanaAgregar: () => aplicar(agregarSemana(actual.plan)),
  semanaCampo: (el) =>
    aplicar(actualizarSemana(actual.plan, indice(el, 'w'), { [el.dataset.campo]: el.value }), { redibujar: false }),
  semanaDuplicar: (el) => aplicar(duplicarSemana(actual.plan, indice(el, 'w'))),
  semanaEliminar: (el) => eliminarSemanaConfirmando(indice(el, 'w')),
  diaAgregar: (el) => aplicar(agregarDia(actual.plan, indice(el, 'w'))),
  diaCampo: (el) =>
    aplicar(actualizarDia(actual.plan, indice(el, 'w'), indice(el, 'd'), { name: el.value }), { redibujar: false }),
  diaEliminar: (el) => eliminarDiaConfirmando(indice(el, 'w'), indice(el, 'd')),
  diaPropagar: (el) => aplicar(propagarDia(actual.plan, indice(el, 'w'), indice(el, 'd'))),
});
