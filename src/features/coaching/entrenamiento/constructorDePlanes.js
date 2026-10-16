// Constructor de planes de entrenamiento (vista admin).
// Se abre desde la ficha del alumno en Planilla. Cada cambio se guarda al instante en el
// repositorio (hoy localStorage). Las ediciones de texto no redibujan la pantalla entera
// (para no perder el foco al pasar de un campo a otro): solo actualizan el mapa de semanas.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';
import { mostrarProcesando, ocultarProcesando, toast } from '../../../lib/ui.js';
import { docEntrenamiento } from '../pdf/entrenamiento.js';
import { generarPdfBlob } from '../pdf/generar.js';
import { docLineamientos } from '../pdf/lineamientos.js';
import { nombreArchivo } from '../pdf/nombre.js';
import { abrirVistaPrevia } from '../pdf/vistaPrevia.js';
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
  crearPlan,
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
  prepararCatalogoEjercicios(); // no se espera: el autocompletado aparece cuando termina de cargar
  actual.plan = await repo.cargarPlanEntrenamiento(alumno.id);
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
      ${plan ? dibujarBotonesPdf() + dibujarCabecera(plan) + dibujarLineamientos(plan) : dibujarSinPlan()}
      ${dibujarGenerador(plan)}
      ${plan ? dibujarMapa(plan) : ''}
      ${plan ? plan.weeks.map((semana, w) => dibujarSemana(plan, semana, w)).join('') : ''}
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
      'Este alumno ya tiene semanas armadas. Si generás una estructura nueva se reemplazan. ¿Continuar?',
    );
    if (!ok) return;
  }
  const base = actual.plan ?? crearPlan({ fechaInicio: hoy() });
  await aplicar(generarEstructura(base, semanas, dias));
}

function cambiarCampoPlan(el) {
  const nuevo = structuredClone(actual.plan);
  nuevo[el.dataset.campo] = el.value;
  return aplicar(nuevo, { redibujar: false });
}

/** Genera uno de los PDF del plan ('lineamientos' o 'entrenamiento') y lo muestra en la vista previa. */
async function generarPdf(tipo) {
  const { plan, alumno } = actual;
  const armar = tipo === 'lineamientos' ? docLineamientos : docEntrenamiento;
  const fecha = hoy();
  mostrarProcesando('Generando PDF...');
  try {
    const blob = await generarPdfBlob(armar(plan, alumno, { fecha }));
    abrirVistaPrevia({
      blob,
      nombreArchivo: nombreArchivo(tipo, alumno, fecha),
      titulo: tipo === 'lineamientos' ? 'PDF de lineamientos' : 'PDF del entrenamiento',
    });
  } catch (error) {
    console.error('No se pudo generar el PDF', error);
    toast('No se pudo generar el PDF', false);
  } finally {
    ocultarProcesando();
  }
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
  planGenerar: () => generar(),
  planCampo: (el) => cambiarCampoPlan(el),
  pdfLineamientos: () => generarPdf('lineamientos'),
  pdfEntrenamiento: () => generarPdf('entrenamiento'),
  reporteCampo: (el) => aplicar(actualizarReporte(actual.plan, { [el.dataset.campo]: el.value }), { redibujar: false }),
  prioridadAgregar: () => aplicar(agregarPrioridad(actual.plan)),
  prioridadCampo: (el) =>
    aplicar(actualizarPrioridad(actual.plan, Number(el.dataset.i), { [el.dataset.campo]: el.value }), {
      redibujar: false,
    }),
  prioridadEliminar: (el) => aplicar(eliminarPrioridad(actual.plan, Number(el.dataset.i))),
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
