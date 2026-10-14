// Núcleo de la app: sesión, navegación entre pestañas y despacho a cada sección (src/features).
import { renderTabAdmin } from './features/admin/admin.js';
import { renderLanding, renderPasswordUpdate } from './features/auth/auth.js';
import { renderTabMaterial } from './features/material/material.js';
import { renderTabPerfil } from './features/perfil/perfil.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './features/planilla/planilla.js';
import { renderTabTurnos, setPublicBooking } from './features/reservas/reservas.js';
import { supaClient } from './lib/supabase.js';
import { state } from './state.js';
import './features/admin/alumnos.js';
import './features/admin/vencimientos.js';
const SITE_URL = window.location.origin.startsWith('http') ? window.location.origin : 'https://app-entrenamiento-one.vercel.app';

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
}

// ============================================
// HANDLERS INLINE
// ============================================
// Este archivo es un módulo ES: sus funciones no son globales. Las que se usan desde
// atributos onclick/onsubmit/oninput del HTML se exponen acá (el resto ya se define como window.x).
Object.assign(window, {
  switchTab,
});
