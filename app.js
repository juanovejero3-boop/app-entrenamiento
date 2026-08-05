// 1. CONFIGURACIÓN DE SUPABASE 
const SUPABASE_URL = 'https://bnqjtyaytvvajuikzymq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TbmI-Ng6DpGTo4WK-stBHg_F507N3Cr'; // <-- REEMPLAZA ESTO
const supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userProfile = null;
let evolutionHistory = [];

// 2. VERIFICACIÓN DE SESIÓN AL CARGAR LA APP
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supaClient.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUserProfile();
    await loadEvolutionHistory();
    renderApp();
  } else {
    renderLogin();
  }
});

// 3. CARGA DE DATOS DESDE SUPABASE
async function loadUserProfile() {
  const { data } = await supaClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    userProfile = data;
  } else {
    // Si es la primera vez que entra, le creamos su perfil en la tabla automáticamente
    const { data: newProfile } = await supaClient
      .from('profiles')
      .insert([{ id: currentUser.id, email: currentUser.email, role: 'alumno' }])
      .select()
      .single();
    userProfile = newProfile || { role: 'alumno', sheet_url: '#', pdf_url: '#' };
  }
}

async function loadEvolutionHistory() {
  const { data } = await supaClient
    .from('evolution')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('fecha', { ascending: false });

  evolutionHistory = data || [];
}

// 4. VISTA DE INICIO DE SESIÓN / REGISTRO
function renderLogin() {
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'none';

  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="max-w-md mx-auto mt-10 bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-6">
      <div class="text-center">
        <h2 class="text-2xl font-black text-neonRed">PRIME PHYSIQUE</h2>
        <p class="text-xs text-gray-400 mt-1">Ingreso al sistema</p>
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
          <button type="submit" onclick="authMode='login'" class="flex-1 neon-glow-button text-white font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider">
            Iniciar Sesión
          </button>
          <button type="submit" onclick="authMode='signup'" class="flex-1 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold py-2.5 rounded-lg text-xs uppercase tracking-wider hover:border-neonRed">
            Registrarse
          </button>
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
    if (error) return alert('Error al iniciar sesión. Verifica tus datos.');
    currentUser = data.user;
  } else {
    const { data, error } = await supaClient.auth.signUp({ email, password });
    if (error) return alert('Error en el registro: ' + error.message);
    alert('¡Cuenta creada exitosamente! Ya puedes iniciar sesión.');
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
  renderLogin();
}

// 5. RENDERIZADO DE LA APLICACIÓN Y PANEL DE ADMIN
function renderApp() {
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'block';

  // Inyectar botón de Administrador si tiene el rol adecuado
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
  ['perfil', 'entrenamiento', 'alimentacion', 'videoteca', 'admin'].forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn) btn.className = (t === tab) ? "flex flex-col items-center text-neonRed" : "flex flex-col items-center text-gray-500 hover:text-neonRed";
  });
}

async function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');

  if (tab === 'admin') {
    content.innerHTML = `<p class="text-center text-neonRed mt-10 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando panel maestro...</p>`;
    // Traemos todos los perfiles de la base de datos
    const { data: allUsers } = await supaClient.from('profiles').select('*').order('email');
    
    content.innerHTML = `
      <div class="space-y-6 pb-10">
        <div class="bg-red-950 p-4 rounded-xl border border-neonRed text-center">
            <h2 class="text-xl font-black text-neonRed uppercase">Panel de Entrenador</h2>
            <p class="text-xs text-gray-300">Asigna aquí las planillas a cada alumno</p>
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
  } else if (tab === 'perfil') {
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
  } else if (tab === 'entrenamiento') {
    content.innerHTML = `
      <div class="space-y-6">
        <a href="${userProfile?.sheet_url || '#'}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-xl py-6 rounded-2xl uppercase tracking-wider">
          <i class="fa-solid fa-file-spreadsheet mr-2"></i> ABRIR PLANILLA
        </a>
        <h3 class="font-bold text-md text-gray-200 uppercase">Notas Rápidas</h3>
        <div class="bg-cyberCard p-3 rounded-xl border border-gray-800">
          <textarea placeholder="Ejercicios de calentamiento, recordatorios..." class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-gray-200 h-32 outline-none focus:border-neonRed"></textarea>
        </div>
      </div>
    `;
  } else if (tab === 'alimentacion') {
    content.innerHTML = `
      <div class="space-y-6">
        <div class="bg-cyberCard p-6 rounded-xl border border-gray-800 text-center space-y-3">
          <i class="fa-solid fa-file-pdf text-4xl text-neonRed"></i>
          <h3 class="font-bold text-md text-white">Plan de Alimentación</h3>
          <a href="${userProfile?.pdf_url || '#'}" target="_blank" class="inline-block bg-cyberCarbon text-neonRed font-bold text-xs px-4 py-2 rounded-lg border border-neonRed">
            Abrir PDF
          </a>
        </div>
      </div>
    `;
  } else if (tab === 'videoteca') {
    content.innerHTML = `
      <div class="space-y-4">
        <h3 class="font-bold text-md text-neonRed uppercase">Videoteca</h3>
        <div class="bg-cyberCard rounded-xl overflow-hidden border border-gray-800 p-3">
          <iframe class="w-full aspect-video" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
          <h4 class="font-bold text-xs mt-2 text-white">Técnica de Sentadilla</h4>
        </div>
      </div>
    `;
  }
}

// 6. FUNCIONES DE BASE DE DATOS
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

// NUEVO: Guardar los links desde el panel de admin
window.saveUserLinks = async function(userId) {
  const sheet = document.getElementById(`sheet-${userId}`).value;
  const pdf = document.getElementById(`pdf-${userId}`).value;
  
  const { error } = await supaClient
    .from('profiles')
    .update({ sheet_url: sheet, pdf_url: pdf })
    .eq('id', userId);
    
  if (error) {
    alert('Error al guardar: ' + error.message);
  } else {
    alert('¡Enlaces actualizados correctamente para este alumno!');
  }
}