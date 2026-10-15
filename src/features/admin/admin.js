// Panel admin: sub-pestañas (Asignación / Llamadas) y listado paginado de alumnos.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr } from '../../lib/dom.js';
import { switchTab } from '../../router.js';
import { supaClient } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { renderAdminLlamadas } from '../reservas/reservas.js';
import { checkAndSendExpirationEmails } from './vencimientos.js';

let adminSubTab = 'asignacion';
let alumnosFiltrados = [];
let alumnosPagina = 0;
const ALUMNOS_POR_PAGINA = 3;

export async function renderTabAdmin(content) {
  // --- CANDADO DE SEGURIDAD ---
  if (state.userProfile?.role !== 'admin') {
    alert('Acceso denegado. Esta área es exclusiva.');
    switchTab('perfil');
    return;
  }
  content.innerHTML = `<p class="text-center text-neonRed mt-10 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando paneles...</p>`;
  const { data: allUsers } = await supaClient.from('profiles').select('*').order('email');
  state.adminAllUsers = allUsers || [];
  checkAndSendExpirationEmails();
  content.innerHTML = `
      <div class="space-y-6 pb-10">
        <!-- SUB-TABS DEL ADMIN -->
        <div class="bg-cyberCard p-1 rounded-xl border border-gray-800 flex mt-4">
          <button data-click="switchAdminSubTab" data-subtab="asignacion" id="subtabs-btn-asignacion" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${adminSubTab === 'asignacion' ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}">Asignación</button>
          <button data-click="switchAdminSubTab" data-subtab="llamadas" id="subtabs-btn-llamadas" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${adminSubTab === 'llamadas' ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}">Llamadas</button>
        </div>

        <div id="admin-sub-content">${renderAdminSubTab()}</div>
      </div>
    `;
}

// ---------- SUB-TABS DEL ADMIN ----------
export async function loadAdminData() {
  const { data: allUsers } = await supaClient.from('profiles').select('*').order('email');
  state.adminAllUsers = allUsers || [];
}

function renderAdminSubTab() {
  if (adminSubTab === 'llamadas') return renderAdminLlamadas();
  return renderAdminAsignacion();
}

function renderAdminAsignacion() {
  alumnosFiltrados = state.adminAllUsers;
  alumnosPagina = 0;
  return `
    <div class="space-y-4">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-xl font-black text-white uppercase tracking-wide">Asignación de Programas</h2>
        <p class="text-xs text-gray-400">Tocá un alumno para editar su información</p>
      </div>
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <label class="block text-[11px] font-bold text-gray-400 uppercase">Buscar alumno por nombre o correo</label>
        <input type="text" id="alumno-search" data-input="filterAlumnos" placeholder="Ej: juan, fede, @gmail..." class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div id="alumnos-container" class="space-y-4">
        ${renderAlumnos()}
      </div>

      <button data-click="abrirModalNuevoAlumno" class="fixed right-4 bg-neonRed text-white w-14 h-14 rounded-full shadow-[0_0_20px_rgba(255,0,60,0.4)] hover:bg-red-700 transition flex items-center justify-center" style="bottom: 5.5rem; z-index: 60;">
        <i class="fa-solid fa-plus text-2xl"></i>
      </button>
    </div>
  `;
}

function switchAdminSubTab(tab) {
  adminSubTab = tab;
  ['asignacion', 'llamadas'].forEach((t) => {
    const btn = document.getElementById(`subtabs-btn-${t}`);
    if (btn)
      btn.className = `flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${tab === t ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}`;
  });
  const container = document.getElementById('admin-sub-content');
  if (container) container.innerHTML = renderAdminSubTab();
}

function renderAlumnos() {
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  if (alumnosPagina >= totalPaginas) alumnosPagina = totalPaginas - 1;
  const desde = alumnosPagina * ALUMNOS_POR_PAGINA;
  const paginaActual = alumnosFiltrados.slice(desde, desde + ALUMNOS_POR_PAGINA);

  const tarjetas =
    paginaActual
      .map(
        (u) => `
    <button data-click="abrirModalAlumno" data-id="${escapeAttr(u.id)}" class="w-full text-left bg-cyberCard p-4 rounded-xl border border-gray-800 hover:border-neonRed transition">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-bold text-white text-sm truncate">${u.name || '(sin nombre)'}</p>
          <p class="text-xs text-gray-400 truncate">${u.email}</p>
        </div>
        ${u.disabled_at ? '<span class="text-[9px] uppercase tracking-widest text-red-400 bg-red-950/40 border border-red-900 px-2 py-0.5 rounded shrink-0">Deshabilitado</span>' : '<i class="fa-solid fa-chevron-right text-gray-600 shrink-0"></i>'}
      </div>
    </button>
  `,
      )
      .join('') || '<p class="text-center text-xs text-gray-500 py-6">No se encontraron alumnos.</p>';

  const paginacion =
    alumnosFiltrados.length > ALUMNOS_POR_PAGINA
      ? `
    <div class="flex items-center justify-between pt-1">
      <button data-click="cambiarPaginaAlumnos" data-dir="-1" ${alumnosPagina === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Anterior</button>
      <span class="text-[11px] text-gray-500">Página ${alumnosPagina + 1} de ${totalPaginas}</span>
      <button data-click="cambiarPaginaAlumnos" data-dir="1" ${alumnosPagina >= totalPaginas - 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Siguiente</button>
    </div>`
      : '';

  return `${tarjetas}${paginacion}`;
}

export function refrescarListaAlumnos() {
  const searchEl = document.getElementById('alumno-search');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  alumnosFiltrados = state.adminAllUsers.filter(
    (u) => !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q),
  );
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  if (alumnosPagina >= totalPaginas) alumnosPagina = totalPaginas - 1;
  const container = document.getElementById('alumnos-container');
  if (container) container.innerHTML = renderAlumnos();
}

function filterAlumnos() {
  alumnosPagina = 0;
  refrescarListaAlumnos();
}

function cambiarPaginaAlumnos(dir) {
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  const nueva = alumnosPagina + dir;
  if (nueva < 0 || nueva >= totalPaginas) return;
  alumnosPagina = nueva;
  document.getElementById('alumnos-container').innerHTML = renderAlumnos();
}

registrarAcciones({
  switchAdminSubTab: (el) => switchAdminSubTab(el.dataset.subtab),
  filterAlumnos: () => filterAlumnos(),
  cambiarPaginaAlumnos: (el) => cambiarPaginaAlumnos(Number(el.dataset.dir)),
});
