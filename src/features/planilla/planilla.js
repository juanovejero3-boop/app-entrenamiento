// Pestaña Planilla: links de entrenamiento/nutrición del alumno y, para el admin,
// buscador de alumnos con pestañas para ver la planilla de cada uno.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr } from '../../lib/dom.js';
import { renderUserHeader } from '../../shell.js';
import { state } from '../../state.js';
import { loadAdminData } from '../admin/admin.js';
import { abrirPlanesDelAlumno } from '../coaching/alumno/planesDelAlumno.js';
import { abrirCiclosDelAlumno } from '../coaching/ciclos/ciclosDelAlumno.js';

let adminPlanillaAbiertos = [];
let adminPlanillaActivo = null;
let adminPlanillaPagina = 0;
const ALUMNOS_PLANILLA_POR_PAGINA = 3;

// Sección "Mi plan de entrenamiento": la usan el alumno y también el coach si tiene un plan asignado
const SECCION_MI_PLAN = `
  <section data-mi-plan hidden class="space-y-3">
    <h3 class="font-bold text-md text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
      <i class="fa-solid fa-layer-group text-neonRed mr-2"></i> Mi plan de entrenamiento
    </h3>
    <div data-mi-plan-contenido></div>
  </section>
`;

/** Muestra el plan propio dentro de la sección, o la quita si no hay plan (la pantalla queda como siempre). */
async function montarMiPlan(content) {
  const seccion = content.querySelector('[data-mi-plan]');
  const hayPlan = await abrirPlanesDelAlumno(seccion.querySelector('[data-mi-plan-contenido]'), state.userProfile);
  if (hayPlan) seccion.hidden = false;
  else seccion.remove();
}

export async function renderTabEntrenamiento(content) {
  if (state.userProfile?.role === 'admin') {
    if (!state.adminAllUsers.length) await loadAdminData();
    if (adminPlanillaActivo) {
      const alumno = state.adminAllUsers.find((u) => u.id === adminPlanillaActivo);
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
      // El coach también puede tener un plan asignado: lo ve y lo completa acá
      content.insertAdjacentHTML('beforeend', `<div class="mt-6">${SECCION_MI_PLAN}</div>`);
      await montarMiPlan(content);
    }
  } else {
    const sheetUrl = state.userProfile?.sheet_url;
    const nutritionUrl = state.userProfile?.nutrition_url;

    const entrenamientoCard = sheetUrl
      ? `
        <a href="${sheetUrl}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-lg py-4 rounded-2xl uppercase tracking-wider shadow-lg">
          <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE GOOGLE SHEETS
        </a>
      `
      : `
        <button disabled class="block w-full text-center bg-cyberCarbon text-gray-600 font-black text-lg py-4 rounded-2xl uppercase tracking-wider border border-gray-800 cursor-not-allowed">
          <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE GOOGLE SHEETS
        </button>
        <p class="text-xs text-gray-500 text-center">Pronto te cargaremos tu entrenamiento.</p>
      `;

    const nutricionCard = nutritionUrl
      ? `
        <a href="${nutritionUrl}" target="_blank" class="block w-full text-center bg-cyberCarbon text-neonRed font-black text-lg py-4 rounded-2xl uppercase tracking-wider border border-neonRed hover:bg-red-950 transition">
          <i class="fa-solid fa-utensils mr-2"></i> ABRIR PLAN DE NUTRICIÓN
        </a>
      `
      : `
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

          ${SECCION_MI_PLAN}
        </div>
      `;
    await montarMiPlan(content);
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
        <input type="text" id="admin-planilla-search" data-input="adminPlanillaFiltrar" placeholder="Buscar por nombre o correo..." class="w-full bg-cyberDark border border-gray-700 rounded p-2.5 text-sm text-white outline-none focus:border-neonRed" />
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
  const usuarios = state.adminAllUsers.filter(
    (u) => !filtro || (u.email || '').toLowerCase().includes(filtro) || (u.name || '').toLowerCase().includes(filtro),
  );
  if (!usuarios.length) {
    lista.innerHTML = '<p class="text-center text-xs text-gray-500 py-6">No se encontraron alumnos.</p>';
    return;
  }
  const totalPaginas = Math.max(1, Math.ceil(usuarios.length / ALUMNOS_PLANILLA_POR_PAGINA));
  if (adminPlanillaPagina >= totalPaginas) adminPlanillaPagina = totalPaginas - 1;
  const desde = adminPlanillaPagina * ALUMNOS_PLANILLA_POR_PAGINA;
  const paginaActual = usuarios.slice(desde, desde + ALUMNOS_PLANILLA_POR_PAGINA);

  const tarjetas = paginaActual
    .map(
      (u) => `
    <button data-click="adminPlanillaSeleccionar" data-id="${escapeAttr(u.id)}" class="w-full text-left bg-cyberCard p-3 rounded-xl border border-gray-800 hover:border-neonRed transition">
      <p class="font-bold text-white text-sm">${u.name || '(sin nombre)'}</p>
      <p class="text-xs text-gray-400">${u.email}</p>
    </button>
  `,
    )
    .join('');

  const paginacion =
    usuarios.length > ALUMNOS_PLANILLA_POR_PAGINA
      ? `
    <div class="flex items-center justify-between pt-2">
      <button data-click="adminPlanillaCambiarPagina" data-dir="-1" ${adminPlanillaPagina === 0 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Anterior</button>
      <span class="text-[11px] text-gray-500">Página ${adminPlanillaPagina + 1} de ${totalPaginas}</span>
      <button data-click="adminPlanillaCambiarPagina" data-dir="1" ${adminPlanillaPagina >= totalPaginas - 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-30 disabled:hover:text-gray-300 disabled:hover:border-gray-700 transition">Siguiente</button>
    </div>
  `
      : '';

  lista.innerHTML = `${tarjetas}${paginacion}`;
}

function adminPlanillaCambiarPagina(dir) {
  const q = document.getElementById('admin-planilla-search').value.toLowerCase().trim();
  const usuarios = state.adminAllUsers.filter(
    (u) => !q || (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q),
  );
  const totalPaginas = Math.max(1, Math.ceil(usuarios.length / ALUMNOS_PLANILLA_POR_PAGINA));
  const nueva = adminPlanillaPagina + dir;
  if (nueva < 0 || nueva >= totalPaginas) return;
  adminPlanillaPagina = nueva;
  adminPlanillaActualizarLista(q);
}

function renderAdminPlanillaPestanas() {
  if (!adminPlanillaAbiertos.length) return '';
  return `
    <div class="flex gap-1 overflow-x-auto pb-2 scrollbar-none">
      ${adminPlanillaAbiertos
        .map((id) => {
          const u = state.adminAllUsers.find((x) => x.id === id);
          if (!u) return '';
          const activo = id === adminPlanillaActivo;
          return `
          <div class="flex items-center gap-1 shrink-0">
            <button data-click="adminPlanillaActivar" data-id="${escapeAttr(id)}" class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition ${activo ? 'bg-neonRed text-white' : 'bg-cyberCard text-gray-400 border border-gray-700 hover:border-neonRed'}">
              ${u.name || u.email.split('@')[0]}
            </button>
            <button data-click="adminPlanillaCerrarPestana" data-id="${escapeAttr(id)}" class="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-neonRed transition">
              <i class="fa-solid fa-times text-[10px]"></i>
            </button>
          </div>
        `;
        })
        .join('')}
      <button data-click="adminPlanillaMostrarBuscador" class="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-cyberCard text-gray-400 border border-dashed border-gray-600 hover:border-neonRed hover:text-neonRed transition shrink-0">
        <i class="fa-solid fa-plus"></i>
      </button>
    </div>
  `;
}

function renderAdminPlanillaAlumno(u) {
  const sheetUrl = u.sheet_url;
  const nutritionUrl = u.nutrition_url;

  const entrenamientoCard = sheetUrl
    ? `
    <a href="${sheetUrl}" target="_blank" class="block w-full text-center neon-glow-button text-white font-black text-sm py-4 rounded-2xl uppercase tracking-wider shadow-lg">
      <i class="fa-solid fa-file-excel mr-2"></i> ABRIR PLANILLA DE ENTRENAMIENTO
    </a>
  `
    : `
    <div class="block w-full text-center bg-cyberCarbon text-gray-500 font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-gray-800">
      <i class="fa-solid fa-file-excel mr-2"></i> Sin planilla asignada
    </div>
  `;

  const nutricionCard = nutritionUrl
    ? `
    <a href="${nutritionUrl}" target="_blank" class="block w-full text-center bg-cyberCarbon text-neonRed font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-neonRed hover:bg-red-950 transition">
      <i class="fa-solid fa-utensils mr-2"></i> ABRIR PLAN DE NUTRICIÓN
    </a>
  `
    : `
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

      <div class="bg-cyberCard p-4 rounded-xl border border-dashed border-neonRed/60 space-y-3">
        <h3 class="font-bold text-neonRed uppercase tracking-wide border-l-4 border-neonRed pl-2">
          <i class="fa-solid fa-layer-group mr-2"></i> Plan de entrenamiento (en la app)
        </h3>
        <p class="text-[11px] text-gray-400">Los ciclos del alumno: armá uno nuevo, mostralo cuando esté listo y consultá los anteriores.</p>
        <button data-click="planillaAbrirCiclos" data-id="${escapeAttr(u.id)}" class="block w-full text-center bg-cyberCarbon text-neonRed font-black text-sm py-4 rounded-2xl uppercase tracking-wider border border-neonRed hover:bg-red-950 transition">
          <i class="fa-solid fa-pen-ruler mr-2"></i> Ciclos de entrenamiento
        </button>
        <button data-click="planillaVerComoAlumno" data-id="${escapeAttr(u.id)}" class="block w-full text-center bg-cyberCarbon text-gray-300 font-black text-sm py-3 rounded-2xl uppercase tracking-wider border border-gray-600 hover:border-neonRed hover:text-neonRed transition">
          <i class="fa-solid fa-eye mr-2"></i> ${u.id === state.userProfile?.id ? 'Ver mi plan (podés completarlo)' : 'Ver como alumno (solo lectura)'}
        </button>
      </div>
    </div>
  `;
}

function adminPlanillaSeleccionar(userId) {
  if (!adminPlanillaAbiertos.includes(userId)) {
    adminPlanillaAbiertos.push(userId);
  }
  adminPlanillaActivo = userId;
  const u = state.adminAllUsers.find((x) => x.id === userId);
  if (u) {
    const content = document.getElementById('app-content');
    content.innerHTML = renderAdminPlanillaAlumno(u);
  }
}

function adminPlanillaActivar(userId) {
  adminPlanillaActivo = userId;
  const u = state.adminAllUsers.find((x) => x.id === userId);
  if (u) {
    const content = document.getElementById('app-content');
    content.innerHTML = renderAdminPlanillaAlumno(u);
  }
}

function adminPlanillaCerrarPestana(userId) {
  adminPlanillaAbiertos = adminPlanillaAbiertos.filter((id) => id !== userId);
  if (adminPlanillaActivo === userId) {
    adminPlanillaActivo = adminPlanillaAbiertos.length ? adminPlanillaAbiertos[adminPlanillaAbiertos.length - 1] : null;
  }
  if (!adminPlanillaActivo) {
    adminPlanillaMostrarBuscador();
  } else {
    const u = state.adminAllUsers.find((x) => x.id === adminPlanillaActivo);
    if (u) {
      const content = document.getElementById('app-content');
      content.innerHTML = renderAdminPlanillaAlumno(u);
    }
  }
}

function adminPlanillaMostrarBuscador() {
  adminPlanillaActivo = null;
  const content = document.getElementById('app-content');
  content.innerHTML = renderAdminPlanillaBuscador();
  adminPlanillaActualizarLista('');
  setTimeout(() => {
    const input = document.getElementById('admin-planilla-search');
    if (input) input.focus();
  }, 50);
}

// Cierra las pestañas de alumnos abiertas (al salir de la pestaña Planilla).
export function resetPlanillaPestanas() {
  adminPlanillaAbiertos = [];
  adminPlanillaActivo = null;
}

registrarAcciones({
  adminPlanillaFiltrar: () => adminPlanillaFiltrar(),
  adminPlanillaSeleccionar: (el) => adminPlanillaSeleccionar(el.dataset.id),
  adminPlanillaCambiarPagina: (el) => adminPlanillaCambiarPagina(Number(el.dataset.dir)),
  adminPlanillaActivar: (el) => adminPlanillaActivar(el.dataset.id),
  adminPlanillaCerrarPestana: (el) => adminPlanillaCerrarPestana(el.dataset.id),
  adminPlanillaMostrarBuscador: () => adminPlanillaMostrarBuscador(),
  planillaAbrirCiclos: (el) => {
    const u = state.adminAllUsers.find((x) => x.id === el.dataset.id);
    if (!u) return;
    abrirCiclosDelAlumno(document.getElementById('app-content'), u, {
      alVolver: () => adminPlanillaActivar(u.id),
    });
  },
  planillaVerComoAlumno: (el) => {
    const u = state.adminAllUsers.find((x) => x.id === el.dataset.id);
    if (!u) return;
    abrirPlanesDelAlumno(document.getElementById('app-content'), u, {
      soloLectura: u.id !== state.userProfile?.id, // su propio plan sí lo puede completar
      alVolver: () => adminPlanillaActivar(u.id),
    });
  },
});
