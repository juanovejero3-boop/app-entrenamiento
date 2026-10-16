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

    expect((await repo.cargarRegistro(ALUMNO.id)).e1[1]).toEqual({ kg: '80', reps: '9', done: false });

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
