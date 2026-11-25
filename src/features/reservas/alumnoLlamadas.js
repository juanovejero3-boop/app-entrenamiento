// Pantalla del alumno: la llamada grupal y los turnos de seguimiento que generó el coach.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import '../../lib/ui.js';
import { state } from '../../state.js';
import {
  alternarDia,
  AVISO_RESERVA,
  cancelarTurno,
  guardarAgenda,
  grupalesVisibles,
  hrefDe,
  leerAgenda,
  leerGrupales,
  ofertaDisponible,
  reservar,
  textoFecha,
} from './reservaLocal.js';

/** @type {HTMLElement | null} */
let contenido = null;
/** @type {{ fecha: string, hora: string } | null} */
let elegido = null;
let aviso = '';
let listo = false;

const diaPendiente = (fecha, ahora = new Date()) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59) >= ahora;
};

function tarjetaGrupal(g) {
  return `
    <article data-grupal class="rounded-xl border border-neonRed bg-black/40 p-4 space-y-1">
      <p class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Llamada grupal</p>
      <p class="text-lg font-black text-white capitalize">${esc(textoFecha(g.fecha))}</p>
      <p class="text-3xl font-black text-neonRed leading-none">${esc(g.hora)}</p>
      <a data-grupal-enlace href="${esc(hrefDe(g.enlace))}" target="_blank" rel="noopener" class="!mt-3 block w-full py-2 bg-neonRed text-white text-center text-xs font-bold uppercase rounded-lg">Entrar a la llamada</a>
    </article>`;
}

function tarjetaTurno(t) {
  return `
    <article data-turno-propio class="rounded-xl border border-neonRed bg-black/40 p-4 space-y-1">
      <p class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Tu turno</p>
      <p class="text-lg font-black text-white capitalize">${esc(textoFecha(t.fecha))}</p>
      <p class="text-3xl font-black text-neonRed leading-none">${esc(t.hora)}</p>
      <button type="button" data-click="llamadaCancelar" data-fecha="${esc(t.fecha)}" data-hora="${esc(t.hora)}" class="!mt-3 w-full py-2 border border-red-900 text-red-400 rounded-lg text-xs font-bold uppercase">Cancelar turno</button>
    </article>`;
}

function formulario(nombre) {
  return `<div class="space-y-3">
    <p class="text-xs text-neonRed font-bold">${esc(textoFecha(elegido.fecha))} a las ${esc(elegido.hora)}</p>
    <label class="block text-[10px] text-gray-400 uppercase font-bold">Nombre<input id="alumno-nombre" value="${esc(nombre)}" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-sm text-white"></label>
    <label class="block text-[10px] text-gray-400 uppercase font-bold">WhatsApp<input id="alumno-telefono" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-sm text-white"></label>
    ${aviso ? `<p class="text-xs text-amber-300">${esc(aviso)}</p>` : ''}
    <div class="flex gap-2">
      <button type="button" data-click="llamadaVolver" class="w-1/3 py-2 border border-gray-700 rounded text-xs text-gray-300">Atrás</button>
      <button type="button" data-click="alumnoConfirmar" class="w-2/3 py-2 bg-neonRed rounded text-xs font-bold text-white uppercase">Agendar</button>
    </div>
  </div>`;
}

function listaDias(dias) {
  return `<div data-lista-dias class="space-y-2">${dias
    .map((dia, i) => {
      const abierto = i === 0;
      return `<div class="border border-gray-800 rounded-lg">
        <button type="button" data-click="alumnoDesplegar" aria-expanded="${abierto}" class="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase text-white">
          <span>${esc(textoFecha(dia.fecha))}</span>
          <i data-flecha class="fa-solid fa-chevron-down text-[10px] ${abierto ? 'rotate-180' : ''}"></i>
        </button>
        <div data-cuerpo-dia ${abierto ? '' : 'hidden'} class="px-3 pb-3">
          <div class="grid grid-cols-3 gap-2">
            ${dia.horas
              .map(
                (hora) =>
                  `<button type="button" data-click="alumnoElegirTurno" data-fecha="${esc(dia.fecha)}" data-hora="${esc(hora)}" class="p-2 border border-gray-700 rounded-lg text-xs text-white">${hora}</button>`,
              )
              .join('')}
          </div>
        </div>
      </div>`;
    })
    .join('')}</div>`;
}

function dibujar() {
  if (!contenido) return;
  const { jornadas, turnos } = leerAgenda();
  const email = (state.currentUser?.email || '').trim().toLowerCase();
  const nombre = state.userProfile?.name || '';
  const grupales = grupalesVisibles(leerGrupales());
  const dias = ofertaDisponible('seguimiento', jornadas, turnos, new Date());
  const propios = turnos.filter((t) => t.agendaId === 'seguimiento' && (t.email || '') === email);
  const vigentes = propios.filter((t) => diaPendiente(t.fecha));
  const diasLibres = vigentes.length ? [] : dias;

  contenido.innerHTML = `
    <div class="space-y-4 pb-8">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-xl font-black text-white uppercase tracking-wide">Llamadas</h2>
      </div>
      <section class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="text-sm font-black text-white uppercase">Grupal</h3>
        ${
          grupales.length
            ? grupales.map(tarjetaGrupal).join('')
            : '<p class="text-sm text-gray-400">No hay una llamada grupal por ahora.</p>'
        }
      </section>
      <section class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="text-sm font-black text-white uppercase">Seguimiento</h3>
        ${vigentes.map(tarjetaTurno).join('')}
        ${
          elegido
            ? formulario(nombre)
            : diasLibres.length
              ? listaDias(diasLibres)
              : vigentes.length
                ? ''
                : '<p class="text-sm text-gray-400">No hay turnos de seguimiento por ahora.</p>'
        }
      </section>
    </div>`;
}

/** Muestra las llamadas del alumno dentro de `content`. */
export function renderTabLlamadas(content) {
  contenido = content;
  elegido = null;
  aviso = '';
  listo = false;
  dibujar();
}

registrarAcciones({
  alumnoElegirTurno: (el) => {
    elegido = { fecha: el.dataset.fecha, hora: el.dataset.hora };
    aviso = '';
    listo = false;
    dibujar();
  },
  llamadaVolver: () => {
    elegido = null;
    aviso = '';
    dibujar();
  },
  alumnoConfirmar: () => {
    if (!elegido || !contenido) return;
    const nombreCampo = contenido.querySelector('#alumno-nombre')?.value || '';
    const telefono = contenido.querySelector('#alumno-telefono')?.value || '';
    const { jornadas, turnos } = leerAgenda();
    const resultado = reservar(jornadas, turnos, {
      agendaId: 'seguimiento',
      fecha: elegido.fecha,
      hora: elegido.hora,
      nombre: nombreCampo,
      email: state.currentUser?.email || '',
      telefono,
    });
    if (!resultado.ok) {
      aviso = AVISO_RESERVA[resultado.motivo];
      dibujar();
      return;
    }
    guardarAgenda(jornadas, resultado.turnos);
    elegido = null;
    aviso = '';
    listo = true;
    dibujar();
  },
  alumnoDesplegar: (el) => alternarDia(el),
  llamadaCancelar: async (el) => {
    const fecha = el.dataset.fecha;
    const hora = el.dataset.hora;
    const ok = await window.confirm(`¿Cancelar el turno del ${textoFecha(fecha)} a las ${hora}?`);
    if (!ok) return;
    const { jornadas, turnos } = leerAgenda();
    guardarAgenda(jornadas, cancelarTurno(turnos, { agendaId: 'seguimiento', fecha, hora }));
    elegido = null;
    listo = false;
    dibujar();
  },
});
