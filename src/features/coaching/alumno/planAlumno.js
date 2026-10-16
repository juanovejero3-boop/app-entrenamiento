// Vista del plan de entrenamiento para el alumno: semanas, días, ejercicios y un registro de
// kg / reps / check por serie. El coach la usa en modo lectura ("Ver como alumno"): es la misma
// pantalla, pero sin poder anotar.
// Los datos salen del repositorio (Supabase); cada anotación se guarda al
// instante y no redibuja la pantalla, para no perder el foco al pasar de un campo a otro.
import { registrarAcciones } from '../../../lib/acciones.js';
import { escapeAttr as esc } from '../../../lib/dom.js';
import { hoyISO } from '../../../lib/fecha.js';
import { toast } from '../../../lib/ui.js';
import { cicloActivo } from '../ciclos/ciclos.js';
import { GRUPOS_SUPERSERIE, TIPOS_BLOQUE } from '../entrenamiento/catalogos.js';
import { etiquetasSuperserie, fechasDeSemana, rangoDelPlan, semanaActual } from '../entrenamiento/plan.js';
import { nombreDelAlumno } from '../pdf/alumno.js';
import { mostrarPdf } from '../pdf/mostrar.js';
import { repo } from '../repo/index.js';
import {
  actualizarSerie,
  cantidadDeSeries,
  omitirTodasLasSeries,
  pasarPendientesAOmitidas,
  progresoDelDia,
  serieDe,
} from './registro.js';
import { diasTerminados, reabrirSesion, sesionDe, terminarSesion } from './sesiones.js';

/**
 * @type {{
 *   content: HTMLElement, alumno: { id: string, name?: string, email?: string }, cicloId: string | null,
 *   plan: import('../entrenamiento/plan.js').PlanEntrenamiento | null,
 *   registro: import('./registro.js').Registro, sesiones: import('./sesiones.js').Sesiones, hoy: string,
 *   soloLectura: boolean, alVolver: (() => void) | null,
 *   w: number, d: number, videos: Map<string, string>
 * } | null}
 */
let vista = null;

let catalogoVideos = null;

/** Nombre de ejercicio (minúsculas, sin espacios de más) -> link de video, de la base de ejercicios. */
async function cargarVideos() {
  if (!catalogoVideos) {
    try {
      const ejercicios = (await import('../../../data/exercises.json')).default;
      catalogoVideos = new Map(ejercicios.filter((e) => e.l).map((e) => [e.n.trim().toLowerCase(), e.l]));
    } catch (error) {
      console.error('No se pudo cargar la base de videos de ejercicios', error);
      return new Map();
    }
  }
  return catalogoVideos;
}

/**
 * Muestra el plan del alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ cicloId?: string, soloLectura?: boolean, alVolver?: (() => void) | null, hoy?: string }} [opciones]
 *   cicloId: qué ciclo mostrar (por defecto, el activo del alumno).
 *   soloLectura: modo del coach, sin poder anotar. alVolver: agrega un botón "Volver".
 *   hoy: AAAA-MM-DD, para elegir la semana inicial (por defecto, la de hoy).
 * @returns {Promise<boolean>} si el alumno tiene un plan para mostrar
 */
export async function abrirPlanAlumno(
  content,
  alumno,
  { cicloId = null, soloLectura = false, alVolver = null, hoy = hoyISO() } = {},
) {
  const ciclos = await repo.listarCiclos(alumno.id);
  const ciclo = cicloId ? (ciclos.find((c) => c.id === cicloId) ?? null) : cicloActivo(ciclos);
  const [registro, sesiones] = ciclo
    ? await Promise.all([repo.cargarRegistroDelCiclo(ciclo.id), repo.cargarSesionesDelCiclo(ciclo.id)])
    : [{}, {}];
  const plan = ciclo?.plan.weeks.length ? ciclo.plan : null;
  const videos = plan ? await cargarVideos() : new Map();
  vista = {
    content,
    alumno,
    cicloId: ciclo?.id ?? null,
    plan,
    registro,
    sesiones,
    hoy,
    soloLectura,
    alVolver,
    w: plan ? semanaActual(plan, hoy) : 0,
    d: 0,
    videos,
  };
  dibujar();
  return Boolean(plan);
}

// ---------------------------------------------------------------------------
// Vista
// ---------------------------------------------------------------------------

const claseChip = (activa) =>
  `shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition ${
    activa ? 'bg-neonRed border-neonRed text-white' : 'bg-cyberCard border-gray-700 text-gray-300 hover:border-neonRed'
  }`;
const claseBotonChico =
  'text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed transition';
const claseCheck = (hecha) => `text-2xl transition ${hecha ? 'text-emerald-500' : 'text-gray-600'}`;
const claseOmitir = (omitida) => `text-2xl transition ${omitida ? 'text-red-500' : 'text-gray-600'}`;
const COLUMNAS = 'grid-cols-[1.75rem_1fr_1fr_2.25rem_2.25rem]';
const claseInput =
  'w-full bg-black border border-gray-700 rounded-lg py-2 text-center text-sm text-white outline-none focus:border-neonRed disabled:opacity-60';

function dibujar() {
  const { content, plan, soloLectura } = vista;
  content.innerHTML = `
    <div class="space-y-4">
      ${soloLectura || vista.alVolver ? dibujarBarraSuperior() : ''}
      ${plan ? dibujarPlan() : dibujarSinPlan()}
    </div>
  `;
}

/** Botón Volver (si hay a dónde volver) y, en modo lectura del coach, el aviso de que no se puede anotar. */
function dibujarBarraSuperior() {
  const { alVolver, alumno, soloLectura } = vista;
  const volver = alVolver
    ? `<button data-click="alumnoVolver" class="text-gray-300 hover:text-neonRed" title="Volver"><i class="fa-solid fa-arrow-left"></i></button>`
    : '';
  return soloLectura
    ? `<div class="bg-sky-950/40 border border-sky-800 rounded-xl p-3 flex items-center gap-3 text-xs text-sky-200">
        ${volver}
        <p><b class="uppercase tracking-wide">Modo lectura</b> · Así ve el plan ${esc(nombreDelAlumno(alumno))}. Desde acá no se puede anotar.</p>
      </div>`
    : `<div class="flex items-center gap-3 text-xs text-gray-400">${volver}<span class="uppercase tracking-wide font-bold">Mi plan</span></div>`;
}

function dibujarSinPlan() {
  const mensaje = vista.soloLectura
    ? 'Este alumno todavía no tiene un plan armado en la app.'
    : 'Tu entrenador todavía no cargó tu plan en la app.';
  return `
    <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 text-center text-sm text-gray-400">
      <i class="fa-solid fa-dumbbell text-2xl text-neonRed mb-2 block"></i>${mensaje}
    </div>
  `;
}

const tieneLineamientos = ({ objective, priorities, focus, evaluation, guidelines }) =>
  Boolean(objective || focus || evaluation || guidelines || priorities.some((p) => p.target || p.progression));

function dibujarPlan() {
  const { plan, w, d } = vista;
  const semana = plan.weeks[w];
  const rango = rangoDelPlan(plan);
  const n = plan.weeks.length;
  const meta = [
    semana.objective && `Fase: ${semana.objective}`,
    semana.targetVolume && `Volumen: ${semana.targetVolume}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  return `
    <div class="bg-cyberCard p-4 rounded-xl border border-gray-800 space-y-3">
      <div>
        <h2 class="text-lg font-black text-white uppercase tracking-wide">${esc(plan.macroName)}</h2>
        <p class="text-xs text-gray-400">${[rango && `${rango.inicio} – ${rango.fin}`, `${n} ${n === 1 ? 'semana' : 'semanas'}`].filter(Boolean).join('  ·  ')}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        ${tieneLineamientos(plan.report) ? `<button data-click="alumnoPdf" data-tipo="lineamientos" class="${claseBotonChico}"><i class="fa-solid fa-file-lines mr-1"></i>Lineamientos</button>` : ''}
        <button data-click="alumnoPdf" data-tipo="entrenamiento" class="${claseBotonChico}"><i class="fa-solid fa-file-pdf mr-1"></i>Plan completo (PDF)</button>
      </div>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      ${plan.weeks
        .map((s, i) => {
          const fechas = plan.startDate ? fechasDeSemana(plan.startDate, i) : '';
          const { hechos, total } = diasTerminados(s, vista.sesiones);
          const detalle = [fechas, total ? `${hechos}/${total} días` : ''].filter(Boolean).join(' · ');
          return `<button data-click="alumnoSemana" data-w="${i}" ${i === w ? 'aria-current="true"' : ''} class="${claseChip(i === w)}">${esc(s.name)}${detalle ? `<span class="block text-[9px] font-normal normal-case opacity-80">${esc(detalle)}</span>` : ''}</button>`;
        })
        .join('')}
    </div>
    ${meta ? `<p class="text-xs text-gray-400">${esc(meta)}</p>` : ''}

    ${
      semana.days.length
        ? `<div class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            ${semana.days
              .map((dia, i) => {
                const sesion = sesionDe(vista.sesiones, dia.id);
                const marca = !sesion
                  ? ''
                  : sesion.estado === 'omitida'
                    ? '<i class="fa-solid fa-xmark ml-1 text-red-400"></i>'
                    : '<i class="fa-solid fa-check ml-1"></i>';
                const estado =
                  sesion?.estado === 'omitida' ? 'data-no-entrenado="true"' : sesion ? 'data-hecho="true"' : '';
                return `<button data-click="alumnoDia" data-d="${i}" ${i === d ? 'aria-current="true"' : ''} ${estado} class="${claseChip(i === d)}">${esc(dia.name)}${marca}</button>`;
              })
              .join('')}
          </div>
          ${dibujarDia(semana.days[d])}`
        : '<p class="text-sm text-gray-500 italic">Sin días cargados.</p>'
    }
  `;
}

function dibujarDia(dia) {
  const bloques = dia.blocks.filter((b) => b.exercises.length);
  if (!bloques.length) return '<p class="text-sm text-gray-500 italic">Sin ejercicios cargados.</p>';
  const { hechas, omitidas, total } = progresoDelDia(dia, vista.registro);
  const { verde, rojo } = anchosDeBarra(hechas, omitidas, total);
  const sesion = sesionDe(vista.sesiones, dia.id);
  return `
    ${sesion ? dibujarSesionTerminada(sesion) : vista.soloLectura ? '<p data-sin-terminar class="text-xs text-gray-500 italic">Sesión sin terminar.</p>' : ''}
    <div class="space-y-1">
      <p data-progreso class="text-[11px] font-bold uppercase tracking-wider text-gray-400">${textoProgreso(hechas, omitidas, total)}</p>
      <div class="h-1.5 bg-gray-800 rounded flex overflow-hidden">
        <div data-progreso-barra class="h-1.5 bg-emerald-500 transition-all" style="width: ${verde}%"></div>
        <div data-progreso-omitidas class="h-1.5 bg-red-500 transition-all" style="width: ${rojo}%"></div>
      </div>
    </div>
    ${bloques.map(dibujarBloque).join('')}
    ${sesion || vista.soloLectura ? '' : dibujarCierreDeSesion()}
  `;
}

const textoProgreso = (hechas, omitidas, total) =>
  `${hechas} / ${total} series${omitidas ? ` · ${omitidas} ${omitidas === 1 ? 'omitida' : 'omitidas'}` : ''}`;
const porcentaje = (parte, total) => (total ? Math.round((parte / total) * 100) : 0);

/** Anchos (en %) de las dos partes de la barra: hechas en verde y omitidas en rojo a continuación. */
function anchosDeBarra(hechas, omitidas, total) {
  const verde = porcentaje(hechas, total);
  return { verde, rojo: Math.min(porcentaje(omitidas, total), 100 - verde) }; // el redondeo no pasa del 100 %
}

const formatearFecha = (fecha) => fecha.split('-').reverse().join('/');

function dibujarSesionTerminada(sesion) {
  const noEntrenado = sesion.estado === 'omitida';
  const marca = noEntrenado ? 'data-dia-no-entrenado' : 'data-sesion-terminada';
  const colores = noEntrenado
    ? 'bg-red-950/30 border-red-900 text-red-200'
    : 'bg-emerald-950/30 border-emerald-800 text-emerald-200';
  const titulo = noEntrenado
    ? '<i class="fa-solid fa-circle-xmark mr-1"></i><b class="uppercase tracking-wide">Día no entrenado</b>'
    : '<i class="fa-solid fa-circle-check mr-1"></i><b class="uppercase tracking-wide">Sesión terminada</b>';
  return `
    <div ${marca} class="${colores} border rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
      <p>${titulo} el ${esc(formatearFecha(sesion.fecha))}</p>
      ${vista.soloLectura ? '' : `<button data-click="alumnoReabrir" class="${claseBotonChico}">Reabrir sesión</button>`}
    </div>
  `;
}

function dibujarCierreDeSesion() {
  return `
    <div class="bg-cyberCard rounded-xl border border-gray-800 p-3 space-y-3">
      <label class="flex items-center justify-between gap-2 text-xs text-gray-400">Fecha de la sesión
        <input type="date" data-fecha-sesion value="${esc(vista.hoy)}" max="${esc(vista.hoy)}" class="bg-black border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-neonRed">
      </label>
      <button data-click="alumnoTerminar" class="w-full py-3 neon-glow-button text-white font-black text-sm rounded-xl uppercase tracking-wider"><i class="fa-solid fa-flag-checkered mr-2"></i>Terminar sesión</button>
      <button data-click="alumnoNoEntrene" class="w-full py-2.5 bg-black border border-gray-700 text-gray-300 font-bold text-xs rounded-xl uppercase tracking-wider"><i class="fa-solid fa-xmark mr-2"></i>No entrené este día</button>
    </div>
  `;
}

function dibujarBloque(bloque) {
  const tipo = TIPOS_BLOQUE[bloque.type] ?? { label: bloque.type, color: '#888' };
  const etiquetas = etiquetasSuperserie(bloque);
  return `
    <section class="space-y-2">
      <h3 class="text-[11px] font-black uppercase tracking-wider pl-2 border-l-4" style="color: ${esc(tipo.color)}; border-color: ${esc(tipo.color)}">${esc(tipo.label)}</h3>
      ${bloque.exercises.map((ej, i) => dibujarEjercicio(ej, etiquetas[i])).join('')}
    </section>
  `;
}

function dibujarEjercicio(ej, etiqueta) {
  const color = GRUPOS_SUPERSERIE[ej.group] ?? '#9ca3af';
  const video = vista.videos.get(ej.name.trim().toLowerCase());
  const insignias = [
    ej.reps && `Reps ${ej.reps}`,
    ej.intensityValue && `${ej.intensityType} ${ej.intensityValue}`,
    ej.rest && `Descanso ${ej.rest}`,
    ej.tech,
  ].filter(Boolean);
  return `
    <article data-ejercicio="${esc(ej.id)}" class="bg-cyberCard rounded-xl border p-3 space-y-2 ${ej.group ? 'border-dashed' : 'border-gray-800'}" ${ej.group ? `style="border-color: ${esc(color)}"` : ''}>
      <div class="flex items-start gap-2">
        ${etiqueta ? `<span data-etiqueta class="shrink-0 min-w-[2rem] text-center text-xs font-black px-1.5 py-1 rounded" style="color: ${esc(color)}; background: ${esc(color)}22; border: 1px solid ${esc(color)}">${esc(etiqueta)}</span>` : ''}
        <div class="flex-1 min-w-0">
          <h4 class="font-black text-white text-sm">${esc(ej.name || 'Ejercicio')}</h4>
          <div class="flex flex-wrap gap-1 mt-1">${insignias.map((t) => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-black border border-gray-700 text-gray-300">${esc(t)}</span>`).join('')}</div>
        </div>
        ${video ? `<button data-click="materialAbrirLink" data-link="${esc(video)}" data-nombre="${esc(ej.name.trim())}" class="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded bg-red-950 border border-neonRed text-neonRed"><i class="fa-solid fa-play mr-1"></i>Demo</button>` : ''}
      </div>
      ${ej.notes ? `<p class="text-xs text-gray-400">${esc(ej.notes)}</p>` : ''}
      ${dibujarSeries(ej)}
    </article>
  `;
}

function dibujarSeries(ej) {
  const dis = vista.soloLectura || diaTerminado() ? 'disabled' : '';
  const filas = Array.from({ length: cantidadDeSeries(ej) }, (_, i) => {
    const n = i + 1;
    const serie = serieDe(vista.registro, ej.id, n);
    const pos = `data-e="${esc(ej.id)}" data-n="${n}"`;
    return `
      <div data-serie="${esc(ej.id)}-${n}" class="grid ${COLUMNAS} gap-1.5 items-center">
        <span class="text-center text-xs font-bold text-gray-500">${n}</span>
        <input data-change="alumnoSerie" ${pos} data-campo="kg" type="text" inputmode="decimal" placeholder="0" value="${esc(serie.kg)}" ${dis} class="${claseInput}" aria-label="Kg de la serie ${n}">
        <input data-change="alumnoSerie" ${pos} data-campo="reps" type="text" inputmode="numeric" placeholder="${esc(ej.reps || '-')}" value="${esc(serie.reps)}" ${dis} class="${claseInput}" aria-label="Repeticiones de la serie ${n}">
        <button data-click="alumnoCheck" ${pos} aria-pressed="${serie.done}" ${dis} class="${claseCheck(serie.done)} disabled:opacity-60" aria-label="Serie ${n} hecha"><i class="fa-solid fa-circle-check"></i></button>
        <button data-click="alumnoOmitir" ${pos} aria-pressed="${serie.skipped}" ${dis} class="${claseOmitir(serie.skipped)} disabled:opacity-60" aria-label="Serie ${n}: no la hice" title="No la hice"><i class="fa-solid fa-circle-xmark"></i></button>
      </div>`;
  }).join('');
  return `
    <div class="space-y-2">
      <div class="grid ${COLUMNAS} gap-1.5 text-center text-[10px] font-bold uppercase text-gray-500"><span>Serie</span><span>Kg</span><span>Reps</span><span>Listo</span><span>No</span></div>
      ${filas}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Registro de series
// ---------------------------------------------------------------------------

/** Actualiza el texto y la barra de progreso del día mostrado, sin redibujar nada más. */
function actualizarProgreso() {
  const { content, plan, w, d, registro } = vista;
  const dia = plan.weeks[w].days[d];
  const texto = content.querySelector('[data-progreso]');
  if (!dia || !texto) return;
  const { hechas, omitidas, total } = progresoDelDia(dia, registro);
  texto.textContent = textoProgreso(hechas, omitidas, total);
  const { verde, rojo } = anchosDeBarra(hechas, omitidas, total);
  const barraVerde = content.querySelector('[data-progreso-barra]');
  if (barraVerde) barraVerde.style.width = `${verde}%`;
  const barraRoja = content.querySelector('[data-progreso-omitidas]');
  if (barraRoja) barraRoja.style.width = `${rojo}%`;
}

/** Pinta los botones de hecha / no la hice de una serie según el registro (sin redibujar el resto). */
function pintarEstadoDeSerie(ejercicioId, numero) {
  const fila = [...vista.content.querySelectorAll('[data-serie]')].find(
    (f) => f.dataset.serie === `${ejercicioId}-${numero}`,
  );
  if (!fila) return;
  const { done, skipped } = serieDe(vista.registro, ejercicioId, numero);
  const check = fila.querySelector('[data-click="alumnoCheck"]');
  const omitir = fila.querySelector('[data-click="alumnoOmitir"]');
  check.setAttribute('aria-pressed', String(done));
  check.className = `${claseCheck(done)} disabled:opacity-60`;
  omitir.setAttribute('aria-pressed', String(skipped));
  omitir.className = `${claseOmitir(skipped)} disabled:opacity-60`;
}

const diaActual = () => vista.plan.weeks[vista.w].days[vista.d];
const diaTerminado = () => Boolean(sesionDe(vista.sesiones, diaActual()?.id));

async function anotarSerie(ejercicioId, numero, cambios) {
  if (!vista || vista.soloLectura || diaTerminado()) return;
  vista.registro = actualizarSerie(vista.registro, ejercicioId, numero, cambios);
  pintarEstadoDeSerie(ejercicioId, numero);
  actualizarProgreso();
  try {
    await repo.guardarRegistroDelCiclo(vista.cicloId, vista.registro);
  } catch (error) {
    console.error('No se pudo guardar el registro', error);
    toast('No se pudo guardar: ' + error.message, false);
  }
}

/** Hecha / "no la hice": tocar el estado activo lo vuelve a pendiente. */
function alternarEstado(boton, campo) {
  const { e, n } = boton.dataset;
  const activa = serieDe(vista.registro, e, Number(n))[campo];
  return anotarSerie(e, Number(n), { [campo]: !activa });
}

/** Guarda las sesiones (y el registro si cambió); si no se puede, avisa en lugar de perder el dato. */
async function guardarSesionYRegistro({ conRegistro }) {
  try {
    await Promise.all([
      conRegistro ? repo.guardarRegistroDelCiclo(vista.cicloId, vista.registro) : null,
      repo.guardarSesionesDelCiclo(vista.cicloId, vista.sesiones),
    ]);
  } catch (error) {
    console.error('No se pudo guardar la sesion', error);
    toast('No se pudo guardar: ' + error.message, false);
  }
}

/** La fecha elegida para cerrar el día, o null (avisando) si falta o es futura. */
function fechaElegida() {
  const fecha = vista.content.querySelector('[data-fecha-sesion]')?.value ?? '';
  if (!fecha) return void window.alert('Elegí la fecha de la sesión.');
  if (fecha > vista.hoy) return void window.alert('La fecha de la sesión no puede ser futura.');
  return fecha;
}

/** Termina el día con la fecha elegida; las series sin marcar pasan a omitidas (con confirmación). */
async function terminarDia() {
  if (!vista || vista.soloLectura) return;
  const dia = diaActual();
  const fecha = fechaElegida();
  if (!fecha) return;

  const { hechas, omitidas, total } = progresoDelDia(dia, vista.registro);
  const pendientes = total - hechas - omitidas;
  if (pendientes > 0) {
    const ok = await window.confirm(
      `Quedan ${pendientes} ${pendientes === 1 ? 'serie' : 'series'} sin marcar. Si terminás la sesión se marcan como omitidas. ¿Terminar igual?`,
    );
    if (!ok) return;
  }
  try {
    vista.sesiones = terminarSesion(vista.sesiones, dia.id, { fecha, terminadaEn: new Date().toISOString() });
  } catch {
    return window.alert('La fecha de la sesión no es válida.');
  }
  vista.registro = pasarPendientesAOmitidas(dia, vista.registro);
  dibujar();
  await guardarSesionYRegistro({ conRegistro: pendientes > 0 });
}

/** Marca el día como no entrenado en la fecha elegida: todas sus series pasan a omitidas. */
async function noEntrenarDia() {
  if (!vista || vista.soloLectura) return;
  const dia = diaActual();
  const fecha = fechaElegida();
  if (!fecha) return;

  const { total } = progresoDelDia(dia, vista.registro);
  const ok = await window.confirm(
    `Vas a marcar este día como no entrenado: ${total === 1 ? 'la serie pasa' : `las ${total} series pasan`} a omitidas. ¿Seguro?`,
  );
  if (!ok) return;
  vista.sesiones = terminarSesion(vista.sesiones, dia.id, {
    fecha,
    terminadaEn: new Date().toISOString(),
    estado: 'omitida',
  });
  vista.registro = omitirTodasLasSeries(dia, vista.registro);
  dibujar();
  await guardarSesionYRegistro({ conRegistro: true });
}

/** Vuelve a abrir un día terminado para seguir anotando (lo omitido automáticamente sigue omitido). */
async function reabrirDia() {
  if (!vista || vista.soloLectura) return;
  vista.sesiones = reabrirSesion(vista.sesiones, diaActual().id);
  dibujar();
  await guardarSesionYRegistro({ conRegistro: false });
}

registrarAcciones({
  alumnoVolver: () => vista?.alVolver?.(),
  alumnoSemana: (el) => {
    if (!vista) return;
    vista.w = Number(el.dataset.w);
    vista.d = 0;
    dibujar();
  },
  alumnoDia: (el) => {
    if (!vista) return;
    vista.d = Number(el.dataset.d);
    dibujar();
  },
  alumnoSerie: (el) => anotarSerie(el.dataset.e, Number(el.dataset.n), { [el.dataset.campo]: el.value }),
  alumnoCheck: (el) => (vista ? alternarEstado(el, 'done') : undefined),
  alumnoOmitir: (el) => (vista ? alternarEstado(el, 'skipped') : undefined),
  alumnoTerminar: () => terminarDia(),
  alumnoNoEntrene: () => noEntrenarDia(),
  alumnoReabrir: () => reabrirDia(),
  alumnoPdf: (el) => (vista?.plan ? mostrarPdf(el.dataset.tipo, vista.plan, vista.alumno) : undefined),
});
