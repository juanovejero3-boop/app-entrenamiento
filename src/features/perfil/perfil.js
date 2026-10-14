// Perfil del usuario: ficha (datos físicos y objetivo) y cambio de contraseña.
import { renderUserHeader, switchTab } from '../../app.js';
import { supaClient } from '../../lib/supabase.js';
import { toast } from '../../lib/ui.js';
import { state } from '../../state.js';

let profileEditing = false;

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

export function renderTabPerfil(content) {
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
