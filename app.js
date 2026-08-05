// 1. CONFIGURACIÓN DE SUPABASE 
const SUPABASE_URL = 'https://bnqjtyaytvvajuikzymq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TbmI-Ng6DpGTo4WK-stBHg_F507N3Cr'; // <-- REEMPLAZA ESTO
const supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userProfile = null;
let evolutionHistory = [];

// VARIABLES DEL SISTEMA DE TURNOS
let bookingStep = 2; // Empezamos en 2 porque ya no hay que elegir servicio
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let localBookings = JSON.parse(localStorage.getItem('pp_bookings_v4') || '[]');
let webhookUrl = localStorage.getItem('pp_webhook_url') || '';
let isPublicBooking = false; // Define si estamos afuera o adentro de la app

// 2. VERIFICACIÓN DE SESIÓN AL CARGAR LA APP
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supaClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUserProfile();
    await loadEvolutionHistory();
    renderApp();
  } else {
    renderLanding();
  }
});

// 3. CARGA DE DATOS
async function loadUserProfile() {
  const { data } = await supaClient.from('profiles').select('*').eq('id', currentUser.id).single();
  if (data) {
    userProfile = data;
  } else {
    const { data: newProfile } = await supaClient.from('profiles').insert([{ id: currentUser.id, email: currentUser.email, role: 'alumno' }]).select().single();
    userProfile = newProfile || { role: 'alumno', sheet_url: '#', pdf_url: '#' };
  }
}

async function loadEvolutionHistory() {
  const { data } = await supaClient.from('evolution').select('*').eq('user_id', currentUser.id).order('fecha', { ascending: false });
  evolutionHistory = data || [];
}

// 4. VISTAS PÚBLICAS (LANDING, LOGIN Y RESERVA INICIAL)
function renderLanding() {
  isPublicBooking = true;
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
            <button onclick="startPublicBooking()" class="w-full max-w-sm mx-auto p-6 bg-red-950/40 border-2 border-neonRed hover:bg-neonRed hover:text-white text-neonRed font-black text-xl md:text-2xl uppercase tracking-wider rounded-2xl transition-all neon-glow-button flex flex-col items-center gap-2">
                COMENZAR A ENTRENAR
                <span class="text-xs font-normal normal-case text-gray-300 mt-1">Agenda tu evaluación inicial aquí</span>
            </button>
        </div>
    </div>
  `;
}

function renderLogin() {
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
          <button type="submit" onclick="authMode='login'" class="flex-1 neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">Iniciar Sesión</button>
          <button type="submit" onclick="authMode='signup'" class="flex-1 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider hover:border-neonRed">Registrarse</button>
        </div>
      </form>
    </div>
  `;
}

let authMode = 'login';
async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;

  if (authMode === 'login') {
    const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
    if (error) return alert('Error al iniciar sesión. Verifica tus datos o tu mail de confirmación.');
    currentUser = data.user;
  } else {
    const { data, error } = await supaClient.auth.signUp({ email, password });
    if (error) return alert('Error en el registro: ' + error.message);
    alert('¡Cuenta creada exitosamente! Revisa tu email para confirmar y luego inicia sesión.');
    document.getElementById('auth-email').value = '';
    document.getElementById('auth-password').value = '';
    return;
  }
  await loadUserProfile();
  await loadEvolutionHistory();
  renderApp();
}

async function handleLogout() {
  await supaClient.auth.signOut();
  currentUser = null;
  renderLanding();
}

// ============================================
// LÓGICA DE AGENDAMIENTO PÚBLICO (NUEVO INGRESO)
// ============================================
function startPublicBooking() {
  selectedService = { name: 'Evaluación Inicial & Onboarding', duration: 45 };
  bookingStep = 2;
  renderPublicBooking();
}

function renderPublicBooking() {
  const content = document.getElementById('app-content');
  
  let html = `
    <div class="max-w-md mx-auto mt-4 space-y-6">
      <div class="flex justify-between items-center border-b border-gray-800 pb-4">
        <h2 class="text-xl font-black text-white uppercase"><i class="fa-solid fa-bolt text-neonRed mr-2"></i> Nuevo Ingreso</h2>
        <button onclick="renderLanding()" class="text-xs text-gray-500 hover:text-white border border-gray-800 px-2 py-1 rounded">Cancelar</button>
      </div>
  `;

  if (bookingStep === 2) {
    html += `
      <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4 shadow-xl">
        <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-4">Paso 1: Fecha y Hora</p>
        <div>
          <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Selecciona la Fecha</label>
          <input type="date" id="bookingDate" min="${new Date().toISOString().split('T')[0]}" onchange="generateAppTimeSlots('public')" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-lg outline-none focus:border-neonRed">
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Turnos (ART)</label>
          <div id="timeSlotsContainer" class="grid grid-cols-3 gap-2">
             <p class="col-span-3 text-[10px] text-gray-500 text-center py-4">Selecciona fecha primero</p>
          </div>
        </div>
        <div class="pt-4 flex justify-end">
          <button id="btnToStep3" disabled onclick="bookingStep=3; renderPublicBooking()" class="px-6 py-3 bg-neonRed disabled:opacity-40 text-white text-xs font-bold rounded-lg w-full tracking-wider uppercase shadow-lg">Siguiente Paso <i class="fa-solid fa-arrow-right ml-2"></i></button>
        </div>
      </div>
    `;
    setTimeout(() => { if(selectedDate) generateAppTimeSlots('public'); }, 50);
  } 
  else if (bookingStep === 3) {
    html += `
      <form onsubmit="confirmAppBooking(event)" class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4 shadow-xl">
        <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-2">Paso 2: Tus Datos</p>
        <p class="text-xs text-white font-bold bg-cyberDark p-3 rounded border border-gray-700 mb-4"><i class="fa-solid fa-calendar-check mr-2 text-neonRed"></i> ${selectedDate} a las ${selectedTime} ART</p>
        
        <div><label class="block text-[10px] text-gray-400 mb-1">Nombre Completo *</label><input type="text" id="b-name" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed"></div>
        <div><label class="block text-[10px] text-gray-400 mb-1">Correo Electrónico *</label><input type="email" id="b-email" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed"></div>
        <div><label class="block text-[10px] text-gray-400 mb-1">Teléfono / WhatsApp *</label><input type="tel" id="b-phone" required class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed"></div>
        <div><label class="block text-[10px] text-gray-400 mb-1">¿Qué objetivo buscas? (opcional)</label><textarea id="b-notes" rows="2" class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-white outline-none focus:border-neonRed"></textarea></div>
        
        <div class="flex gap-2 pt-4">
          <button type="button" onclick="bookingStep=2; renderPublicBooking()" class="px-4 py-3 bg-cyberDark text-gray-400 text-xs font-bold rounded-lg border border-gray-700 w-1/3">Atrás</button>
          <button type="submit" id="b-submit" class="px-4 py-3 neon-glow-button text-white text-xs font-bold rounded-lg w-2/3 uppercase tracking-wider">Confirmar</button>
        </div>
      </form>
    `;
  }
  else if (bookingStep === 4) {
    html += `
      <div class="bg-cyberCard p-8 rounded-xl border border-emerald-900 text-center space-y-4 shadow-xl">
         <i class="fa-solid fa-circle-check text-5xl text-emerald-500 mb-2"></i>
         <h2 class="text-xl font-black text-emerald-400 uppercase">¡Reserva Confirmada!</h2>
         <p class="text-xs text-gray-300">Hemos registrado tu evaluación inicial. Te llegará un correo con los detalles.</p>
         <button onclick="renderLanding()" class="mt-6 w-full px-4 py-3 bg-cyberDark border border-gray-700 hover:border-neonRed text-white text-xs font-bold rounded-lg transition uppercase tracking-wider">Volver al Inicio</button>
      </div>
    `;
  }

  html += `</div>`;
  content.innerHTML = html;
}

// ============================================
// RENDERIZADO DE LA APLICACIÓN (INTERNO)
// ============================================
function renderApp() {
  isPublicBooking = false;
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'block';

  const navContainer = document.querySelector('nav .max-w-lg');
  if (userProfile.role === 'admin' && !document.getElementById('btn-admin')) {
    navContainer.innerHTML += `
        <button id="btn-admin" onclick="switchTab('admin')" class="flex flex-col items-center text-gray-500 hover:text-neonRed">
            <i class="fa-solid fa-shield-halved text-lg mb-1"></i> Admin
        </button>
    `;
  }
  switchTab('perfil');
}

function setActiveNav(tab) {
  ['perfil', 'entrenamiento', 'alimentacion', 'turnos', 'videoteca', 'admin'].forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn) btn.className = (t === tab) ? "flex flex-col items-center text-neonRed" : "flex flex-col items-center text-gray-500 hover:text-neonRed";
  });
}

async function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');

  // LÓGICA DE TURNOS INTERNA (Solo Seguimiento Semanal)
  if (tab === 'turnos') {
    selectedService = { name: 'Seguimiento Semanal de Progreso', duration: 30 };
    if(bookingStep === 1 || isPublicBooking) bookingStep = 2; // Forzar inicio en paso 2 internamente
    
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
            <button id="btnToStep3" disabled onclick="bookingStep=3; switchTab('turnos')" class="w-full py-3 bg-neonRed disabled:opacity-40 text-white text-xs font-bold rounded-lg uppercase tracking-wider">Siguiente Paso</button>
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
              <button type="button" onclick="bookingStep=2; switchTab('turnos')" class="w-1/3 py-2 bg-cyberDark text-gray-400 text-xs font-bold rounded-lg border border-gray-700">Atrás</button>
              <button type="submit" id="b-submit" class="w-2/3 py-2 neon-glow-button text-white text-xs font-bold rounded-lg flex items-center justify-center uppercase"><i class="fa-solid fa-bolt mr-2"></i> AGENDAR</button>
            </div>
        </form>
        ` : ''}

        ${bookingStep === 4 ? `
        <div class="bg-cyberCard p-6 rounded-xl border border-emerald-900 text-center space-y-4 shadow-xl mt-10">
           <i class="fa-solid fa-circle-check text-5xl text-emerald-500"></i>
           <h2 class="text-lg font-black text-emerald-400 uppercase">¡Llamada Agendada!</h2>
           <button onclick="bookingStep=2; switchTab('turnos')" class="mt-4 px-4 py-2 bg-cyberDark border border-gray-700 text-white text-xs font-bold rounded-lg">Programar otra</button>
        </div>
        ` : ''}
      </div>
    `;
    
    if (bookingStep === 2 && selectedDate) { setTimeout(() => generateAppTimeSlots('internal'), 50); }
  } 
  else if (tab === 'admin') {
    content.innerHTML = `<p class="text-center text-neonRed mt-10 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando paneles...</p>`;
    const { data: allUsers } = await supaClient.from('profiles').select('*').order('email');
    
    content.innerHTML = `
      <div class="space-y-6 pb-10">
        
        <!-- SECCIÓN GESTIÓN DE TURNOS -->
        <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 mt-4">
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

        <!-- SECCIÓN ENLACES -->
        <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 mt-8">
          <h2 class="text-xl font-black text-white uppercase tracking-wide">Asignación de Programas</h2>
          <p class="text-xs text-gray-400">Links de Google Sheets y PDFs</p>
        </div>
        <div class="space-y-4">
          ${(allUsers || []).map(u => `
            <div class="bg-cyberCard p-4 rounded-xl border border-gray-800">
               <p class="font-bold text-white text-sm mb-2">${u.email} <span class="text-[10px] text-gray-500 uppercase tracking-widest bg-cyberDark px-2 py-1 rounded ml-2 border border-gray-700">${u.role}</span></p>
               <input type="text" id="sheet-${u.id}" value="${u.sheet_url || ''}" placeholder="Pega el link de Google Sheets aquí" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white mb-2 outline-none focus:border-neonRed" />
               <input type="text" id="pdf-${u.id}" value="${u.pdf_url || ''}" placeholder="Pega el link del PDF aquí" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-white mb-3 outline-none focus:border-neonRed" />
               <button onclick="saveUserLinks('${u.id}')" class="w-full bg-cyberCarbon border border-neonRed text-neonRed font-bold py-2 rounded text-xs hover:bg-red-950 transition-colors">GUARDAR LINKS</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  else if (tab === 'perfil') {
    content.innerHTML = `
      <div class="space-y-6">
        <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 flex justify-between items-center">
          <div>
            <h3 class="font-bold text-md text-neonRed">Perfil de Usuario</h3>
            <p class="text-xs text-gray-300">${currentUser.email}</p>
          </div>
          <button onclick="handleLogout()" class="text-xs bg-red-950 text-neonRed px-3 py-1.5 rounded border border-neonRed font-bold">Cerrar Sesión</button>
        </div>
        <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-4">
          <h3 class="font-bold text-md text-neonRed"><i class="fa-solid fa-chart-line mr-2"></i> Registrar Evolución</h3>
          <form onsubmit="saveEvolution(event)" class="grid grid-cols-2 gap-3 text-sm">
            <div><label class="block text-[10px] text-gray-400">Peso Corporal (kg)</label><input type="number" step="0.1" id="evo-peso" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <div><label class="block text-[10px] text-gray-400">Sentadilla (kg)</label><input type="number" id="evo-sentadilla" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <div><label class="block text-[10px] text-gray-400">Banco Plano (kg)</label><input type="number" id="evo-banco" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <div><label class="block text-[10px] text-gray-400">Peso Muerto (kg)</label><input type="number" id="evo-muerto" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <div><label class="block text-[10px] text-gray-400">Dominadas (reps)</label><input type="number" id="evo-dominadas" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <div><label class="block text-[10px] text-gray-400">Tracciones (kg)</label><input type="number" id="evo-tracciones" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white outline-none focus:border-neonRed" /></div>
            <button type="submit" class="col-span-2 neon-glow-button text-white font-bold py-2 rounded-lg text-xs uppercase">Guardar Marcas</button>
          </form>
        </div>
        <div class="bg-cyberCard p-4 rounded-xl border border-gray-800">
          <h3 class="font-bold text-md text-neonRed mb-2"><i class="fa-solid fa-clock-rotate-left mr-2"></i> Historial de Marcas</h3>
          <div class="overflow-x-auto text-xs">
            <table class="w-full text-left text-gray-300 whitespace-nowrap">
              <thead class="bg-cyberCarbon text-neonRed border-b border-gray-800">
                <tr><th class="p-2">Fecha</th><th class="p-2">Peso</th><th class="p-2">SQ</th><th class="p-2">BP</th><th class="p-2">DL</th></tr>
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${evolutionHistory.map(item => `
                  <tr>
                    <td class="p-2 font-mono">${item.fecha}</td>
                    <td class="p-2 font-bold text-white">${item.peso || '-'} kg</td>
                    <td class="p-2">${item.sentadilla || '-'} kg</td>
                    <td class="p-2">${item.banco || '-'} kg</td>
                    <td class="p-2">${item.muerto || '-'} kg</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } 
  else if (tab === 'entrenamiento') {
    content.innerHTML = `
      <div class="space-y-6">
        <a href="${userProfile?.sheet_url || '#'}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-xl py-6 rounded-2xl uppercase tracking-wider shadow-lg">
          <i class="fa-solid fa-file-spreadsheet mr-2"></i> ABRIR PLANILLA
        </a>
      </div>
    `;
  } 
  else if (tab === 'alimentacion') {
    content.innerHTML = `
      <div class="space-y-6">
        <div class="bg-cyberCard p-6 rounded-xl border border-gray-800 text-center space-y-3 shadow-lg">
          <i class="fa-solid fa-file-pdf text-4xl text-neonRed"></i>
          <h3 class="font-bold text-md text-white">Plan de Alimentación</h3>
          <a href="${userProfile?.pdf_url || '#'}" target="_blank" class="inline-block bg-cyberCarbon text-neonRed font-bold text-xs px-4 py-2 rounded-lg border border-neonRed hover:bg-red-950 transition">Abrir PDF</a>
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

// ============================================
// LÓGICA DE BASE DE DATOS Y TURNOS
// ============================================
async function saveEvolution(e) {
  e.preventDefault();
  const registro = {
    user_id: currentUser.id,
    fecha: new Date().toISOString().split('T')[0],
    peso: parseFloat(document.getElementById('evo-peso').value) || null,
    sentadilla: parseFloat(document.getElementById('evo-sentadilla').value) || null,
    banco: parseFloat(document.getElementById('evo-banco').value) || null,
    dominadas: parseFloat(document.getElementById('evo-dominadas').value) || null,
    tracciones: parseFloat(document.getElementById('evo-tracciones').value) || null,
    muerto: parseFloat(document.getElementById('evo-muerto').value) || null
  };
  const { error } = await supaClient.from('evolution').insert([registro]);
  if (error) return alert('Error al guardar: ' + error.message);
  await loadEvolutionHistory();
  switchTab('perfil');
}

window.saveUserLinks = async function(userId) {
  const sheet = document.getElementById(`sheet-${userId}`).value;
  const pdf = document.getElementById(`pdf-${userId}`).value;
  const { error } = await supaClient.from('profiles').update({ sheet_url: sheet, pdf_url: pdf }).eq('id', userId);
  if (error) alert('Error: ' + error.message);
  else alert('¡Enlaces actualizados correctamente!');
}

window.generateAppTimeSlots = function(context) {
  const dateVal = document.getElementById('bookingDate').value;
  const container = document.getElementById('timeSlotsContainer');
  selectedDate = dateVal;
  selectedTime = null;
  document.getElementById('btnToStep3').disabled = true;

  if (!dateVal) return;

  const baseSlots = ["08:00", "09:30", "15:00", "16:30", "18:00"];
  const bookedTimes = localBookings.filter(b => b.date === dateVal).map(b => b.time);
  
  container.innerHTML = baseSlots.map(slot => {
    if (bookedTimes.includes(slot)) {
      return `<button disabled class="p-2 rounded bg-gray-900 text-gray-700 text-xs font-bold line-through">Ocupado</button>`;
    }
    return `<button type="button" onclick="selectAppTimeSlot(this, '${slot}')" class="slot-btn p-2 rounded border border-gray-700 bg-cyberDark hover:border-neonRed text-white text-xs font-bold transition">${slot}</button>`;
  }).join('');
}

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

  // Si es público, saca el email del form. Si es interno, lo saca del usuario actual.
  const emailToSave = isPublicBooking ? document.getElementById('b-email').value.trim() : currentUser.email;

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

window.clearAppBookings = function() {
  if (confirm("¿Borrar historial de turnos?")) {
    localBookings = [];
    localStorage.removeItem('pp_bookings_v4');
    switchTab('admin');
  }
}