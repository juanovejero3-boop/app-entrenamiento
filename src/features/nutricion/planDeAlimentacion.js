// El plan de alimentación tal como lo ve el alumno: sus objetivos del día, las comidas por horario (plegables), con
// sus opciones y los alimentos con la cantidad bien clara, y las aclaraciones del coach. Es solo para mirar.
// El coach abre la misma pantalla desde la ficha del alumno, en modo lectura: ve exactamente lo mismo.
import { registrarAcciones } from '../../lib/acciones.js';
import { escapeAttr as esc } from '../../lib/dom.js';
import { nombreDelAlumno } from '../coaching/pdf/alumno.js';
import { cantidadParaMostrar, macrosDeItem, macrosDeOpcion, ordenadasPorHora } from './comidas.js';
import { calcularObjetivos } from './objetivos.js';
import { mostrarPdfAlimentacion } from './mostrarPdf.js';
import { repoNutricion } from './repoLocal.js';

/** ¿El alumno ya tiene algo cargado en su plan de alimentación? (si no, no hay nada para mostrarle) */
export function tienePlanDeAlimentacion(repo, alumnoId) {
  const plan = alumnoId ? repo.cargarPlan(alumnoId) : null;
  return Boolean(plan?.comidas.some((c) => opcionesConAlimentos(c).length));
}

/** Qué hacer al tocar «Volver»; lo define quien abre la pantalla. */
let alVolverActual = null;
/** Baja en PDF el plan que se está mirando; null si no hay nada para bajar. */
let pdfActual = null;

/**
 * Muestra el plan de alimentación del alumno dentro de `content`.
 * @param {HTMLElement} content
 * @param {{ id: string, name?: string, email?: string }} alumno
 * @param {{ repo?: typeof repoNutricion, alVolver: () => void, soloLectura?: boolean }} opciones
 *   soloLectura: lo mira el coach (muestra un cartel con el nombre del alumno); el contenido es el mismo
 */
export function abrirPlanDeAlimentacion(
  content,
  alumno,
  { repo = repoNutricion, alVolver, soloLectura = false, pdf = mostrarPdfAlimentacion },
) {
  alVolverActual = alVolver;
  const plan = repo.cargarPlan(alumno.id);
  // Solo las comidas que tienen algo cargado, en orden de horario
  const comidas = plan ? ordenadasPorHora(plan.comidas).filter((c) => opcionesConAlimentos(c).length) : [];
  const nombre = nombreDelAlumno(alumno);
  pdfActual = comidas.length ? () => pdf(plan, alumno) : null;

  content.innerHTML = `
    <div class="space-y-4 pb-24">
      <div class="flex items-center gap-3">
        <button data-click="alimentacionVolver" class="w-10 h-10 shrink-0 inline-flex items-center justify-center text-gray-400 hover:text-neonRed" title="Volver" aria-label="Volver">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <h2 class="flex-1 min-w-0 text-lg font-black text-white uppercase tracking-wide">${soloLectura ? `Plan de alimentación de ${esc(nombre)}` : 'Mi plan de alimentación'}</h2>
        ${comidas.length ? `<button data-click="alimentacionPdf" class="shrink-0 min-h-10 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider border border-gray-700 text-gray-300 hover:text-neonRed hover:border-neonRed transition"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>` : ''}
      </div>
      ${soloLectura ? `<p data-modo-lectura class="bg-sky-950/40 border border-sky-800 rounded-xl p-3 text-xs text-sky-200"><i class="fa-solid fa-eye mr-1"></i><b class="uppercase tracking-wide">Modo lectura</b> · así lo ve ${esc(nombre)}.</p>` : ''}
      ${comidas.length ? dibujarPlan(plan, comidas) : dibujarVacio(soloLectura)}
    </div>
  `;
}

const opcionesConAlimentos = (comida) =>
  comida.opciones.map((opcion, i) => ({ opcion, numero: i + 1 })).filter(({ opcion }) => opcion.items.length);

const resumen = (m) =>
  `${Math.round(m.kcal)} kcal · P ${Math.round(m.p)} · C ${Math.round(m.c)} · G ${Math.round(m.f)}`;

function dibujarVacio(soloLectura) {
  return `<div class="bg-cyberCard p-6 rounded-xl border border-gray-800 text-center text-sm text-gray-400 space-y-1">
      <i class="fa-solid fa-utensils text-2xl text-neonRed mb-2 block"></i>
      ${
        soloLectura
          ? 'Este alumno todavía no tiene un plan de alimentación.<p class="text-[11px] text-gray-500">Armalo en Nutrición › Alumnos.</p>'
          : 'Todavía no tenés un plan de alimentación. Tu entrenador te lo va a cargar acá.'
      }
    </div>`;
}

function dibujarPlan(plan, comidas) {
  return `
    ${dibujarObjetivos(plan.parametros)}
    <div class="space-y-3">${comidas.map(dibujarComida).join('')}</div>
    ${plan.notas.trim() ? dibujarAclaraciones(plan.notas) : ''}`;
}

function dibujarObjetivos(parametros) {
  const objetivos = calcularObjetivos(parametros);
  if (!objetivos) return ''; // faltan datos para calcular: no se muestran números a medias
  const caja = (clave, nombre, valor, unidad, color) => `
    <div data-objetivo="${clave}" class="bg-cyberCard rounded-xl border border-gray-800 p-3 text-center">
      <p class="text-[10px] uppercase font-bold ${color}">${nombre}</p>
      <p class="text-xl font-black text-white">${valor} <span class="text-xs text-gray-400">${unidad}</span></p>
    </div>`;
  return `
    <div>
      <p class="text-[10px] text-gray-400 uppercase font-bold mb-2">Tu objetivo del día</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${caja('kcal', 'Calorías', objetivos.kcal, 'kcal', 'text-amber-300')}
        ${caja('p', 'Proteína', objetivos.p, 'g', 'text-sky-300')}
        ${caja('c', 'Carbohidratos', objetivos.c, 'g', 'text-emerald-300')}
        ${caja('f', 'Grasas', objetivos.f, 'g', 'text-orange-300')}
      </div>
    </div>`;
}

const claseTarjeta = 'bg-cyberCard rounded-xl border border-gray-800 overflow-hidden';
const claseEncabezado = 'w-full flex items-center gap-3 px-4 py-3 min-h-14 text-left';

function dibujarComida(comida) {
  const opciones = opcionesConAlimentos(comida);
  const id = esc(comida.id);
  const pestanas =
    opciones.length > 1
      ? `<div role="tablist" class="flex gap-2">${opciones
          .map(
            ({ opcion, numero }, i) =>
              `<button role="tab" data-click="alimentacionOpcion" data-comida="${id}" data-opcion="${esc(opcion.id)}" aria-selected="${i === 0}" class="${clasePestana(i === 0)}">Opción ${numero}</button>`,
          )
          .join('')}</div>`
      : '';
  return `
    <section data-comida-alumno="${id}" class="${claseTarjeta}">
      <button data-click="alimentacionToggle" aria-expanded="false" class="${claseEncabezado}">
        <div class="flex-1 min-w-0">
          <h3 data-comida-nombre class="font-bold text-white text-base truncate">${esc(comida.nombre)}</h3>
          <p class="text-[11px] text-gray-400">${comida.hora ? `<span class="text-neonRed font-bold">${esc(comida.hora)}</span> · ` : ''}${resumen(macrosDeOpcion(opciones[0].opcion))}</p>
        </div>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform"></i>
      </button>
      <div data-comida-cuerpo hidden class="p-4 space-y-3 border-t border-gray-800">
        ${pestanas}
        ${opciones.map(({ opcion }, i) => dibujarOpcion(opcion, i === 0)).join('')}
      </div>
    </section>`;
}

const clasePestana = (activa) =>
  `flex-1 min-h-10 rounded-lg text-xs font-bold uppercase tracking-wider border transition ${activa ? 'bg-neonRed text-white border-neonRed' : 'text-gray-300 border-gray-700 hover:border-neonRed'}`;

function dibujarOpcion(opcion, visible) {
  return `
    <div data-opcion-panel="${esc(opcion.id)}" ${visible ? '' : 'hidden'} class="space-y-1">
      <p class="text-[11px] text-gray-400">${resumen(macrosDeOpcion(opcion))}</p>
      <div class="divide-y divide-gray-800">${opcion.items.map(dibujarAlimento).join('')}</div>
    </div>`;
}

function dibujarAlimento(item) {
  const m = macrosDeItem(item);
  return `
    <div data-alimento-fila class="flex items-center gap-3 py-3">
      <div class="flex-1 min-w-0">
        <p data-alimento-nombre class="text-sm font-bold text-white break-words">${esc(item.nombre)}</p>
        <p data-alimento-macros class="text-[11px] text-gray-400">P ${Math.round(m.p)} g · C ${Math.round(m.c)} g · G ${Math.round(m.f)} g</p>
      </div>
      <div data-alimento-cantidad class="shrink-0 max-w-[45%] px-3 py-2 rounded-lg bg-cyberDark border border-gray-700 text-base font-black text-neonRed text-center">${esc(cantidadParaMostrar(item.porcion, item.porciones))}</div>
    </div>`;
}

function dibujarAclaraciones(notas) {
  return `
    <section data-aclaraciones class="${claseTarjeta}">
      <button data-click="alimentacionToggle" aria-expanded="false" class="${claseEncabezado}">
        <h3 class="flex-1 font-bold text-neonRed uppercase tracking-wide text-sm">Aclaraciones</h3>
        <i data-chevron class="fa-solid fa-chevron-down text-gray-400 transition-transform"></i>
      </button>
      <div data-comida-cuerpo hidden class="p-4 text-sm text-gray-200 whitespace-pre-line break-words border-t border-gray-800">${esc(notas)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Acciones (solo abren y cierran lo que ya está dibujado: no hay nada para editar)
// ---------------------------------------------------------------------------

function alternar(boton) {
  const seccion = boton.closest('section');
  const cuerpo = seccion.querySelector('[data-comida-cuerpo]');
  const abrir = cuerpo.hidden;
  cuerpo.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  seccion.querySelector('[data-chevron]').classList.toggle('rotate-180', abrir);
}

/** Muestra los alimentos de la opción elegida de una comida y oculta los de las otras. */
function elegirOpcion(boton) {
  const seccion = boton.closest('section');
  for (const panel of seccion.querySelectorAll('[data-opcion-panel]')) {
    panel.hidden = panel.dataset.opcionPanel !== boton.dataset.opcion;
  }
  for (const pestana of seccion.querySelectorAll('[data-click="alimentacionOpcion"]')) {
    const activa = pestana === boton;
    pestana.setAttribute('aria-selected', String(activa));
    pestana.className = clasePestana(activa);
  }
}

registrarAcciones({
  alimentacionVolver: () => alVolverActual?.(),
  alimentacionPdf: () => pdfActual?.(),
  alimentacionToggle: (el) => alternar(el),
  alimentacionOpcion: (el) => elegirOpcion(el),
});
