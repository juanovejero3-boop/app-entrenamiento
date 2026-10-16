// Lo que ve el alumno de su entrenamiento: el ciclo activo, con todo para anotar, y debajo los
// ciclos anteriores plegados (solo el nombre) que se abren en solo lectura. El coach usa la misma
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

  content.dataset.planesAlumno = 'true';
  contextos.set(content, { alumno, hoy: opciones.hoy });
  content.innerHTML = `
    <div class="space-y-6">
      <div data-plan-activo></div>
      ${anteriores.length ? dibujarAnteriores(anteriores) : ''}
    </div>
  `;
  const hayPlan = await abrirPlanAlumno(content.querySelector('[data-plan-activo]'), alumno, {
    ...opciones,
    cicloId: activo?.id ?? null,
  });
  return hayPlan || anteriores.length > 0;
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
            <i class="fa-solid fa-chevron-down text-gray-500 transition"></i>
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
  const panel = boton.parentElement.querySelector('[data-ciclo-anterior-contenido]');
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
