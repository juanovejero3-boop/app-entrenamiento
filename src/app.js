// Núcleo de la app: sesión, navegación entre pestañas y despacho a cada sección (src/features).
import { renderTabAdmin } from './features/admin/admin.js';
import { renderLanding, renderPasswordUpdate } from './features/auth/auth.js';
import { renderTabPerfil } from './features/perfil/perfil.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './features/planilla/planilla.js';
import { renderTabTurnos, setPublicBooking } from './features/reservas/reservas.js';
import { supaClient } from './lib/supabase.js';
import { state } from './state.js';
import './features/admin/alumnos.js';
import './features/admin/vencimientos.js';
const SITE_URL = window.location.origin.startsWith('http') ? window.location.origin : 'https://app-entrenamiento-one.vercel.app';
let materialEditando = false;

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
    resetPlanillaPestanas();
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
  setMaterialEditando,
});
