// Núcleo de la app: sesión, navegación entre pestañas y despacho a cada sección (src/features).
import emailjs from '@emailjs/browser';
import { renderLanding, renderPasswordUpdate } from './features/auth/auth.js';
import { renderTabPerfil } from './features/perfil/perfil.js';
import { renderAdminLlamadas, renderTabTurnos, setPublicBooking } from './features/reservas/reservas.js';
import { SUPABASE_URL, supaClient } from './lib/supabase.js';
import { modalBase, modalCard, mostrarProcesando, ocultarProcesando, toast } from './lib/ui.js';
import { state } from './state.js';
const SITE_URL = window.location.origin.startsWith('http') ? window.location.origin : 'https://app-entrenamiento-one.vercel.app';
let adminSubTab = 'asignacion';
let alumnosFiltrados = [];
let alumnosPagina = 0;
const ALUMNOS_POR_PAGINA = 3;
let adminPlanillaAbiertos = [];
let adminPlanillaActivo = null;
let materialEditando = false;
let adminPlanillaPagina = 0;
const ALUMNOS_PLANILLA_POR_PAGINA = 3;

// Listener global de sesión: login, logout y recuperación de contraseña
supaClient.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_IN' && session) {
    state.currentUser = session.user;
    await loadUserProfile();
    await loadEvolutionHistory();
    if (state.passwordRecoveryActive) return;
    if (!state.appRendered) { state.appRendered = true; renderApp(); }
  } else if (event === 'SIGNED_OUT') {
    state.appRendered = false;
    state.currentTab = null;
    state.currentUser = null;
    state.userProfile = null;
    state.evolutionHistory = [];
    if (state.passwordRecoveryActive) {
      renderPasswordUpdate();
      return;
    }
    renderLanding();
  } else if (event === 'PASSWORD_RECOVERY') {
    state.passwordRecoveryActive = true;
    renderPasswordUpdate();
  }
}); // Define si estamos afuera o adentro de la app

// 2. VERIFICACIÓN DE SESIÓN AL CARGAR LA APP
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supaClient.auth.getSession();
  if (state.passwordRecoveryActive) {
    renderPasswordUpdate();
    return;
  }
  if (session) {
    state.currentUser = session.user;
    await loadUserProfile();
    await loadEvolutionHistory();
    if (!state.appRendered) { state.appRendered = true; renderApp(); }
  } else {
    renderLanding();
  }
});

// 3. CARGA DE DATOS
async function loadUserProfile() {
  const { data } = await supaClient.from('profiles').select('*').eq('id', state.currentUser.id).single();
  if (data) {
    state.userProfile = data;
  } else {
    // El trigger handle_new_user debería crear el perfil automáticamente al registrarse.
    state.userProfile = { id: state.currentUser.id, email: state.currentUser.email, role: 'alumno', sheet_url: '#', pdf_url: '#' };
    console.warn('Perfil no encontrado en la base de datos para', state.currentUser.id);
  }
}

async function loadEvolutionHistory() {
  const { data } = await supaClient.from('evolution').select('*').eq('user_id', state.currentUser.id).order('fecha', { ascending: false });
  state.evolutionHistory = data || [];
}

// ============================================
// RENDERIZADO DE LA APLICACIÓN (INTERNO)
// ============================================
function renderApp() {
  setPublicBooking(false);
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'block';

  const navContainer = document.querySelector('nav .max-w-lg');
  const btnAdmin = document.getElementById('btn-admin');
  if (state.userProfile?.role === 'admin' && !btnAdmin) {
    navContainer.innerHTML += `
        <button id="btn-admin" onclick="switchTab('admin')" class="flex flex-col items-center text-gray-500 hover:text-neonRed">
            <i class="fa-solid fa-shield-halved text-lg mb-1"></i> Admin
        </button>
    `;
  } else if (state.userProfile?.role !== 'admin' && btnAdmin) {
    btnAdmin.remove();
  }
  // Si ya estamos en una tab de la app, no re-navegar (evita saltos al volver a la pestaña)
  if (state.currentTab) return;
  const fichaCompleta = !!(state.userProfile?.name && state.userProfile?.goal && state.userProfile?.height_cm && state.userProfile?.weight_kg);
  switchTab(fichaCompleta ? 'entrenamiento' : 'perfil');
}

function setActiveNav(tab) {
  state.currentTab = tab;
  if (tab !== 'entrenamiento') {
    adminPlanillaAbiertos = [];
    adminPlanillaActivo = null;
  }
  ['perfil', 'entrenamiento', 'material', 'admin'].forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn) btn.className = (t === tab) ? "flex flex-col items-center text-neonRed" : "flex flex-col items-center text-gray-500 hover:text-neonRed";
  });
}

export function renderUserHeader() {
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 flex justify-between items-center">
      <div>
        <h3 class="font-bold text-md text-neonRed">Perfil de Usuario</h3>
        <p class="text-xs text-gray-300">${state.currentUser.email}</p>
      </div>
      <button onclick="handleLogout()" class="text-xs bg-red-950 text-neonRed px-3 py-1.5 rounded border border-neonRed font-bold">Cerrar Sesión</button>
    </div>
  `;
}

export async function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');

  // LÓGICA DE TURNOS INTERNA (Solo Seguimiento Semanal)
  if (tab === 'turnos') await renderTabTurnos(content);
  else if (tab === 'material') await renderTabMaterial(content);
  else if (tab === 'admin') await renderTabAdmin(content);
  else if (tab === 'perfil') await renderTabPerfil(content);
  else if (tab === 'entrenamiento') await renderTabEntrenamiento(content);
  else if (tab === 'alimentacion') await renderTabAlimentacion(content);
  else if (tab === 'videoteca') await renderTabVideoteca(content);
}

async function renderTabMaterial(content) {
    content.innerHTML = '<p class="text-center text-gray-500 mt-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';
    materialData = null;
    materialData = await materialCargar();
    if (state.userProfile?.role === 'admin' && materialEditando) {
      content.innerHTML = renderMaterialAdmin();
    } else {
      content.innerHTML = renderMaterialAlumno();
    }
}

async function renderTabAdmin(content) {
    // --- CANDADO DE SEGURIDAD ---
    if (state.userProfile?.role !== 'admin') {
        alert('Acceso denegado. Esta área es exclusiva.');
        switchTab('perfil');
        return;
    }
    content.innerHTML = `<p class="text-center text-neonRed mt-10 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando paneles...</p>`;
    const { data: allUsers } = await supaClient.from('profiles').select('*').order('email');
    state.adminAllUsers = allUsers || [];
    window.checkAndSendExpirationEmails();
    content.innerHTML = `
      <div class="space-y-6 pb-10">
        <!-- SUB-TABS DEL ADMIN -->
        <div class="bg-cyberCard p-1 rounded-xl border border-gray-800 flex mt-4">
          <button onclick="switchAdminSubTab('asignacion')" id="subtabs-btn-asignacion" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${adminSubTab === 'asignacion' ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}">Asignación</button>
          <button onclick="switchAdminSubTab('llamadas')" id="subtabs-btn-llamadas" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${adminSubTab === 'llamadas' ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}">Llamadas</button>
        </div>

        <div id="admin-sub-content">${renderAdminSubTab()}</div>
      </div>
    `;
}

async function renderTabEntrenamiento(content) {
    if (state.userProfile?.role === 'admin') {
      if (!state.adminAllUsers.length) await loadAdminData();
      if (adminPlanillaActivo) {
        const alumno = state.adminAllUsers.find(u => u.id === adminPlanillaActivo);
        if (alumno) {
          content.innerHTML = renderAdminPlanillaAlumno(alumno);
        } else {
          adminPlanillaActivo = null;
          content.innerHTML = renderAdminPlanillaBuscador();
          adminPlanillaActualizarLista('');
        }
      } else {
        content.innerHTML = renderAdminPlanillaBuscador();
        adminPlanillaActualizarLista('');
        setTimeout(() => {
          const input = document.getElementById('admin-planilla-search');
          if (input) input.focus();
        }, 50);
      }
    } else {
      const sheetUrl = state.userProfile?.sheet_url;
      const nutritionUrl = state.userProfile?.nutrition_url;

      const entrenamientoCard = sheetUrl ? `
        <a href="${sheetUrl}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-lg py-4 rounded-2xl uppercase tracking-wider shadow-lg">
          <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE GOOGLE SHEETS
        </a>
      ` : `
        <button disabled class="block w-full text-center bg-cyberCarbon text-gray-600 font-black text-lg py-4 rounded-2xl uppercase tracking-wider border border-gray-800 cursor-not-allowed">
          <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE GOOGLE SHEETS
        </button>
        <p class="text-xs text-gray-500 text-center">Pronto te cargaremos tu entrenamiento.</p>
      `;

      const nutricionCard = nutritionUrl ? `
        <a href="${nutritionUrl}" target="_blank" class="block w-full text-center bg-cyberCarbon text-neonRed font-black text-lg py-4 rounded-2xl uppercase tracking-wider border border-neonRed hover:bg-red-950 transition">
          <i class="fa-solid fa-utensils mr-2"></i> ABRIR PLAN DE NUTRICIÓN
        </a>
      ` : `
        <button disabled class="block w-full text-center bg-cyberCarbon text-gray-600 font-black text-lg py-4 rounded-2xl uppercase tracking-wider border border-gray-800 cursor-not-allowed">
          <i class="fa-solid fa-utensils mr-2"></i> ABRIR PLAN DE NUTRICIÓN
        </button>
        <p class="text-xs text-gray-500 text-center">Pronto te cargaremos tu plan de nutrición.</p>
      `;

      content.innerHTML = `
        <div class="space-y-6 pb-10">
          ${renderUserHeader()}
          <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-3 shadow-lg">
            <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
              <i class="fa-solid fa-dumbbell text-neonRed mr-2"></i> Planilla de Entrenamiento
            </h3>
            ${entrenamientoCard}
          </div>

          <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-3 shadow-lg">
            <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
              <i class="fa-solid fa-apple-whole text-neonRed mr-2"></i> Plan de Nutrición
            </h3>
            ${nutricionCard}
          </div>
        </div>
      `;
    }
}

function renderTabAlimentacion(content) {
    content.innerHTML = `
      <div class="space-y-6">
        <div class="bg-cyberCard p-6 rounded-xl border border-gray-800 text-center space-y-3 shadow-lg">
          <i class="fa-solid fa-file-pdf text-4xl text-neonRed"></i>
          <h3 class="font-bold text-md text-white">Plan de Alimentación</h3>
          <a href="${state.userProfile?.pdf_url || '#'}" target="_blank" class="inline-block bg-cyberCarbon text-neonRed font-bold text-xs px-4 py-2 rounded-lg border border-neonRed hover:bg-red-950 transition">Abrir PDF</a>
        </div>
      </div>
    `;
}

function renderTabVideoteca(content) {
    content.innerHTML = `
      <div class="space-y-4">
        <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">Videoteca</h3>
        <div class="bg-cyberCard rounded-xl overflow-hidden border border-gray-800 p-3 shadow-lg">
          <iframe class="w-full aspect-video rounded" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
          <h4 class="font-bold text-xs mt-3 text-white">Técnica de Sentadilla</h4>
        </div>
      </div>
    `;
}

// ---------- ADMIN: PLANILLA DE ALUMNO (PESTAÑAS) ----------
function renderAdminPlanillaBuscador() {
  adminPlanillaPagina = 0;
  return `
    <div class="space-y-4 pb-10">
      ${renderUserHeader()}
      ${renderAdminPlanillaPestanas()}
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-lg font-black text-white uppercase tracking-wide">Planilla de Alumno</h2>
        <p class="text-xs text-gray-400">Buscá un alumno para ver sus planillas</p>
      </div>
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800">
        <input type="text" id="admin-planilla-search" oninput="adminPlanillaFiltrar()" placeholder="Buscar por nombre o correo..." class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-sm text-white outline-none focus:border-neonRed" />
      </div>
      <div id="admin-planilla-lista" class="space-y-2">
      </div>
    </div>
  `;
}

function adminPlanillaFiltrar() {
  adminPlanillaPagina = 0;
  const q = document.getElementById('admin-planilla-search').value.toLowerCase().trim();
  adminPlanillaActualizarLista(q);
}

function adminPlanillaActualizarLista(filtro) {
  const lista = document.getElementById('admin-planilla-lista');
  if (!lista) return;
  const usuarios = state.adminAllUsers.filter(u =>
    !filtro || (u.email || '').toLowerCase().includes(filtro) || (u.name || '').toLowerCase().includes(filtro)
  );
  if (!usuarios.length) {
    lista.innerHTML = '<p class="text-center text-xs text-gray-500 py-6">No se encontraron alumnos.</p>';
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(usuarios.length / ALUMNOS_PLANILLA_POR_PAGINA));
  if (adminPlanillaPagina >= totalPaginas) adminPlanillaPagina = totalPaginas - 1;
  const desde = adminPlanillaPagina * ALUMNOS_PLANILLA_POR_PAGINA;
  const paginaActual = usuarios.slice(desde, desde + ALUMNOS_PLANILLA_POR_PAGINA);

  const tarjetas = paginaActual.map(u => `
    <button onclick="adminPlanillaSeleccionar('${u.id}')" class="w-full text-left bg-cyberCard p-3 rounded-xl border border-gray-800 hover:border-neonRed transition">
      <p class="font-bold text-white text-sm">${u.name || '(sin nombre)'}</p>
      <p class="text-xs text-gray-400">${u.email}</p>
    </button>
  `).join('');

  const paginacion = usuarios.length > ALUMNOS_PLANILLA_POR_PAGINA ? `
    <div class="flex items-center justify-between pt-2">
      <button onclick="adminPlanillaCambiarPagina(-1)" ${adminPlanillaPagina === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Anterior</button>
      <span class="text-[11px] text-gray-500">Página ${adminPlanillaPagina + 1} de ${totalPaginas}</span>
      <button onclick="adminPlanillaCambiarPagina(1)" ${adminPlanillaPagina >= totalPaginas - 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Siguiente</button>
    </div>
  ` : '';

  lista.innerHTML = `${tarjetas}${paginacion}`;
}

window.adminPlanillaCambiarPagina = function(dir) {
  const q = document.getElementById('admin-planilla-search').value.toLowerCase().trim();
  const usuarios = state.adminAllUsers.filter(u =>
    !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
  );
  const totalPaginas = Math.max(1, Math.ceil(usuarios.length / ALUMNOS_PLANILLA_POR_PAGINA));
  const nueva = adminPlanillaPagina + dir;
  if (nueva < 0 || nueva >= totalPaginas) return;
  adminPlanillaPagina = nueva;
  adminPlanillaActualizarLista(q);
};

function renderAdminPlanillaPestanas() {
  if (!adminPlanillaAbiertos.length) return '';
  return `
    <div class="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
      ${adminPlanillaAbiertos.map(id => {
        const u = state.adminAllUsers.find(x => x.id === id);
        if (!u) return '';
        const activo = id === adminPlanillaActivo;
        return `
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="adminPlanillaActivar('${id}')" class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${activo ? 'bg-neonRed text-white' : 'bg-cyberCard text-gray-400 border border-gray-700 hover:border-neonRed'}">
              ${u.name || u.email.split('@')[0]}
            </button>
            <button onclick="adminPlanillaCerrarPestana('${id}')" class="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-neonRed transition">
              <i class="fa-solid fa-times text-[10px]"></i>
            </button>
          </div>
        `;
      }).join('')}
      <button onclick="adminPlanillaMostrarBuscador()" class="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-cyberCard text-gray-400 border border-dashed border-gray-600 hover:border-neonRed hover:text-neonRed transition shrink-0">
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>
  `;
}

function renderAdminPlanillaAlumno(u) {
  const sheetUrl = u.sheet_url;
  const nutritionUrl = u.nutrition_url;

  const entrenamientoCard = sheetUrl ? `
    <a href="${sheetUrl}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-sm py-4 rounded-2xl uppercase tracking-wider shadow-lg">
      <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE ENTRENAMIENTO
    </a>
  ` : `
    <div class="block w-full text-center bg-cyberCarbon text-gray-500 font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-gray-800">
      <i class="fa-solid fa-file-excel mr-2"></i> Sin planilla asignada
    </div>
  `;

  const nutricionCard = nutritionUrl ? `
    <a href="${nutritionUrl}" target="_blank" class="block w-full text-center bg-cyberCarbon text-neonRed font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-neonRed hover:bg-red-950 transition">
      <i class="fa-solid fa-utensils mr-2"></i> ABRIR PLAN DE NUTRICIÓN
    </a>
  ` : `
    <div class="block w-full text-center bg-cyberCarbon text-gray-500 font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-gray-800">
      <i class="fa-solid fa-utensils mr-2"></i> Sin nutrición asignada
    </div>
  `;

  return `
    <div class="space-y-4 pb-10">
      ${renderUserHeader()}
      ${renderAdminPlanillaPestanas()}

      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-2 text-xs">
        <h3 class="font-bold text-neonRed uppercase tracking-wide">${u.name || 'Alumno'} <span class="text-gray-500 font-normal">— ${u.email}</span></h3>
        <div class="grid grid-cols-2 gap-3 text-gray-300 pt-2">
          <div><span class="text-gray-500">Objetivo:</span> ${u.goal || '-'}</div>
          <div><span class="text-gray-500">Altura:</span> ${u.height_cm ? u.height_cm + ' cm' : '-'}</div>
          <div><span class="text-gray-500">Peso:</span> ${u.weight_kg ? u.weight_kg + ' kg' : '-'}</div>
          <div><span class="text-gray-500">Estado:</span> ${u.disabled_at ? '<span class="text-red-400">Deshabilitado</span>' : '<span class="text-emerald-400">Activo</span>'}</div>
        </div>
      </div>

      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="font-bold text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
          <i class="fa-solid fa-dumbbell mr-2"></i> Planilla de Entrenamiento
        </h3>
        ${entrenamientoCard}
      </div>

      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="font-bold text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
          <i class="fa-solid fa-utensils mr-2"></i> Plan de Nutrición
        </h3>
        ${nutricionCard}
      </div>
    </div>
  `;
}

window.adminPlanillaSeleccionar = function(userId) {
  if (!adminPlanillaAbiertos.includes(userId)) {
    adminPlanillaAbiertos.push(userId);
  }
  adminPlanillaActivo = userId;
  const u = state.adminAllUsers.find(x => x.id === userId);
  if (u) {
    const content = document.getElementById('app-content');
    content.innerHTML = renderAdminPlanillaAlumno(u);
  }
};

window.adminPlanillaActivar = function(userId) {
  adminPlanillaActivo = userId;
  const u = state.adminAllUsers.find(x => x.id === userId);
  if (u) {
    const content = document.getElementById('app-content');
    content.innerHTML = renderAdminPlanillaAlumno(u);
  }
};

window.adminPlanillaCerrarPestana = function(userId) {
  adminPlanillaAbiertos = adminPlanillaAbiertos.filter(id => id !== userId);
  if (adminPlanillaActivo === userId) {
    adminPlanillaActivo = adminPlanillaAbiertos.length ? adminPlanillaAbiertos[adminPlanillaAbiertos.length - 1] : null;
  }
  if (!adminPlanillaActivo) {
    adminPlanillaMostrarBuscador();
  } else {
    const u = state.adminAllUsers.find(x => x.id === adminPlanillaActivo);
    if (u) {
      const content = document.getElementById('app-content');
      content.innerHTML = renderAdminPlanillaAlumno(u);
    }
  }
};

window.adminPlanillaMostrarBuscador = function() {
  adminPlanillaActivo = null;
  const content = document.getElementById('app-content');
  content.innerHTML = renderAdminPlanillaBuscador();
  adminPlanillaActualizarLista('');
  setTimeout(() => {
    const input = document.getElementById('admin-planilla-search');
    if (input) input.focus();
  }, 50);
};


// ---------- SUB-TABS DEL ADMIN ----------
async function loadAdminData() {
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
        <input type="text" id="alumno-search" oninput="filterAlumnos()" placeholder="Ej: juan, fede, @gmail..." class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div id="alumnos-container" class="space-y-4">
        ${renderAlumnos()}
      </div>

      <button onclick="abrirModalNuevoAlumno()" class="fixed right-4 bg-neonRed text-white w-14 h-14 rounded-full shadow-[0_0_20px_rgba(255,0,60,0.4)] hover:bg-red-700 transition flex items-center justify-center" style="bottom: 5.5rem; z-index: 60;">
        <i class="fa-solid fa-plus text-2xl"></i>
      </button>
    </div>
  `;
}

window.switchAdminSubTab = function(tab) {
  adminSubTab = tab;
  ['asignacion', 'llamadas'].forEach(t => {
    const btn = document.getElementById(`subtabs-btn-${t}`);
    if (btn) btn.className = `flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${tab === t ? 'bg-neonRed text-white' : 'text-gray-400 hover:text-neonRed'}`;
  });
  const container = document.getElementById('admin-sub-content');
  if (container) container.innerHTML = renderAdminSubTab();
};


function renderAlumnos() {
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  if (alumnosPagina >= totalPaginas) alumnosPagina = totalPaginas - 1;
  const desde = alumnosPagina * ALUMNOS_POR_PAGINA;
  const paginaActual = alumnosFiltrados.slice(desde, desde + ALUMNOS_POR_PAGINA);

  const tarjetas = paginaActual.map(u => `
    <button onclick="abrirModalAlumno('${u.id}')" class="w-full text-left bg-cyberCard p-4 rounded-xl border border-gray-800 hover:border-neonRed transition">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="font-bold text-white text-sm truncate">${u.name || '(sin nombre)'}</p>
          <p class="text-xs text-gray-400 truncate">${u.email}</p>
        </div>
        ${u.disabled_at ? '<span class="text-[9px] uppercase tracking-widest text-red-400 bg-red-950/40 border border-red-900 px-2 py-0.5 rounded shrink-0">Deshabilitado</span>' : '<i class="fa-solid fa-chevron-right text-gray-600 shrink-0"></i>'}
      </div>
    </button>
  `).join('') || '<p class="text-center text-xs text-gray-500 py-6">No se encontraron alumnos.</p>';

  const paginacion = alumnosFiltrados.length > ALUMNOS_POR_PAGINA ? `
    <div class="flex items-center justify-between pt-1">
      <button onclick="cambiarPaginaAlumnos(-1)" ${alumnosPagina === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Anterior</button>
      <span class="text-[11px] text-gray-500">Página ${alumnosPagina + 1} de ${totalPaginas}</span>
      <button onclick="cambiarPaginaAlumnos(1)" ${alumnosPagina >= totalPaginas - 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Siguiente</button>
    </div>` : '';

  return `${tarjetas}${paginacion}`;
}

function refrescarListaAlumnos() {
  const searchEl = document.getElementById('alumno-search');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  alumnosFiltrados = state.adminAllUsers.filter(u =>
    !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q)
  );
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  if (alumnosPagina >= totalPaginas) alumnosPagina = totalPaginas - 1;
  const container = document.getElementById('alumnos-container');
  if (container) container.innerHTML = renderAlumnos();
}

window.filterAlumnos = function() {
  alumnosPagina = 0;
  refrescarListaAlumnos();
};

window.cambiarPaginaAlumnos = function(dir) {
  const totalPaginas = Math.max(1, Math.ceil(alumnosFiltrados.length / ALUMNOS_POR_PAGINA));
  const nueva = alumnosPagina + dir;
  if (nueva < 0 || nueva >= totalPaginas) return;
  alumnosPagina = nueva;
  document.getElementById('alumnos-container').innerHTML = renderAlumnos();
};

async function llamarAdminUsuarios(action, body = {}) {
  const { data: { session } } = await supaClient.auth.getSession();
  if (!session) return { error: 'No hay sesión activa.' };
  mostrarProcesando();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action, ...body })
    });
    const data = await res.json();
    ocultarProcesando();
    if (!res.ok) return { error: data.error || 'Error en el servidor.' };
    return data;
  } catch (e) {
    ocultarProcesando();
    return { error: 'No se pudo conectar con el servidor. ' + e.message };
  }
}

// ---------- MODAL NUEVO ALUMNO ----------
window.abrirModalNuevoAlumno = function() {
  const overlay = modalBase();
  overlay.innerHTML = modalCard(`
    <p class="text-[11px] text-gray-400 uppercase tracking-wider mb-4">Nuevo alumno</p>
    <label class="block text-[10px] text-gray-400 uppercase mb-1 text-left">Correo del alumno</label>
    <input type="email" id="nuevo-alumno-email" required placeholder="correo@alumno.com" class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed mb-4" />
    <button onclick="crearNuevoAlumno()" class="w-full py-3 bg-neonRed text-white font-black text-xs rounded-xl uppercase tracking-wider hover:bg-red-700 transition mb-2">Guardar</button>
    <button onclick="document.getElementById('app-modal-overlay').style.display='none'" class="w-full py-2.5 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Cancelar</button>
  `);
  document.getElementById('nuevo-alumno-email').focus();
};

window.crearNuevoAlumno = async function() {
  const emailInput = document.getElementById('nuevo-alumno-email');
  const email = (emailInput.value || '').trim();
  if (!email) return alert('Ingresá el correo del alumno.');
  const res = await llamarAdminUsuarios('crear', { email });
  if (res.error) return alert(res.error);
  mostrarCredencialesNuevoAlumno(res.email, res.password);
  await loadAdminData();
  refrescarListaAlumnos();
};

function mostrarCredencialesNuevoAlumno(email, password) {
  const overlay = modalBase();
  overlay.innerHTML = modalCard(`
    <p class="text-[11px] text-gray-400 uppercase tracking-wider mb-1">¡Alumno creado!</p>
    <p class="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-3">Guardá estas credenciales, no se mostrarán de nuevo.</p>
    <div class="bg-cyberDark border border-gray-700 rounded-xl px-3 py-3 mb-2 text-left">
      <p class="text-[9px] text-gray-500 uppercase mb-1">Correo</p>
      <div class="flex items-center gap-2">
        <p class="text-sm text-white font-bold break-all flex-1">${String(email).replace(/</g, '&lt;')}</p>
        <button onclick="copiarTexto('${String(email).replace(/'/g, "\\'")}')" class="text-gray-500 hover:text-neonRed shrink-0"><i class="fa-solid fa-copy"></i></button>
      </div>
    </div>
    <div class="bg-cyberDark border border-gray-700 rounded-xl px-3 py-3 mb-4 text-left">
      <p class="text-[9px] text-gray-500 uppercase mb-1">Contraseña</p>
      <div class="flex items-center gap-2">
        <input type="password" id="nuevo-password-campo" value="${password}" readonly class="flex-1 bg-transparent text-lg text-neonRed font-black font-mono outline-none" />
        <button type="button" onclick="togglePasswordCampo('nuevo-password-campo', this)" class="text-gray-500 hover:text-neonRed shrink-0"><i class="fa-solid fa-eye text-sm"></i></button>
        <button onclick="copiarTexto('${password}')" class="text-gray-500 hover:text-neonRed shrink-0"><i class="fa-solid fa-copy"></i></button>
      </div>
    </div>
    <button onclick="document.getElementById('app-modal-overlay').style.display='none'" class="w-full py-3 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Cerrar</button>
  `);
}

window.togglePasswordCampo = function(inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = `<i class="fa-solid ${isPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm"></i>`;
};

window.copiarTexto = function(texto) {
  navigator.clipboard.writeText(texto).then(() => {
    toast(`${texto.includes('@') ? 'Correo copiado' : 'Contraseña copiada'} en portapapeles`);
  }).catch(() => {
    toast('No se pudo copiar', false);
  });
};

// ---------- MODAL DETALLE ALUMNO ----------
window.abrirModalAlumno = function(userId) {
  const u = state.adminAllUsers.find(x => x.id === userId);
  if (!u) return;
  const deshabilitado = !!u.disabled_at;
  const overlay = modalBase();
  overlay.innerHTML = modalCard(`
    <p class="text-[11px] text-gray-400 uppercase tracking-wider mb-1">${String(u.email || '').replace(/</g, '&lt;')}</p>
    ${deshabilitado ? '<p class="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-3">Deshabilitado</p>' : ''}
    <div class="space-y-2 text-left mb-3">
      <div>
        <label class="block text-[10px] text-gray-400 uppercase mb-1">Nombre</label>
        <input type="text" id="alu-name-${userId}" value="${(u.name || '').replace(/"/g, '&quot;')}" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div>
        <label class="block text-[10px] text-gray-400 uppercase mb-1">Link planilla</label>
        <input type="text" id="alu-sheet-${userId}" value="${(u.sheet_url || '').replace(/"/g, '&quot;')}" placeholder="Google Sheets" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div>
        <label class="block text-[10px] text-gray-400 uppercase mb-1">Link plan de nutrición</label>
        <input type="text" id="alu-nutricion-${userId}" value="${(u.nutrition_url || '').replace(/"/g, '&quot;')}" placeholder="Google Sheets" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div>
        <label class="block text-[10px] text-gray-400 uppercase mb-1">Objetivo</label>
        <input type="text" id="alu-goal-${userId}" value="${(u.goal || '').replace(/"/g, '&quot;')}" placeholder="Objetivo" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] text-gray-400 uppercase mb-1">Altura (cm)</label>
          <input type="number" id="alu-height-${userId}" value="${u.height_cm ?? ''}" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400 uppercase mb-1">Peso (kg)</label>
          <input type="number" id="alu-weight-${userId}" value="${u.weight_kg ?? ''}" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white outline-none focus:border-neonRed" />
        </div>
      </div>
    </div>
    <button onclick="guardarDatosAlumno('${userId}')" class="w-full py-3 bg-neonRed text-white font-black text-xs rounded-xl uppercase tracking-wider hover:bg-red-700 transition mb-2">
      <i class="fa-solid fa-floppy-disk mr-2"></i> Guardar
    </button>
    <div class="grid grid-cols-2 gap-2 mb-2">
      <button onclick="generarPasswordAlumno('${userId}', '${(u.email || '').replace(/'/g, "\\'")}')" class="py-2.5 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Nueva contraseña</button>
      <button onclick="toggleDeshabilitarAlumno('${userId}')" class="py-2.5 bg-cyberCarbon border ${deshabilitado ? 'border-emerald-700 text-emerald-400' : 'border-gray-700 text-gray-300'} font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed transition">${deshabilitado ? 'Habilitar' : 'Deshabilitar'}</button>
    </div>
    <button onclick="eliminarAlumno('${userId}')" class="w-full py-2.5 bg-red-950 border border-red-800 text-red-400 font-bold text-xs rounded-xl uppercase tracking-wider hover:bg-red-900 transition mb-2">
      <i class="fa-solid fa-trash mr-2"></i> Eliminar alumno
    </button>
    <button onclick="document.getElementById('app-modal-overlay').style.display='none'" class="w-full py-2.5 bg-cyberDark border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Cerrar</button>
  `);
};

window.guardarDatosAlumno = async function(userId) {
  const nombre = document.getElementById(`alu-name-${userId}`).value.trim();
  const sheet = document.getElementById(`alu-sheet-${userId}`).value.trim();
  const nutricion = document.getElementById(`alu-nutricion-${userId}`).value.trim();
  const goal = document.getElementById(`alu-goal-${userId}`).value.trim();
  const altura = parseFloat(document.getElementById(`alu-height-${userId}`).value) || null;
  const peso = parseFloat(document.getElementById(`alu-weight-${userId}`).value) || null;
  mostrarProcesando('Guardando...');
  const { error } = await supaClient.from('profiles').update({
    name: nombre || null,
    sheet_url: sheet || null,
    nutrition_url: nutricion || null,
    goal: goal || null,
    height_cm: altura,
    weight_kg: peso
  }).eq('id', userId);
  ocultarProcesando();
  if (error) return alert('Error al guardar: ' + error.message);
  toast('Alumno actualizado');
  await loadAdminData();
  refrescarListaAlumnos();
  abrirModalAlumno(userId);
};

window.toggleDeshabilitarAlumno = async function(userId) {
  const u = state.adminAllUsers.find(x => x.id === userId);
  const deshabilitado = !!u?.disabled_at;
  const ok = await window.confirm(deshabilitado
    ? `¿Querés habilitar a ${u?.email || 'este alumno'}?`
    : `¿Querés deshabilitar a ${u?.email || 'este alumno'}?`);
  if (!ok) return;
  const res = await llamarAdminUsuarios(deshabilitado ? 'habilitar' : 'deshabilitar', { user_id: userId });
  if (res.error) return alert(res.error);
  const accionDeshabilitar = !deshabilitado;
  toast(accionDeshabilitar ? 'Alumno deshabilitado' : 'Alumno habilitado');
  await loadAdminData();
  refrescarListaAlumnos();
  document.getElementById('app-modal-overlay').style.display = 'none';
};

window.eliminarAlumno = async function(userId) {
  const u = state.adminAllUsers.find(x => x.id === userId);
  const ok = await window.confirm(`¿Seguro que querés ELIMINAR a ${u?.email || 'este alumno'}? Esta acción no se puede deshacer.`);
  if (!ok) return;
  const res = await llamarAdminUsuarios('eliminar', { user_id: userId });
  if (res.error) return alert(res.error);
  toast('Alumno eliminado');
  await loadAdminData();
  refrescarListaAlumnos();
  document.getElementById('app-modal-overlay').style.display = 'none';
};

window.generarPasswordAlumno = async function(userId, nombreAlumno) {
  const ok = await window.confirm(`¿Seguro que querés generar una nueva contraseña para ${nombreAlumno || 'este alumno'}?`);
  if (!ok) return;
  const res = await llamarAdminUsuarios('reset', { user_id: userId });
  if (res.error) return alert(res.error);
  mostrarPasswordGenerada(nombreAlumno, res.password);
};

function mostrarPasswordGenerada(nombreAlumno, password) {
  const overlay = modalBase();
  overlay.innerHTML = modalCard(`
    <p class="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Nueva contraseña para</p>
    <p class="text-sm font-bold text-white mb-4">${String(nombreAlumno || '').replace(/</g, '&lt;')}</p>
    <div class="bg-cyberDark border border-gray-700 rounded-xl px-3 py-3 mb-4 text-left">
      <p class="text-[9px] text-gray-500 uppercase mb-1">Contraseña</p>
      <div class="flex items-center gap-2">
        <input type="password" id="nueva-password-campo" value="${password}" readonly class="flex-1 bg-transparent text-lg text-neonRed font-black font-mono outline-none" />
        <button type="button" onclick="togglePasswordCampo('nueva-password-campo', this)" class="text-gray-500 hover:text-neonRed shrink-0"><i class="fa-solid fa-eye text-sm"></i></button>
        <button onclick="copiarTexto('${password}')" class="text-gray-500 hover:text-neonRed shrink-0"><i class="fa-solid fa-copy"></i></button>
      </div>
    </div>
    <button onclick="document.getElementById('app-modal-overlay').style.display='none'" class="w-full py-2.5 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Cerrar</button>
  `);
}(function(){
    emailjs.init("5EuZV_5aIYiY9s4HQ");
})();

window.checkAndSendExpirationEmails = async function() {
  const { data: allUsers, error } = await supaClient.from('profiles').select('*');
  if (error) {
    console.error('Error al obtener usuarios para vencimientos:', error.message);
    return;
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  allUsers.forEach(async (user) => {
    if (!user.expiry_date || !user.email) return;
    
    const expiryDate = new Date(user.expiry_date + 'T00:00:00');
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let subject = "";
    let message = "";
    
    if (diffDays === 7) {
      subject = "Prime Physique - Tu abono vence en 1 semana";
      message = `Hola ${user.name || 'Atleta'}, te escribimos de Prime Physique para recordarte que tu abono vence en 7 días. Asegúrate de renovar a tiempo para mantener tus planificaciones activas.`;
    } else if (diffDays === 3) {
      subject = "Prime Physique - Quedan 3 días para tu vencimiento";
      message = `Hola ${user.name || 'Atleta'}, tu plan en Prime Physique está a solo 3 días de finalizar. ¡No pierdas el ritmo y renueva tu membresía!`;
    } else if (diffDays === -1) {
      subject = "Prime Physique - Tu abono ha finalizado";
      message = `Hola ${user.name || 'Atleta'}, notamos que tu abono venció ayer. Para continuar con tus rutinas y seguimientos en la plataforma, por favor efectúa la renovación.`;
    }
    
    if (subject) {
      const templateParams = {
        to_email: user.email,
        to_name: user.name || 'Atleta',
        subject: subject,
        message: message
      };

      // Reemplaza 'TU_SERVICE_ID' y 'TU_TEMPLATE_ID' con tus datos de EmailJS
      emailjs.send('service_sh1wbtf', 'template_ilxy30k', templateParams)
        .then(response => {
           console.log(`Correo de aviso (${diffDays} días) enviado con éxito a ${user.email}`);
        }, err => {
           console.error('Error al enviar correo:', err);
        });
    }
  });
};

// ============================================
// MATERIAL (Biblioteca) — Supabase
// ============================================
let materialData = null;

function materialEsYouTube(link) {
  if (!link) return null;
  const match = link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function materialCargar() {
  if (materialData) return materialData;
  const { data: secciones } = await supaClient
    .from('material_sections')
    .select('*, material_items(*)')
    .order('sort_order');
  if (!secciones) { materialData = []; return materialData; }
  materialData = secciones.map(s => ({
    id: s.id,
    title: s.title,
    sort_order: s.sort_order,
    items: (s.material_items || []).sort((a, b) => a.sort_order - b.sort_order).map(i => ({
      id: i.id,
      name: i.name,
      link: i.link,
      sort_order: i.sort_order
    }))
  }));
  return materialData;
}

window.materialAbrirLink = function(link, nombre) {
  const videoId = materialEsYouTube(link);
  if (videoId) {
    const modal = document.getElementById('modal-video-preview');
    const container = document.getElementById('video-iframe-container');
    const titulo = document.getElementById('video-modal-title');
    titulo.textContent = nombre || 'Video';
    container.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    modal.classList.remove('hidden');
  } else {
    window.open(link, '_blank');
  }
};

function renderMaterialAlumno() {
  const secciones = materialData || [];
  const isAdmin = state.userProfile?.role === 'admin';

  const btnGestionar = isAdmin ? `
    <button onclick="setMaterialEditando(true)" class="ml-auto text-xs bg-cyberCard border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg hover:border-neonRed hover:text-neonRed transition">
      <i class="fa-solid fa-pen-to-square mr-1"></i> Gestionar
    </button>
  ` : '';

  if (!secciones.length) {
    return `
      <div class="space-y-4 pb-10">
        <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 flex items-center justify-between">
          <h2 class="text-lg font-black text-white uppercase tracking-wide">Material</h2>
          ${btnGestionar}
        </div>
        <p class="text-center text-sm text-gray-500 py-10">No hay material disponible todavía.</p>
      </div>
    `;
  }

  const acordeones = secciones.map((sec) => {
    const items = sec.items.map(item => {
      const videoId = materialEsYouTube(item.link);
      const icono = videoId ? 'fa-brands fa-youtube text-red-500' : (item.link.includes('.pdf') ? 'fa-solid fa-file-pdf text-red-400' : 'fa-solid fa-link text-blue-400');
      return `
        <button onclick="materialAbrirLink('${item.link.replace(/'/g, "\\'")}', '${item.name.replace(/'/g, "\\'")}')" class="w-full text-left p-3 rounded-lg bg-cyberDark border border-gray-800 hover:border-neonRed transition flex items-center gap-3">
          <i class="${icono} text-lg shrink-0"></i>
          <span class="text-sm text-white">${item.name}</span>
          <i class="fa-solid fa-chevron-right text-gray-600 text-xs ml-auto"></i>
        </button>
      `;
    }).join('');

    return `
      <div class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
        <button onclick="this.nextElementSibling.classList.toggle('hidden'); this.querySelector('.fa-chevron-down').classList.toggle('rotate-180')" class="w-full p-4 flex items-center justify-between text-left">
          <span class="font-bold text-white text-sm">${sec.title}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-500 bg-cyberDark px-2 py-0.5 rounded-full">${sec.items.length}</span>
            <i class="fa-solid fa-chevron-down text-gray-500 text-xs transition-transform duration-200"></i>
          </div>
        </button>
        <div class="hidden p-3 pt-0 space-y-2">
          ${items}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-4 pb-10">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 flex items-center justify-between">
        <h2 class="text-lg font-black text-white uppercase tracking-wide">Material</h2>
        ${btnGestionar}
      </div>
      ${acordeones}
    </div>
  `;
}

function renderMaterialAdmin() {
  const secciones = materialData || [];

  const listaSecciones = secciones.map((sec) => {
    const items = sec.items.map((item) => `
      <div class="flex items-center gap-2 mb-2">
        <div class="flex flex-col gap-0.5">
          <button onclick="materialMoverItem('${item.id}', -1)" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-up"></i></button>
          <button onclick="materialMoverItem('${item.id}', 1)" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-down"></i></button>
        </div>
        <input type="text" value="${item.name}" onchange="materialActualizarItemNombre('${item.id}', this.value)" placeholder="Nombre" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
        <input type="text" value="${item.link}" onchange="materialActualizarItemLink('${item.id}', this.value)" placeholder="Link" class="flex-[2] bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
        <button onclick="materialEliminarItem('${item.id}')" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
    `).join('');

    return `
      <div class="bg-cyberCard rounded-xl border border-gray-800 p-3 space-y-2">
        <div class="flex items-center gap-2">
          <input type="text" value="${sec.title}" onchange="materialActualizarSecTitulo('${sec.id}', this.value)" placeholder="Título de la sección" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-sm text-white font-bold outline-none focus:border-neonRed" />
          <div class="flex flex-col gap-0.5">
            <button onclick="materialMoverSeccion('${sec.id}', -1)" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-up"></i></button>
            <button onclick="materialMoverSeccion('${sec.id}', 1)" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-down"></i></button>
          </div>
          <button onclick="materialEliminarSeccion('${sec.id}')" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
        <div class="pl-1">
          ${items}
        </div>
        <div class="flex gap-2 mt-2">
          <input type="text" id="mat-new-name-${sec.id}" placeholder="Nombre" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
          <input type="text" id="mat-new-link-${sec.id}" placeholder="Link (YouTube, PDF, web...)" class="flex-[2] bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
          <button onclick="materialAgregarItem('${sec.id}')" class="px-3 py-1.5 bg-neonRed text-white text-xs font-bold rounded-lg hover:bg-red-700"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="space-y-4 pb-10">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 flex items-center justify-between">
        <h2 class="text-lg font-black text-white uppercase tracking-wide">Gestionar Material</h2>
        <button onclick="setMaterialEditando(false)" class="text-xs bg-cyberCard border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg hover:border-neonRed hover:text-neonRed transition">
          <i class="fa-solid fa-arrow-left mr-1"></i> Volver
        </button>
      </div>
      ${listaSecciones}
      <button onclick="materialAgregarSeccion()" class="w-full py-3 bg-cyberCard border-2 border-dashed border-gray-700 text-gray-400 font-bold text-sm rounded-xl hover:border-neonRed hover:text-neonRed transition">
        <i class="fa-solid fa-plus mr-2"></i> Agregar sección
      </button>
    </div>
  `;
}

async function materialRefresh() {
  materialData = await materialCargar();
  const content = document.getElementById('app-content');
  if (materialEditando) {
    content.innerHTML = renderMaterialAdmin();
  } else {
    content.innerHTML = renderMaterialAlumno();
  }
}

window.materialAgregarSeccion = async function() {
  const maxOrder = materialData.reduce((max, s) => Math.max(max, s.sort_order), -1);
  const { error } = await supaClient
    .from('material_sections')
    .insert({ title: 'Nueva sección', sort_order: maxOrder + 1 });
  if (error) return alert('Error al crear sección: ' + error.message);
  materialData = null;
  materialRefresh();
};

window.materialEliminarSeccion = async function(id) {
  const ok = await window.confirm('¿Eliminar esta sección y todos sus elementos?');
  if (!ok) return;
  const { error } = await supaClient.from('material_sections').delete().eq('id', id);
  if (error) return alert('Error al eliminar: ' + error.message);
  materialData = null;
  materialRefresh();
};

window.materialActualizarSecTitulo = async function(id, titulo) {
  await supaClient.from('material_sections').update({ title: titulo }).eq('id', id);
  materialData = null;
};

window.materialMoverSeccion = async function(id, dir) {
  const secciones = materialData;
  const idx = secciones.findIndex(s => s.id === id);
  if (idx < 0) return;
  const nuevoIdx = idx + dir;
  if (nuevoIdx < 0 || nuevoIdx >= secciones.length) return;
  const otroId = secciones[nuevoIdx].id;
  const miOrder = secciones[idx].sort_order;
  const otroOrder = secciones[nuevoIdx].sort_order;
  await supaClient.from('material_sections').update({ sort_order: otroOrder }).eq('id', id);
  await supaClient.from('material_sections').update({ sort_order: miOrder }).eq('id', otroId);
  materialData = null;
  materialRefresh();
};

window.materialAgregarItem = async function(sectionId) {
  const nameInput = document.getElementById(`mat-new-name-${sectionId}`);
  const linkInput = document.getElementById(`mat-new-link-${sectionId}`);
  const nombre = (nameInput?.value || '').trim();
  const link = (linkInput?.value || '').trim();
  if (!nombre || !link) return alert('Completá nombre y link');
  const seccion = materialData.find(s => s.id === sectionId);
  const maxOrder = seccion ? seccion.items.reduce((max, i) => Math.max(max, i.sort_order), -1) : -1;
  const { error } = await supaClient
    .from('material_items')
    .insert({ section_id: sectionId, name: nombre, link: link, sort_order: maxOrder + 1 });
  if (error) return alert('Error al agregar item: ' + error.message);
  materialData = null;
  materialRefresh();
};

window.materialEliminarItem = async function(id) {
  const { error } = await supaClient.from('material_items').delete().eq('id', id);
  if (error) return alert('Error al eliminar: ' + error.message);
  materialData = null;
  materialRefresh();
};

window.materialActualizarItemNombre = async function(id, nombre) {
  await supaClient.from('material_items').update({ name: nombre }).eq('id', id);
  materialData = null;
};

window.materialActualizarItemLink = async function(id, link) {
  await supaClient.from('material_items').update({ link: link }).eq('id', id);
  materialData = null;
};

window.materialMoverItem = async function(id, dir) {
  const seccion = materialData.find(s => s.items.some(i => i.id === id));
  if (!seccion) return;
  const idx = seccion.items.findIndex(i => i.id === id);
  const nuevoIdx = idx + dir;
  if (nuevoIdx < 0 || nuevoIdx >= seccion.items.length) return;
  const otroId = seccion.items[nuevoIdx].id;
  const miOrder = seccion.items[idx].sort_order;
  const otroOrder = seccion.items[nuevoIdx].sort_order;
  await supaClient.from('material_items').update({ sort_order: otroOrder }).eq('id', id);
  await supaClient.from('material_items').update({ sort_order: miOrder }).eq('id', otroId);
  materialData = null;
  materialRefresh();
};
function setMaterialEditando(valor) { materialEditando = valor; switchTab('material'); }

// ============================================
// HANDLERS INLINE
// ============================================
// Este archivo es un módulo ES: sus funciones no son globales. Las que se usan desde
// atributos onclick/onsubmit/oninput del HTML se exponen acá (el resto ya se define como window.x).
Object.assign(window, {
  switchTab,
  adminPlanillaFiltrar,
  setMaterialEditando,
});
