// Lo que ve el alumno de su entrenamiento: el ciclo actual, con todo para anotar, y debajo los
// ciclos anteriores en solo lectura; todos plegados (solo el nombre) hasta que los toca. El coach usa la misma
// pantalla en modo lectura ("Ver como alumno"). Los borradores no se muestran.
import { escapeAttr as esc } from '../../../lib/dom.js';
import { registrarAcciones } from '../../../lib/acciones.js';
import { ciclosAnteriores, cicloActivo } from '../ciclos/ciclos.js';
import { repo } from '../repo/index.js';
import { abrirPlanAlumno } from './planAlumno.js';

/** Opciones y datos de cada contenedor, para atender el despliegue de sus ciclos anteriores. */
const contextos = new WeakMap();

/**
 * Muestra los planes del alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ soloLectura?: boolean, alVolver?: (() => void) | null, hoy?: string }} [opciones]
 *   las mismas que `abrirPlanAlumno` (menos `cicloId`).
 * @returns {Promise<boolean>} si hay algo para mostrar (un plan activo o ciclos anteriores)
 */
export async function abrirPlanesDelAlumno(content, alumno, opciones = {}) {
  const ciclos = await repo.listarCiclos(alumno.id);
  const activo = cicloActivo(ciclos);
  const anteriores = ciclosAnteriores(ciclos);
  // El alumno ve su ciclo plegado; el coach (modo lectura o con Volver) lo ve abierto, con su barra de aviso
  const plegarActivo = Boolean(activo?.plan.weeks.length) && !opciones.soloLectura && !opciones.alVolver;

  content.dataset.planesAlumno = 'true';
  contextos.set(content, { alumno, hoy: opciones.hoy });
  content.innerHTML = `
    <div class="space-y-6">
      ${dibujarActivo(activo, plegarActivo)}
      ${anteriores.length ? dibujarAnteriores(anteriores) : ''}
    </div>
  `;
  const hayPlan = await abrirPlanAlumno(content.querySelector('[data-plan-activo]'), alumno, {
    ...opciones,
    cicloId: activo?.id ?? null,
  });
  return hayPlan || anteriores.length > 0;
}

function dibujarActivo(activo, plegado) {
  if (!plegado) return '<div data-plan-activo></div>';
  return `
    <div data-ciclo-actual class="bg-cyberCard rounded-xl border border-neonRed/60">
      <button data-click="historialAlternar" aria-expanded="false" class="w-full flex items-center justify-between gap-3 p-3 text-left">
        <span class="min-w-0">
          <span class="block text-[10px] font-bold uppercase tracking-wider text-neonRed">Ciclo actual</span>
          <span data-ciclo-actual-nombre class="block font-black text-white text-base uppercase tracking-wide truncate">${esc(activo.plan.macroName)}</span>
        </span>
        <i class="fa-solid fa-chevron-down text-gray-300 transition"></i>
      </button>
      <div data-plan-activo data-cargado="true" hidden class="p-3 pt-0"></div>
    </div>
  `;
}

function dibujarAnteriores(anteriores) {
  return `
    <section data-ciclos-anteriores class="space-y-2">
      <h3 class="text-[11px] font-black uppercase tracking-wider text-gray-400">Ciclos anteriores</h3>
      ${anteriores
        .map(
          (c) => `
        <div data-ciclo-anterior="${esc(c.id)}" class="bg-cyberCard rounded-xl border border-gray-800">
          <button data-click="historialAlternar" data-id="${esc(c.id)}" aria-expanded="false" class="w-full flex items-center justify-between gap-3 p-3 text-left">
            <span data-ciclo-anterior-nombre class="font-black text-white text-sm uppercase tracking-wide truncate">${esc(c.plan.macroName)}</span>
            <i class="fa-solid fa-chevron-down text-gray-300 transition"></i>
          </button>
          <div data-ciclo-anterior-contenido hidden class="p-3 pt-0"></div>
        </div>`,
        )
        .join('')}
    </section>
  `;
}

/** Despliega o pliega un ciclo anterior; la primera vez lo carga (y si falla, se puede reintentar). */
async function alternar(boton) {
  const contexto = contextos.get(boton.closest('[data-planes-alumno]'));
  const panel = boton.nextElementSibling; // el contenido va justo después del botón
  if (!contexto || !panel) return;

  const abrir = panel.hidden;
  panel.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  boton.querySelector('i')?.classList.toggle('rotate-180', abrir);
  if (!abrir || panel.dataset.cargado) return;

  panel.dataset.cargado = 'true';
  try {
    await abrirPlanAlumno(panel, contexto.alumno, {
      cicloId: boton.dataset.id,
      soloLectura: true,
      sinBarra: true,
      hoy: contexto.hoy,
    });
  } catch (error) {
    console.error('No se pudo cargar el ciclo anterior', error);
    delete panel.dataset.cargado;
    panel.innerHTML = `<p class="text-sm text-red-300">No se pudo cargar este ciclo: ${esc(error.message)}. Plegalo y volvé a abrirlo para reintentar.</p>`;
  }
}

registrarAcciones({
  historialAlternar: (el) => alternar(el),
});
