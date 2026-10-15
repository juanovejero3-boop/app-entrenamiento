// Autenticación: landing, login, logout y recuperación de contraseña.
import { supaClient } from '../../lib/supabase.js';
import { toast } from '../../lib/ui.js';
import { state } from '../../state.js';
import { setPublicBooking } from '../reservas/reservas.js';

export function renderLanding() {
  setPublicBooking(true);
  state.currentTab = null;
  const navBar = document.querySelector('nav');
  if (navBar) navBar.style.display = 'none';

  const content = document.getElementById('app-content');
  content.innerHTML = `
    <!-- Botón pequeño arriba a la derecha para usuarios existentes -->
    <div class="flex justify-end mb-12">
        <button onclick="renderLogin()" class="text-xs font-bold text-gray-400 hover:text-neonRed border border-gray-800 hover:border-neonRed bg-cyberCard px-4 py-2 rounded-lg transition shadow-lg">
            <i class="fa-solid fa-user mr-1"></i> Ingresar / Crear Cuenta
        </button>
    </div>
    
    <!-- Centro de la Landing -->
    <div class="text-center mt-10 space-y-6">
        <div class="w-20 h-20 mx-auto bg-cyberCard border border-neonRed rounded-2xl flex items-center justify-center mb-6 neon-glow-button" style="background: linear-gradient(45deg, #2a000a, #000);">
            <i class="fa-solid fa-bolt text-4xl text-neonRed"></i>
        </div>
        <h1 class="text-3xl md:text-5xl font-black text-white uppercase tracking-widest drop-shadow-md">PRIME <span class="text-neonRed">PHYSIQUE</span></h1>
        <p class="text-xs md:text-sm text-gray-400 uppercase tracking-widest font-bold">High Performance & Applied Biomechanics</p>
        
       <div class="pt-12">
                <button onclick="startPublicBooking()" class="w-full max-w-sm mx-auto p-5 bg-neonRed text-white font-black uppercase tracking-wider rounded-xl shadow-lg hover:bg-red-700 transition block">
                    COMENZÁ A TRANSFORMAR TU VIDA POR COMPLETO
                    <span class="block text-sm font-bold text-white/90 mt-1">¡Hacé click aquí!</span>
                </button>
            </div>
  `;
}

function renderLogin() {
  state.currentTab = null;
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="max-w-md mx-auto mt-10 bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-6">
      <div class="flex justify-between items-center border-b border-gray-800 pb-4">
        <h2 class="text-xl font-black text-neonRed">ACCESO AL SISTEMA</h2>
        <button onclick="renderLanding()" class="text-xs text-gray-500 hover:text-white"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>

      <form onsubmit="handleAuth(event)" class="space-y-4 text-sm">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Correo Electrónico</label>
          <input type="email" id="auth-email" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed" />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Contraseña</label>
          <input type="password" id="auth-password" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed" />
        </div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="w-full neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">Iniciar Sesión</button>
        </div>
        <div class="pt-1 text-center">
          <button type="button" onclick="avisoContraseña()" class="text-xs text-gray-500 hover:text-neonRed">¿Olvidaste tu contraseña?</button>
        </div>
      </form>
    </div>
  `;
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message === 'Email not confirmed') {
      return alert('Todavía no confirmaste tu email. Revisá tu casilla de correo (y el spam).');
    }
    const esDeshabilitado = /banned|disabled|desactiv|blocked/i.test(error.message || '');
    if (esDeshabilitado) {
      return alert('Su cuenta ha sido deshabilitada. Comuníquese con su entrenador para más información.');
    }
    return alert('Email o contraseña incorrectos.');
  }
  // El listener onAuthStateChange (SIGNED_IN) carga el perfil y renderiza la app.
}

async function handleLogout() {
  await supaClient.auth.signOut();
  // El listener onAuthStateChange (SIGNED_OUT) limpia el estado y muestra el landing.
}

export function renderPasswordUpdate() {
  const navBar = document.querySelector('nav');
  if (navBar) navBar.style.display = 'none';
  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="max-w-md mx-auto mt-10 bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-5">
      <h2 class="text-xl font-black text-neonRed border-b border-gray-800 pb-4">NUEVA CONTRASEÑA</h2>
      <form onsubmit="updatePassword(event)" class="space-y-4 text-sm">
        <div>
          <label class="block text-xs text-gray-400 mb-1">Nueva contraseña</label>
          <input type="password" id="new-password" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed" />
        </div>
        <button type="submit" class="w-full neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">Guardar contraseña</button>
      </form>
    </div>
  `;
}

window.updatePassword = async function (e) {
  e.preventDefault();
  const password = document.getElementById('new-password').value;
  const { error } = await supaClient.auth.updateUser({ password });
  if (error) return alert('No se pudo actualizar: ' + error.message);
  state.passwordRecoveryActive = false;
  toast('Contraseña actualizada. Iniciá sesión con tu nueva clave.');
  await supaClient.auth.signOut();
};

window.avisoContraseña = function () {
  window.alert('Comunicate con tu entrenador para que te regenere tu contraseña.');
};

// Usadas desde handlers inline (onclick/onsubmit) del HTML
Object.assign(window, {
  handleAuth,
  handleLogout,
  renderLanding,
  renderLogin,
});
