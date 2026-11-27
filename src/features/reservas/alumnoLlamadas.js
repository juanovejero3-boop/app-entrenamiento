// Pantalla del alumno: arriba su próxima llamada (con el Meet), las grupales para entrar, y abajo reservar un
// seguimiento eligiendo el día y la hora.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import '../../lib/ui.js';
import { state } from '../../state.js';
import {
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
import {
  agendarCalendario,
  anotarTurnoRemoto,
  cancelarTurnoRemoto,
  errorAlTraer,
  traerLlamadas,
} from './llamadasSync.js';

/** @type {HTMLElement | null} */
let contenido = null;
/** @type {{ fecha: string, hora: string } | null} */
let elegido = null;
let aviso = '';
let listo = false;
/** Por qué no se pudieron traer las llamadas ('' si se trajeron bien). */
let errorLectura = '';
/** Aviso si el turno quedó reservado pero no se pudo agendar en el calendario. */
let avisoCalendario = '';
let actualizando = false;
/** El día que está mirando para reservar ('' = el primero con lugar). */
let diaElegido = '';

const diaPendiente = (fecha, ahora = new Date()) => {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59) >= ahora;
};

function tarjetaGrupal(g) {
  return `
    <article data-grupal class="flex items-center gap-3 rounded-xl border border-gray-800 bg-black/40 px-3 py-2">
      <span class="flex-1 min-w-0">
        <span class="block text-[10px] uppercase tracking-widest text-gray-400 font-bold">Grupal · <span class="capitalize">${esc(textoFecha(g.fecha))}</span></span>
        <span class="block text-xl font-black text-neonRed leading-tight">${esc(g.hora)}</span>
      </span>
      <a data-grupal-enlace href="${esc(hrefDe(g.enlace))}" target="_blank" rel="noopener" class="shrink-0 inline-flex items-center gap-1 min-h-10 px-3 bg-neonRed text-white text-xs font-bold uppercase rounded-lg"><i class="fa-solid fa-video"></i>Entrar</a>
    </article>`;
}

function tarjetaTurno(t) {
  const meet = /^https:\/\/meet\.google\.com\//i.test(t.meet || '') ? t.meet : '';
  const detalle = [
    t.duracionMin ? `${t.duracionMin} min` : '',
    t.calendarioEstado === 'agendado' ? 'en tu calendario' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `
    <article data-turno-propio class="rounded-xl border border-neonRed bg-black/40 p-4 space-y-1">
      <p class="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Tu próxima llamada</p>
      <p class="text-lg font-black text-white capitalize">${esc(textoFecha(t.fecha))}</p>
      <p class="text-3xl font-black text-neonRed leading-none">${esc(t.hora)}</p>
      <p class="text-[11px] text-gray-400">Seguimiento${detalle ? ` · ${esc(detalle)}` : ''}</p>
      <div class="!mt-3 flex gap-2">
        ${meet ? `<a data-meet href="${esc(meet)}" target="_blank" rel="noopener" class="flex-1 py-2 bg-neonRed text-white text-center text-xs font-bold uppercase rounded-lg"><i class="fa-solid fa-video mr-1"></i>Entrar a la llamada</a>` : ''}
        <button type="button" data-click="llamadaCancelar" data-fecha="${esc(t.fecha)}" data-hora="${esc(t.hora)}" class="${meet ? 'shrink-0 px-3' : 'w-full'} py-2 border border-red-900 text-red-400 rounded-lg text-xs font-bold uppercase">Cancelar</button>
      </div>
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

/** Los días con lugar como botones arriba, y los horarios del día elegido abajo. */
function listaDias(dias) {
  const dia = dias.find((d) => d.fecha === diaElegido) ?? dias[0];
  return `<div class="space-y-3">
    <div class="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">${dias
      .map(
        (d) =>
          `<button type="button" data-click="llamadasDia" data-fecha="${esc(d.fecha)}" aria-pressed="${d === dia}" class="shrink-0 min-h-10 px-3 rounded-lg border text-[11px] font-bold uppercase capitalize ${d === dia ? 'bg-neonRed border-neonRed text-white' : 'border-gray-700 text-gray-300'}">${esc(textoFecha(d.fecha))}</button>`,
      )
      .join('')}</div>
    <div class="grid grid-cols-3 gap-2">${dia.horas
      .map(
        (hora) =>
          `<button type="button" data-click="alumnoElegirTurno" data-fecha="${esc(dia.fecha)}" data-hora="${esc(hora)}" class="min-h-10 p-2 border border-gray-700 rounded-lg text-xs text-white">${esc(hora)}</button>`,
      )
      .join('')}</div>
  </div>`;
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
      <div class="flex items-center gap-3">
        <div class="flex-1 bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
          <h2 class="text-xl font-black text-white uppercase tracking-wide">Llamadas</h2>
        </div>
        <button type="button" data-click="llamadasActualizar" ${actualizando ? 'disabled' : ''} class="shrink-0 min-h-10 px-3 rounded-lg border border-gray-700 text-[11px] font-bold uppercase text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-50"><i class="fa-solid fa-rotate ${actualizando ? 'fa-spin' : ''} mr-1"></i>Actualizar</button>
      </div>
      ${errorLectura ? `<p data-error-lectura class="text-sm text-amber-300 bg-cyberCard border border-amber-900 rounded-xl p-4">No se pudieron traer las llamadas (${esc(errorLectura)}). Probá con «Actualizar».</p>` : ''}
      ${avisoCalendario ? `<p data-aviso-calendario class="text-sm text-amber-300 bg-cyberCard border border-amber-900 rounded-xl p-4">${esc(avisoCalendario)}</p>` : ''}
      ${vigentes.map(tarjetaTurno).join('')}
      <section class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="text-sm font-black text-white uppercase">Grupales</h3>
        ${
          grupales.length
            ? grupales.map(tarjetaGrupal).join('')
            : '<p class="text-sm text-gray-400">No hay una llamada grupal por ahora.</p>'
        }
      </section>
      ${
        vigentes.length && !elegido
          ? '' // ya tiene su seguimiento: arriba está su próxima llamada
          : `<section class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <h3 class="text-sm font-black text-white uppercase">Reservar seguimiento</h3>
        ${
          elegido
            ? formulario(nombre)
            : diasLibres.length
              ? listaDias(diasLibres)
              : '<p class="text-sm text-gray-400">No hay turnos de seguimiento por ahora.</p>'
        }
      </section>`
      }
    </div>`;
}

/** Muestra las llamadas del alumno dentro de `content`. */
export function renderTabLlamadas(content) {
  contenido = content;
  elegido = null;
  aviso = '';
  listo = false;
  errorLectura = '';
  avisoCalendario = '';
  diaElegido = '';
  dibujar();
  actualizar();
}

/** Vuelve a traer las llamadas de la cuenta y redibuja (sin recargar la página). */
async function actualizar() {
  const esta = contenido;
  actualizando = true;
  dibujar();
  const trajo = await traerLlamadas();
  if (contenido !== esta) return; // ya salió de esta pantalla
  actualizando = false;
  errorLectura = trajo ? '' : errorAlTraer();
  dibujar();
}

registrarAcciones({
  llamadasActualizar: () => actualizar(),
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
    const turno = resultado.turnos.at(-1);
    const jornada = jornadas.find((j) => j.agendaId === 'seguimiento' && j.fecha === turno.fecha);
    elegido = null;
    aviso = '';
    listo = true;
    dibujar();
    avisoCalendario = '';
    anotarTurnoRemoto(turno, jornada)
      .then(async () => {
        const resultado = await agendarCalendario(turno);
        if (resultado && resultado.estado !== 'agendado') {
          avisoCalendario =
            'Tu turno quedó reservado, pero no se pudo agendar en tu calendario. El coach lo va a ver y te confirma la llamada.';
          dibujar();
        } else if (resultado) {
          await actualizar(); // trae el enlace de Meet del evento
        }
      })
      .catch(() => {
        const ahora = leerAgenda();
        guardarAgenda(ahora.jornadas, cancelarTurno(ahora.turnos, turno));
        alert('No se pudo guardar el turno. Probá de nuevo.');
        dibujar();
      });
  },
  llamadasDia: (el) => {
    diaElegido = el.dataset.fecha;
    dibujar();
  },
  llamadaCancelar: async (el) => {
    const fecha = el.dataset.fecha;
    const hora = el.dataset.hora;
    const ok = await window.confirm(`¿Cancelar el turno del ${textoFecha(fecha)} a las ${hora}?`);
    if (!ok) return;
    const { jornadas, turnos } = leerAgenda();
    const clave = { agendaId: 'seguimiento', fecha, hora };
    const turno = turnos.find((t) => t.agendaId === 'seguimiento' && t.fecha === fecha && t.hora === hora) ?? clave;
    guardarAgenda(jornadas, cancelarTurno(turnos, clave));
    elegido = null;
    listo = false;
    dibujar();
    try {
      await cancelarTurnoRemoto(turno); // también lo borra de tu calendario y del del coach
    } catch {
      alert('No se pudo cancelar el turno.');
    }
    await actualizar();
  },
});
