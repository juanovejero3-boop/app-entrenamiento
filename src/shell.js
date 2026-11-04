// Estructura de la app con sesión iniciada: barra inferior (con botón Admin según
// el rol), pestaña inicial y encabezado de usuario reutilizado por varias secciones.
import { setPublicBooking } from './features/reservas/reservas.js';
import { switchTab } from './router.js';
import { state } from './state.js';

// Botones de la barra inferior que solo ve el admin, en el orden en que aparecen
const BOTONES_ADMIN = [
  { tab: 'nutricion', icono: 'fa-utensils', texto: 'Nutrición' },
  { tab: 'admin', icono: 'fa-shield-halved', texto: 'Admin' },
];

export function renderApp() {
  setPublicBooking(false);
  const navBar = document.querySelector('nav');
  if (navBar) navBar.style.display = 'block';

  const navContainer = document.querySelector('nav .max-w-lg');
  const esAdmin = state.userProfile?.role === 'admin';
  for (const { tab, icono, texto } of BOTONES_ADMIN) {
    const boton = document.getElementById(`btn-${tab}`);
    if (esAdmin && !boton) {
      navContainer.insertAdjacentHTML(
        'beforeend',
        `<button id="btn-${tab}" data-click="switchTab" data-tab="${tab}" class="flex flex-col items-center text-gray-500 hover:text-neonRed">
            <i class="fa-solid ${icono} text-lg mb-1"></i> ${texto}
        </button>`,
      );
    } else if (!esAdmin && boton) {
      boton.remove();
    }
  }
  // Si ya estamos en una tab de la app, no re-navegar (evita saltos al volver a la pestaña)
  if (state.currentTab) return;
  const fichaCompleta = !!(
    state.userProfile?.name &&
    state.userProfile?.goal &&
    state.userProfile?.height_cm &&
    state.userProfile?.weight_kg
  );
  switchTab(fichaCompleta ? 'entrenamiento' : 'perfil');
}

export function renderUserHeader() {
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 flex justify-between items-center">
      <div>
        <h3 class="font-bold text-md text-neonRed">Perfil de Usuario</h3>
        <p class="text-xs text-gray-300">${state.currentUser.email}</p>
      </div>
      <button data-click="handleLogout" class="text-xs bg-red-950 text-neonRed px-3 py-1.5 rounded border border-neonRed font-bold">Cerrar Sesión</button>
    </div>
  `;
}
