// Router de pestañas: cada pestaña de la barra inferior (o interna) tiene una
// función que dibuja su contenido dentro de #app-content.
import { renderTabAdmin } from './features/admin/admin.js';
import { renderTabMaterial } from './features/material/material.js';
import { renderTabPerfil } from './features/perfil/perfil.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './features/planilla/planilla.js';
import { renderTabTurnos } from './features/reservas/reservas.js';
import { state } from './state.js';

/** @type {Record<string, (content: HTMLElement) => void | Promise<void>>} */
const PESTANAS = {
  perfil: renderTabPerfil,
  entrenamiento: renderTabEntrenamiento, // botón "Planilla"
  material: renderTabMaterial,
  admin: renderTabAdmin,
  turnos: renderTabTurnos, // turnos internos (sin botón en la barra)
};

// Botones de la barra inferior (id: btn-<pestaña>)
const BOTONES_NAV = ['perfil', 'entrenamiento', 'material', 'admin'];

function setActiveNav(tab) {
  state.currentTab = tab;
  if (tab !== 'entrenamiento') {
    resetPlanillaPestanas();
  }
  BOTONES_NAV.forEach((t) => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn)
      btn.className =
        t === tab
          ? 'flex flex-col items-center text-neonRed'
          : 'flex flex-col items-center text-gray-500 hover:text-neonRed';
  });
}

export async function switchTab(tab) {
  setActiveNav(tab);
  const content = document.getElementById('app-content');
  const render = PESTANAS[tab];
  if (render) await render(content);
}

// Usada desde handlers inline (onclick) del HTML
Object.assign(window, {
  switchTab,
});
