// UI compartida: toast, modales propios (reemplazan alert/confirm del navegador),
// overlay de "procesando" y toggle de visibilidad de contraseñas.
// Importar este módulo instala window.alert / window.confirm y registra las acciones de los modales.
import { registrarAcciones } from './acciones.js';

export function toast(message, ok = true) {
  const el = document.createElement('div');
  el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[10010] px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-wider shadow-2xl border ${ok ? 'bg-emerald-950/90 border-emerald-700 text-emerald-300' : 'bg-red-950/90 border-red-700 text-red-300'}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ============================================
// MODALES PROPIOS (reemplazan alert/confirm del navegador)
// ============================================
export function modalBase() {
  let overlay = document.getElementById('app-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'app-modal-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(overlay);
  } else {
    overlay.innerHTML = '';
  }
  overlay.style.display = 'flex';
  return overlay;
}

// Overlay apilado para confirmaciones/avisos (no reemplaza la modal de fondo).
export function modalBaseApilado() {
  let overlay = document.getElementById('app-modal-overlay-aux');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'app-modal-overlay-aux';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10005;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:20px;';
    document.body.appendChild(overlay);
  } else {
    overlay.innerHTML = '';
  }
  overlay.style.display = 'flex';
  return overlay;
}

export function modalCard(inner) {
  return `
    <div class="bg-cyberCard border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
      <i class="fa-solid fa-bolt text-2xl text-neonRed mb-3"></i>
      ${inner}
    </div>
  `;
}

window.alert = function (message) {
  const overlay = modalBaseApilado();
  overlay.innerHTML = modalCard(`
    <p class="text-sm text-white font-medium mb-5 break-words whitespace-pre-line">${String(message).replace(/</g, '&lt;')}</p>
    <button data-click="cerrarModalAux" class="w-full py-3 bg-neonRed text-white font-black text-xs rounded-xl uppercase tracking-wider hover:bg-red-700 transition">Entendido</button>
  `);
};

// resolve de la promesa del window.confirm abierto
let modalResolve = null;

window.confirm = function (message) {
  return new Promise((resolve) => {
    const overlay = modalBaseApilado();
    overlay.innerHTML = modalCard(`
      <p class="text-sm text-white font-medium mb-5 break-words whitespace-pre-line">${String(message).replace(/</g, '&lt;')}</p>
      <div class="flex gap-2">
        <button data-click="resolverModal" data-valor="false" class="flex-1 py-3 bg-cyberCarbon border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider hover:border-neonRed hover:text-neonRed transition">Cancelar</button>
        <button data-click="resolverModal" data-valor="true" class="flex-1 py-3 bg-neonRed text-white font-black text-xs rounded-xl uppercase tracking-wider hover:bg-red-700 transition">Confirmar</button>
      </div>
    `);
    modalResolve = resolve;
  });
};

function resolverModal(valor) {
  if (modalResolve) modalResolve(valor);
  modalResolve = null;
  document.getElementById('app-modal-overlay-aux').style.display = 'none';
}

registrarAcciones({
  resolverModal: (el) => resolverModal(el.dataset.valor === 'true'),
  // Cierra la modal apilada (avisos de window.alert)
  cerrarModalAux: () => {
    document.getElementById('app-modal-overlay-aux').style.display = 'none';
  },
  // Cierra la modal principal (#app-modal-overlay)
  cerrarModal: () => {
    document.getElementById('app-modal-overlay').style.display = 'none';
  },
});

// ============================================
// OVERLAY DE PROCESANDO
// ============================================
export function mostrarProcesando(mensaje = 'Procesando...') {
  let overlay = document.getElementById('app-processing');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'app-processing';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:10020;background:rgba(0,0,0,0.6);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="bg-cyberCard border border-gray-700 rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-2xl">
      <div class="w-10 h-10 border-4 border-neonRed border-t-transparent rounded-full" style="animation: spin 0.8s linear infinite;"></div>
      <p class="text-sm font-bold text-white uppercase tracking-wider">${mensaje}</p>
    </div>
  `;
  overlay.style.display = 'flex';
}

export function ocultarProcesando() {
  const overlay = document.getElementById('app-processing');
  if (overlay) overlay.style.display = 'none';
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = `<i class="fa-solid ${isPassword ? 'fa-eye-slash' : 'fa-eye'} text-sm"></i>`;
}

registrarAcciones({
  // <button data-click="togglePassword" data-campo="id-del-input">
  togglePassword: (el) => togglePassword(el.dataset.campo, el),
});
