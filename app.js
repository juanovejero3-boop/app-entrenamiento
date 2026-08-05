// 1. CONFIGURACIÓN DE SUPABASE 
const SUPABASE_URL = 'https://bnqjtyaytvvajuikzymq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TbmI-Ng6DpGTo4WK-stBHg_F507N3Cr'; // <-- REEMPLAZA ESTO
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let userProfile = null;
let evolutionHistory = [];

// 2. VERIFICACIÓN DE SESIÓN AL CARGAR LA APP
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabase.auth.getSession();
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
  const { data } = await supabase
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
  const { data } = await supabase
    .from('evolution')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('fecha', { ascending: false });

  evolutionHistory = data || [];
}

// 4. VISTA DE INICIO DE SESIÓN / REGISTRO
function renderLogin() {
  const content = document.getElementById('app-content');
  content.innerHTML = `
    
      
        PRIME PHYSIQUE
        Ingresa con tu cuenta de alumno o administrador
      

      
        
          Correo Electrónico
          
        
        
          Contraseña
          
        
        
          
            Iniciar Sesión
          
          
            Registrarse
          
        
      
    
  `;
}

let authMode = 'login';

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;

  if (authMode === 'login') {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert('Error al iniciar sesión: ' + error.message);
    currentUser = data.user;
  } else {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return alert('Error en el registro: ' + error.message);
    alert('Cuenta creada. Ya puedes iniciar sesión.');
    return;
  }

  await loadUserProfile();
  await loadEvolutionHistory();
  renderApp();
}

async function handleLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  renderLogin();
}

// 5. RENDERIZADO DE LA APLICACIÓN
function renderApp() {
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
      
        
          
            Perfil de Usuario
            ${currentUser.email}
          
          Cerrar Sesión
        

        
           Registrar Evolución
          
            Peso (kg)
            Sentadilla (kg)
            Banco Plano (kg)
            Dominadas (reps)
            Tracciones (kg)
            Peso Muerto (kg)
            Guardar en Base de Datos
          
        

        
           Historial
          
            
                ${evolutionHistory.map(item => `
                  
                `).join('')}
              
              
                FechaPesoSQBPDL
              
              
                    ${item.fecha}
                    ${item.peso || '-'} kg
                    ${item.sentadilla || '-'} kg
                    ${item.banco || '-'} kg
                    ${item.muerto || '-'} kg
                  
            
          
        
      
    `;
  } else if (tab === 'entrenamiento') {
    content.innerHTML = `
      
        
           ABRIR PLANILLA
        
        Entradas en Calor
        
          ${[1, 2, 3, 4, 5].map(i => `
            
              Día ${i}
              
            
          `).join('')}
        
      
    `;
  } else if (tab === 'alimentacion') {
    content.innerHTML = `
      
        
          
          Plan de Alimentación
          
            Abrir PDF
          
        
      
    `;
  } else if (tab === 'videoteca') {
    content.innerHTML = `
      
        Videoteca
        
          
          Técnica de Sentadilla
        
      
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

  const { error } = await supabase.from('evolution').insert([registro]);
  if (error) return alert('Error al guardar: ' + error.message);

  await loadEvolutionHistory();
  switchTab('perfil');
}