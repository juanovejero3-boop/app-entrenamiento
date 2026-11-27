// Agenda del coach: arriba las próximas llamadas reservadas (con su Meet y si quedaron en Google Calendar),
// después el script, y la generación de horarios por día con los libres y los tomados.
// Cancelar un turno lo vuelve a dejar libre y borra su evento del calendario.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import '../../lib/ui.js';
import { state } from '../../state.js';
import { valoresIniciales } from './agendas.js';
import {
  alternarDia,
  cancelarGrupal,
  cancelarTurno,
  estadoDelDia,
  fechasDelRango,
  guardarAgenda,
  guardarGrupales,
  grupalesVisibles,
  leerAgenda,
  leerGrupales,
  publicarGrupal,
  textoFecha,
} from './reservaLocal.js';
import {
  agendarCalendario,
  avisoDeCancelacion,
  cancelarGrupalRemoto,
  cancelarTurnoRemoto,
  errorAlTraer,
  guardarJornadasRemotas,
  guardarScriptRemoto,
  publicarGrupalRemoto,
  scriptCompartidoDe,
  scriptListo,
  traerLlamadas,
  urlScript,
} from './llamadasSync.js';

const claseInput =
  'w-full bg-cyberDark border border-gray-700 rounded-lg p-2 text-sm text-white outline-none focus:border-neonRed';
const claseFecha = `${claseInput} relative cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0`;

const DURACIONES = [15, 20, 30, 45, 60];
const DESCANSOS = [0, 10, 15, 20, 30, 45, 60];
const HORAS = Array.from({ length: ((22 - 6) * 60) / 30 + 1 }, (_, i) => {
  const minutos = 6 * 60 + i * 30;
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
});

const opciones = (valores, actual) => {
  const lista = valores.map(String);
  const todos = lista.includes(String(actual)) ? lista : [String(actual), ...lista];
  return todos
    .map(
      (valor) => `<option value="${esc(valor)}" ${String(actual) === valor ? 'selected' : ''}>${esc(valor)}</option>`,
    )
    .join('');
};

/** @type {HTMLElement | null} */
let raiz = null;
/** @type {ReturnType<typeof valoresIniciales>[string] | null} */
let tipo = null;
/** @type {{ agendaId: string, fecha: string, desde: string, hasta: string, duracionMin: number, descansoMin: number }[]} */
let jornadas = [];
/** @type {{ agendaId: string, fecha: string, hora: string }[]} */
let turnos = [];
let agendaId = 'seguimiento';
let fecha = '';
let fechaDesde = '';
let fechaHasta = '';
let fechaGrupal = '';
let horaGrupal = '19:00';
let avisoGrupal = '';
let scriptEscrito = localStorage.getItem('pp_webhook_url') || '';
/** Por qué no se pudieron traer los turnos ('' si se trajeron bien). */
let errorLectura = '';
let actualizando = false;
/** @type {{ desde: string, hasta: string, duracionMin: number, descansoMin: number }} */
let borrador = { desde: '08:30', hasta: '19:30', duracionMin: 30, descansoMin: 30 };

function guardar() {
  guardarAgenda(jornadas, turnos);
}

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};
const aHora = (minutos) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

function jornadaActual() {
  return jornadas.find((j) => j.agendaId === agendaId && j.fecha === fecha) ?? null;
}

function finDelBloque(jornada, hora) {
  return aHora(aMinutos(hora) + jornada.duracionMin + jornada.descansoMin);
}

const ESTADOS_CALENDARIO = {
  agendado: { texto: 'En Google Calendar', clase: 'border-emerald-800 text-emerald-300', icono: 'fa-circle-check' },
  pendiente: { texto: 'Agendando…', clase: 'border-gray-700 text-gray-400', icono: 'fa-clock' },
  error: { texto: 'No se agendó', clase: 'border-red-900 text-red-300', icono: 'fa-triangle-exclamation' },
  sin_script: { texto: 'Sin calendario conectado', clase: 'border-amber-800 text-amber-300', icono: 'fa-plug' },
};

/** Si el turno quedó en el Google Calendar del coach; si no, el motivo y el botón para reintentar. */
function estadoCalendario(t) {
  const estado = ESTADOS_CALENDARIO[t.calendarioEstado];
  if (!t.id || !estado) return '';
  const reintentable = t.calendarioEstado === 'error' || t.calendarioEstado === 'sin_script';
  return `<span data-calendario="${esc(t.calendarioEstado)}" class="flex flex-wrap items-center gap-2 text-[11px]">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border ${estado.clase}"><i class="fa-solid ${estado.icono}"></i>${esc(estado.texto)}</span>
      ${reintentable && t.calendarioError ? `<span class="text-gray-400">${esc(t.calendarioError)}</span>` : ''}
      ${reintentable ? `<button type="button" data-click="agendaReintentar" data-id="${esc(t.id)}" class="text-neonRed font-bold underline">Reintentar</button>` : ''}
    </span>`;
}

function filaTurno(t) {
  const de = jornadas.find((j) => j.agendaId === t.agendaId && j.fecha === t.fecha);
  const tipoNombre = tipo[t.agendaId]?.nombre ?? '';
  const quien = t.nombre || 'Ocupado';
  const contacto = [t.telefono, t.email].filter(Boolean).join(' · ');
  return `<li data-ocupado="${esc(t.hora)}" class="space-y-1 text-xs text-gray-300 border-t border-gray-800 pt-2">
      <div class="flex items-center justify-between gap-2"><span><b class="text-white">${esc(t.hora)}</b> ${esc(quien)}${contacto ? ` · ${esc(contacto)}` : ''} hasta ${de ? esc(finDelBloque(de, t.hora)) : ''} · ${esc(tipoNombre)}</span><button type="button" data-click="agendaSoltar" data-hora="${esc(t.hora)}" data-fecha="${esc(t.fecha)}" data-agenda="${esc(t.agendaId)}" class="text-red-400 font-bold">Cancelar</button></div>
      ${estadoCalendario(t)}
    </li>`;
}

/** La grilla del día: los horarios libres y, mezclados en orden, los tomados con el nombre de quien reservó. */
function huecosHtml(horas, ocupados = []) {
  const chips = [
    ...horas.map((hora) => ({
      hora,
      html: `<span data-libre="${esc(hora)}" class="p-2 border border-gray-700 rounded-lg text-xs text-white text-center">${esc(hora)}</span>`,
    })),
    ...ocupados.map((t) => ({
      hora: t.hora,
      html: `<span data-tomado="${esc(t.hora)}" class="p-2 border border-neonRed/60 bg-neonRed/10 rounded-lg text-xs text-white text-center min-w-0"><b>${esc(t.hora)}</b><span class="block truncate text-[10px] text-gray-300">${esc(t.nombre || 'Ocupado')}</span></span>`,
    })),
  ].sort((a, b) => a.hora.localeCompare(b.hora));
  if (!horas.length && !ocupados.length) {
    return '<p class="col-span-3 text-sm text-gray-400">No quedan huecos en este día.</p>';
  }
  return `${chips.map((c) => c.html).join('')}${
    horas.length ? '' : '<p class="col-span-3 text-xs text-gray-400">No quedan huecos libres en este día.</p>'
  }`;
}

const hoyIso = (ahora = new Date()) =>
  `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;

const hrefMeet = (enlace) => (/^https:\/\/meet\.google\.com\//i.test(enlace || '') ? enlace : '');

/** Una llamada reservada en la lista de próximas: quién, a qué hora, su Meet, el calendario y cancelar. */
function filaProxima(t) {
  const tipoNombre = tipo[t.agendaId]?.nombre ?? '';
  const contacto = [t.telefono, t.email].filter(Boolean).join(' · ');
  const meet = hrefMeet(t.meet);
  return `<li data-proxima="${esc(t.id || `${t.agendaId}|${t.fecha}|${t.hora}`)}" class="space-y-2 border-t border-gray-800 pt-3 first:border-t-0 first:pt-0">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-white"><b class="text-neonRed">${esc(t.hora)}</b> ${esc(t.nombre || 'Ocupado')}</p>
          <p class="text-[11px] text-gray-400 break-words">${esc(tipoNombre)}${contacto ? ` · ${esc(contacto)}` : ''}</p>
          ${t.notas ? `<p class="text-[11px] text-gray-500 break-words">${esc(t.notas)}</p>` : ''}
        </div>
        <button type="button" data-click="agendaSoltar" data-hora="${esc(t.hora)}" data-fecha="${esc(t.fecha)}" data-agenda="${esc(t.agendaId)}" class="shrink-0 min-h-10 px-2 text-[11px] text-red-400 font-bold uppercase">Cancelar</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${meet ? `<a data-meet href="${esc(meet)}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2 py-1 rounded bg-neonRed text-white text-[11px] font-bold uppercase"><i class="fa-solid fa-video"></i>Meet</a>` : ''}
        ${estadoCalendario(t)}
      </div>
    </li>`;
}

/** Las llamadas reservadas de hoy en adelante, agrupadas por día. */
function panelProximas() {
  const hoy = hoyIso();
  const vienen = turnos
    .filter((t) => t.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
  const dias = [...new Set(vienen.map((t) => t.fecha))];
  return `<section data-proximas class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <h3 class="text-sm font-black text-white uppercase">Próximas llamadas${vienen.length ? ` <span class="text-neonRed">${vienen.length}</span>` : ''}</h3>
      ${
        dias.length
          ? dias
              .map(
                (dia) => `<div class="space-y-2">
          <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400 capitalize">${esc(textoFecha(dia))}</p>
          <ul class="space-y-3">${vienen
            .filter((t) => t.fecha === dia)
            .map(filaProxima)
            .join('')}</ul>
        </div>`,
              )
              .join('')
          : '<p class="text-sm text-gray-400">No hay llamadas reservadas por ahora.</p>'
      }
    </section>`;
}

function panelDias() {
  if (agendaId === 'primera') {
    const dias = jornadas.filter((j) => j.agendaId === 'primera').sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!dias.length) return '<p class="text-sm text-gray-400">Todavía no hay días generados.</p>';
    return `<div data-lista-dias class="space-y-2">${dias
      .map((j, i) => {
        const horas = estadoDelDia('primera', j.fecha, jornadas, turnos).horas;
        const ocupados = turnos.filter((t) => t.agendaId === 'primera' && t.fecha === j.fecha);
        const abierto = i === 0;
        return `<div data-dia-generado="${esc(j.fecha)}" class="border border-gray-800 rounded-lg">
          <button type="button" data-click="agendaDesplegar" aria-expanded="${abierto}" class="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold uppercase text-white">
            <span>${esc(textoFecha(j.fecha))}</span>
            <i data-flecha class="fa-solid fa-chevron-down text-[10px] text-gray-400 transition ${abierto ? 'rotate-180' : ''}"></i>
          </button>
          <div data-cuerpo-dia ${abierto ? '' : 'hidden'} class="px-3 pb-3 space-y-2">
            <div class="grid grid-cols-3 gap-2">${huecosHtml(horas, ocupados)}</div>
            ${ocupados.length ? `<ul class="space-y-1">${ocupados.map(filaTurno).join('')}</ul>` : ''}
          </div>
        </div>`;
      })
      .join('')}</div>`;
  }
  const jornada = jornadaActual();
  const horas = jornada ? estadoDelDia(agendaId, fecha, jornadas, turnos).horas : [];
  const ocupados = turnos.filter((t) => t.agendaId === agendaId && t.fecha === fecha);
  if (!fecha) return '<p class="text-sm text-gray-400">Elegí una fecha y generá sus horarios.</p>';
  if (!jornada) return '<p data-sin-generar class="text-sm text-gray-400">Este día todavía no tiene horarios.</p>';
  return `<div data-huecos class="grid grid-cols-3 gap-2">${huecosHtml(horas, ocupados)}</div>${
    ocupados.length ? `<ul class="space-y-1">${ocupados.map(filaTurno).join('')}</ul>` : ''
  }`;
}
function panelGrupal() {
  const llamadas = grupalesParaMostrar();
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <div>
        <h3 class="text-sm font-black text-white uppercase">Llamada grupal</h3>
        <p class="text-[11px] text-gray-500">La ven todos los alumnos. Pegá el enlace de Meet.</p>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-[10px] text-gray-400 uppercase font-bold">Día<input type="date" data-click="agendaAbrirFecha" data-change="grupalFecha" value="${esc(fechaGrupal)}" class="${claseFecha}"></label>
        <label class="text-[10px] text-gray-400 uppercase font-bold">Hora<select data-change="grupalHora" class="${claseInput}">${opciones(HORAS, horaGrupal)}</select></label>
      </div>
      <label class="block text-[10px] text-gray-400 uppercase font-bold">Enlace<input id="grupal-enlace" type="url" placeholder="https://meet.google.com/..." class="${claseInput}"></label>
      ${avisoGrupal ? `<p class="text-xs text-amber-300">${esc(avisoGrupal)}</p>` : ''}
      <button type="button" data-click="grupalPublicar" class="w-full py-2 rounded-lg bg-neonRed text-white text-xs font-bold uppercase tracking-wider">Publicar llamada</button>
      ${
        llamadas.length
          ? `<div class="space-y-2">${llamadas
              .map(
                (g) => `<article data-grupal class="rounded-xl border border-gray-700 bg-black/40 p-4 space-y-1">
                  <p class="text-lg font-black text-white capitalize">${esc(textoFecha(g.fecha))}</p>
                  <p class="text-3xl font-black text-neonRed leading-none">${esc(g.hora)}</p>
                  <p class="text-[11px] text-gray-500 break-all">${esc(g.enlace)}</p>
                  <button type="button" data-click="grupalCancelar" data-id="${esc(g.id)}" data-fecha="${esc(g.fecha)}" data-hora="${esc(g.hora)}" class="!mt-2 w-full py-2 border border-red-900 text-red-400 rounded-lg text-xs font-bold uppercase">Cancelar llamada</button>
                </article>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>`;
}

function grupalesParaMostrar() {
  return grupalesVisibles(leerGrupales());
}

function tomarBorrador(origen) {
  borrador = {
    desde: origen.desde,
    hasta: origen.hasta,
    duracionMin: origen.duracionMin,
    descansoMin: origen.descansoMin,
  };
}

function dibujar() {
  if (!raiz || !tipo) return;
  const campoScript = raiz.querySelector('#agenda-script');
  if (campoScript) scriptEscrito = campoScript.value;
  const esPrimera = agendaId === 'primera';
  const fechas = esPrimera
    ? `<div class="grid grid-cols-2 gap-2">
        <label class="text-[10px] text-gray-400 uppercase font-bold">Desde el día<input type="date" data-click="agendaAbrirFecha" data-change="agendaRango" data-campo="desde" value="${esc(fechaDesde)}" class="${claseFecha}"></label>
        <label class="text-[10px] text-gray-400 uppercase font-bold">Hasta el día<input type="date" data-click="agendaAbrirFecha" data-change="agendaRango" data-campo="hasta" value="${esc(fechaHasta)}" class="${claseFecha}"></label>
      </div>`
    : `<label class="block text-[10px] text-gray-400 uppercase font-bold">Fecha<input type="date" data-click="agendaAbrirFecha" data-change="agendaFecha" value="${esc(fecha)}" class="${claseFecha}"></label>`;
  raiz.innerHTML = `
    <div data-agenda class="space-y-4">
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0 bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
          <h2 class="text-xl font-black text-white uppercase tracking-wide">Agenda</h2>
          <p class="text-xs text-gray-400">${esPrimera ? 'Elegí desde qué día hasta qué día, y el horario. Generar abre todos esos días.' : 'Elegí el día y el horario. Generar publica esos horarios.'}</p>
        </div>
        <button type="button" data-click="agendaActualizar" ${actualizando ? 'disabled' : ''} class="shrink-0 min-h-10 px-3 rounded-lg border border-gray-700 text-[11px] font-bold uppercase text-gray-300 hover:text-neonRed hover:border-neonRed disabled:opacity-50"><i class="fa-solid fa-rotate ${actualizando ? 'fa-spin' : ''} mr-1"></i>Actualizar</button>
      </div>
      ${errorLectura ? `<p data-error-lectura class="text-sm text-amber-300 bg-cyberCard border border-amber-900 rounded-xl p-4">No se pudieron traer los turnos (${esc(errorLectura)}). Lo que ves puede no estar al día: probá con «Actualizar».</p>` : ''}
      ${panelProximas()}
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        <div>
          <h3 class="text-sm font-black text-white uppercase">Calendario</h3>
          <p class="text-[11px] text-gray-500">Un solo script para todos los coaches. Al reservar, agenda la llamada con él. Si cargás otro, pasa a ser el de todos.</p>
        </div>
        ${scriptCompartidoDe() ? `<p data-script-compartido class="text-[11px] text-sky-300">Usás el script que cargó ${esc(scriptCompartidoDe())}.</p>` : ''}
        <label class="block text-[10px] text-gray-400 uppercase font-bold">URL del script<input id="agenda-script" type="url" value="${esc(scriptEscrito)}" placeholder="https://script.google.com/macros/..." class="${claseInput}"></label>
        <button type="button" data-click="agendaGuardarScript" class="w-full py-2 rounded-lg border border-gray-700 text-xs font-bold uppercase text-white">Guardar script</button>
      </div>
      ${
        scriptListo()
          ? ''
          : '<p data-sin-script class="text-sm text-amber-300 bg-cyberCard border border-gray-800 rounded-xl p-4">Cargá tu script para poder generar llamadas.</p>'
      }
      ${
        scriptListo()
          ? `<div class="flex gap-2">
        ${Object.values(tipo)
          .map(
            (a) => `
          <button type="button" data-click="agendaElegir" data-id="${esc(a.id)}" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${a.id === agendaId ? 'bg-neonRed border-neonRed text-white' : 'border-gray-700 text-gray-300'}">${esc(a.nombre)}</button>`,
          )
          .join('')}
      </div>
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        ${fechas}
        <div class="grid grid-cols-2 gap-2">
          <label class="text-[10px] text-gray-400 uppercase font-bold">Desde la hora<select data-change="agendaCampo" data-campo="desde" class="${claseInput}">${opciones(HORAS, borrador.desde)}</select></label>
          <label class="text-[10px] text-gray-400 uppercase font-bold">Hasta la hora<select data-change="agendaCampo" data-campo="hasta" class="${claseInput}">${opciones(HORAS, borrador.hasta)}</select></label>
          <label class="text-[10px] text-gray-400 uppercase font-bold">Duración (min)<select data-change="agendaCampo" data-campo="duracionMin" class="${claseInput}">${opciones(DURACIONES, borrador.duracionMin)}</select></label>
          <label class="text-[10px] text-gray-400 uppercase font-bold">Descanso (min)<select data-change="agendaCampo" data-campo="descansoMin" class="${claseInput}">${opciones(DESCANSOS, borrador.descansoMin)}</select></label>
        </div>
        <p class="text-[11px] text-gray-500">El descanso queda bloqueado después de cada llamada.</p>
        <button type="button" data-click="agendaGenerar" class="w-full py-2 rounded-lg bg-neonRed text-white text-xs font-bold uppercase tracking-wider">Generar horarios</button>
      </div>
      <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
        ${panelDias()}
      </div>
      ${panelGrupal()}`
          : ''
      }
    </div>`;
}

function cargarLocal() {
  const agenda = leerAgenda();
  jornadas = agenda.jornadas;
  turnos = agenda.turnos;
}

/** Muestra la agenda de prueba dentro de `contenedor`. */
export function montarAgenda(contenedor) {
  raiz = contenedor;
  tipo = valoresIniciales();
  cargarLocal();
  agendaId = 'seguimiento';
  fecha = '';
  fechaDesde = '';
  fechaHasta = '';
  tomarBorrador(tipo.seguimiento);
  errorLectura = '';
  dibujar();
  actualizar();
}

/** Vuelve a traer jornadas, turnos y grupales de la cuenta y redibuja (sin recargar la página). */
async function actualizar() {
  const esta = raiz;
  actualizando = true;
  dibujar();
  const trajo = await traerLlamadas();
  if (raiz !== esta) return; // el coach ya salió de esta pantalla
  actualizando = false;
  errorLectura = trajo ? '' : errorAlTraer();
  if (trajo) {
    if (urlScript()) {
      scriptEscrito = urlScript();
      // dibujar() toma lo escrito en el campo: se le pone la dirección traída para que no la pise con el campo vacío
      const campo = raiz.querySelector('#agenda-script');
      if (campo) campo.value = scriptEscrito;
    }
    cargarLocal();
  }
  dibujar();
}

function campoNumero(valor, anterior) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : anterior;
}

registrarAcciones({
  agendaActualizar: () => actualizar(),
  agendaReintentar: async (el) => {
    el.disabled = true;
    const resultado = await agendarCalendario({ id: el.dataset.id });
    if (resultado && resultado.estado !== 'agendado')
      alert(`No se pudo agendar: ${resultado.error || resultado.estado}`);
    await actualizar();
  },
  agendaElegir: (el) => {
    agendaId = el.dataset.id;
    const jornada = jornadaActual();
    tomarBorrador(jornada ?? tipo[agendaId]);
    dibujar();
  },
  agendaCampo: (el) => {
    const campo = el.dataset.campo;
    borrador[campo] = campo.endsWith('Min') ? campoNumero(el.value, borrador[campo]) : el.value;
    dibujar();
  },
  agendaAbrirFecha: (el, e) => {
    if (typeof el.showPicker !== 'function') return;
    try {
      el.showPicker();
      e.preventDefault();
    } catch {
      // El navegador abre el calendario con el toque.
    }
  },
  agendaFecha: (el) => {
    fecha = el.value;
    const jornada = jornadaActual();
    if (jornada) tomarBorrador(jornada);
    dibujar();
  },
  agendaRango: (el) => {
    if (el.dataset.campo === 'desde') fechaDesde = el.value;
    else fechaHasta = el.value;
    dibujar();
  },
  agendaGenerar: () => {
    const dias = agendaId === 'primera' ? fechasDelRango(fechaDesde, fechaHasta) : fecha ? [fecha] : [];
    if (!dias.length) return;
    for (const dia of dias) {
      jornadas = jornadas.filter((j) => !(j.agendaId === agendaId && j.fecha === dia));
      jornadas.push({ agendaId, fecha: dia, ...borrador });
    }
    guardar();
    dibujar();
    guardarJornadasRemotas(jornadas).catch(() => alert('No se pudieron publicar los horarios.'));
  },
  agendaDesplegar: (el) => alternarDia(el),
  agendaSoltar: async (el) => {
    const clave = {
      agendaId: el.dataset.agenda,
      fecha: el.dataset.fecha || fecha,
      hora: el.dataset.hora,
    };
    const turno = turnos.find((t) => t.agendaId === clave.agendaId && t.fecha === clave.fecha && t.hora === clave.hora);
    if (!turno) return;
    const ok = await window.confirm(
      `¿Cancelar la llamada de ${turno.nombre || 'este turno'} del ${textoFecha(turno.fecha)} a las ${turno.hora}? Se borra también de los calendarios.`,
    );
    if (!ok) return;
    turnos = cancelarTurno(turnos, clave);
    guardar();
    dibujar();
    try {
      const aviso = avisoDeCancelacion(await cancelarTurnoRemoto(turno), turno);
      if (aviso) alert(aviso);
    } catch (error) {
      alert(`No se pudo cancelar el turno: ${error?.message || 'error desconocido'}`);
    }
    await actualizar();
  },
  agendaGuardarScript: async () => {
    const url = raiz?.querySelector('#agenda-script')?.value.trim() || '';
    scriptEscrito = url;
    if (!url) {
      alert('Pegá la URL del script.');
      return;
    }
    try {
      await guardarScriptRemoto(url, state.currentUser?.email || '');
      dibujar();
      alert('Script guardado. Las reservas nuevas lo usan para agendar.');
    } catch {
      alert('No se pudo guardar el script.');
    }
  },
  grupalFecha: (el) => {
    fechaGrupal = el.value;
    avisoGrupal = '';
    dibujar();
  },
  grupalHora: (el) => {
    horaGrupal = el.value;
    avisoGrupal = '';
    dibujar();
  },
  grupalPublicar: () => {
    const enlace = raiz?.querySelector('#grupal-enlace')?.value || '';
    const resultado = publicarGrupal(leerGrupales(), { fecha: fechaGrupal, hora: horaGrupal, enlace });
    if (!resultado.ok) {
      avisoGrupal = 'Poné el día, la hora y el enlace.';
      dibujar();
      return;
    }
    avisoGrupal = '';
    guardarGrupales(resultado.grupales);
    dibujar();
    publicarGrupalRemoto(resultado.grupales.at(-1)).catch(() => alert('No se pudo publicar la llamada grupal.'));
  },
  grupalCancelar: async (el) => {
    const ok = await window.confirm(
      `¿Cancelar la llamada grupal del ${textoFecha(el.dataset.fecha)} a las ${el.dataset.hora}?`,
    );
    if (!ok) return;
    guardarGrupales(cancelarGrupal(leerGrupales(), el.dataset.id));
    dibujar();
    cancelarGrupalRemoto(el.dataset.id).catch(() => alert('No se pudo cancelar la llamada grupal.'));
  },
});
