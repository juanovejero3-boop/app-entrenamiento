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
    userProfile = { role: 'alumno', sheet_url: '#', pdf_url: '#' };
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
  // OCULTAR LA BARRA DE NAVEGACIÓN INFERIOR
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'none';

  const content = document.getElementById('app-content');
  content.innerHTML = `
    <div class="max-w-md mx-auto mt-10 bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-6">
      <div class="text-center">
        <h2 class="text-2xl font-black text-neonRed">PRIME PHYSIQUE</h2>
        <p class="text-xs text-gray-400 mt-1">Ingresa con tu cuenta de alumno o administrador</p>
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
    if (error) return alert('Error al iniciar sesión: ' + error.message);
    currentUser = data.user;
  } else {
    const { data, error } = await supaClient.auth.signUp({ email, password });
    if (error) return alert('Error en el registro: ' + error.message);
    alert('Cuenta creada. Ya puedes iniciar sesión.');
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

// 5. RENDERIZADO DE LA APLICACIÓN
function renderApp() {
  // MOSTRAR LA BARRA DE NAVEGACIÓN INFERIOR AL ENTRAR
  const navBar = document.querySelector('nav');
  if(navBar) navBar.style.display = 'block';

  switchTab('perfil');
}

function setActiveNav(tab) {
  ['perfil', 'entrenamiento', 'alimentacion', 'videoteca'].forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn) btn.className = (t === tab) ? "flex flex-col items-center text-neonRed" : "flex flex-col items-center text-gray-500 hover:text-neonRed";
  });
}

function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');

  if (tab === 'perfil') {
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
            <div><label class="block text-[10px] text-gray-400">Peso (kg)</label><input type="number" step="0.1" id="evo-peso" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <div><label class="block text-[10px] text-gray-400">Sentadilla (kg)</label><input type="number" id="evo-sentadilla" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <div><label class="block text-[10px] text-gray-400">Banco Plano (kg)</label><input type="number" id="evo-banco" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <div><label class="block text-[10px] text-gray-400">Dominadas (reps)</label><input type="number" id="evo-dominadas" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <div><label class="block text-[10px] text-gray-400">Tracciones (kg)</label><input type="number" id="evo-tracciones" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <div><label class="block text-[10px] text-gray-400">Peso Muerto (kg)</label><input type="number" id="evo-muerto" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white" /></div>
            <button type="submit" class="col-span-2 neon-glow-button text-white font-bold py-2 rounded-lg text-xs uppercase">Guardar en Base de Datos</button>
          </form>
        </div>

        <div class="bg-cyberCard p-4 rounded-xl border border-gray-800">
          <h3 class="font-bold text-md text-neonRed mb-2"><i class="fa-solid fa-clock-rotate-left mr-2"></i> Historial</h3>
          <div class="overflow-x-auto text-xs">
            <table class="w-full text-left text-gray-300">
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
        <h3 class="font-bold text-md text-gray-200 uppercase">Entradas en Calor</h3>
        <div class="space-y-3">
          ${[1, 2, 3, 4, 5].map(i => `
            <div class="bg-cyberCard p-3 rounded-xl border border-gray-800">
              <h4 class="font-bold text-neonRed text-xs mb-1">Día ${i}</h4>
              <textarea placeholder="Ejercicios de activación y notas..." class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-xs text-gray-200 h-16 outline-none focus:border-neonRed"></textarea>
            </div>
          `).join('')}
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

// 6. GUARDAR REGISTRO EN LA BASE DE DATOS DE SUPABASE
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