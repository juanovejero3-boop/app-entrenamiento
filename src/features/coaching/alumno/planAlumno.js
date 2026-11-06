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
  replicarKg,
  serieDe,
  seriesCambiadas,
} from './registro.js';
import { diasTerminados, reabrirSesion, sesionDe, terminarSesion } from './sesiones.js';
import { vigilarTeclado } from './escribirSinTapar.js';
import { conUnidadDeTiempo, esTiempo, sinUnidadDeTiempo } from './tiempo.js';
import { textoUltimaMarca, ultimaMarca } from './ultimaMarca.js';

/**
 * @typedef {{
 *   content: HTMLElement, alumno: { id: string, name?: string, email?: string }, cicloId: string | null,
 *   esperandoProximo: boolean, sinBarra: boolean,
 *   plan: import('../entrenamiento/plan.js').PlanEntrenamiento | null,
 *   registro: import('./registro.js').Registro, sesiones: import('./sesiones.js').Sesiones, hoy: string,
 *   soloLectura: boolean, alVolver: (() => void) | null,
 *   w: number, d: number, videos: Map<string, string>, abiertos: Set<string>,
 *   enVivo: boolean, seguir: boolean, actualizadoEn: Date | null, esperaEnVivoMs: number, resaltadoMs: number
 * }} VistaDelPlan
 */

/** Una instancia de la vista por contenedor (así se pueden mostrar varios ciclos a la vez). */
const instancias = new WeakMap();

/** Las vistas en vivo abiertas: contenedor -> función que deja de escuchar los cambios. */
const seguimientos = new Map();

/** Deja de escuchar las vistas en vivo de `actual` (se está por abrir otra ahí) y las de pantallas que ya no están. */
function limpiarSeguimientos(actual) {
  for (const [contenedor, dejarDeEscuchar] of seguimientos) {
    if (contenedor !== actual && contenedor.isConnected) continue;
    dejarDeEscuchar();
    seguimientos.delete(contenedor);
  }
}

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
 * @param {{ cicloId?: string, soloLectura?: boolean, sinBarra?: boolean, alVolver?: (() => void) | null, hoy?: string }} [opciones]
 *   cicloId: qué ciclo mostrar (por defecto, el activo del alumno).
 *   soloLectura: modo del coach, sin poder anotar. alVolver: agrega un botón "Volver".
 *   sinBarra: no muestra la barra superior (aviso de lectura y Volver), para usarla dentro de otra pantalla.
 *   hoy: AAAA-MM-DD, para elegir la semana inicial (por defecto, la de hoy).
 *   enVivo: solo con soloLectura; se actualiza cuando el alumno anota algo (Realtime), resalta lo nuevo y
 *   sigue al alumno de día en día. esperaEnVivoMs / resaltadoMs: cuánto se espera para juntar avisos y cuánto
 *   dura el resaltado (se pueden achicar en los tests).
 * @returns {Promise<boolean>} si el alumno tiene un plan para mostrar
 */
export async function abrirPlanAlumno(
  content,
  alumno,
  {
    cicloId = null,
    soloLectura = false,
    sinBarra = false,
    alVolver = null,
    hoy = hoyISO(),
    enVivo = false,
    esperaEnVivoMs = 300,
    resaltadoMs = 3000,
  } = {},
) {
  const ciclos = await repo.listarCiclos(alumno.id);
  const ciclo = cicloId ? (ciclos.find((c) => c.id === cicloId) ?? null) : cicloActivo(ciclos);
  const [registro, sesiones] = ciclo
    ? await Promise.all([repo.cargarRegistroDelCiclo(ciclo.id), repo.cargarSesionesDelCiclo(ciclo.id)])
    : [{}, {}];
  const plan = ciclo?.plan.weeks.length ? ciclo.plan : null;
  const videos = plan ? await cargarVideos() : new Map();
  const vista = {
    content,
    alumno,
    cicloId: ciclo?.id ?? null,
    // sin ciclo activo pero con ciclos anteriores: el próximo todavía no está
    esperandoProximo: !cicloId && !ciclo && ciclos.some((c) => c.estado === 'finalizado'),
    sinBarra,
    plan,
    registro,
    sesiones,
    hoy,
    soloLectura,
    alVolver,
    w: plan ? semanaActual(plan, hoy) : 0,
    d: 0,
    videos,
    abiertos: new Set(), // ids de los ejercicios desplegados
    enVivo: enVivo && soloLectura, // solo el coach en modo lectura puede seguir al alumno
    seguir: true, // la vista acompaña al alumno al día donde está anotando
    actualizadoEn: null,
    esperaEnVivoMs,
    resaltadoMs,
  };
  content.dataset.planAlumno = 'true';
  vigilarTeclado(content);
  const instancia = crearVista(vista);
  instancias.set(content, instancia);
  instancia.dibujar();
  limpiarSeguimientos(content);
  if (vista.enVivo && vista.cicloId) seguimientos.set(content, instancia.iniciarEnVivo());
  return Boolean(plan);
}

/**
 * Arma la vista de un contenedor: dibuja y atiende las acciones sobre su propio estado.
 * @param {VistaDelPlan} vista
 */
function crearVista(vista) {
  // ---------------------------------------------------------------------------
  // Vista
  // ---------------------------------------------------------------------------

  const claseChip = (activa) =>
    `shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition ${
      activa
        ? 'bg-neonRed border-neonRed text-white'
        : 'bg-cyberCard border-gray-700 text-gray-300 hover:border-neonRed'
    }`;
  // Los días van en la barra fija: más chicos que los chips de las semanas para ocupar poco lugar al scrollear
  const claseChipDia = (activa) =>
    `shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition ${
      activa
        ? 'bg-neonRed border-neonRed text-white'
        : 'bg-cyberCard border-gray-700 text-gray-300 hover:border-neonRed'
    }`;
  const claseBotonChico =
    'text-[11px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg border border-gray-600 text-gray-300 hover:border-neonRed hover:text-neonRed transition';
  const claseCheck = (hecha) => `text-2xl transition ${hecha ? 'text-emerald-500' : 'text-gray-600'}`;
  const claseOmitir = (omitida) => `text-2xl transition ${omitida ? 'text-red-500' : 'text-gray-600'}`;
  const COLUMNAS = 'grid-cols-[1.75rem_1fr_1fr_2.25rem_2.25rem]';
  const claseInput =
    'w-full bg-black border border-gray-600 rounded-lg py-2 text-center text-base text-white placeholder:text-gray-300 outline-none focus:border-neonRed disabled:opacity-60';

  function dibujar() {
    const { content, plan, soloLectura } = vista;
    content.innerHTML = `
    <div class="space-y-4">
      ${!vista.sinBarra && (soloLectura || vista.alVolver) ? dibujarBarraSuperior() : ''}
      ${plan ? dibujarPlan() : dibujarSinPlan()}
    </div>
  `;
    seguirAlturaDeLaBarraFija();
  }

  let observadorDeBarra = null;
  /** Las cabeceras de los ejercicios se pegan debajo de la barra fija: se les pasa su altura por una variable CSS. */
  function seguirAlturaDeLaBarraFija() {
    observadorDeBarra?.disconnect();
    observadorDeBarra = null;
    const barra = vista.content.querySelector('[data-barra-fija]');
    const medir = () => vista.content.style.setProperty('--barra-fija-h', `${barra?.offsetHeight ?? 0}px`);
    medir();
    if (barra && typeof ResizeObserver !== 'undefined') {
      observadorDeBarra = new ResizeObserver(medir);
      observadorDeBarra.observe(barra);
    }
  }

  /** Botón Volver (si hay a dónde volver) y, en modo lectura del coach, el aviso de que no se puede anotar. */
  function dibujarBarraSuperior() {
    const { alVolver, alumno, soloLectura } = vista;
    const volver = alVolver
      ? `<button data-click="alumnoVolver" class="text-gray-300 hover:text-neonRed" title="Volver"><i class="fa-solid fa-arrow-left"></i></button>`
      : '';
    if (soloLectura && vista.enVivo) return dibujarBarraEnVivo(volver);
    return soloLectura
      ? `<div class="bg-sky-950/40 border border-sky-800 rounded-xl p-3 flex items-center gap-3 text-xs text-sky-200">
        ${volver}
        <p><b class="uppercase tracking-wide">Modo lectura</b> · Así ve el plan ${esc(nombreDelAlumno(alumno))}. Desde acá no se puede anotar.</p>
      </div>`
      : `<div class="flex items-center gap-3 text-xs text-gray-400">${volver}<span class="uppercase tracking-wide font-bold">Mi plan</span></div>`;
  }

  /** El aviso del coach cuando mira en vivo: que se actualiza solo y si acompaña al alumno de día en día. */
  function dibujarBarraEnVivo(volver) {
    const hora = vista.actualizadoEn?.toLocaleTimeString('es-AR') ?? '';
    return `<div class="bg-sky-950/40 border border-sky-800 rounded-xl p-3 flex items-center gap-3 text-xs text-sky-200">
        ${volver}
        <span class="relative flex h-2.5 w-2.5 shrink-0"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span></span>
        <p data-en-vivo class="flex-1 min-w-0"><b class="uppercase tracking-wide">Observando cambios</b> · modo lectura de ${esc(nombreDelAlumno(vista.alumno))}.${hora ? ` <span data-actualizado class="text-sky-300/80">Actualizado ${esc(hora)}</span>` : ''}</p>
        <button data-click="alumnoSeguir" aria-pressed="${vista.seguir}" title="${vista.seguir ? 'Tocá para dejar de acompañar al alumno de día en día' : 'Tocá para que la vista acompañe al alumno de día en día'}" class="shrink-0 ${claseBotonChico} ${vista.seguir ? '!border-emerald-600 !text-emerald-300' : ''}"><i class="fa-solid ${vista.seguir ? 'fa-location-crosshairs' : 'fa-location-dot'} mr-1"></i>${vista.seguir ? 'Siguiendo al alumno' : 'Seguir al alumno'}</button>
      </div>`;
  }

  function dibujarSinPlan() {
    const mensaje = vista.soloLectura
      ? vista.esperandoProximo
        ? 'Este alumno no tiene un ciclo activo en este momento.'
        : 'Este alumno todavía no tiene un plan armado en la app.'
      : vista.esperandoProximo
        ? 'Tu entrenador está armando tu próximo ciclo.'
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

    <div data-semanas class="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      ${plan.weeks
        .map((s, i) => {
          const fechas = plan.startDate ? fechasDeSemana(plan.startDate, i) : '';
          const { hechos, total } = diasTerminados(s, vista.sesiones);
          const detalle = [fechas, total ? `${hechos}/${total} días` : ''].filter(Boolean).join(' · ');
          return `<button data-click="alumnoSemana" data-w="${i}" ${i === w ? 'aria-current="true"' : ''} class="${claseChip(i === w)}">${esc(s.name)}${detalle ? `<span class="block text-[9px] font-normal normal-case opacity-80">${esc(detalle)}</span>` : ''}</button>`;
        })
        .join('')}
    </div>
    ${
      semana.days.length
        ? `<div data-barra-fija class="sticky top-0 z-30 bg-black py-1.5 space-y-1 border-b border-gray-800">
          <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span data-semana-actual title="${esc(semana.name)}" class="shrink-0 text-[10px] font-black uppercase tracking-wider text-neonRed pr-1">S${w + 1}</span>
            ${semana.days
              .map((dia, i) => {
                const sesion = sesionDe(vista.sesiones, dia.id);
                const marca = !sesion
                  ? ''
                  : sesion.estado === 'omitida'
                    ? '<i class="fa-solid fa-xmark absolute left-full ml-1 top-1/2 -translate-y-1/2 text-red-400"></i>'
                    : '<i class="fa-solid fa-check absolute left-full ml-1 top-1/2 -translate-y-1/2"></i>';
                const estado =
                  sesion?.estado === 'omitida' ? 'data-no-entrenado="true"' : sesion ? 'data-hecho="true"' : '';
                return `<button data-click="alumnoDia" data-d="${i}" ${i === d ? 'aria-current="true"' : ''} ${estado} class="${claseChipDia(i === d)}${sesion ? ' !px-4' : ''}"><span class="relative inline-block">${esc(dia.name)}${marca}</span>${sesion ? `<span data-dia-fecha class="block text-[9px] font-normal normal-case opacity-80">${esc(diaYMes(sesion.fecha))}</span>` : ''}</button>`;
              })
              .join('')}
          </div>${dibujarProgreso(semana.days[d])}</div>`
        : ''
    }
    ${meta ? `<p class="text-xs text-gray-400">${esc(meta)}</p>` : ''}
    ${semana.days.length ? dibujarDia(semana.days[d]) : '<p class="text-sm text-gray-500 italic">Sin días cargados.</p>'}
  `;
  }

  function dibujarDia(dia) {
    const bloques = dia.blocks.filter((b) => b.exercises.length);
    if (!bloques.length) return '<p class="text-sm text-gray-500 italic">Sin ejercicios cargados.</p>';
    const sesion = sesionDe(vista.sesiones, dia.id);
    return `
    ${sesion ? dibujarSesionTerminada(sesion) : vista.soloLectura ? '<p data-sin-terminar class="text-xs text-gray-500 italic">Sesión sin terminar.</p>' : ''}
    <div class="flex justify-end"><button data-click="alumnoEjerciciosTodos" class="text-[11px] font-bold uppercase tracking-wider text-gray-300 hover:text-neonRed">${textoBotonTodos()}</button></div>
    ${bloques.map(dibujarBloque).join('')}
    ${sesion || vista.soloLectura ? '' : dibujarCierreDeSesion()}
  `;
  }

  /** El contador de series del día (texto y barra verde/roja): va en la barra fija para verlo siempre. */
  function dibujarProgreso(dia) {
    if (!dia.blocks.some((b) => b.exercises.length)) return '';
    const { hechas, omitidas, total } = progresoDelDia(dia, vista.registro);
    const { verde, rojo } = anchosDeBarra(hechas, omitidas, total);
    return `
      <div class="flex items-center gap-2">
        <p data-progreso class="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-300">${textoProgreso(hechas, omitidas, total)}</p>
        <div class="flex-1 h-1.5 bg-gray-800 rounded flex overflow-hidden">
          <div data-progreso-barra class="h-1.5 bg-emerald-500 transition-all" style="width: ${verde}%"></div>
          <div data-progreso-omitidas class="h-1.5 bg-red-500 transition-all" style="width: ${rojo}%"></div>
        </div>
      </div>`;
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
  /** «2026-11-08» → «8/11», para la pestaña del día terminado. */
  const diaYMes = (fecha) => {
    const [, mes, dia] = fecha.split('-');
    return `${Number(dia)}/${Number(mes)}`;
  };

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

  /** Lo que hizo la última vez que entrenó este ejercicio en el ciclo (o que todavía no hay marcas). */
  function dibujarUltimaMarca(ej) {
    const marca = ultimaMarca(vista.plan, vista.registro, { w: vista.w, d: vista.d }, ej);
    return `<p data-ultima-marca ${marca ? '' : 'data-sin-marca'} class="text-[11px] leading-snug rounded-lg bg-black border border-gray-700 px-2 py-1 ${marca ? 'text-gray-200' : 'text-gray-400 italic'}"><i class="fa-solid fa-clock-rotate-left mr-1 text-neonRed not-italic"></i>${esc(textoUltimaMarca(marca))}</p>`;
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
    const abierto = vista.abiertos.has(ej.id);
    const { texto, completo } = resumenDeEjercicio(ej);
    return `
    <article data-ejercicio="${esc(ej.id)}" class="bg-cyberCard rounded-xl border p-3 space-y-2 ${ej.group ? 'border-dashed' : 'border-gray-800'}" ${ej.group ? `style="border-color: ${esc(color)}"` : ''}>
      <div data-ej-cabecera class="sticky z-20 bg-cyberCard -mx-3 -mt-3 px-3 pt-3 pb-1 rounded-t-xl" style="top: var(--barra-fija-h, 0px)">
      <div class="flex items-start gap-2">
        <button type="button" data-click="alumnoEjercicio" data-e="${esc(ej.id)}" aria-expanded="${abierto}" class="flex-1 min-w-0 flex items-start gap-2 text-left">
        ${etiqueta ? `<span data-etiqueta class="shrink-0 min-w-[2rem] text-center text-xs font-black px-1.5 py-1 rounded" style="color: ${esc(color)}; background: ${esc(color)}22; border: 1px solid ${esc(color)}">${esc(etiqueta)}</span>` : ''}
        <span class="flex-1 min-w-0 block">
          <span class="block font-black text-white text-sm">${esc(ej.name || 'Ejercicio')}</span>
        </span>
        <span data-ej-resumen ${completo ? 'data-completo="true"' : ''} class="${claseResumen(completo)}">${esc(texto)}</span>
        <i data-ej-flecha class="fa-solid fa-chevron-down text-gray-300 transition mt-1 ${abierto ? 'rotate-180' : ''}"></i>
        </button>
        ${video ? `<button data-click="materialAbrirLink" data-link="${esc(video)}" data-nombre="${esc(ej.name.trim())}" class="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded bg-red-950 border border-neonRed text-neonRed"><i class="fa-solid fa-play mr-1"></i>Demo</button>` : ''}
      </div>
      <button type="button" data-click="alumnoEjercicio" data-e="${esc(ej.id)}" tabindex="-1" class="mt-2 w-full flex flex-wrap gap-1 text-left">${insignias.map((t) => `<span data-insignia class="text-sm font-semibold px-1.5 py-0.5 rounded-md bg-black border border-gray-500 text-gray-100">${esc(t)}</span>`).join('')}</button>
      <div data-ej-columnas ${abierto ? '' : 'hidden'} class="mt-2 pb-1 border-b border-gray-800 space-y-2">${dibujarUltimaMarca(ej)}${dibujarColumnas(ej)}</div>
      </div>
      <div data-ej-cuerpo ${abierto ? '' : 'hidden'} class="space-y-2">
        ${ej.notes ? `<p class="text-xs text-gray-400">${esc(ej.notes)}</p>` : ''}
        ${dibujarSeries(ej)}
      </div>
    </article>
  `;
  }

  const claseResumen = (completo) =>
    `shrink-0 text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${
      completo ? 'border-emerald-700 text-emerald-300 bg-emerald-950/40' : 'border-gray-600 text-gray-200'
    }`;

  /** "2/4" (y "· 1 omitida"): cuántas series del ejercicio se hicieron; completo si están todas. */
  function resumenDeEjercicio(ej) {
    const total = cantidadDeSeries(ej);
    let hechas = 0;
    let omitidas = 0;
    for (let n = 1; n <= total; n++) {
      const serie = serieDe(vista.registro, ej.id, n);
      if (serie.done) hechas++;
      else if (serie.skipped) omitidas++;
    }
    const omitidasTexto = omitidas ? ` · ${omitidas} ${omitidas === 1 ? 'omitida' : 'omitidas'}` : '';
    return { texto: `${hechas}/${total}${omitidasTexto}`, completo: hechas === total };
  }

  /** Reps de la serie. Si son segundos se escribe solo el número (el teclado del celular no tiene comillas) y la unidad se ve fija. */
  function campoReps(ej, serie, pos, dis, n) {
    const tiempo = esTiempo(ej.reps);
    const campo = `<input data-change="alumnoSerie" ${pos} data-campo="reps" ${tiempo ? 'data-tiempo ' : ''}type="text" inputmode="${tiempo ? 'decimal' : 'numeric'}" placeholder="${esc(tiempo ? sinUnidadDeTiempo(ej.reps) : ej.reps || '-')}" value="${esc(tiempo ? sinUnidadDeTiempo(serie.reps) : serie.reps)}" ${dis} class="${claseInput}${tiempo ? ' pr-7' : ''}" aria-label="${tiempo ? 'Segundos' : 'Repeticiones'} de la serie ${n}">`;
    return tiempo
      ? `<div class="relative">${campo}<span data-unidad-tiempo class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">seg</span></div>`
      : campo;
  }

  /** Los títulos de las columnas: van en la cabecera fija de la tarjeta, así se ven aunque haya muchas series. */
  const dibujarColumnas = (ej) =>
    `<div class="grid ${COLUMNAS} gap-1.5 text-center text-xs font-bold uppercase text-gray-300"><span>Serie</span><span>Kg</span><span>${esTiempo(ej.reps) ? 'Seg' : 'Reps'}</span><span>Listo</span><span>No</span></div>`;

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
        ${campoReps(ej, serie, pos, dis, n)}
        <button data-click="alumnoCheck" ${pos} aria-pressed="${serie.done}" ${dis} class="${claseCheck(serie.done)} disabled:opacity-60" aria-label="Serie ${n} hecha"><i class="fa-solid fa-circle-check"></i></button>
        <button data-click="alumnoOmitir" ${pos} aria-pressed="${serie.skipped}" ${dis} class="${claseOmitir(serie.skipped)} disabled:opacity-60" aria-label="Serie ${n}: no la hice" title="No la hice"><i class="fa-solid fa-circle-xmark"></i></button>
      </div>`;
    }).join('');
    return `
    <div class="space-y-2">${filas}</div>
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

  const articuloDe = (ejercicioId) =>
    [...vista.content.querySelectorAll('[data-ejercicio]')].find((a) => a.dataset.ejercicio === ejercicioId);

  /** Actualiza el "2/4" del encabezado de un ejercicio, sin redibujar nada más. */
  function actualizarResumenDeEjercicio(ejercicioId) {
    const ejercicio = diaActual()
      .blocks.flatMap((b) => b.exercises)
      .find((e) => e.id === ejercicioId);
    const resumen = articuloDe(ejercicioId)?.querySelector('[data-ej-resumen]');
    if (!ejercicio || !resumen) return;
    const { texto, completo } = resumenDeEjercicio(ejercicio);
    resumen.textContent = texto;
    resumen.className = claseResumen(completo);
    if (completo) resumen.dataset.completo = 'true';
    else delete resumen.dataset.completo;
  }

  const idsDelDia = () =>
    diaActual()
      .blocks.filter((b) => b.exercises.length)
      .flatMap((b) => b.exercises.map((e) => e.id));
  const todosAbiertos = () => idsDelDia().every((id) => vista.abiertos.has(id));
  const textoBotonTodos = () => (todosAbiertos() ? 'Plegar todos' : 'Abrir todos');

  /** Muestra u oculta el cuerpo de un ejercicio (sin redibujar). */
  function mostrarCuerpo(ejercicioId, abierto) {
    const articulo = articuloDe(ejercicioId);
    if (!articulo) return;
    articulo.querySelector('[data-ej-cuerpo]').hidden = !abierto;
    articulo.querySelector('[data-ej-columnas]').hidden = !abierto;
    articulo.querySelector('[data-click="alumnoEjercicio"]').setAttribute('aria-expanded', String(abierto));
    articulo.querySelector('[data-ej-flecha]')?.classList.toggle('rotate-180', abierto);
  }

  function actualizarBotonTodos() {
    const boton = vista.content.querySelector('[data-click="alumnoEjerciciosTodos"]');
    if (boton) boton.textContent = textoBotonTodos();
  }

  function alternarEjercicio(ejercicioId) {
    const abrir = !vista.abiertos.has(ejercicioId);
    if (abrir) vista.abiertos.add(ejercicioId);
    else vista.abiertos.delete(ejercicioId);
    mostrarCuerpo(ejercicioId, abrir);
    actualizarBotonTodos();
  }

  /** Abre todos los ejercicios del día o, si ya estaban todos abiertos, los pliega. */
  function alternarTodos() {
    const abrir = !todosAbiertos();
    for (const id of idsDelDia()) {
      if (abrir) vista.abiertos.add(id);
      else vista.abiertos.delete(id);
      mostrarCuerpo(id, abrir);
    }
    actualizarBotonTodos();
  }

  /** Al cambiar de semana o de día desde la barra fija, vuelve al principio de la vista si se había scrolleado. */
  function traerAlTope() {
    if (vista.content.getBoundingClientRect().top < 0) vista.content.scrollIntoView?.({ block: 'start' });
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

  /** Al cargar el peso de una serie, lo copia a las siguientes que siguen pendientes y lo muestra en sus campos. */
  function copiarKgASiguientes(ejercicioId, numero, kg) {
    const ejercicio = diaActual()
      .blocks.flatMap((b) => b.exercises)
      .find((e) => e.id === ejercicioId);
    if (!ejercicio) return;
    vista.registro = replicarKg(vista.registro, ejercicio, numero, kg);
    for (let n = numero + 1; n <= cantidadDeSeries(ejercicio); n++) {
      const campoKg = [...vista.content.querySelectorAll('[data-change="alumnoSerie"][data-campo="kg"]')].find(
        (c) => c.dataset.e === ejercicioId && c.dataset.n === String(n),
      );
      if (campoKg) campoKg.value = serieDe(vista.registro, ejercicioId, n).kg;
    }
  }

  async function anotarSerie(ejercicioId, numero, cambios) {
    if (vista.soloLectura || diaTerminado()) return;
    vista.registro = actualizarSerie(vista.registro, ejercicioId, numero, cambios);
    if ('kg' in cambios) copiarKgASiguientes(ejercicioId, numero, cambios.kg);
    pintarEstadoDeSerie(ejercicioId, numero);
    actualizarResumenDeEjercicio(ejercicioId);
    actualizarProgreso();
    try {
      await repo.guardarRegistroDelCiclo(vista.cicloId, vista.registro);
    } catch (error) {
      console.error('No se pudo guardar el registro', error);
      toast('No se pudo guardar: ' + error.message, false);
    }
  }

  // ---------------------------------------------------------------------------
  // En vivo (el coach mira lo que el alumno va completando)
  // ---------------------------------------------------------------------------

  /** En qué semana y día está un ejercicio, o null. */
  function ubicacionDe(ejercicioId) {
    for (const [w, semana] of vista.plan.weeks.entries()) {
      for (const [d, dia] of semana.days.entries()) {
        if (dia.blocks.some((b) => b.exercises.some((e) => e.id === ejercicioId))) return { w, d };
      }
    }
    return null;
  }

  /** Abre los ejercicios donde hubo cambios y, si se está siguiendo al alumno, se pasa a su semana y día. */
  function seguirALaActividad(cambiadas) {
    if (!cambiadas.length) return;
    for (const { ejercicio } of cambiadas) vista.abiertos.add(ejercicio);
    if (!vista.seguir) return;
    const lugar = ubicacionDe(cambiadas.at(-1).ejercicio);
    if (lugar) Object.assign(vista, lugar);
  }

  /** Resalta un rato las series que acaban de cambiar. */
  function resaltar(cambiadas) {
    const clases = ['ring-2', 'ring-emerald-400', 'rounded-lg'];
    const filas = cambiadas
      .map(({ ejercicio, n }) =>
        [...vista.content.querySelectorAll('[data-serie]')].find((f) => f.dataset.serie === `${ejercicio}-${n}`),
      )
      .filter(Boolean);
    for (const fila of filas) {
      fila.dataset.reciente = 'true';
      fila.classList.add(...clases);
    }
    setTimeout(() => {
      for (const fila of filas) {
        delete fila.dataset.reciente;
        fila.classList.remove(...clases);
      }
    }, vista.resaltadoMs);
  }

  /** Vuelve a leer lo que anotó el alumno y lo muestra, sin perder el lugar donde se estaba scrolleando. */
  async function refrescarDesdeLaBase() {
    try {
      const [registro, sesiones] = await Promise.all([
        repo.cargarRegistroDelCiclo(vista.cicloId),
        repo.cargarSesionesDelCiclo(vista.cicloId),
      ]);
      if (!vista.content.isConnected) return;
      const cambiadas = seriesCambiadas(vista.registro, registro);
      vista.registro = registro;
      vista.sesiones = sesiones;
      vista.actualizadoEn = new Date();
      seguirALaActividad(cambiadas);
      const alto = window.scrollY;
      dibujar();
      window.scrollTo?.(0, alto);
      resaltar(cambiadas);
    } catch (error) {
      console.error('No se pudo actualizar la vista en vivo', error); // el próximo aviso lo vuelve a intentar
    }
  }

  /** Empieza a escuchar los cambios del ciclo; devuelve la función para dejar de hacerlo. */
  function iniciarEnVivo() {
    let espera = null;
    const dejarDeEscuchar = repo.suscribirCiclo(vista.cicloId, () => {
      if (!vista.content.isConnected) {
        // la pantalla ya no está: no hace falta seguir escuchando
        clearTimeout(espera);
        dejarDeEscuchar();
        seguimientos.delete(vista.content);
        return;
      }
      clearTimeout(espera); // varios avisos seguidos se juntan en una sola recarga
      espera = setTimeout(refrescarDesdeLaBase, vista.esperaEnVivoMs);
    });
    return () => {
      clearTimeout(espera);
      dejarDeEscuchar();
    };
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
    if (vista.soloLectura) return;
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
    if (vista.soloLectura) return;
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
    if (vista.soloLectura) return;
    vista.sesiones = reabrirSesion(vista.sesiones, diaActual().id);
    dibujar();
    await guardarSesionYRegistro({ conRegistro: false });
  }

  return {
    dibujar,
    volver: () => vista.alVolver?.(),
    semana: (el) => {
      vista.w = Number(el.dataset.w);
      vista.d = 0;
      vista.seguir = false; // si el coach navega a mano, deja de acompañar al alumno
      dibujar();
      traerAlTope();
    },
    dia: (el) => {
      vista.d = Number(el.dataset.d);
      vista.seguir = false;
      dibujar();
      traerAlTope();
    },
    seguir: () => {
      vista.seguir = !vista.seguir;
      dibujar();
    },
    iniciarEnVivo,
    ejercicio: (el) => alternarEjercicio(el.dataset.e),
    ejerciciosTodos: () => alternarTodos(),
    serie: (el) =>
      anotarSerie(el.dataset.e, Number(el.dataset.n), {
        [el.dataset.campo]: 'tiempo' in el.dataset ? conUnidadDeTiempo(el.value) : el.value,
      }),
    check: (el) => alternarEstado(el, 'done'),
    omitir: (el) => alternarEstado(el, 'skipped'),
    terminar: terminarDia,
    noEntrene: noEntrenarDia,
    reabrir: reabrirDia,
    pdf: (el) => (vista.plan ? mostrarPdf(el.dataset.tipo, vista.plan, vista.alumno) : undefined),
  };
}

/** La instancia a la que pertenece el elemento tocado. */
const instanciaDe = (el) => instancias.get(el.closest('[data-plan-alumno]'));

registrarAcciones({
  alumnoVolver: (el) => instanciaDe(el)?.volver(),
  alumnoSemana: (el) => instanciaDe(el)?.semana(el),
  alumnoDia: (el) => instanciaDe(el)?.dia(el),
  alumnoSeguir: (el) => instanciaDe(el)?.seguir(),
  alumnoSerie: (el) => instanciaDe(el)?.serie(el),
  alumnoCheck: (el) => instanciaDe(el)?.check(el),
  alumnoOmitir: (el) => instanciaDe(el)?.omitir(el),
  alumnoEjercicio: (el) => instanciaDe(el)?.ejercicio(el),
  alumnoEjerciciosTodos: (el) => instanciaDe(el)?.ejerciciosTodos(),
  alumnoTerminar: (el) => instanciaDe(el)?.terminar(),
  alumnoNoEntrene: (el) => instanciaDe(el)?.noEntrene(),
  alumnoReabrir: (el) => instanciaDe(el)?.reabrir(),
  alumnoPdf: (el) => instanciaDe(el)?.pdf(el),
});
