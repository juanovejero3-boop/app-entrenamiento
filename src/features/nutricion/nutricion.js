// Nutrición (solo admin): dos subpestañas. «Alumnos» calcula los objetivos de cada alumno y «Alimentos» es la
// biblioteca del coach. Todo se guarda en Supabase.
import { registrarAcciones } from '../../lib/acciones.js';
import { switchTab } from '../../router.js';
import { state } from '../../state.js';
import { loadAdminData } from '../admin/admin.js';
import { mostrarAlumnosDeNutricion } from './alumnos.js';
import { mostrarBibliotecaDeAlimentos } from './biblioteca.js';
import { repoNutricion } from './repoNutricion.js';

const SUBPESTANAS = [
  {
    id: 'alumnos',
    texto: 'Alumnos',
    mostrar: (contenido, repo) => mostrarAlumnosDeNutricion(contenido, { repo, alumnos: state.adminAllUsers }),
  },
  {
    id: 'alimentos',
    texto: 'Alimentos',
    mostrar: (contenido, repo) => mostrarBibliotecaDeAlimentos(contenido, { repo }),
  },
];

let subpestana = 'alumnos';
/** @type {{ content: HTMLElement, repo: typeof repoNutricion } | null} */
let actual = null;

/**
 * @param {HTMLElement} content
 * @param {{ repo?: typeof repoNutricion, subpestana?: string }} [opciones]  subpestana: con cuál abrir (por defecto,
 *   la que se estaba mirando)
 */
export async function renderTabNutricion(content, { repo = repoNutricion, subpestana: inicial } = {}) {
  if (state.userProfile?.role !== 'admin') {
    alert('Acceso denegado. Esta área es exclusiva.');
    switchTab('perfil');
    return;
  }
  if (inicial) subpestana = inicial;
  if (!state.adminAllUsers.length) await loadAdminData();
  actual = { content, repo };

  content.innerHTML = `
    <div class="space-y-4 pb-24">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-xl font-black text-white uppercase tracking-wide">Nutrición</h2>
        <p class="text-xs text-gray-400">Objetivos de los alumnos y biblioteca de alimentos</p>
      </div>
      <div role="tablist" class="bg-cyberCard p-1 rounded-xl border border-gray-800 flex">
        ${SUBPESTANAS.map(
          (s) =>
            `<button role="tab" data-click="nutricionSubtab" data-subtab="${s.id}" class="flex-1 min-h-11 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition"></button>`,
        ).join('')}
      </div>
      <div data-nutricion-contenido></div>
    </div>
  `;
  mostrarSubpestana();
}

/** Marca la subpestaña activa y dibuja su contenido. */
function mostrarSubpestana() {
  const { content, repo } = actual;
  for (const boton of content.querySelectorAll('[data-click="nutricionSubtab"]')) {
    const s = SUBPESTANAS.find((x) => x.id === boton.dataset.subtab);
    const activa = s.id === subpestana;
    boton.setAttribute('aria-selected', String(activa));
    boton.className = `flex-1 min-h-11 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${activa ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}`;
    boton.textContent = s.texto;
  }
  SUBPESTANAS.find((s) => s.id === subpestana).mostrar(content.querySelector('[data-nutricion-contenido]'), repo);
}

registrarAcciones({
  nutricionSubtab: (el) => {
    subpestana = el.dataset.subtab;
    mostrarSubpestana();
  },
});
