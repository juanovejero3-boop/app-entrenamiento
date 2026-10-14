// Sesión: escucha los eventos de Supabase Auth (login, logout, recuperación de
// contraseña), revisa si ya hay sesión al cargar y carga los datos del usuario.
import { renderLanding, renderPasswordUpdate } from './features/auth/auth.js';
import { supaClient } from './lib/supabase.js';
import { renderApp } from './shell.js';
import { state } from './state.js';

export function iniciarSesion() {
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
  });

  // Verificación de sesión al cargar la app
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
}

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
