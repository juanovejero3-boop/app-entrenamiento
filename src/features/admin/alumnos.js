// Gestión de alumnos (admin): alta, edición, deshabilitar, eliminar y contraseñas,
// vía la Edge Function admin-usuarios.
import { loadAdminData, refrescarListaAlumnos } from './admin.js';
import { SUPABASE_URL, supaClient } from '../../lib/supabase.js';
import { modalBase, modalCard, mostrarProcesando, ocultarProcesando, toast } from '../../lib/ui.js';
import { state } from '../../state.js';

async function llamarAdminUsuarios(action, body = {}) {
  const {
    data: { session },
  } = await supaClient.auth.getSession();
  if (!session) return { error: 'No hay sesión activa.' };
  mostrarProcesando();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...body }),
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
window.abrirModalNuevoAlumno = function () {
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

window.crearNuevoAlumno = async function () {
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

window.togglePasswordCampo = function (inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = `<i class="fa-solid ${isPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm"></i>`;
};

window.copiarTexto = function (texto) {
  navigator.clipboard
    .writeText(texto)
    .then(() => {
      toast(`${texto.includes('@') ? 'Correo copiado' : 'Contraseña copiada'} en portapapeles`);
    })
    .catch(() => {
      toast('No se pudo copiar', false);
    });
};

// ---------- MODAL DETALLE ALUMNO ----------
window.abrirModalAlumno = function (userId) {
  const u = state.adminAllUsers.find((x) => x.id === userId);
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

window.guardarDatosAlumno = async function (userId) {
  const nombre = document.getElementById(`alu-name-${userId}`).value.trim();
  const sheet = document.getElementById(`alu-sheet-${userId}`).value.trim();
  const nutricion = document.getElementById(`alu-nutricion-${userId}`).value.trim();
  const goal = document.getElementById(`alu-goal-${userId}`).value.trim();
  const altura = parseFloat(document.getElementById(`alu-height-${userId}`).value) || null;
  const peso = parseFloat(document.getElementById(`alu-weight-${userId}`).value) || null;
  mostrarProcesando('Guardando...');
  const { error } = await supaClient
    .from('profiles')
    .update({
      name: nombre || null,
      sheet_url: sheet || null,
      nutrition_url: nutricion || null,
      goal: goal || null,
      height_cm: altura,
      weight_kg: peso,
    })
    .eq('id', userId);
  ocultarProcesando();
  if (error) return alert('Error al guardar: ' + error.message);
  toast('Alumno actualizado');
  await loadAdminData();
  refrescarListaAlumnos();
  window.abrirModalAlumno(userId);
};

window.toggleDeshabilitarAlumno = async function (userId) {
  const u = state.adminAllUsers.find((x) => x.id === userId);
  const deshabilitado = !!u?.disabled_at;
  const ok = await window.confirm(
    deshabilitado
      ? `¿Querés habilitar a ${u?.email || 'este alumno'}?`
      : `¿Querés deshabilitar a ${u?.email || 'este alumno'}?`,
  );
  if (!ok) return;
  const res = await llamarAdminUsuarios(deshabilitado ? 'habilitar' : 'deshabilitar', { user_id: userId });
  if (res.error) return alert(res.error);
  const accionDeshabilitar = !deshabilitado;
  toast(accionDeshabilitar ? 'Alumno deshabilitado' : 'Alumno habilitado');
  await loadAdminData();
  refrescarListaAlumnos();
  document.getElementById('app-modal-overlay').style.display = 'none';
};

window.eliminarAlumno = async function (userId) {
  const u = state.adminAllUsers.find((x) => x.id === userId);
  const ok = await window.confirm(
    `¿Seguro que querés ELIMINAR a ${u?.email || 'este alumno'}? Esta acción no se puede deshacer.`,
  );
  if (!ok) return;
  const res = await llamarAdminUsuarios('eliminar', { user_id: userId });
  if (res.error) return alert(res.error);
  toast('Alumno eliminado');
  await loadAdminData();
  refrescarListaAlumnos();
  document.getElementById('app-modal-overlay').style.display = 'none';
};

window.generarPasswordAlumno = async function (userId, nombreAlumno) {
  const ok = await window.confirm(
    `¿Seguro que querés generar una nueva contraseña para ${nombreAlumno || 'este alumno'}?`,
  );
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
