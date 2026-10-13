// 1. CONFIGURACIÓN DE SUPABASE
import emailjs from '@emailjs/browser';
import { SUPABASE_URL, supaClient } from './lib/supabase.js';
import { state } from './state.js';
import { toast, modalBase, modalCard, mostrarProcesando, ocultarProcesando } from './lib/ui.js';
const SITE_URL = window.location.origin.startsWith('http') ? window.location.origin : 'https://app-entrenamiento-one.vercel.app';

let profileEditing = false;
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
});

// ==========================================
// PANEL GLOBAL DE HORARIOS (100% INFALIBLE)
// ==========================================
// Cambia a true para HABILITAR el día, o false para DESHABILITARLO.
window.APP_SCHEDULE = {
    onboarding: { // PRIMERA VEZ (60 min)
        start: "14:00", // Hora en la que empiezas
        end: "20:00",   // Hora de tu último turno
        days: {
            1: true,  // Lunes
            2: true,  // Martes
            3: true,  // Miércoles
            4: true,  // Jueves
            5: false,  // Viernes
            6: false, // Sábado
            0: false  // Domingo
        }
    },
    followup: { // SEGUIMIENTO ALUMNOS (45 min)
        start: "08:30",
        end: "19:30",
        days: {
            1: false,  // Lunes
            2: false,  // Martes
            3: false,  // Miércoles
            4: false,  // Jueves
            5: true,  // Viernes
            6: true, // Sábado
            0: false  // Domingo
        }
    }
};

// VARIABLES DEL SISTEMA DE TURNOS
let bookingStep = 1; // Empezamos en 2 porque ya no hay que elegir servicio
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let localBookings = JSON.parse(localStorage.getItem('pp_bookings_v4') || '[]');
let webhookUrl = localStorage.getItem('pp_webhook_url') || '';
let isPublicBooking = false; // Define si estamos afuera o adentro de la app

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

// 4. VISTAS PÚBLICAS (LANDING, LOGIN Y RESERVA INICIAL)
function renderLanding() {
  isPublicBooking = true;
  state.currentTab = null;
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'none';

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

// ============================================
// VISTAS DE AUTENTICACIÓN (recuperación)
// ============================================
function renderPasswordUpdate() {
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

window.updatePassword = async function(e) {
  e.preventDefault();
  const password = document.getElementById('new-password').value;
  const { error } = await supaClient.auth.updateUser({ password });
  if (error) return alert('No se pudo actualizar: ' + error.message);
  state.passwordRecoveryActive = false;
  toast('Contraseña actualizada. Iniciá sesión con tu nueva clave.');
  await supaClient.auth.signOut();
};

// ============================================
// LÓGICA DE AGENDAMIENTO PÚBLICO (NUEVO INGRESO)
// ============================================
function startPublicBooking() {
    selectedService = { name: 'Evaluación Inicial & Onboarding', duration: 45 };
    bookingStep = 1; // ESTO FUERZA A QUE ARRANQUE EN EL PASO 1 SÍ O SÍ
    renderPublicBooking();
}

window.renderPublicBooking = function() {
    const content = document.getElementById('app-content');
    
    let html = `
    <div class="max-w-md mx-auto mt-4 space-y-6 pb-12">
        <div class="flex justify-between items-center border-b border-gray-800 pb-4">
            <h2 class="text-xl font-black text-white uppercase"><i class="fa-solid fa-bolt text-neonRed mr-2"></i> Asesoría Estratégica</h2>
            <button onclick="renderLanding()" class="text-xs text-gray-500 hover:text-white border border-gray-800 px-3 py-1.5 rounded">Volver</button>
        </div>
    `;

    if (bookingStep === 1) {
        html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <div class="border-l-4 border-neonRed pl-3">
                <h3 class="text-white font-black text-sm uppercase tracking-wide">Hablemos de tu caso real</h3>
                <p class="text-[11px] text-gray-400 mt-1">Queremos entender dónde estás parado hoy para saber exactamente cómo ayudarte.</p>
            </div>
            
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿Cómo te llamas?</label>
                <input type="text" id="booking-name" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Tu nombre y apellido">
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿A qué te dedicas?</label>
                <input type="text" id="booking-job" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Ej: Empleado, empresario, estudiante, atleta...">
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿Qué es lo que más te molesta de tu cuerpo o salud hoy?</label>
                <textarea id="booking-challenge" rows="3" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Cuéntame con confianza qué te frustra hoy..."></textarea>
            </div>

            <button onclick="validateBookingStep1()" class="w-full py-4 mt-2 neon-glow-button text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-lg">
                Continuar a selección de horario <i class="fa-solid fa-arrow-right ml-2"></i>
            </button>
        </div>
        `;
    } else if (bookingStep === 2) {
        html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-2"><i class="fa-solid fa-calendar-check mr-1"></i> Paso 2: Elige cuándo nos contactamos</p>
            
            <div class="bg-cyberDark/60 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-300 space-y-2 mb-4">
                <p><i class="fa-solid fa-clock text-neonRed mr-2"></i> <span class="font-bold text-white">Duración:</span> 15 a 20 minutos.</p>
                <p><i class="fa-solid fa-phone text-neonRed mr-2"></i> <span class="font-bold text-white">Formato:</span> Llamada telefónica.</p>
                <p><i class="fa-solid fa-bullseye text-neonRed mr-2"></i> <span class="font-bold text-white">Garantía:</span> Transformación desde el día 1.</p>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Selecciona la Fecha</label>
                <input type="date" id="bookingDate" min="${new Date().toISOString().split('T')[0]}" onchange="generateTimeSlots()" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed">
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Horarios Disponibles (ART)</label>
                <div id="timeSlotsContainer" class="grid grid-cols-3 gap-2">
                    <p class="col-span-3 text-[10px] text-gray-500 text-center py-4">Selecciona una fecha arriba para ver los turnos</p>
                </div>
            </div>
            <button onclick="irAPasoReservaPublica(1)" class="text-xs text-gray-400 hover:text-white mt-4 flex items-center"><i class="fa-solid fa-arrow-left mr-1"></i> Volver a mis datos</button>
        </div>
        `;
    } else if (bookingStep === 3) {
        const temp = window.tempBookingData || { name: '', job: '', challenge: '' };
        
        html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-2"><i class="fa-solid fa-check-circle mr-1"></i> Paso 3: Confirma tu llamada</p>
            
            <div class="bg-cyberDark/60 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-300 mb-4 flex justify-between items-center">
                <div>
                    <p><span class="font-bold text-white">Fecha:</span> ${selectedDate}</p>
                    <p><span class="font-bold text-white">Hora:</span> ${selectedTime}</p>
                </div>
                <button onclick="irAPasoReservaPublica(2)" class="text-[10px] text-neonRed hover:text-white underline">Cambiar</button>
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Nombre Completo</label>
                <input type="text" id="b-name" value="${temp.name}" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed">
            </div>
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Email</label>
                <input type="email" id="b-email" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="tu@email.com">
            </div>
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Teléfono (WhatsApp)</label>
                <input type="tel" id="b-phone" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="+54 9 ...">
            </div>
            
            <div class="hidden">
                <textarea id="b-notes">Ocupación: ${temp.job} | Reto: ${temp.challenge}</textarea>
            </div>

            <button id="b-submit" onclick="confirmAppBooking(event)" class="w-full py-4 mt-2 neon-glow-button text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-lg">
                Agendar Llamada <i class="fa-solid fa-paper-plane ml-2"></i>
            </button>
        </div>
        `;
    } else if (bookingStep === 4) {
        // --- ¡AQUÍ ESTÁ LA NUEVA PANTALLA DE FELICITACIÓN! ---
        html += `
        <div class="bg-cyberCard p-8 rounded-2xl border border-neonRed space-y-4 shadow-2xl text-center">
            <i class="fa-solid fa-fire text-5xl text-neonRed mb-2 drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]"></i>
            <h3 class="text-white font-black text-2xl uppercase tracking-wide">¡Llamada Agendada!</h3>
            
            <p class="text-sm text-gray-300 font-bold mt-2">
                ¡Te felicito por tomar acción y dar el primer paso para transformar tu vida y tu físico!
            </p>
            <p class="text-[11px] text-gray-400">
                Nos pondremos en contacto contigo en el horario seleccionado. Prepárate para el cambio.
            </p>

            <div class="bg-cyberDark/80 p-4 rounded-xl border border-gray-700 text-left mt-4 shadow-inner">
                <p class="text-xs text-gray-400 uppercase tracking-widest mb-2 font-bold border-b border-gray-800 pb-2">Resumen de tu Turno</p>
                <p class="text-sm text-white mb-1"><i class="fa-regular fa-calendar-check text-neonRed w-5"></i> <b>${selectedDate}</b></p>
                <p class="text-sm text-white"><i class="fa-regular fa-clock text-neonRed w-5"></i> <b>${selectedTime}</b> (Hora Argentina)</p>
            </div>

            <button onclick="window.location.reload()" class="w-full py-4 mt-6 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider shadow-lg transition duration-300">
                Volver al Inicio
            </button>
        </div>
        `;
    }
    
    html += `</div>`;
    content.innerHTML = html;
};

// ============================================
// RENDERIZADO DE LA APLICACIÓN (INTERNO)
// ============================================
function renderApp() {
  isPublicBooking = false;
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

function renderUserHeader() {
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

function fichaCompleta() {
  return !!(state.userProfile?.name && state.userProfile?.goal && state.userProfile?.height_cm && state.userProfile?.weight_kg);
}

function renderFicha() {
  const completa = fichaCompleta();
  const editing = profileEditing || !completa;
  const readOnly = editing ? '' : 'readonly';

  const badge = completa
    ? `<span class="text-[10px] text-emerald-400 font-bold uppercase tracking-widest bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800"><i class="fa-solid fa-check mr-1"></i>Ficha completa</span>`
    : `<span class="text-[10px] text-yellow-400 font-bold uppercase tracking-widest bg-yellow-950/40 px-2 py-1 rounded border border-yellow-800">Ficha incompleta</span>`;

  return `
    <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4 shadow-lg">
      <div class="flex justify-between items-center">
        <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2"><i class="fa-solid fa-id-card mr-2"></i> Mi Ficha</h3>
        <div class="flex items-center gap-2">
          ${badge}
          ${!editing ? `<button onclick="enableProfileEdit()" class="text-gray-500 hover:text-neonRed transition" title="Editar ficha"><i class="fa-solid fa-pen text-lg"></i></button>` : ''}
        </div>
      </div>
      <form onsubmit="saveProfile(event)" class="space-y-3 text-sm">
        <div>
          <label class="block text-[10px] text-gray-400 mb-1">Nombre</label>
          <input type="text" id="profile-name" value="${state.userProfile?.name || ''}" ${readOnly} class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed ${readOnly ? 'opacity-60' : ''}" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400 mb-1">Objetivo</label>
          <input type="text" id="profile-goal" value="${state.userProfile?.goal || ''}" ${readOnly} placeholder="Ej: perder grasa, ganar masa muscular..." class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed ${readOnly ? 'opacity-60' : ''}" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">Altura (cm)</label>
            <input type="number" step="0.1" id="profile-height" value="${state.userProfile?.height_cm || ''}" ${readOnly} class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed ${readOnly ? 'opacity-60' : ''}" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-1">Peso (kg)</label>
            <input type="number" step="0.1" id="profile-weight" value="${state.userProfile?.weight_kg || ''}" ${readOnly} class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed ${readOnly ? 'opacity-60' : ''}" />
          </div>
        </div>
        ${editing ? `<button type="submit" class="w-full neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">Guardar Ficha</button>` : ''}
      </form>
    </div>
  `;
}

window.enableProfileEdit = function() {
  profileEditing = true;
  switchTab('perfil');
};

window.avisoContraseña = function() {
  window.alert('Comunicate con tu entrenador para que te regenere tu contraseña.');
};

window.changePassword = async function(e) {
  e.preventDefault();
  const current = document.getElementById('pw-current').value;
  const nuevo = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;

  if (nuevo !== confirm) return toast('Las contraseñas nuevas no coinciden', false);

  const { error } = await supaClient.auth.updateUser({ password: nuevo, current_password: current });
  if (error) return toast('Error al cambiar: ' + error.message, false);

  toast('Contraseña cambiada');
  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value = '';
  document.getElementById('pw-confirm').value = '';
};

async function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');

  // LÓGICA DE TURNOS INTERNA (Solo Seguimiento Semanal)
  if (tab === 'turnos') {
    selectedService = { name: 'Seguimiento Semanal de Progreso', duration: 30 };
    if(bookingStep === 1 || isPublicBooking) bookingStep = 2; 
    
    content.innerHTML = `
      <div class="space-y-6 pb-8">
        <h2 class="text-xl font-black text-white uppercase tracking-wide border-l-4 border-neonRed pl-3"><i class="fa-solid fa-headset text-neonRed mr-2"></i> Seguimiento</h2>
        <p class="text-xs text-gray-400 -mt-4">Agenda tu check-in de 30 minutos.</p>

        ${bookingStep === 2 ? `
        <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Selecciona la Fecha</label>
            <input type="date" id="bookingDate" min="${new Date().toISOString().split('T')[0]}" onchange="generateAppTimeSlots('internal')" class="w-full bg-cyberDark border border-gray-700 text-white p-2.5 rounded-lg outline-none focus:border-neonRed">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Turnos (ART)</label>
            <div id="timeSlotsContainer" class="grid grid-cols-3 gap-2">
               <p class="col-span-3 text-[10px] text-gray-500 text-center py-4">Selecciona fecha primero</p>
            </div>
          </div>
          <div class="pt-2">
            <button id="btnToStep3" disabled onclick="irAPasoTurnos(3)" class="w-full py-3 bg-neonRed disabled:opacity-40 text-white text-xs font-bold rounded-lg uppercase tracking-wider">Siguiente Paso</button>
          </div>
        </div>
        ` : ''}

        ${bookingStep === 3 ? `
        <form onsubmit="confirmAppBooking(event)" class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4">
            <p class="text-xs text-neonRed font-bold bg-red-950/40 p-3 rounded border border-red-900 mb-4 text-center"><i class="fa-solid fa-calendar-check mr-2"></i> ${selectedDate} a las ${selectedTime} ART</p>
            
            <div><label class="block text-[10px] text-gray-400 mb-1">Nombre *</label><input type="text" id="b-name" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></div>
            <div><label class="block text-[10px] text-gray-400 mb-1">WhatsApp *</label><input type="tel" id="b-phone" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></div>
            <div><label class="block text-[10px] text-gray-400 mb-1">Temas a revisar</label><textarea id="b-notes" rows="2" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></textarea></div>
            
            <div class="flex gap-2 pt-2">
              <button type="button" onclick="irAPasoTurnos(2)" class="w-1/3 py-2 bg-cyberDark text-gray-400 text-xs font-bold rounded-lg border border-gray-700">Atrás</button>
              <button type="submit" id="b-submit" class="w-2/3 py-2 neon-glow-button text-white text-xs font-bold rounded-lg flex items-center justify-center uppercase"><i class="fa-solid fa-bolt mr-2"></i> AGENDAR</button>
            </div>
        </form>
        ` : ''}

        ${bookingStep === 4 ? `
        <div class="bg-cyberCard p-6 rounded-xl border border-emerald-900 text-center space-y-4 shadow-xl mt-10">
           <i class="fa-solid fa-circle-check text-5xl text-emerald-500"></i>
           <h2 class="text-lg font-black text-emerald-400 uppercase">¡Llamada Agendada!</h2>
           <button onclick="irAPasoTurnos(2)" class="mt-4 px-4 py-2 bg-cyberDark border border-gray-700 text-white text-xs font-bold rounded-lg">Programar otra</button>
        </div>
        ` : ''}
      </div>
    `;
    
    if (bookingStep === 2 && selectedDate) { setTimeout(() => generateAppTimeSlots('internal'), 50); }
  }
  
  else if (tab === 'material') {
    content.innerHTML = '<p class="text-center text-gray-500 mt-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';
    materialData = null;
    materialData = await materialCargar();
    if (state.userProfile?.role === 'admin' && materialEditando) {
      content.innerHTML = renderMaterialAdmin();
    } else {
      content.innerHTML = renderMaterialAlumno();
    }
  }
  else if (tab === 'admin') {
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
  else if (tab === 'perfil') {
    content.innerHTML = `
      <div class="space-y-6">
        ${renderUserHeader()}
        ${renderFicha()}
        <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4 shadow-lg">
          <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2"><i class="fa-solid fa-key mr-2"></i> Cambiar Contraseña</h3>
          <form onsubmit="changePassword(event)" class="space-y-3 text-sm">
            <div>
              <label class="block text-[10px] text-gray-400 mb-1">Contraseña actual</label>
              <div class="relative">
                <input type="password" id="pw-current" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed pr-10" autocomplete="current-password" />
                <button type="button" onclick="togglePassword('pw-current', this)" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-neonRed"><i class="fa-solid fa-eye text-sm"></i></button>
              </div>
            </div>
            <div>
              <label class="block text-[10px] text-gray-400 mb-1">Nueva contraseña</label>
              <div class="relative">
                <input type="password" id="pw-new" required minlength="6" class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed pr-10" autocomplete="new-password" />
                <button type="button" onclick="togglePassword('pw-new', this)" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-neonRed"><i class="fa-solid fa-eye text-sm"></i></button>
              </div>
            </div>
            <div>
              <label class="block text-[10px] text-gray-400 mb-1">Repetir nueva contraseña</label>
              <div class="relative">
                <input type="password" id="pw-confirm" required minlength="6" class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed pr-10" autocomplete="new-password" />
                <button type="button" onclick="togglePassword('pw-confirm', this)" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-neonRed"><i class="fa-solid fa-eye text-sm"></i></button>
              </div>
            </div>
            <button type="submit" class="w-full neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">Guardar Contraseña</button>
          </form>
        </div>
      </div>
    `;
  } 
  else if (tab === 'entrenamiento') {
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
  else if (tab === 'alimentacion') {
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
  else if (tab === 'videoteca') {
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

function renderAdminLlamadas() {
  return `
    <div class="space-y-4">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-xl font-black text-white uppercase tracking-wide">Agenda de Llamadas</h2>
        <p class="text-xs text-gray-400">Evaluaciones y Seguimientos</p>
      </div>
      <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-3">
        <label class="block text-[11px] font-bold text-gray-400 uppercase">URL Webhook (Google Calendar):</label>
        <input type="text" id="appsScriptUrl" value="${webhookUrl}" onchange="saveAppWebhookUrl()" placeholder="https://script.google.com/macros/..." class="w-full bg-cyberDark border border-gray-700 p-2.5 rounded text-xs text-neonRed outline-none focus:border-neonRed mb-4">

        <div class="grid grid-cols-2 gap-4 mb-4">
           <div class="bg-cyberDark p-3 rounded-lg border border-gray-800 text-center"><p class="text-[10px] text-gray-500 uppercase">Turnos Activos</p><p class="text-xl font-bold text-neonRed">${localBookings.length}</p></div>
           <button onclick="clearAppBookings()" class="bg-red-950/40 text-red-500 border border-red-900/50 rounded-lg text-xs font-bold hover:bg-red-900/60 transition"><i class="fa-solid fa-trash mb-1 block"></i> Limpiar Registro</button>
        </div>

        <div class="overflow-x-auto mt-4">
          <table class="w-full text-left text-xs text-gray-300">
            <thead class="bg-cyberCarbon text-neonRed border-b border-gray-800">
              <tr><th class="p-2">Fecha/Hora</th><th class="p-2">Atleta</th><th class="p-2">Servicio</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-800">
              ${localBookings.length === 0 ? `<tr><td colspan="3" class="p-4 text-center text-gray-500">Sin citas pendientes</td></tr>` :
                localBookings.slice().reverse().map(b => `
                <tr>
                  <td class="p-2 whitespace-nowrap"><span class="font-bold text-white">${b.date}</span><br>${b.time} ART</td>
                  <td class="p-2 font-semibold">${b.clientName}<br><span class="text-[10px] text-gray-500">${b.clientEmail}</span></td>
                  <td class="p-2 text-[10px]"><span class="text-neonRed font-bold border border-red-900 px-1 rounded bg-red-950/30">${b.service}</span><br><span class="text-gray-500 truncate max-w-[80px] block mt-1">${b.notes}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
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

// ============================================
// LÓGICA DE BASE DE DATOS Y TURNOS
// ============================================
window.saveProfile = async function(e) {
  e.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  const goal = document.getElementById('profile-goal').value.trim();
  const heightCm = parseFloat(document.getElementById('profile-height').value) || null;
  const weightKg = parseFloat(document.getElementById('profile-weight').value) || null;

  const { error } = await supaClient.from('profiles').update({
    name: name || null,
    goal: goal || null,
    height_cm: heightCm,
    weight_kg: weightKg
  }).eq('id', state.currentUser.id);

  if (error) {
    toast('Error al guardar: ' + error.message, false);
    return;
  }
  if (state.userProfile) {
    state.userProfile.name = name || null;
    state.userProfile.goal = goal || null;
    state.userProfile.height_cm = heightCm;
    state.userProfile.weight_kg = weightKg;
  }
  profileEditing = false;
  toast('Ficha guardada');
  switchTab('perfil');
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
}

window.generateTimeSlots = function() {
    const dateInput = document.getElementById('bookingDate');
    const container = document.getElementById('timeSlotsContainer');
    
    if(!dateInput || !dateInput.value) return;

    // --- SOLUCIÓN DEFINITIVA ---
    let type = 'onboarding'; // Por defecto, CUALQUIERA que entre asume horarios de Primera Vez.
    
    try {
        // Solo si la variable currentUser existe y tiene datos (o sea, estás logueado en tu admin), usa Seguimiento.
        if (typeof state.currentUser !== 'undefined' && state.currentUser !== null) {
            type = 'followup';
        }
    } catch(e) {
        // Si hay cualquier error al leer el usuario, seguimos forzando Primera Vez.
        type = 'onboarding';
    }
    // ---------------------------
    
    const config = window.APP_SCHEDULE[type]; 
    
    const [year, month, day] = dateInput.value.split('-');
    const selectedDateLocal = new Date(year, month - 1, day, 12, 0, 0); 
    const dayOfWeek = selectedDateLocal.getDay(); // 0=Dom, 1=Lun, etc.

    // Comprobamos si le pusiste 'true' o 'false' a ese día en tu panel
    if(!config.days[dayOfWeek]) {
        container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No atendemos este día de la semana. Por favor, selecciona otro.</p>`;
        return;
    }

    const intervalMinutes = type === 'onboarding' ? 60 : 45;
    const slots = [];
    
    let current = new Date(`2000-01-01T${config.start}:00`);
    const end = new Date(`2000-01-01T${config.end}:00`);

    while(current < end) {
        const hours = current.getHours().toString().padStart(2, '0');
        const minutes = current.getMinutes().toString().padStart(2, '0');
        const nextSlot = new Date(current.getTime() + intervalMinutes * 60000);
        
        if (nextSlot <= end) {
            slots.push(`${hours}:${minutes}`);
        }
        current = new Date(current.getTime() + intervalMinutes * 60000);
    }

    if(slots.length === 0) {
        container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No quedan horarios disponibles en este día.</p>`;
        return;
    }

    // Dibujamos los botones
    container.innerHTML = slots.map(time => `
        <button type="button" onclick="selectTime('${time}')" class="p-2 border border-gray-700 rounded-lg text-xs text-white hover:border-neonRed hover:text-neonRed transition">
            ${time}
        </button>
    `).join('');
};

window.selectAppTimeSlot = function(btnEl, slot) {
  document.querySelectorAll('.slot-btn').forEach(b => b.className = "slot-btn p-2 rounded border border-gray-700 bg-cyberDark hover:border-neonRed text-white text-xs font-bold transition");
  btnEl.className = "slot-btn p-2 rounded border border-neonRed bg-red-950 text-neonRed font-black text-xs transition";
  selectedTime = slot;
  document.getElementById('btnToStep3').disabled = false;
}

window.confirmAppBooking = function(e) {
  e.preventDefault();
  const btn = document.getElementById('b-submit');
  btn.disabled = true;
  btn.innerHTML = "PROCESANDO...";

  const emailToSave = isPublicBooking ? document.getElementById('b-email').value.trim() : state.currentUser.email;

  const newBooking = {
    id: Date.now(),
    service: selectedService.name,
    date: selectedDate,
    time: selectedTime,
    clientName: document.getElementById('b-name').value.trim(),
    clientEmail: emailToSave,
    clientPhone: document.getElementById('b-phone').value.trim(),
    notes: document.getElementById('b-notes').value.trim()
  };

  localBookings.push(newBooking);
  localStorage.setItem('pp_bookings_v4', JSON.stringify(localBookings));

  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking)
    }).catch(err => console.log('Sincronización de fondo fallida', err));
  }

  setTimeout(() => {
    bookingStep = 4;
    if(isPublicBooking) {
        renderPublicBooking();
    } else {
        switchTab('turnos');
    }
  }, 1000);
}

window.saveAppWebhookUrl = function() {
  webhookUrl = document.getElementById('appsScriptUrl').value.trim();
  localStorage.setItem('pp_webhook_url', webhookUrl);
  alert("URL del Webhook guardada.");
}

window.clearAppBookings = async function() {
  const ok = await window.confirm("¿Borrar historial de turnos?");
  if (ok) {
    localBookings = [];
    localStorage.removeItem('pp_bookings_v4');
    switchTab('admin');
  }
}

// Inicializamos EmailJS con tu Public Key (reemplaza 'TU_PUBLIC_KEY' por la tuya)
;(function(){
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
// Función para validar el Paso 1 y pasar al calendario
window.validateBookingStep1 = function() {
    const nameInput = document.getElementById('booking-name');
    const jobInput = document.getElementById('booking-job');
    const challengeInput = document.getElementById('booking-challenge');
    
    // Verificamos que los campos existan en la pantalla
    if(!nameInput || !jobInput || !challengeInput) {
        console.error("Error: No se encontraron los campos del formulario.");
        return;
    }

    const name = nameInput.value.trim();
    const job = jobInput.value.trim();
    const challenge = challengeInput.value.trim();
    
    // Validamos que el usuario haya escrito algo
    if(!name || !job || !challenge) {
        alert('Por favor, completa todos los campos para que podamos prepararnos para tu caso.');
        return;
    }
    
    // Guardamos los datos para usarlos cuando confirme el turno final
    window.tempBookingData = { name, job, challenge };
    
    // Cambiamos al paso 2 y actualizamos la vista
    bookingStep = 2;
    renderPublicBooking();
}


// ==========================================
// CONTROL DE HORARIOS Y TURNOS (NUEVO)
// ==========================================

window.saveScheduleConfig = function(type) {
    const startInput = document.getElementById(`config-start-${type}`);
    const endInput = document.getElementById(`config-end-${type}`);
    // Busca todos los checkboxes que estén marcados
    const dayCheckboxes = document.querySelectorAll(`#days-${type} input[type="checkbox"]:checked`);
    
    if (!startInput || !endInput) return;

    // Convertimos los valores de los días a números
    const selectedDays = Array.from(dayCheckboxes).map(cb => parseInt(cb.value));

    if(selectedDays.length === 0) {
        alert("Por favor, selecciona al menos un día de la semana.");
        return;
    }

    const config = {
        start: startInput.value,
        end: endInput.value,
        days: selectedDays
    };

    localStorage.setItem(`pp_schedule_${type}`, JSON.stringify(config));
    
    const typeName = type === 'onboarding' ? 'Primera Vez' : 'Seguimiento';
    alert(`¡Configuración de ${typeName} guardada!\nHorario: ${config.start} a ${config.end}\nDías seleccionados: ${selectedDays.length}`);
};


window.generateTimeSlots = function() {
    const dateInput = document.getElementById('bookingDate');
    const container = document.getElementById('timeSlotsContainer');
    
    if(!dateInput || !dateInput.value) return;

    // FORZAMOS a que busque siempre la configuración de "onboarding" (Primera vez) 
    // cuando alguien entra desde el link público.
    const type = (typeof isPublicBooking !== 'undefined' && isPublicBooking) ? 'onboarding' : 'followup';
    
    // Leemos los datos guardados en el localStorage de tu navegador
    const configString = localStorage.getItem(`pp_schedule_${type}`);
    
    if(!configString) {
        container.innerHTML = `<p class="col-span-3 text-[10px] text-red-500 text-center py-4">Error: El administrador aún no guardó los horarios de disponibilidad.</p>`;
        return;
    }

    const config = JSON.parse(configString);
    
    // ARREGLO DE ZONA HORARIA: Evitamos que el día cambie por culpa del GMT
    // Leemos la fecha exacta que seleccionó el usuario (ej: 2026-08-15)
    const [year, month, day] = dateInput.value.split('-');
    // Creamos una fecha local a las 12 del mediodía para que nunca cambie de día por el timezone
    const selectedDateLocal = new Date(year, month - 1, day, 12, 0, 0); 
    const dayOfWeek = selectedDateLocal.getDay(); // 0=Dom, 1=Lun, etc.

    if(!config.days || !config.days.includes(dayOfWeek)) {
        container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No atendemos este día de la semana. Por favor, selecciona otro.</p>`;
        return;
    }

    // Calcular el intervalo: 60 min para primera vez, 45 min para seguimiento
    const intervalMinutes = type === 'onboarding' ? 60 : 45;

    const slots = [];
    // Creamos fechas ficticias solo para poder sumar los minutos fácilmente
    let current = new Date(`2000-01-01T${config.start}:00`);
    const end = new Date(`2000-01-01T${config.end}:00`);

    while(current < end) {
        const hours = current.getHours().toString().padStart(2, '0');
        const minutes = current.getMinutes().toString().padStart(2, '0');
        
        const nextSlot = new Date(current.getTime() + intervalMinutes * 60000);
        
        // Solo mostramos el turno si el bloque entero entra antes de la hora de fin
        if (nextSlot <= end) {
            slots.push(`${hours}:${minutes}`);
        }
        
        current = new Date(current.getTime() + intervalMinutes * 60000);
    }

    if(slots.length === 0) {
        container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No quedan horarios disponibles en este día.</p>`;
        return;
    }

    // Mostramos los botones en pantalla
    container.innerHTML = slots.map(time => `
        <button onclick="selectTime('${time}')" class="p-2 border border-gray-700 rounded-lg text-xs text-white hover:border-neonRed hover:text-neonRed transition">
            ${time}
        </button>
    `).join('');
};

window.selectTime = function(time) {
    selectedTime = time; // Guarda la hora que elegiste
    selectedDate = document.getElementById('bookingDate').value; // Guarda la fecha
    bookingStep = 3; // Nos manda al Paso 3 de confirmación
    renderPublicBooking(); // Actualiza la pantalla
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

// ============================================
// HANDLERS INLINE
// ============================================
// Este archivo es un módulo ES: sus funciones no son globales. Las que se usan desde
// atributos onclick/onsubmit/oninput del HTML se exponen acá (el resto ya se define como window.x).
function irAPasoReservaPublica(paso) { bookingStep = paso; renderPublicBooking(); }
function irAPasoTurnos(paso) { bookingStep = paso; switchTab('turnos'); }
function setMaterialEditando(valor) { materialEditando = valor; switchTab('material'); }

Object.assign(window, {
  switchTab,
  handleAuth,
  handleLogout,
  renderLanding,
  renderLogin,
  startPublicBooking,
  adminPlanillaFiltrar,
  irAPasoReservaPublica,
  irAPasoTurnos,
  setMaterialEditando,
});
