// Ciclos de entrenamiento de un alumno (vista del coach): la lista con su estado y las acciones
// para armar uno nuevo, mostrarlo al alumno, ocultarlo, finalizarlo, editarlo o verlo como el alumno.
//   borrador   -> el alumno no lo ve; el coach lo arma con calma
//   activo     -> el alumno lo ve y anota en él (solo hay uno por alumno)
//   finalizado -> queda en el historial del alumno, en solo lectura
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';
import { esFechaValida, hoyISO } from '../../../lib/fecha.js';
import { toast } from '../../../lib/ui.js';
import { abrirPlanAlumno } from '../alumno/planAlumno.js';
import { abrirConstructorDePlanes } from '../entrenamiento/constructorDePlanes.js';
import { crearPlan, rangoDelPlan } from '../entrenamiento/plan.js';
import { nombreDelAlumno } from '../pdf/alumno.js';
import { repo } from '../repo/index.js';
import { cicloActivo, fechaInicioSugerida, planCopiado } from './ciclos.js';

/**
 * @type {{
 *   content: HTMLElement, alumno: { id: string, name?: string, email?: string },
 *   ciclos: import('../repo/supabase.js').Ciclo[], error: string | null, nuevo: { inicio: string } | null,
 *   alVolver: () => void, hoy: string
 * } | null}
 */
let actual = null;

/**
 * Abre la lista de ciclos del alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ alVolver: () => void, hoy?: string }} opciones  qué hacer al tocar "Volver"; hoy: AAAA-MM-DD
 */
export async function abrirCiclosDelAlumno(content, alumno, { alVolver, hoy = hoyISO() }) {
  actual = { content, alumno, ciclos: [], error: null, nuevo: null, alVolver, hoy };
  await recargar();
}

async function recargar() {
  try {
    actual.ciclos = await repo.listarCiclos(actual.alumno.id);
    actual.error = null;
  } catch (error) {
    console.error('No se pudieron cargar los ciclos', error);
    actual.error = error.message;
  }
  dibujar();
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

const claseBoton =
  'text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border transition whitespace-nowrap';
const claseNeutro = `${claseBoton} border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed`;
const claseVerde = `${claseBoton} border-emerald-700 text-emerald-300 hover:bg-emerald-950`;
const clasePeligro = `${claseBoton} border-red-900 text-red-400 hover:bg-red-950`;
const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-neonRed';

const ESTADOS = {
  borrador: { etiqueta: 'Borrador', clase: 'border-gray-600 text-gray-300' },
  activo: { etiqueta: 'Activo', clase: 'border-emerald-700 text-emerald-300 bg-emerald-950/40' },
  finalizado: { etiqueta: 'Finalizado', clase: 'border-sky-800 text-sky-300 bg-sky-950/40' },
};

const formatear = (fecha) => fecha.split('-').reverse().join('/');

function dibujar() {
  const { content, alumno, ciclos, error, nuevo } = actual;
  const recientes = [...ciclos].reverse(); // del más nuevo al más viejo
  content.innerHTML = `
    <div class="space-y-4 pb-24">
      <div class="flex items-center gap-3">
        <button data-click="ciclosVolver" class="text-gray-400 hover:text-neonRed" title="Volver a la planilla">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="flex-1 min-w-0">
          <h2 class="text-lg font-black text-white uppercase tracking-wide truncate">Ciclos de entrenamiento</h2>
          <p class="text-xs text-gray-400 truncate">${esc(nombreDelAlumno(alumno))}</p>
        </div>
      </div>
      ${error ? dibujarError(error) : dibujarContenido(recientes, nuevo)}
    </div>
  `;
}

function dibujarError(error) {
  return `<div class="bg-red-950/30 border border-red-900 rounded-xl p-4 text-sm text-red-300">No se pudieron cargar los ciclos: ${esc(error)}</div>`;
}

function dibujarContenido(recientes, nuevo) {
  return `
    ${nuevo ? dibujarFormularioNuevo(recientes, nuevo) : `<button data-click="cicloNuevo" class="w-full py-3 neon-glow-button text-white font-black text-sm rounded-xl uppercase tracking-wider"><i class="fa-solid fa-plus mr-2"></i>Nuevo ciclo</button>`}
    ${
      recientes.length
        ? recientes.map(dibujarCiclo).join('')
        : '<div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400"><i class="fa-solid fa-dumbbell text-2xl text-neonRed mb-2 block"></i>Este alumno todavía no tiene ciclos. Creá el primero para empezar.</div>'
    }
  `;
}

function dibujarFormularioNuevo(recientes, { inicio }) {
  const origenes = recientes
    .map((c) => `<option value="${esc(c.id)}">Copiar «${esc(c.plan.macroName)}»</option>`)
    .join('');
  return `
    <div data-nuevo-formulario class="bg-cyberCard p-4 rounded-xl border border-dashed border-neonRed/60 space-y-3">
      <label class="block">
        <span class="text-[10px] text-gray-400 uppercase font-bold">Fecha de inicio</span>
        <input type="date" data-nuevo-inicio value="${esc(inicio)}" class="${claseInput}">
      </label>
      ${
        recientes.length
          ? `<label class="block">
              <span class="text-[10px] text-gray-400 uppercase font-bold">Armarlo a partir de</span>
              <select data-nuevo-origen class="${claseInput}"><option value="">Un ciclo vacío</option>${origenes}</select>
            </label>`
          : ''
      }
      <p class="text-[11px] text-gray-500">Nace como borrador: el alumno no lo ve hasta que lo muestres.</p>
      <div class="flex gap-2">
        <button data-click="cicloCrear" class="flex-1 py-2.5 neon-glow-button text-white font-black text-xs rounded-lg uppercase tracking-wider">Crear borrador</button>
        <button data-click="cicloNuevoCancelar" class="${claseNeutro}">Cancelar</button>
      </div>
    </div>
  `;
}

function dibujarCiclo(ciclo) {
  const { plan, estado } = ciclo;
  const rango = rangoDelPlan(plan);
  const semanas = plan.weeks.length;
  const detalle = [
    rango ? `${rango.inicio} – ${rango.fin}` : plan.startDate ? `Desde ${formatear(plan.startDate)}` : 'Sin fechas',
    semanas ? `${semanas} ${semanas === 1 ? 'semana' : 'semanas'}` : 'Sin semanas armadas',
  ].join('  ·  ');
  const id = esc(ciclo.id);
  const boton = (accion, clase, texto) =>
    `<button data-click="${accion}" data-id="${id}" class="${clase}">${texto}</button>`;
  const acciones = [
    boton('cicloEditar', claseNeutro, '<i class="fa-solid fa-pen mr-1"></i>Editar'),
    boton('cicloVer', claseNeutro, '<i class="fa-solid fa-eye mr-1"></i>Ver'),
    estado === 'borrador' && boton('cicloMostrar', claseVerde, '<i class="fa-solid fa-eye mr-1"></i>Mostrar al alumno'),
    estado === 'activo' && boton('cicloOcultar', claseNeutro, '<i class="fa-solid fa-eye-slash mr-1"></i>Ocultar'),
    estado === 'activo' &&
      boton('cicloFinalizar', clasePeligro, '<i class="fa-solid fa-flag-checkered mr-1"></i>Finalizar'),
    boton('cicloEliminar', clasePeligro, '<i class="fa-solid fa-trash mr-1"></i>Eliminar'),
  ].filter(Boolean);
  return `
    <div data-ciclo="${id}" class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 data-ciclo-nombre class="font-black text-white uppercase tracking-wide truncate">${esc(plan.macroName)}</h3>
          <p class="text-xs text-gray-400">${esc(detalle)}</p>
        </div>
        <span data-ciclo-estado class="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${ESTADOS[estado].clase}">${ESTADOS[estado].etiqueta}</span>
      </div>
      <div class="flex flex-wrap gap-2">${acciones.join('')}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

const cicloDe = (id) => actual.ciclos.find((c) => c.id === id);

/** Corre una acción sobre la base: si falla lo avisa, y en todos los casos vuelve a leer la lista. */
async function conAviso(accion) {
  try {
    await accion();
  } catch (error) {
    console.error('No se pudo completar la acción sobre el ciclo', error);
    toast(`No se pudo completar: ${error.message}`, false);
  }
  await recargar();
}

const reabrirLista = () =>
  abrirCiclosDelAlumno(actual.content, actual.alumno, { alVolver: actual.alVolver, hoy: actual.hoy });

function editar(id) {
  const { content, alumno } = actual;
  return abrirConstructorDePlanes(content, alumno, { cicloId: id, alVolver: reabrirLista });
}

function ver(id) {
  const { content, alumno, hoy } = actual;
  return abrirPlanAlumno(content, alumno, { cicloId: id, soloLectura: true, alVolver: reabrirLista, hoy });
}

async function crear() {
  const inicio = actual.content.querySelector('[data-nuevo-inicio]')?.value ?? '';
  if (!esFechaValida(inicio)) return window.alert('Elegí la fecha de inicio del ciclo.');
  const origen = cicloDe(actual.content.querySelector('[data-nuevo-origen]')?.value);
  const plan = origen ? planCopiado(origen.plan, inicio) : crearPlan({ fechaInicio: inicio });
  let ciclo;
  try {
    ciclo = await repo.crearCiclo(actual.alumno.id, plan, 'borrador');
  } catch (error) {
    console.error('No se pudo crear el ciclo', error);
    return toast(`No se pudo crear el ciclo: ${error.message}`, false);
  }
  await editar(ciclo.id);
}

/** Muestra el ciclo al alumno; si había otro activo, lo finaliza antes (la base permite uno solo). */
async function mostrar(id) {
  const activo = cicloActivo(actual.ciclos);
  if (activo) {
    const ok = await window.confirm(
      `Ya hay un ciclo activo («${activo.plan.macroName}»). Si mostrás este, ese pasa a finalizado. ¿Continuar?`,
    );
    if (!ok) return;
  }
  await conAviso(async () => {
    if (activo) await repo.cambiarEstadoDelCiclo(activo.id, 'finalizado');
    try {
      await repo.cambiarEstadoDelCiclo(id, 'activo');
    } catch (error) {
      if (activo) await repo.cambiarEstadoDelCiclo(activo.id, 'activo').catch(() => {}); // deja todo como estaba
      throw error;
    }
  });
}

async function ocultar(id) {
  const ok = await window.confirm(
    `El alumno deja de verlo (lo que anotó se conserva) y «${cicloDe(id).plan.macroName}» vuelve a ser un borrador. ¿Ocultarlo?`,
  );
  if (ok) await conAviso(() => repo.cambiarEstadoDelCiclo(id, 'borrador'));
}

async function finalizar(id) {
  const ok = await window.confirm(
    `¿Finalizar «${cicloDe(id).plan.macroName}»? El alumno lo verá en su historial y ya no podrá anotar en él.`,
  );
  if (ok) await conAviso(() => repo.cambiarEstadoDelCiclo(id, 'finalizado'));
}

async function eliminar(id) {
  const { plan, estado } = cicloDe(id);
  // Un borrador nunca lo vio el alumno; en los demás se borra también lo que anotó
  const ok = await window.confirm(
    estado === 'borrador'
      ? `¿Eliminar el borrador «${plan.macroName}»? No se puede deshacer.`
      : `¿Eliminar «${plan.macroName}»? Se borra también todo lo que el alumno anotó en él (series y sesiones). No se puede deshacer.`,
  );
  if (ok) await conAviso(() => repo.eliminarCiclo(id));
}

registrarAcciones({
  ciclosVolver: () => actual?.alVolver(),
  cicloNuevo: () => {
    actual.nuevo = { inicio: fechaInicioSugerida(actual.ciclos, actual.hoy) };
    dibujar();
  },
  cicloNuevoCancelar: () => {
    actual.nuevo = null;
    dibujar();
  },
  cicloCrear: () => crear(),
  cicloEditar: (el) => editar(el.dataset.id),
  cicloVer: (el) => ver(el.dataset.id),
  cicloMostrar: (el) => mostrar(el.dataset.id),
  cicloOcultar: (el) => ocultar(el.dataset.id),
  cicloFinalizar: (el) => finalizar(el.dataset.id),
  cicloEliminar: (el) => eliminar(el.dataset.id),
});
