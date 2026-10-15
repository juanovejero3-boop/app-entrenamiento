// Material: biblioteca de secciones y links (lectura para alumnos, edición para el admin).
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr } from '../../lib/dom.js';
import { switchTab } from '../../router.js';
import { supaClient } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { materialEsYouTube } from './youtube.js';

let materialEditando = false;

export async function renderTabMaterial(content) {
  content.innerHTML =
    '<p class="text-center text-gray-500 mt-10"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando...</p>';
  materialData = null;
  materialData = await materialCargar();
  if (state.userProfile?.role === 'admin' && materialEditando) {
    content.innerHTML = renderMaterialAdmin();
  } else {
    content.innerHTML = renderMaterialAlumno();
  }
}

let materialData = null;

async function materialCargar() {
  if (materialData) return materialData;
  const { data: secciones } = await supaClient
    .from('material_sections')
    .select('*, material_items(*)')
    .order('sort_order');
  if (!secciones) {
    materialData = [];
    return materialData;
  }
  materialData = secciones.map((s) => ({
    id: s.id,
    title: s.title,
    sort_order: s.sort_order,
    items: (s.material_items || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        id: i.id,
        name: i.name,
        link: i.link,
        sort_order: i.sort_order,
      })),
  }));
  return materialData;
}

function materialAbrirLink(link, nombre) {
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
}

function renderMaterialAlumno() {
  const secciones = materialData || [];
  const isAdmin = state.userProfile?.role === 'admin';

  const btnGestionar = isAdmin
    ? `
    <button data-click="setMaterialEditando" data-valor="true" class="ml-auto text-xs bg-cyberCard border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg hover:border-neonRed hover:text-neonRed transition">
      <i class="fa-solid fa-pen-to-square mr-1"></i> Gestionar
    </button>
  `
    : '';

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

  const acordeones = secciones
    .map((sec) => {
      const items = sec.items
        .map((item) => {
          const videoId = materialEsYouTube(item.link);
          const icono = videoId
            ? 'fa-brands fa-youtube text-red-500'
            : item.link.includes('.pdf')
              ? 'fa-solid fa-file-pdf text-red-400'
              : 'fa-solid fa-link text-blue-400';
          return `
        <button data-click="materialAbrirLink" data-link="${escapeAttr(item.link)}" data-nombre="${escapeAttr(item.name)}" class="w-full text-left p-3 rounded-lg bg-cyberDark border border-gray-800 hover:border-neonRed transition flex items-center gap-3">
          <i class="${icono} text-lg shrink-0"></i>
          <span class="text-sm text-white">${item.name}</span>
          <i class="fa-solid fa-chevron-right text-gray-600 text-xs ml-auto"></i>
        </button>
      `;
        })
        .join('');

      return `
      <div class="bg-cyberCard rounded-xl border border-gray-800 overflow-hidden">
        <button data-click="materialToggleSeccion" class="w-full p-4 flex items-center justify-between text-left">
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
    })
    .join('');

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

  const listaSecciones = secciones
    .map((sec) => {
      const items = sec.items
        .map(
          (item) => `
      <div class="flex items-center gap-2 mb-2">
        <div class="flex flex-col gap-0.5">
          <button data-click="materialMoverItem" data-id="${escapeAttr(item.id)}" data-dir="-1" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-up"></i></button>
          <button data-click="materialMoverItem" data-id="${escapeAttr(item.id)}" data-dir="1" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-down"></i></button>
        </div>
        <input type="text" value="${escapeAttr(item.name)}" data-change="materialActualizarItemNombre" data-id="${escapeAttr(item.id)}" placeholder="Nombre" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
        <input type="text" value="${escapeAttr(item.link)}" data-change="materialActualizarItemLink" data-id="${escapeAttr(item.id)}" placeholder="Link" class="flex-[2] bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
        <button data-click="materialEliminarItem" data-id="${escapeAttr(item.id)}" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>
    `,
        )
        .join('');

      return `
      <div class="bg-cyberCard rounded-xl border border-gray-800 p-3 space-y-2">
        <div class="flex items-center gap-2">
          <input type="text" value="${escapeAttr(sec.title)}" data-change="materialActualizarSecTitulo" data-id="${escapeAttr(sec.id)}" placeholder="Título de la sección" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-sm text-white font-bold outline-none focus:border-neonRed" />
          <div class="flex flex-col gap-0.5">
            <button data-click="materialMoverSeccion" data-id="${escapeAttr(sec.id)}" data-dir="-1" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-up"></i></button>
            <button data-click="materialMoverSeccion" data-id="${escapeAttr(sec.id)}" data-dir="1" class="w-5 h-4 flex items-center justify-center text-gray-500 hover:text-neonRed text-[10px]"><i class="fa-solid fa-chevron-down"></i></button>
          </div>
          <button data-click="materialEliminarSeccion" data-id="${escapeAttr(sec.id)}" class="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-red-500"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
        <div class="pl-1">
          ${items}
        </div>
        <div class="flex gap-2 mt-2">
          <input type="text" id="mat-new-name-${sec.id}" placeholder="Nombre" class="flex-1 bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
          <input type="text" id="mat-new-link-${sec.id}" placeholder="Link (YouTube, PDF, web...)" class="flex-[2] bg-cyberDark border border-gray-700 rounded p-1.5 text-xs text-white outline-none focus:border-neonRed" />
          <button data-click="materialAgregarItem" data-id="${escapeAttr(sec.id)}" class="px-3 py-1.5 bg-neonRed text-white text-xs font-bold rounded-lg hover:bg-red-700"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div class="space-y-4 pb-10">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2 flex items-center justify-between">
        <h2 class="text-lg font-black text-white uppercase tracking-wide">Gestionar Material</h2>
        <button data-click="setMaterialEditando" data-valor="false" class="text-xs bg-cyberCard border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg hover:border-neonRed hover:text-neonRed transition">
          <i class="fa-solid fa-arrow-left mr-1"></i> Volver
        </button>
      </div>
      ${listaSecciones}
      <button data-click="materialAgregarSeccion" class="w-full py-3 bg-cyberCard border-2 border-dashed border-gray-700 text-gray-400 font-bold text-sm rounded-xl hover:border-neonRed hover:text-neonRed transition">
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

async function materialAgregarSeccion() {
  const maxOrder = materialData.reduce((max, s) => Math.max(max, s.sort_order), -1);
  const { error } = await supaClient
    .from('material_sections')
    .insert({ title: 'Nueva sección', sort_order: maxOrder + 1 });
  if (error) return alert('Error al crear sección: ' + error.message);
  materialData = null;
  materialRefresh();
}

async function materialEliminarSeccion(id) {
  const ok = await window.confirm('¿Eliminar esta sección y todos sus elementos?');
  if (!ok) return;
  const { error } = await supaClient.from('material_sections').delete().eq('id', id);
  if (error) return alert('Error al eliminar: ' + error.message);
  materialData = null;
  materialRefresh();
}

async function materialActualizarSecTitulo(id, titulo) {
  await supaClient.from('material_sections').update({ title: titulo }).eq('id', id);
  materialData = null;
}

async function materialMoverSeccion(id, dir) {
  const secciones = materialData;
  const idx = secciones.findIndex((s) => s.id === id);
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
}

async function materialAgregarItem(sectionId) {
  const nameInput = document.getElementById(`mat-new-name-${sectionId}`);
  const linkInput = document.getElementById(`mat-new-link-${sectionId}`);
  const nombre = (nameInput?.value || '').trim();
  const link = (linkInput?.value || '').trim();
  if (!nombre || !link) return alert('Completá nombre y link');
  const seccion = materialData.find((s) => s.id === sectionId);
  const maxOrder = seccion ? seccion.items.reduce((max, i) => Math.max(max, i.sort_order), -1) : -1;
  const { error } = await supaClient
    .from('material_items')
    .insert({ section_id: sectionId, name: nombre, link: link, sort_order: maxOrder + 1 });
  if (error) return alert('Error al agregar item: ' + error.message);
  materialData = null;
  materialRefresh();
}

async function materialEliminarItem(id) {
  const { error } = await supaClient.from('material_items').delete().eq('id', id);
  if (error) return alert('Error al eliminar: ' + error.message);
  materialData = null;
  materialRefresh();
}

async function materialActualizarItemNombre(id, nombre) {
  await supaClient.from('material_items').update({ name: nombre }).eq('id', id);
  materialData = null;
}

async function materialActualizarItemLink(id, link) {
  await supaClient.from('material_items').update({ link: link }).eq('id', id);
  materialData = null;
}

async function materialMoverItem(id, dir) {
  const seccion = materialData.find((s) => s.items.some((i) => i.id === id));
  if (!seccion) return;
  const idx = seccion.items.findIndex((i) => i.id === id);
  const nuevoIdx = idx + dir;
  if (nuevoIdx < 0 || nuevoIdx >= seccion.items.length) return;
  const otroId = seccion.items[nuevoIdx].id;
  const miOrder = seccion.items[idx].sort_order;
  const otroOrder = seccion.items[nuevoIdx].sort_order;
  await supaClient.from('material_items').update({ sort_order: otroOrder }).eq('id', id);
  await supaClient.from('material_items').update({ sort_order: miOrder }).eq('id', otroId);
  materialData = null;
  materialRefresh();
}
function setMaterialEditando(valor) {
  materialEditando = valor;
  switchTab('material');
}

// Acordeón de una sección (vista alumno): muestra/oculta los links y rota la flecha
function materialToggleSeccion(btn) {
  btn.nextElementSibling.classList.toggle('hidden');
  btn.querySelector('.fa-chevron-down').classList.toggle('rotate-180');
}

// Cierra el modal de video (#modal-video-preview de index.html) y corta la reproducción
function cerrarModalVideo() {
  document.getElementById('modal-video-preview').classList.add('hidden');
  document.getElementById('video-iframe-container').innerHTML = '';
}

registrarAcciones({
  setMaterialEditando: (el) => setMaterialEditando(el.dataset.valor === 'true'),
  materialAbrirLink: (el) => materialAbrirLink(el.dataset.link, el.dataset.nombre),
  materialToggleSeccion: (el) => materialToggleSeccion(el),
  cerrarModalVideo: () => cerrarModalVideo(),
  materialAgregarSeccion: () => materialAgregarSeccion(),
  materialEliminarSeccion: (el) => materialEliminarSeccion(el.dataset.id),
  materialActualizarSecTitulo: (el) => materialActualizarSecTitulo(el.dataset.id, el.value),
  materialMoverSeccion: (el) => materialMoverSeccion(el.dataset.id, Number(el.dataset.dir)),
  materialAgregarItem: (el) => materialAgregarItem(el.dataset.id),
  materialEliminarItem: (el) => materialEliminarItem(el.dataset.id),
  materialActualizarItemNombre: (el) => materialActualizarItemNombre(el.dataset.id, el.value),
  materialActualizarItemLink: (el) => materialActualizarItemLink(el.dataset.id, el.value),
  materialMoverItem: (el) => materialMoverItem(el.dataset.id, Number(el.dataset.dir)),
});
