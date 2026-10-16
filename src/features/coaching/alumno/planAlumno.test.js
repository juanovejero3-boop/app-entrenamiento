import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js'; // modales propios (alert/confirm) que usa mostrarPdf al fallar
import { generarPdfBlob } from '../pdf/generar.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { repo } from '../repo/index.js';
import { abrirPlanAlumno } from './planAlumno.js';

// Solo se reemplaza el motor de PDF y el dibujo de las páginas (pdfmake y pdf.js necesitan el
// navegador real); el documento que se genera se arma con el código real.
vi.mock('../pdf/generar.js', () => ({
  generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
}));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

let content;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
});
afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.mocked(generarPdfBlob).mockClear();
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const esperar = () => new Promise((r) => setTimeout(r, 0));
const SEMANA_1 = '2026-10-20'; // el plan de prueba arranca el lunes 19/10/2026
const SEMANA_2 = '2026-10-27';

async function guardarPlan(plan = planCompleto()) {
  await repo.guardarPlanEntrenamiento(ALUMNO.id, plan);
}
const abrir = (opciones = {}) => abrirPlanAlumno(content, ALUMNO, { hoy: SEMANA_1, ...opciones });

/** Simula escribir un valor y salir del campo. */
function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const campo = (ejercicio, serie, nombre) =>
  $(`[data-change="alumnoSerie"][data-e="${ejercicio}"][data-n="${serie}"][data-campo="${nombre}"]`);
const check = (ejercicio, serie) => $(`[data-click="alumnoCheck"][data-e="${ejercicio}"][data-n="${serie}"]`);

describe('vista del alumno: sin plan', () => {
  it('el alumno ve que su entrenador todavía no cargó el plan', async () => {
    await abrir();
    expect(content.textContent).toContain('todavía no cargó tu plan');
    expect($('[data-click="alumnoSemana"]')).toBeNull();
  });

  it('un plan sin semanas cuenta como sin plan', async () => {
    await guardarPlan({ ...planCompleto(), weeks: [] });
    await abrir();
    expect(content.textContent).toContain('todavía no cargó tu plan');
  });

  it('en modo lectura el coach ve que ese alumno no tiene plan', async () => {
    await abrir({ soloLectura: true });
    expect(content.textContent).toContain('todavía no tiene un plan');
  });
});

describe('vista del alumno: el plan', () => {
  beforeEach(() => guardarPlan());

  it('muestra el macrociclo con sus fechas y duración', async () => {
    await abrir();
    expect(content.textContent).toContain('Hipertrofia base');
    expect(content.textContent).toContain('19/10/2026');
    expect(content.textContent).toContain('01/11/2026');
    expect(content.textContent).toContain('2 semanas');
  });

  it('abre en la semana que corresponde a hoy y la marca como actual', async () => {
    await abrir({ hoy: SEMANA_2 });
    const chips = $$('[data-click="alumnoSemana"]');
    expect(chips.map((c) => c.getAttribute('aria-current'))).toEqual([null, 'true']);
    expect(content.textContent).toContain('Sin días cargados');
  });

  it('en la primera semana muestra su fase, volumen objetivo y días', async () => {
    await abrir();
    expect(content.textContent).toContain('Acumulación');
    expect(content.textContent).toContain('Pecho 12s, Espalda 14s');
    expect($$('[data-click="alumnoDia"]').map((d) => d.textContent.trim())).toEqual([
      'Lunes - Torso',
      'Jueves - Pierna',
    ]);
  });

  it('cambiar de semana y de día muestra su contenido', async () => {
    await abrir();
    expect($('[data-ejercicio="e1"]')).not.toBeNull();

    $('[data-click="alumnoDia"][data-d="1"]').click();
    expect($('[data-ejercicio]')).toBeNull();
    expect(content.textContent).toContain('Sin ejercicios cargados');

    $('[data-click="alumnoSemana"][data-w="1"]').click();
    expect(content.textContent).toContain('Sin días cargados');

    $('[data-click="alumnoSemana"][data-w="0"]').click();
    expect($('[data-ejercicio="e1"]')).not.toBeNull(); // vuelve al primer día de esa semana
    expect($('[data-click="alumnoDia"][data-d="0"]').getAttribute('aria-current')).toBe('true');
  });

  it('cada ejercicio muestra series, reps, intensidad, descanso, técnica y notas', async () => {
    await abrir();
    const press = $('[data-ejercicio="e1"]').textContent;
    expect(press).toContain('Press banca');
    expect(press).toContain('8-10');
    expect(press).toContain('RIR 2');
    expect(press).toContain('2 min');
    const fondos = $('[data-ejercicio="e3"]').textContent;
    expect(fondos).toContain('Rest-Pause');
    expect(fondos).toContain('Pausa abajo');
  });

  it('las superseries se muestran con A1, A2 y el ejercicio suelto sin etiqueta', async () => {
    await abrir();
    expect($('[data-ejercicio="e1"] [data-etiqueta]').textContent.trim()).toBe('A1');
    expect($('[data-ejercicio="e2"] [data-etiqueta]').textContent.trim()).toBe('A2');
    expect($('[data-ejercicio="e3"] [data-etiqueta]')).toBeNull();
  });

  it('muestra el tipo de cada bloque', async () => {
    await abrir();
    expect(content.textContent).toContain('Fuerza Máxima');
  });

  it('muestra lo que escribió el entrenador como texto, sin interpretar HTML', async () => {
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[0].name = '<img src=x onerror="window.__xss=1"> Press';
    plan.weeks[0].days[0].blocks[0].exercises[0].notes = '<b>fuerte</b>';
    await guardarPlan(plan);
    await abrir();
    expect(content.querySelector('img')).toBeNull();
    expect(content.querySelector('b')).toBeNull();
    expect($('[data-ejercicio="e1"]').textContent).toContain('<b>fuerte</b>');
  });
});

describe('vista del alumno: registro de series', () => {
  beforeEach(() => guardarPlan());

  it('cada ejercicio tiene una fila por serie', async () => {
    await abrir();
    expect($$('[data-ejercicio="e1"] [data-serie]')).toHaveLength(4); // Press banca: 4 series
    expect($$('[data-ejercicio="e3"] [data-serie]')).toHaveLength(3); // Fondos: 3 series
  });

  it('las reps objetivo aparecen como ayuda en el campo de reps', async () => {
    await abrir();
    expect(campo('e1', 1, 'reps').getAttribute('placeholder')).toBe('8-10');
  });

  it('lo que anota se guarda en el registro del alumno y está al volver a abrir', async () => {
    await abrir();
    escribir(campo('e1', 1, 'kg'), '80');
    escribir(campo('e1', 1, 'reps'), '9');
    await esperar();

    expect((await repo.cargarRegistro(ALUMNO.id)).e1[1]).toEqual({ kg: '80', reps: '9', done: false, skipped: false });

    await abrir();
    expect(campo('e1', 1, 'kg').value).toBe('80');
    expect(campo('e1', 1, 'reps').value).toBe('9');
  });

  it('marcar la serie como hecha se guarda, se ve marcada y actualiza el progreso del día', async () => {
    await abrir();
    expect($('[data-progreso]').textContent).toContain('0 / 11');

    check('e1', 1).click();
    await esperar();
    check('e2', 3).click();
    await esperar();

    expect(check('e1', 1).getAttribute('aria-pressed')).toBe('true');
    expect(check('e1', 2).getAttribute('aria-pressed')).toBe('false');
    expect($('[data-progreso]').textContent).toContain('2 / 11');
    const registro = await repo.cargarRegistro(ALUMNO.id);
    expect(registro.e1[1].done).toBe(true);
    expect(registro.e2[3].done).toBe(true);

    check('e1', 1).click(); // se puede desmarcar
    await esperar();
    expect($('[data-progreso]').textContent).toContain('1 / 11');
  });

  it('anotar no redibuja la pantalla (no se pierde el foco al pasar de campo)', async () => {
    await abrir();
    const kg = campo('e1', 1, 'kg');
    escribir(kg, '80');
    await esperar();
    check('e1', 2).click();
    await esperar();
    expect(campo('e1', 1, 'kg')).toBe(kg);
  });

  it('el progreso es por día', async () => {
    await abrir();
    check('e1', 1).click();
    await esperar();
    $('[data-click="alumnoDia"][data-d="1"]').click();
    expect($('[data-progreso]')).toBeNull(); // un día sin ejercicios no tiene progreso
  });

  it('si no se puede guardar avisa en lugar de perder el dato en silencio', async () => {
    await abrir();
    vi.spyOn(repo, 'guardarRegistro').mockRejectedValueOnce(new Error('Quota exceeded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    escribir(campo('e1', 1, 'kg'), '80');
    await esperar();

    expect(document.body.textContent).toContain('No se pudo guardar');
  });
});

describe('modo lectura del coach', () => {
  beforeEach(() => guardarPlan());

  it('muestra el aviso, el botón Volver y no deja anotar', async () => {
    const alVolver = vi.fn();
    await abrir({ soloLectura: true, alVolver });

    expect(content.textContent).toContain('Modo lectura');
    expect($$('[data-change="alumnoSerie"]').every((i) => i.disabled)).toBe(true);
    expect($$('[data-click="alumnoCheck"]').every((b) => b.disabled)).toBe(true);

    $('[data-click="alumnoVolver"]').click();
    expect(alVolver).toHaveBeenCalledTimes(1);
  });

  it('muestra lo que el alumno ya anotó, sin poder cambiarlo', async () => {
    await repo.guardarRegistro(ALUMNO.id, { e1: { 1: { kg: '82.5', reps: '8', done: true } } });
    await abrir({ soloLectura: true });

    expect(campo('e1', 1, 'kg').value).toBe('82.5');
    expect(check('e1', 1).getAttribute('aria-pressed')).toBe('true');
    expect($('[data-progreso]').textContent).toContain('1 / 11');
  });

  it('un clic en el check no cambia el registro', async () => {
    await abrir({ soloLectura: true });
    check('e1', 1).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await esperar();
    expect(await repo.cargarRegistro(ALUMNO.id)).toEqual({});
  });

  it('aunque alguien le saque el disabled a un campo, en modo lectura no se guarda', async () => {
    await abrir({ soloLectura: true });
    campo('e1', 1, 'kg').disabled = false; // como desde las herramientas del navegador
    escribir(campo('e1', 1, 'kg'), '99');
    await esperar();
    expect(await repo.cargarRegistro(ALUMNO.id)).toEqual({});
  });

  it('la vista del alumno logueado no tiene aviso de lectura ni botón Volver', async () => {
    await abrir();
    expect(content.textContent).not.toContain('Modo lectura');
    expect($('[data-click="alumnoVolver"]')).toBeNull();
    expect($$('[data-change="alumnoSerie"]').some((i) => i.disabled)).toBe(false);
  });
});

describe('vista del alumno: PDF', () => {
  beforeEach(() => guardarPlan());

  it('el alumno puede ver el plan completo y los lineamientos en PDF', async () => {
    await abrir();

    $('[data-click="alumnoPdf"][data-tipo="entrenamiento"]').click();
    await esperar();
    expect(document.getElementById('pdf-vista-previa').textContent).toContain('PDF del entrenamiento');
    document.querySelector('#pdf-vista-previa [data-click="vistaPreviaCerrar"]').click();

    $('[data-click="alumnoPdf"][data-tipo="lineamientos"]').click();
    await esperar();
    expect(document.getElementById('pdf-vista-previa').textContent).toContain('PDF de lineamientos');
    expect(generarPdfBlob).toHaveBeenCalledTimes(2);
  });

  it('sin lineamientos cargados no ofrece el PDF de lineamientos', async () => {
    const plan = planCompleto();
    plan.report = { objective: '', priorities: [], focus: '', evaluation: '', guidelines: '' };
    await guardarPlan(plan);
    await abrir();
    expect($('[data-click="alumnoPdf"][data-tipo="lineamientos"]')).toBeNull();
    expect($('[data-click="alumnoPdf"][data-tipo="entrenamiento"]')).not.toBeNull();
  });
});

describe('vista del alumno: video de demostración', () => {
  it('ofrece "Demo" solo para los ejercicios que están en la base de ejercicios con video', async () => {
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[0].name = '  02 paused air squat '; // sin importar mayúsculas ni espacios
    await guardarPlan(plan);
    await abrir();

    const demo = $('[data-ejercicio="e1"] [data-click="materialAbrirLink"]');
    expect(demo.dataset.link).toBe('https://www.youtube.com/watch?v=lnMehhkv56Y');
    expect(demo.dataset.nombre).toBe('  02 paused air squat '.trim());
    expect($('[data-ejercicio="e2"] [data-click="materialAbrirLink"]')).toBeNull(); // "Remo con barra"
  });
});

describe('vista del alumno: series con rango y series omitidas', () => {
  beforeEach(() => guardarPlan());
  const omitir = (ejercicio, serie) => $(`[data-click="alumnoOmitir"][data-e="${ejercicio}"][data-n="${serie}"]`);

  it('un ejercicio con rango de series (3-4) muestra una fila por cada serie hasta el máximo', async () => {
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[0].sets = '3-4';
    await guardarPlan(plan);
    await abrir();

    expect($$('[data-ejercicio="e1"] [data-serie]')).toHaveLength(4);
    expect($('[data-progreso]').textContent).toContain('0 / 11 series'); // 4 + 4 + 3
  });

  it('cada serie tiene un botón para marcarla como "no la hice", pendiente al principio', async () => {
    await abrir();
    expect($$('[data-click="alumnoOmitir"]')).toHaveLength(11);
    expect(omitir('e1', 1).getAttribute('aria-pressed')).toBe('false');
  });

  it('omitir una serie la marca, se guarda y el progreso cuenta las omitidas', async () => {
    await abrir();
    omitir('e1', 4).click();
    await esperar();

    expect(omitir('e1', 4).getAttribute('aria-pressed')).toBe('true');
    expect(check('e1', 4).getAttribute('aria-pressed')).toBe('false');
    expect((await repo.cargarRegistro(ALUMNO.id)).e1[4]).toMatchObject({ done: false, skipped: true });
    expect($('[data-progreso]').textContent).toContain('0 / 11 series · 1 omitida');

    omitir('e2', 4).click();
    await esperar();
    expect($('[data-progreso]').textContent).toContain('2 omitidas');
  });

  it('hecha y omitida se excluyen: marcar una desmarca la otra', async () => {
    await abrir();
    check('e1', 1).click();
    await esperar();
    omitir('e1', 1).click();
    await esperar();
    expect(check('e1', 1).getAttribute('aria-pressed')).toBe('false');
    expect(omitir('e1', 1).getAttribute('aria-pressed')).toBe('true');
    expect($('[data-progreso]').textContent).toContain('0 / 11 series · 1 omitida');

    check('e1', 1).click();
    await esperar();
    expect(omitir('e1', 1).getAttribute('aria-pressed')).toBe('false');
    expect(check('e1', 1).getAttribute('aria-pressed')).toBe('true');
    expect($('[data-progreso]').textContent).toBe('1 / 11 series');
  });

  it('tocar de nuevo "no la hice" la devuelve a pendiente', async () => {
    await abrir();
    omitir('e1', 1).click();
    await esperar();
    omitir('e1', 1).click();
    await esperar();
    expect(omitir('e1', 1).getAttribute('aria-pressed')).toBe('false');
    expect((await repo.cargarRegistro(ALUMNO.id)).e1[1].skipped).toBe(false);
    expect($('[data-progreso]').textContent).toBe('0 / 11 series');
  });

  it('lo omitido se ve al volver a abrir y no redibuja la pantalla al marcarlo', async () => {
    await abrir();
    const kg = campo('e1', 1, 'kg');
    omitir('e1', 2).click();
    await esperar();
    expect(campo('e1', 1, 'kg')).toBe(kg);

    await abrir();
    expect(omitir('e1', 2).getAttribute('aria-pressed')).toBe('true');
  });

  it('en modo lectura se ve lo omitido pero no se puede cambiar', async () => {
    await repo.guardarRegistro(ALUMNO.id, { e1: { 1: { kg: '', reps: '', done: false, skipped: true } } });
    await abrir({ soloLectura: true });

    expect(omitir('e1', 1).getAttribute('aria-pressed')).toBe('true');
    expect($$('[data-click="alumnoOmitir"]').every((b) => b.disabled)).toBe(true);

    omitir('e1', 1).disabled = false; // como desde las herramientas del navegador
    omitir('e1', 1).click();
    await esperar();
    expect((await repo.cargarRegistro(ALUMNO.id)).e1[1].skipped).toBe(true); // sigue igual
  });
});

describe('vista del alumno: botón Volver', () => {
  beforeEach(() => guardarPlan());

  it('con alVolver pero sin modo lectura muestra Volver y no el aviso de lectura (es el plan propio)', async () => {
    const alVolver = vi.fn();
    await abrir({ alVolver });

    expect(content.textContent).not.toContain('Modo lectura');
    $('[data-click="alumnoVolver"]').click();
    expect(alVolver).toHaveBeenCalledTimes(1);
    expect($$('[data-change="alumnoSerie"]').some((i) => i.disabled)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Terminar sesión
// ---------------------------------------------------------------------------

/** Responde el modal de confirmación de la app (Confirmar / Cancelar) y devuelve su texto. */
async function responderConfirmacion(acepta) {
  const modal = document.getElementById('app-modal-overlay-aux');
  const texto = modal.textContent;
  modal.querySelector(`[data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await esperar();
  return texto;
}
const textoDelAviso = () => document.getElementById('app-modal-overlay-aux')?.textContent ?? '';

/** El primer día con un solo ejercicio de 1 serie (para terminarlo sin series pendientes). */
function planDeUnaSerie() {
  const plan = planCompleto();
  plan.weeks[0].days[0].blocks[0].exercises = [{ ...plan.weeks[0].days[0].blocks[0].exercises[0], sets: '1' }];
  return plan;
}
const fechaDeSesion = () => $('[data-fecha-sesion]');
const terminar = async () => {
  $('[data-click="alumnoTerminar"]').click();
  await esperar();
};
const barra = () => ({
  hechas: $('[data-progreso-barra]').style.width,
  omitidas: $('[data-progreso-omitidas]').style.width,
});

describe('vista del alumno: terminar sesión', () => {
  beforeEach(() => guardarPlan());

  it('cada día con ejercicios tiene un botón "Terminar sesión" y una fecha que arranca en hoy', async () => {
    await abrir();
    expect($('[data-click="alumnoTerminar"]').textContent).toContain('Terminar sesión');
    expect(fechaDeSesion().value).toBe(SEMANA_1);
    expect(fechaDeSesion().max).toBe(SEMANA_1); // no deja elegir una fecha futura
  });

  it('un día sin ejercicios no tiene botón para terminar', async () => {
    await abrir();
    $('[data-click="alumnoDia"][data-d="1"]').click();
    expect($('[data-click="alumnoTerminar"]')).toBeNull();
  });

  it('sin series pendientes termina directo: guarda el día con su fecha y lo muestra terminado', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();

    await terminar();

    expect(document.getElementById('app-modal-overlay-aux')).toBeNull(); // no pidió confirmación
    const sesion = (await repo.cargarSesiones(ALUMNO.id)).d1;
    expect(sesion.fecha).toBe(SEMANA_1);
    expect(sesion.terminadaEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect($('[data-sesion-terminada]').textContent).toContain('20/10/2026');
    expect($('[data-click="alumnoTerminar"]')).toBeNull();
  });

  it('con series sin marcar pide confirmación; si se cancela no cambia nada', async () => {
    await abrir();
    check('e1', 1).click();
    await esperar();

    await terminar();
    const pregunta = await responderConfirmacion(false);

    expect(pregunta).toContain('Quedan 10 series sin marcar');
    expect(pregunta).toContain('omitidas');
    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    expect($('[data-progreso]').textContent).toBe('1 / 11 series');
  });

  it('si se confirma, las pendientes pasan a omitidas y la sesión queda terminada', async () => {
    await abrir();
    check('e1', 1).click();
    await esperar();

    await terminar();
    await responderConfirmacion(true);

    const registro = await repo.cargarRegistro(ALUMNO.id);
    expect(registro.e1[1]).toMatchObject({ done: true, skipped: false }); // lo hecho sigue hecho
    expect(registro.e1[2]).toMatchObject({ done: false, skipped: true });
    expect(registro.e3[3]).toMatchObject({ skipped: true });
    expect($('[data-progreso]').textContent).toBe('1 / 11 series · 10 omitidas');
    expect((await repo.cargarSesiones(ALUMNO.id)).d1.fecha).toBe(SEMANA_1);
  });

  it('la fecha se puede cambiar a un día anterior', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();

    fechaDeSesion().value = '2026-10-18';
    await terminar();

    expect((await repo.cargarSesiones(ALUMNO.id)).d1.fecha).toBe('2026-10-18');
    expect($('[data-sesion-terminada]').textContent).toContain('18/10/2026');
  });

  it('no deja terminar con una fecha futura ni sin fecha', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();

    fechaDeSesion().value = '2026-10-21'; // mañana
    await terminar();
    expect(textoDelAviso()).toContain('no puede ser futura');
    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    document.querySelector('#app-modal-overlay-aux [data-click="cerrarModalAux"]').click();

    fechaDeSesion().value = '';
    await terminar();
    expect(textoDelAviso()).toContain('Elegí la fecha');
    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
  });

  it('un día terminado queda bloqueado: no se puede anotar ni marcar series', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();
    await terminar();

    expect($$('[data-change="alumnoSerie"]').every((i) => i.disabled)).toBe(true);
    expect($$('[data-click="alumnoCheck"], [data-click="alumnoOmitir"]').every((b) => b.disabled)).toBe(true);

    campo('e1', 1, 'kg').disabled = false; // aunque le saquen el disabled desde las herramientas del navegador
    escribir(campo('e1', 1, 'kg'), '99');
    await esperar();
    expect((await repo.cargarRegistro(ALUMNO.id)).e1[1].kg).toBe('');
  });

  it('"Reabrir sesión" quita la sesión y deja volver a anotar', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();
    await terminar();

    $('[data-click="alumnoReabrir"]').click();
    await esperar();

    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    expect($('[data-sesion-terminada]')).toBeNull();
    expect($('[data-click="alumnoTerminar"]')).not.toBeNull();
    expect($$('[data-change="alumnoSerie"]').some((i) => i.disabled)).toBe(false);
    expect(check('e1', 1).getAttribute('aria-pressed')).toBe('true'); // lo anotado se conserva
  });

  it('el día terminado se marca en su chip y la semana cuenta los días hechos', async () => {
    const plan = planDeUnaSerie();
    plan.weeks[0].days[1].blocks = [
      { id: 'b9', type: 'fuerza', exercises: [{ id: 'e9', name: 'Peso muerto', sets: '1' }] },
    ];
    await guardarPlan(plan);
    await abrir();
    expect($('[data-click="alumnoDia"][data-d="0"]').dataset.hecho).toBeUndefined();
    expect($('[data-click="alumnoSemana"][data-w="0"]').textContent).not.toContain('días');

    check('e1', 1).click();
    await esperar();
    await terminar();

    expect($('[data-click="alumnoDia"][data-d="0"]').dataset.hecho).toBe('true');
    expect($('[data-click="alumnoDia"][data-d="1"]').dataset.hecho).toBeUndefined();
    expect($('[data-click="alumnoSemana"][data-w="0"]').textContent).toContain('1/2 días');
  });

  it('la sesión terminada sigue ahí al volver a abrir la vista', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();
    await terminar();

    await abrir();

    expect($('[data-sesion-terminada]').textContent).toContain('20/10/2026');
  });

  it('si no se puede guardar la sesión avisa en lugar de perderla en silencio', async () => {
    await guardarPlan(planDeUnaSerie());
    await abrir();
    check('e1', 1).click();
    await esperar();
    vi.spyOn(repo, 'guardarSesiones').mockRejectedValueOnce(new Error('Quota exceeded'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await terminar();
    await esperar();

    expect(document.body.textContent).toContain('No se pudo guardar');
  });
});

describe('vista del alumno: barra de progreso con omitidas en rojo', () => {
  beforeEach(() => guardarPlan());

  it('las hechas llenan la barra en verde y las omitidas en rojo, a continuación', async () => {
    await abrir();
    expect(barra()).toEqual({ hechas: '0%', omitidas: '0%' });

    check('e1', 1).click();
    await esperar();
    $('[data-click="alumnoOmitir"][data-e="e1"][data-n="2"]').click();
    await esperar();

    expect(barra()).toEqual({ hechas: '9%', omitidas: '9%' }); // 1 de 11 cada una
  });

  it('al terminar la sesión con pendientes, la barra queda completa (verde + rojo)', async () => {
    await abrir();
    check('e1', 1).click();
    await esperar();
    await terminar();
    await responderConfirmacion(true);

    expect(barra()).toEqual({ hechas: '9%', omitidas: '91%' });
  });

  it('las dos partes nunca pasan del 100 % por el redondeo', async () => {
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises = [{ ...plan.weeks[0].days[0].blocks[0].exercises[0], sets: '8' }];
    await guardarPlan(plan);
    await abrir();
    for (const n of [1, 2, 3]) check('e1', n).click(); // 3 de 8 = 37,5 -> 38 %
    for (const n of [4, 5, 6, 7, 8]) $(`[data-click="alumnoOmitir"][data-e="e1"][data-n="${n}"]`).click(); // 62,5 -> 63 %
    await esperar();

    const { hechas, omitidas } = barra();
    expect(parseInt(hechas) + parseInt(omitidas)).toBeLessThanOrEqual(100);
  });
});

describe('modo lectura del coach: sesiones', () => {
  beforeEach(() => guardarPlan());

  it('ve que el alumno terminó el día y cuándo, sin botones para cambiarlo', async () => {
    await repo.guardarSesiones(ALUMNO.id, { d1: { fecha: '2026-10-19', terminadaEn: '2026-10-19T20:00:00.000Z' } });
    await abrir({ soloLectura: true });

    expect($('[data-sesion-terminada]').textContent).toContain('19/10/2026');
    expect($('[data-click="alumnoReabrir"]')).toBeNull();
    expect($('[data-click="alumnoTerminar"]')).toBeNull();
    expect($('[data-fecha-sesion]')).toBeNull();
    expect($('[data-click="alumnoDia"][data-d="0"]').dataset.hecho).toBe('true');
  });

  it('si el día no se terminó lo dice, sin botón para terminarlo', async () => {
    await abrir({ soloLectura: true });
    expect($('[data-sin-terminar]').textContent).toContain('Sesión sin terminar');
    expect($('[data-click="alumnoTerminar"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Día no entrenado
// ---------------------------------------------------------------------------

const noEntrene = async () => {
  $('[data-click="alumnoNoEntrene"]').click();
  await esperar();
};

describe('vista del alumno: día no entrenado', () => {
  beforeEach(() => guardarPlan());

  it('al lado de "Terminar sesión" hay un botón "No entrené este día" que usa la misma fecha', async () => {
    await abrir();
    expect($('[data-click="alumnoNoEntrene"]').textContent).toContain('No entrené este día');
    expect(fechaDeSesion().value).toBe(SEMANA_1);
  });

  it('pide confirmación; si se cancela no cambia nada', async () => {
    await abrir();
    await noEntrene();
    const pregunta = await responderConfirmacion(false);

    expect(pregunta).toContain('11 series');
    expect(pregunta).toContain('omitidas');
    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    expect($('[data-progreso]').textContent).toBe('0 / 11 series');
  });

  it('si se confirma guarda el día como no entrenado, con la fecha elegida, y omite todas las series', async () => {
    await abrir();
    fechaDeSesion().value = '2026-10-18';
    await noEntrene();
    await responderConfirmacion(true);

    const sesion = (await repo.cargarSesiones(ALUMNO.id)).d1;
    expect(sesion).toMatchObject({ fecha: '2026-10-18', estado: 'omitida' });
    const registro = await repo.cargarRegistro(ALUMNO.id);
    expect(registro.e1[1]).toMatchObject({ skipped: true, done: false });
    expect(registro.e3[3]).toMatchObject({ skipped: true });
    expect(barra()).toEqual({ hechas: '0%', omitidas: '100%' });
    expect($('[data-sesion-terminada]')).toBeNull();
    expect($('[data-dia-no-entrenado]').textContent).toContain('18/10/2026');
  });

  it('no deja marcar el día con una fecha futura ni sin fecha', async () => {
    await abrir();
    fechaDeSesion().value = '2026-10-21';
    await noEntrene();
    expect(textoDelAviso()).toContain('no puede ser futura');
    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    document.querySelector('#app-modal-overlay-aux [data-click="cerrarModalAux"]').click();

    fechaDeSesion().value = '';
    await noEntrene();
    expect(textoDelAviso()).toContain('Elegí la fecha');
  });

  it('el día queda bloqueado y su chip lleva una marca propia (no la de día hecho)', async () => {
    await abrir();
    await noEntrene();
    await responderConfirmacion(true);

    expect($$('[data-change="alumnoSerie"]').every((i) => i.disabled)).toBe(true);
    expect($('[data-click="alumnoTerminar"]')).toBeNull();
    expect($('[data-click="alumnoNoEntrene"]')).toBeNull();
    const chip = $('[data-click="alumnoDia"][data-d="0"]');
    expect(chip.dataset.hecho).toBeUndefined();
    expect(chip.dataset.noEntrenado).toBe('true');
  });

  it('"Reabrir" lo deja otra vez sin terminar', async () => {
    await abrir();
    await noEntrene();
    await responderConfirmacion(true);

    $('[data-click="alumnoReabrir"]').click();
    await esperar();

    expect(await repo.cargarSesiones(ALUMNO.id)).toEqual({});
    expect($('[data-dia-no-entrenado]')).toBeNull();
    expect($('[data-click="alumnoNoEntrene"]')).not.toBeNull();
    expect($('[data-click="alumnoDia"][data-d="0"]').dataset.noEntrenado).toBeUndefined();
  });

  it('el contador de la semana solo cuenta los días entrenados', async () => {
    const plan = planDeUnaSerie();
    plan.weeks[0].days[1].blocks = [
      { id: 'b9', type: 'fuerza', exercises: [{ id: 'e9', name: 'Peso muerto', sets: '1' }] },
    ];
    await guardarPlan(plan);
    await abrir();
    await noEntrene();
    await responderConfirmacion(true);
    expect($('[data-click="alumnoSemana"][data-w="0"]').textContent).not.toContain('días');

    $('[data-click="alumnoDia"][data-d="1"]').click();
    check('e9', 1).click();
    await esperar();
    await terminar();

    expect($('[data-click="alumnoSemana"][data-w="0"]').textContent).toContain('1/2 días');
  });

  it('el coach en modo lectura ve que no entrenó, sin botones', async () => {
    await repo.guardarSesiones(ALUMNO.id, {
      d1: { fecha: '2026-10-19', terminadaEn: '2026-10-19T20:00:00.000Z', estado: 'omitida' },
    });
    await abrir({ soloLectura: true });

    expect($('[data-dia-no-entrenado]').textContent).toContain('19/10/2026');
    expect($('[data-click="alumnoReabrir"]')).toBeNull();
    expect($('[data-click="alumnoNoEntrene"]')).toBeNull();
  });
});
