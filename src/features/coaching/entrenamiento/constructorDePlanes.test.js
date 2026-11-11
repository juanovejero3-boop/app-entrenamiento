import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { abrirConstructorDePlanes } from './constructorDePlanes.js';
import { crearPlan, generarEstructura } from './plan.js';
import { llamarIA } from '../ia/gemini.js';
import { repo } from '../repo/index.js';
import { sembrarPlan, planActivoDe } from '../repo/test-utils.js';
import '../../../lib/ui.js'; // modales propios: window.confirm real de la app
import { textoDe } from '../pdf/test-utils.js';
import { generarPdfBlob } from '../pdf/generar.js';

// Solo se reemplaza el motor de PDF (pdfmake en el navegador): el documento que recibe se arma
// con el código real, y la vista previa y la descarga también son las reales.
vi.mock('../pdf/generar.js', () => ({
  generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' })),
}));
// La IA de verdad (Gemini, en el servidor) no se usa en los tests
vi.mock('../ia/gemini.js', () => ({ llamarIA: vi.fn() }));
// Las páginas de la vista previa las dibuja pdf.js con canvas, que el DOM simulado no tiene
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

const ALUMNO = { id: 'alumno-1', name: 'Ana Pérez', email: 'ana@ejemplo.com' };

let content;
let alVolver;

beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
  alVolver = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(generarPdfBlob).mockClear();
  vi.mocked(llamarIA).mockReset();
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const guardado = () => planActivoDe(ALUMNO.id);
/** Abre el constructor sobre el ciclo activo del alumno (si no tiene, crea uno vacío). */
async function abrir() {
  const cicloId = await sembrarPlan(
    ALUMNO.id,
    (await planActivoDe(ALUMNO.id)) ?? crearPlan({ fechaInicio: '2026-10-19' }),
  );
  return abrirConstructorDePlanes(content, ALUMNO, { cicloId, alVolver });
}

/** Simula que el usuario escribe un valor y sale del campo (evento change). */
function cambiar(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Espera a que terminen las acciones asíncronas (confirm, guardado). */
const esperar = () => new Promise((r) => setTimeout(r, 0));

/** Responde el modal de confirmación de la app (Confirmar / Cancelar). Devuelve su texto. */
async function responderConfirmacion(acepta) {
  const modal = document.getElementById('app-modal-overlay-aux');
  const texto = modal.textContent;
  modal.querySelector(`[data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await esperar();
  return texto;
}

/** Abre la semana `w` del mapa del macrociclo (las semanas son pestañas). */
const elegirSemana = async (w) => {
  $(`[data-click="semanaElegir"][data-w="${w}"]`).click();
  await esperar();
};

async function generar(semanas, dias) {
  $('#gen-semanas').value = String(semanas);
  $('#gen-dias').value = String(dias);
  $('[data-click="planGenerar"]').click();
  await esperar();
}

describe('constructor de planes: apertura', () => {
  it('muestra el alumno y, si el ciclo está vacío, invita a generar la estructura', async () => {
    await abrir();
    expect(content.textContent).toContain('Ana Pérez');
    expect(content.textContent).toContain('todavía no tiene semanas');
    expect($('[data-click="planGenerar"]')).not.toBeNull();
  });

  it('carga el plan guardado del alumno al abrir', async () => {
    await sembrarPlan(ALUMNO.id, {
      macroName: 'Fuerza base',
      startDate: '2026-10-19',
      weeks: [{ name: 'Semana 1', days: [{ name: 'Lunes' }] }],
    });

    await abrir();

    expect($('[data-campo="macroName"]').value).toBe('Fuerza base');
    expect($('[data-change="diaCampo"]').value).toBe('Lunes');
  });

  it('"Volver" avisa a quien abrió el constructor', async () => {
    await abrir();
    $('[data-click="constructorDePlanesVolver"]').click();
    expect(alVolver).toHaveBeenCalledTimes(1);
  });
});

describe('constructor de planes: datos del macrociclo', () => {
  it('nombre, fecha, foco y evaluación se guardan al editarlos', async () => {
    await abrir();
    await generar(1, 1);

    cambiar($('[data-campo="macroName"]'), 'Bloque de fuerza');
    cambiar($('[data-campo="startDate"]'), '2026-11-02');
    cambiar($('[data-campo="focus"]'), 'Estabilidad de rodilla');
    cambiar($('[data-campo="evaluation"]'), 'Test de 5RM');
    await esperar();

    expect(await guardado()).toMatchObject({
      macroName: 'Bloque de fuerza',
      startDate: '2026-11-02',
      report: { focus: 'Estabilidad de rodilla', evaluation: 'Test de 5RM' },
    });
  });

  it('cambiar la fecha de inicio actualiza las fechas del mapa de semanas', async () => {
    await abrir();
    await generar(2, 1);

    cambiar($('[data-campo="startDate"]'), '2026-11-02');
    await esperar();

    expect($('[data-resumen-semana="1"]').textContent).toContain('09/11 - 15/11');
  });

  it('muestra lo que escribe el entrenador como texto, sin interpretar HTML', async () => {
    await abrir();
    await generar(1, 1);

    cambiar($('[data-campo="macroName"]'), '<img src=x onerror="window.__xss=1">');
    cambiar($('[data-change="semanaCampo"][data-campo="name"]'), '<b>Semana</b>');
    await esperar();
    await abrir(); // se vuelve a dibujar desde lo guardado

    expect(content.querySelector('img')).toBeNull();
    expect(content.querySelector('b')).toBeNull();
    expect($('[data-resumen-semana="0"]').textContent).toContain('<b>Semana</b>');
  });
});

describe('constructor de planes: generar estructura', () => {
  it('genera N semanas de M días, las muestra y las guarda', async () => {
    await abrir();
    await generar(3, 2);

    expect($$('[data-resumen-semana]')).toHaveLength(3);
    expect($$('[data-semana]')).toHaveLength(1); // se edita una semana a la vez
    expect($$('[data-semana="0"] [data-dia]')).toHaveLength(2);
    const plan = await guardado();
    expect(plan.weeks.map((w) => w.days.length)).toEqual([2, 2, 2]);
  });

  it('si ya hay semanas pide confirmación y, si se cancela, no toca el plan', async () => {
    await abrir();
    await generar(2, 2);

    await generar(5, 5);
    const pregunta = await responderConfirmacion(false);

    expect(pregunta).toContain('se reemplazan');
    expect((await guardado()).weeks).toHaveLength(2);
  });

  it('si se confirma, reemplaza la estructura', async () => {
    await abrir();
    await generar(2, 2);

    await generar(4, 1);
    await responderConfirmacion(true);

    expect((await guardado()).weeks).toHaveLength(4);
  });

  it('el indicador muestra que el plan quedó guardado', async () => {
    await abrir();
    await generar(1, 1);
    expect($('[data-estado-guardado]').textContent).toContain('Guardado');
  });
});

describe('constructor de planes: semanas', () => {
  it('editar nombre, fase y volumen de una semana se guarda y se ve en el mapa', async () => {
    await abrir();
    await generar(2, 1);
    await elegirSemana(1);

    const semana = $('[data-semana="1"]');
    cambiar(semana.querySelector('[data-campo="name"]'), 'Semana de choque');
    cambiar(semana.querySelector('[data-campo="objective"]'), 'Intensificación');
    cambiar(semana.querySelector('[data-campo="targetVolume"]'), 'Espalda 14s');
    await esperar();

    expect((await guardado()).weeks[1]).toMatchObject({
      name: 'Semana de choque',
      objective: 'Intensificación',
      targetVolume: 'Espalda 14s',
    });
    const resumen = $('[data-resumen-semana="1"]').textContent;
    expect(resumen).toContain('Semana de choque');
    expect(resumen).toContain('Intensificación');
    expect(resumen).toContain('Espalda 14s');
  });

  it('agregar, duplicar y eliminar (con confirmación) semanas', async () => {
    await abrir();
    await generar(1, 2);

    $('[data-click="semanaAgregar"]').click();
    await esperar();
    await elegirSemana(0);
    $('[data-click="semanaDuplicar"][data-w="0"]').click();
    await esperar();
    expect((await guardado()).weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 1 (copia)', 'Semana 2']);

    $('[data-click="semanaEliminar"][data-w="1"]').click();
    await esperar();
    expect(await responderConfirmacion(true)).toContain('Semana 1 (copia)');
    expect((await guardado()).weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 2']);
    expect($$('[data-resumen-semana]')).toHaveLength(2);
  });

  it('eliminar una semana se puede cancelar', async () => {
    await abrir();
    await generar(2, 1);

    $('[data-click="semanaEliminar"][data-w="0"]').click();
    await esperar();
    await responderConfirmacion(false);

    expect((await guardado()).weeks).toHaveLength(2);
  });
});

describe('constructor de planes: días', () => {
  it('agregar, renombrar y eliminar días', async () => {
    await abrir();
    await generar(1, 1);

    $('[data-click="diaAgregar"][data-w="0"]').click();
    await esperar();
    cambiar($('[data-change="diaCampo"][data-w="0"][data-d="1"]'), 'Jueves - Pierna');
    await esperar();
    expect((await guardado()).weeks[0].days.map((d) => d.name)).toEqual(['Día 1', 'Jueves - Pierna']);

    $('[data-click="diaEliminar"][data-w="0"][data-d="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days.map((d) => d.name)).toEqual(['Jueves - Pierna']);
  });

  it('propagar un día lo copia a las semanas siguientes', async () => {
    await abrir();
    await generar(3, 1);
    cambiar($('[data-change="diaCampo"][data-w="0"][data-d="0"]'), 'Torso A');
    await esperar();

    $('[data-click="diaPropagar"][data-w="0"][data-d="0"]').click();
    await esperar();

    expect((await guardado()).weeks.map((w) => w.days[0].name)).toEqual(['Torso A', 'Torso A', 'Torso A']);
    await elegirSemana(2);
    expect($('[data-change="diaCampo"][data-w="2"][data-d="0"]').value).toBe('Torso A');
  });
});

describe('constructor de planes: bloques y ejercicios', () => {
  /** Plan de 2 semanas x 1 día, con un bloque y un ejercicio en la semana 1. */
  async function abrirConEjercicio() {
    await abrir();
    await generar(2, 1);
    $('[data-click="bloqueAgregar"][data-w="0"][data-d="0"]').click();
    await esperar();
    $('[data-click="ejercicioAgregar"][data-w="0"][data-d="0"][data-b="0"]').click();
    await esperar();
  }
  const campoEj = (campo, pos = '0-0-0-0') => $(`[data-ejercicio="${pos}"] [data-campo="${campo}"]`);

  it('agregar un bloque (fuerza por defecto) y cambiarle el tipo', async () => {
    await abrir();
    await generar(1, 1);

    $('[data-click="bloqueAgregar"][data-w="0"][data-d="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].type).toBe('fuerza');

    cambiar($('[data-bloque="0-0-0"] [data-change="bloqueCampo"]'), 'hipertrofia');
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].type).toBe('hipertrofia');
  });

  it('cargar todos los campos de un ejercicio', async () => {
    await abrirConEjercicio();

    cambiar(campoEj('name'), 'Sentadilla con barra');
    cambiar(campoEj('sets'), '4');
    cambiar(campoEj('reps'), '6-8');
    cambiar(campoEj('intensityType'), 'RPE');
    cambiar(campoEj('intensityValue'), '8');
    cambiar(campoEj('rest'), '3 min');
    cambiar(campoEj('tech'), 'Rest-Pause');
    cambiar(campoEj('notes'), 'Pausa abajo');
    cambiar(campoEj('group'), 'A');
    await esperar();

    expect((await guardado()).weeks[0].days[0].blocks[0].exercises[0]).toMatchObject({
      name: 'Sentadilla con barra',
      sets: '4',
      reps: '6-8',
      intensityType: 'RPE',
      intensityValue: '8',
      rest: '3 min',
      tech: 'Rest-Pause',
      notes: 'Pausa abajo',
      group: 'A',
    });
  });

  it('editar las series actualiza el total del mapa sin redibujar el campo (no se pierde el foco)', async () => {
    await abrirConEjercicio();
    const series = campoEj('sets');

    cambiar(series, '5');
    await esperar();

    expect($('[data-resumen-semana="0"]').textContent).toContain('5 series');
    expect(campoEj('sets')).toBe(series); // el mismo elemento: no se redibujó
  });

  it('sube, baja e inserta un ejercicio antes o después', async () => {
    await abrirConEjercicio();
    cambiar(campoEj('name'), 'Sentadilla');
    await esperar();
    $('[data-click="ejercicioAgregar"][data-w="0"][data-d="0"][data-b="0"]').click();
    await esperar();
    cambiar(campoEj('name', '0-0-0-1'), 'Press');
    await esperar();

    expect($('[data-click="ejercicioAntes"]').textContent.trim()).toBe('+ Antes');
    expect($('[data-click="ejercicioDespues"]').textContent.trim()).toBe('+ Después');

    expect($('[data-click="ejercicioSubir"][data-e="0"]').disabled).toBe(true);
    expect($('[data-click="ejercicioBajar"][data-e="1"]').disabled).toBe(true);

    $('[data-click="ejercicioSubir"][data-e="1"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].exercises.map((e) => e.name)).toEqual(['Press', 'Sentadilla']);

    $('[data-click="ejercicioBajar"][data-e="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].exercises.map((e) => e.name)).toEqual(['Sentadilla', 'Press']);

    $('[data-click="ejercicioAntes"][data-e="1"]').click();
    await esperar();
    const trasAntes = (await guardado()).weeks[0].days[0].blocks[0].exercises;
    expect(trasAntes.map((e) => e.name)).toEqual(['Sentadilla', '', 'Press']);
    expect($('[data-ejercicio="0-0-0-1"] [data-click="ejercicioToggle"]').getAttribute('aria-expanded')).toBe('true');

    $('[data-click="ejercicioDespues"][data-e="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].exercises.map((e) => e.name)).toEqual([
      'Sentadilla',
      '',
      '',
      'Press',
    ]);
  });

  it('inserta un bloque antes o después', async () => {
    await abrir();
    await generar(1, 1);
    $('[data-click="bloqueAgregar"][data-w="0"][data-d="0"]').click();
    await esperar();
    cambiar($('[data-bloque="0-0-0"] [data-change="bloqueCampo"]'), 'hipertrofia');
    await esperar();
    $('[data-click="bloqueAgregar"][data-w="0"][data-d="0"]').click();
    await esperar();

    expect($('[data-click="bloqueAntes"]').textContent.trim()).toBe('+ Antes');
    expect($('[data-click="bloqueDespues"]').textContent.trim()).toBe('+ Después');

    $('[data-click="bloqueAntes"][data-b="1"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks.map((b) => b.type)).toEqual(['hipertrofia', 'fuerza', 'fuerza']);
    expect((await guardado()).weeks[0].days[0].blocks[1].exercises).toEqual([]);

    $('[data-click="bloqueDespues"][data-b="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks.map((b) => b.type)).toEqual([
      'hipertrofia',
      'fuerza',
      'fuerza',
      'fuerza',
    ]);
  });

  it('eliminar un ejercicio', async () => {
    await abrirConEjercicio();
    $('[data-click="ejercicioEliminar"][data-w="0"][data-d="0"][data-b="0"][data-e="0"]').click();
    await esperar();
    expect((await guardado()).weeks[0].days[0].blocks[0].exercises).toEqual([]);
  });

  it('eliminar un bloque con ejercicios pide confirmación', async () => {
    await abrirConEjercicio();

    $('[data-click="bloqueEliminar"][data-w="0"][data-d="0"][data-b="0"]').click();
    await esperar();
    await responderConfirmacion(false);
    expect((await guardado()).weeks[0].days[0].blocks).toHaveLength(1);

    $('[data-click="bloqueEliminar"][data-w="0"][data-d="0"][data-b="0"]').click();
    await esperar();
    await responderConfirmacion(true);
    expect((await guardado()).weeks[0].days[0].blocks).toEqual([]);
  });

  it('propagar un ejercicio lo agrega a las semanas siguientes', async () => {
    await abrirConEjercicio();
    cambiar(campoEj('name'), 'Press banca');
    await esperar();

    $('[data-click="ejercicioPropagar"][data-w="0"][data-d="0"][data-b="0"][data-e="0"]').click();
    await esperar();

    expect((await guardado()).weeks[1].days[0].blocks[0].exercises.map((e) => e.name)).toEqual(['Press banca']);
    await elegirSemana(1);
    expect(campoEj('name', '1-0-0-0').value).toBe('Press banca');
  });

  it('el nombre del ejercicio se autocompleta con la base de ejercicios', async () => {
    await abrirConEjercicio();
    await new Promise((r) => setTimeout(r, 50)); // la base se carga aparte (import dinámico)

    const lista = document.getElementById(campoEj('name').getAttribute('list'));
    const opciones = [...lista.querySelectorAll('option')].map((o) => o.value);
    expect(opciones.length).toBeGreaterThan(1000);
    expect(opciones).toContain('02 Paused Air Squat');
  });

  it('un nombre con comillas y < se guarda y se vuelve a mostrar intacto', async () => {
    await abrirConEjercicio();
    cambiar(campoEj('name'), 'Remo "Pendlay" <con pausa>');
    await esperar();

    await abrir();

    expect(campoEj('name').value).toBe('Remo "Pendlay" <con pausa>');
  });
});

describe('constructor de planes: superseries', () => {
  it('muestra A1, A2, B1... según el grupo de cada ejercicio y las recalcula al cambiarlo', async () => {
    await abrir();
    await generar(1, 1);
    $('[data-click="bloqueAgregar"][data-w="0"][data-d="0"]').click();
    await esperar();
    for (let i = 0; i < 4; i++) {
      $('[data-click="ejercicioAgregar"][data-w="0"][data-d="0"][data-b="0"]').click();
      await esperar();
    }
    const grupo = (e) => $(`[data-ejercicio="0-0-0-${e}"] [data-campo="group"]`);
    const etiquetas = () =>
      $$('[data-ejercicio]').map((ej) => ej.querySelector('[data-etiqueta]')?.textContent.trim() ?? '');

    cambiar(grupo(0), 'A');
    await esperar();
    cambiar(grupo(1), 'A');
    await esperar();
    cambiar(grupo(2), 'B');
    await esperar();
    cambiar(grupo(3), 'B');
    await esperar();
    expect(etiquetas()).toEqual(['A1', 'A2', 'B1', 'B2']);

    cambiar(grupo(2), 'A'); // triserie A + B suelto
    await esperar();
    expect(etiquetas()).toEqual(['A1', 'A2', 'A3', 'B1']);
    expect((await guardado()).weeks[0].days[0].blocks[0].exercises.map((e) => e.group)).toEqual(['A', 'A', 'A', 'B']);

    cambiar(grupo(0), ''); // sale de la superserie
    await esperar();
    expect(etiquetas()).toEqual(['', 'A1', 'A2', 'B1']);
  });
});

describe('constructor de planes: objetivos y lineamientos', () => {
  it('objetivo, foco, evaluación y lineamientos se guardan al editarlos', async () => {
    await abrir();
    await generar(1, 1);

    cambiar($('[data-change="reporteCampo"][data-campo="objective"]'), 'Subir el 1RM de sentadilla');
    cambiar($('[data-change="reporteCampo"][data-campo="focus"]'), 'Control de rodilla');
    cambiar($('[data-change="reporteCampo"][data-campo="evaluation"]'), 'Test de 3RM en semana 4');
    cambiar($('[data-change="reporteCampo"][data-campo="guidelines"]'), 'Dormir 8 h\nHidratarse');
    await esperar();

    expect((await guardado()).report).toMatchObject({
      objective: 'Subir el 1RM de sentadilla',
      focus: 'Control de rodilla',
      evaluation: 'Test de 3RM en semana 4',
      guidelines: 'Dormir 8 h\nHidratarse',
    });
  });

  it('agregar, completar y quitar prioridades', async () => {
    await abrir();
    await generar(1, 1);

    $('[data-click="prioridadAgregar"]').click();
    await esperar();
    $('[data-click="prioridadAgregar"]').click();
    await esperar();
    cambiar($('[data-change="prioridadCampo"][data-i="0"][data-campo="target"]'), 'Sentadilla');
    cambiar($('[data-change="prioridadCampo"][data-i="0"][data-campo="progression"]'), '+2,5 kg/semana');
    cambiar($('[data-change="prioridadCampo"][data-i="1"][data-campo="target"]'), 'Glúteo medio');
    await esperar();
    expect((await guardado()).report.priorities.map((p) => p.target)).toEqual(['Sentadilla', 'Glúteo medio']);
    expect((await guardado()).report.priorities[0].progression).toBe('+2,5 kg/semana');

    $('[data-click="prioridadEliminar"][data-i="0"]').click();
    await esperar();
    expect((await guardado()).report.priorities.map((p) => p.target)).toEqual(['Glúteo medio']);
    expect($('[data-change="prioridadCampo"][data-i="0"][data-campo="target"]').value).toBe('Glúteo medio');
  });

  it('los textos de lineamientos con comillas y < se muestran intactos al volver a abrir', async () => {
    await abrir();
    await generar(1, 1);
    $('[data-click="prioridadAgregar"]').click();
    await esperar();
    cambiar($('[data-change="prioridadCampo"][data-i="0"][data-campo="target"]'), 'Press "inclinado" <30°>');
    cambiar($('[data-change="reporteCampo"][data-campo="guidelines"]'), '</textarea><b>x</b>');
    await esperar();

    await abrir();

    expect($('[data-change="prioridadCampo"][data-i="0"][data-campo="target"]').value).toBe('Press "inclinado" <30°>');
    expect($('[data-change="reporteCampo"][data-campo="guidelines"]').value).toBe('</textarea><b>x</b>');
    expect(content.querySelector('b')).toBeNull();
  });
});

describe('constructor de planes: PDF', () => {
  it('cada botón abre la vista previa del PDF correspondiente, armado con el plan actual', async () => {
    await abrir();
    await generar(1, 1);
    cambiar($('[data-campo="macroName"]'), 'Fuerza base');
    cambiar($('[data-change="reporteCampo"][data-campo="objective"]'), 'Subir el 1RM');
    await esperar();

    $('[data-click="pdfLineamientos"]').click();
    await esperar();
    const vista = () => document.getElementById('pdf-vista-previa');
    expect(vista().textContent).toContain('PDF de lineamientos');
    expect(textoDe(vi.mocked(generarPdfBlob).mock.calls[0][0])).toContain('Subir el 1RM');

    vista().querySelector('[data-click="vistaPreviaCerrar"]').click();
    $('[data-click="pdfEntrenamiento"]').click();
    await esperar();
    expect(vista().textContent).toContain('PDF del entrenamiento');
    const docEnt = vi.mocked(generarPdfBlob).mock.calls[1][0];
    expect(textoDe(docEnt)).toContain('Fuerza base');
    expect(textoDe(docEnt)).not.toContain('Subir el 1RM');
  });

  it('"Descargar" en la vista previa baja el archivo con nombre tipo-alumno-fecha.pdf', async () => {
    await abrir();
    await generar(1, 1);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:pdf');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let descargado;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      descargado = this.getAttribute('download');
    });

    $('[data-click="pdfEntrenamiento"]').click();
    await esperar();
    document.querySelector('#pdf-vista-previa [data-click="vistaPreviaDescargar"]').click();

    expect(descargado).toMatch(/^entrenamiento-ana-perez-\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('un ciclo que no existe avisa y no ofrece nada para editar', async () => {
    await abrirConstructorDePlanes(content, ALUMNO, { cicloId: 'inexistente', alVolver });
    expect(content.textContent).toContain('No se encontró ese ciclo');
    expect($('[data-click="planGenerar"]')).toBeNull();
    expect($('[data-click="pdfEntrenamiento"]')).toBeNull();
  });
});

describe('constructor de planes: ciclos', () => {
  const abrirCiclo = (cicloId) => abrirConstructorDePlanes(content, ALUMNO, { cicloId, alVolver });
  const plan = (nombre) => ({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: nombre });

  it('edita el ciclo que se le indica y no toca los demás del alumno', async () => {
    const anterior = await repo.crearCiclo(ALUMNO.id, plan('Anterior'), 'finalizado');
    const nuevo = await repo.crearCiclo(ALUMNO.id, plan('Nuevo'), 'borrador');

    await abrirCiclo(nuevo.id);
    cambiar($('[data-campo="macroName"]'), 'Nuevo editado');
    await esperar();

    const nombres = (await repo.listarCiclos(ALUMNO.id)).map((c) => [c.id, c.plan.macroName]);
    expect(nombres).toEqual([
      [anterior.id, 'Anterior'],
      [nuevo.id, 'Nuevo editado'],
    ]);
  });

  it.each([
    ['borrador', 'el alumno no lo ve hasta que lo muestres'],
    ['activo', 'el alumno ve lo que cambies'],
    ['finalizado', 'queda en el historial'],
  ])('un ciclo %s lo avisa arriba: %s', async (estado, texto) => {
    const { id } = await repo.crearCiclo(ALUMNO.id, plan('Ciclo'), estado);
    await abrirCiclo(id);
    expect($('[data-aviso-estado]').textContent).toContain(texto);
  });
});

describe('constructor de planes: asistente de IA', () => {
  const ejercicio = {
    id: 'e1',
    name: 'Press banca',
    sets: '4',
    reps: '8',
    intensityType: 'RPE',
    intensityValue: '7',
    tech: '',
    rest: '90s',
    notes: '',
    group: '',
  };

  /** 3 semanas de 1 día; solo la primera tiene un ejercicio. */
  function planParaIA() {
    const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 3, 1);
    plan.weeks[0].days[0].blocks = [{ id: 'b1', type: 'fuerza', exercises: [ejercicio] }];
    return plan;
  }

  /** Una IA que sube 1 punto de RPE por semana. */
  const iaQueSubeRPE = async (peticion) => {
    const semanas = JSON.parse(peticion.slice(peticion.indexOf('[{')));
    for (const [i, w] of semanas.entries()) {
      for (const d of w.days) for (const b of d.blocks) for (const e of b.exercises) e.intensityValue = String(7 + i);
    }
    return JSON.stringify(semanas);
  };

  const textoDelAviso = () => document.getElementById('app-modal-overlay-aux')?.textContent ?? '';
  const escribirYProponer = (instruccion) => {
    const campo = $('[data-ia-instruccion]');
    campo.value = instruccion;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    $('[data-click="iaProponer"]').click();
  };
  // La primera consulta carga la biblioteca de ejercicios (un archivo grande) antes de llamar a la IA:
  // se espera a que haya una propuesta o un error
  const pedir = async (instruccion = 'Sube 1 de RPE por semana') => {
    escribirYProponer(instruccion);
    await vi.waitFor(() => expect($('[data-ia-propuesta]') ?? $('[data-ia-error]')).not.toBeNull());
  };
  const rpeGuardado = async (w) =>
    (await planActivoDe(ALUMNO.id)).weeks[w].days[0].blocks[0]?.exercises[0]?.intensityValue;

  beforeEach(async () => {
    await sembrarPlan(ALUMNO.id, planParaIA());
  });

  describe('cuándo aparece', () => {
    it('un plan nuevo, sin semanas, no lo muestra', async () => {
      await sembrarPlan(ALUMNO.id, crearPlan({ fechaInicio: '2026-10-19' }));
      await abrir();
      expect($('[data-ia-panel]')).toBeNull();
    });

    it('con la estructura generada (aunque no tenga ejercicios todavía) aparece y se puede usar', async () => {
      await sembrarPlan(ALUMNO.id, generarEstructura(crearPlan({ fechaInicio: '2026-10-19' }), 3, 2));
      await abrir();

      expect($('[data-ia-panel]')).not.toBeNull();
      expect($('[data-ia-instruccion]').disabled).toBe(false);
      expect($('[data-click="iaProponer"]').disabled).toBe(false);
    });

    it('al generar la estructura de un plan nuevo, aparece', async () => {
      await sembrarPlan(ALUMNO.id, crearPlan({ fechaInicio: '2026-10-19' }));
      await abrir();
      await generar(3, 2);
      expect($('[data-ia-panel]')).not.toBeNull();
    });
  });

  it('el constructor ofrece el asistente con una caja para escribir la instrucción', async () => {
    await abrir();
    expect($('[data-ia-instruccion]')).not.toBeNull();
    expect($('[data-click="iaProponer"]').textContent).toContain('Proponer');
  });

  it('sin instrucción avisa y no llama a la IA', async () => {
    await abrir();
    escribirYProponer('   ');
    await esperar();
    expect(textoDelAviso()).toContain('Escribí qué querés que haga la IA');
    expect(llamarIA).not.toHaveBeenCalled();
  });

  it('muestra la propuesta antes de aplicarla: qué semanas se copian y qué cambia, sin guardar nada', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueSubeRPE);
    await abrir();
    await pedir();

    const propuesta = $('[data-ia-propuesta]');
    expect(propuesta.textContent).toContain('Semana 2');
    expect(propuesta.textContent).toContain('Semana 3');
    const cambios = $$('[data-ia-cambio]').map((c) => c.textContent);
    expect(cambios).toHaveLength(2); // la semana 1 queda igual
    expect(cambios[0]).toContain('Press banca');
    expect(cambios[0]).toContain('7');
    expect(cambios[0]).toContain('8');
    expect(await rpeGuardado(1)).toBeUndefined(); // nada guardado todavía
  });

  it('al aplicar guarda las semanas copiadas con la progresión y las muestra', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueSubeRPE);
    await abrir();
    await pedir();
    $('[data-click="iaAplicar"]').click();
    await esperar();

    expect([await rpeGuardado(0), await rpeGuardado(1), await rpeGuardado(2)]).toEqual(['7', '8', '9']);
    expect((await planActivoDe(ALUMNO.id)).weeks[2].days[0].blocks[0].exercises[0].name).toBe('Press banca');
    expect($('[data-ia-propuesta]')).toBeNull();
    expect($$('[data-resumen-semana]')).toHaveLength(3);
    expect($('[data-ia-instruccion]').value).toBe(''); // listo para otra instrucción
  });

  it('descartar deja el plan como estaba', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueSubeRPE);
    await abrir();
    await pedir();
    $('[data-click="iaDescartar"]').click();
    await esperar();

    expect($('[data-ia-propuesta]')).toBeNull();
    expect(await rpeGuardado(1)).toBeUndefined();
  });

  it('mientras la IA piensa el botón queda deshabilitado y no se puede pedir dos veces', async () => {
    let responder;
    vi.mocked(llamarIA).mockImplementation(() => new Promise((r) => (responder = r)));
    await abrir();
    escribirYProponer('Sube 1 de RPE por semana');
    await vi.waitFor(() => expect($('[data-click="iaProponer"]').disabled).toBe(true));

    const boton = $('[data-click="iaProponer"]');
    expect(boton.disabled).toBe(true);
    expect(boton.textContent).toContain('Pensando');
    boton.disabled = false; // aunque lo habiliten desde las herramientas del navegador
    boton.click();
    await vi.waitFor(() => expect(llamarIA).toHaveBeenCalled());
    await esperar();
    expect(llamarIA).toHaveBeenCalledTimes(1);

    responder(await iaQueSubeRPE(vi.mocked(llamarIA).mock.calls[0][0]));
    await vi.waitFor(() => expect($('[data-ia-propuesta]')).not.toBeNull());
    expect($('[data-click="iaProponer"]').disabled).toBe(false);
  });

  it('si la IA falla muestra el error y el plan no cambia', async () => {
    vi.mocked(llamarIA).mockRejectedValue(new Error('La IA tardó demasiado. Probá de nuevo.'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await abrir();
    await pedir();

    expect($('[data-ia-error]').textContent).toContain('La IA tardó demasiado');
    expect($('[data-ia-propuesta]')).toBeNull();
    expect(await rpeGuardado(1)).toBeUndefined();
  });

  it('si la IA omite partes del plan, muestra la propuesta con avisos en vez de descartarla', async () => {
    vi.mocked(llamarIA).mockImplementation(async (peticion) => {
      const semanas = JSON.parse(peticion.slice(peticion.indexOf('SEMANAS:\n') + 9));
      semanas[0].days[0].blocks[0].exercises[0].intensityValue = '9';
      return JSON.stringify(semanas.slice(0, 2)); // falta la semana 3
    });
    await abrir();
    await pedir();

    expect($('[data-ia-error]')).toBeNull();
    expect($('[data-ia-propuesta]')).not.toBeNull();
    const avisos = $$('[data-ia-aviso]').map((a) => a.textContent);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Semana 3');
    expect($('[data-ia-avisos]').textContent).toContain('Ojo');

    $('[data-click="iaAplicar"]').click(); // lo que sí se pudo aplicar, se aplica
    await esperar();
    expect(await rpeGuardado(0)).toBe('9');
    expect((await planActivoDe(ALUMNO.id)).weeks[2].days[0].blocks[0].exercises[0].name).toBe('Press banca'); // la semana 3 quedó copiada
  });

  it('si la IA solo deja avisos (nada aplicable, ninguna semana para copiar) lo dice y no ofrece aplicar', async () => {
    const plan = planParaIA();
    for (const w of [1, 2]) {
      plan.weeks[w].days[0].blocks = [{ id: `b${w}`, type: 'fuerza', exercises: [{ ...ejercicio, id: `e${w}` }] }];
    }
    await sembrarPlan(ALUMNO.id, plan);
    vi.mocked(llamarIA).mockResolvedValue('[]');
    await abrir();
    await pedir();

    expect($$('[data-ia-aviso]').length).toBeGreaterThan(0);
    expect($('[data-click="iaAplicar"]')).toBeNull();
  });

  it('si la IA no propone ningún cambio y no hay semanas por copiar, lo dice sin botón de aplicar', async () => {
    const plan = planParaIA();
    const conOtroId = (id, idEjercicio) => [{ id, type: 'fuerza', exercises: [{ ...ejercicio, id: idEjercicio }] }];
    plan.weeks[1].days[0].blocks = conOtroId('bx', 'ex');
    plan.weeks[2].days[0].blocks = conOtroId('by', 'ey');
    await sembrarPlan(ALUMNO.id, plan);
    vi.mocked(llamarIA).mockImplementation(async (peticion) => peticion.slice(peticion.indexOf('[{')));
    await abrir();
    await pedir('No cambies nada');

    expect($('[data-ia-propuesta]').textContent).toContain('no propone ningún cambio');
    expect($('[data-click="iaAplicar"]')).toBeNull();
  });

  it('si el plan se editó mientras tanto, no pisa esa edición: pide intentar de nuevo', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueSubeRPE);
    await abrir();
    await pedir();
    cambiar($('[data-campo="macroName"]'), 'Cambiado a mano');
    await esperar();

    $('[data-click="iaAplicar"]').click();
    await esperar();

    expect($('[data-ia-error]').textContent).toContain('El plan cambió');
    const plan = await planActivoDe(ALUMNO.id);
    expect(plan.macroName).toBe('Cambiado a mano');
    expect(await rpeGuardado(1)).toBeUndefined();
  });

  it('un nombre de ejercicio con HTML se muestra como texto en la propuesta', async () => {
    const plan = planParaIA();
    plan.weeks[0].days[0].blocks[0].exercises[0].name = '<img src=x onerror=alert(1)>';
    await sembrarPlan(ALUMNO.id, plan);
    vi.mocked(llamarIA).mockImplementation(iaQueSubeRPE);
    await abrir();
    await pedir();

    expect($('[data-ia-propuesta] img')).toBeNull();
    expect($('[data-ia-cambio]').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('constructor de planes: semanas como pestañas', () => {
  const semanaAbierta = () => $('[data-semana]').dataset.semana;

  it('muestra solo la primera semana y el mapa del macrociclo hace de pestañas', async () => {
    await abrir();
    await generar(4, 2);

    expect($$('[data-semana]')).toHaveLength(1);
    expect(semanaAbierta()).toBe('0');
    expect($$('[data-click="semanaElegir"]')).toHaveLength(4);
    expect($('[data-resumen-semana="0"]').getAttribute('aria-current')).toBe('true');
    expect($('[data-resumen-semana="2"]').getAttribute('aria-current')).toBeNull();
  });

  it('tocar una semana del mapa la abre y cierra la anterior', async () => {
    await abrir();
    await generar(4, 2);
    await elegirSemana(2);

    expect($$('[data-semana]')).toHaveLength(1);
    expect(semanaAbierta()).toBe('2');
    expect($('[data-semana="2"] [data-campo="name"]').value).toBe('Semana 3');
    expect($('[data-resumen-semana="2"]').getAttribute('aria-current')).toBe('true');
    expect($('[data-resumen-semana="0"]').getAttribute('aria-current')).toBeNull();
  });

  it('lo que se edita en una semana se guarda en esa semana', async () => {
    await abrir();
    await generar(3, 1);
    await elegirSemana(1);
    cambiar($('[data-semana="1"] [data-campo="name"]'), 'Descarga');
    await esperar();
    await elegirSemana(2);

    expect((await guardado()).weeks.map((w) => w.name)).toEqual(['Semana 1', 'Descarga', 'Semana 3']);
    expect($('[data-resumen-semana="1"]').textContent).toContain('Descarga');
  });

  it('seguir editando la semana abierta no cambia de pestaña', async () => {
    await abrir();
    await generar(3, 1);
    await elegirSemana(1);
    $('[data-click="diaAgregar"][data-w="1"]').click();
    await esperar();

    expect(semanaAbierta()).toBe('1');
    expect($$('[data-semana="1"] [data-dia]')).toHaveLength(2);
  });

  it('una semana agregada o duplicada queda abierta', async () => {
    await abrir();
    await generar(2, 1);

    $('[data-click="semanaAgregar"]').click();
    await esperar();
    expect(semanaAbierta()).toBe('2');

    await elegirSemana(0);
    $('[data-click="semanaDuplicar"][data-w="0"]').click();
    await esperar();
    expect(semanaAbierta()).toBe('1');
    expect($('[data-semana="1"] [data-campo="name"]').value).toBe('Semana 1 (copia)');
  });

  it('al eliminar la última semana abierta pasa a la anterior', async () => {
    await abrir();
    await generar(3, 1);
    await elegirSemana(2);
    $('[data-click="semanaEliminar"][data-w="2"]').click();
    await esperar();
    await responderConfirmacion(true);

    expect(semanaAbierta()).toBe('1');
    expect($$('[data-resumen-semana]')).toHaveLength(2);
  });

  it('al regenerar la estructura vuelve a la primera semana', async () => {
    await abrir();
    await generar(3, 1);
    await elegirSemana(2);
    await generar(4, 1);
    await responderConfirmacion(true);

    expect(semanaAbierta()).toBe('0');
  });

  it('al volver a abrir el constructor empieza en la primera semana', async () => {
    await abrir();
    await generar(3, 1);
    await elegirSemana(2);
    await abrir();
    expect(semanaAbierta()).toBe('0');
  });
});

describe('constructor de planes: asistente de IA completando días', () => {
  const OFICIAL = 'Encogimientos de hombros con mancuernas - Trapecio';
  const ejercicio = {
    id: 'e1',
    name: 'Press banca',
    sets: '4',
    reps: '6',
    intensityType: 'RPE',
    intensityValue: '7',
    tech: '',
    rest: '90s',
    notes: '',
    group: '',
  };

  /** 2 semanas de 2 días: el Día 1 de la semana 1 tiene un ejercicio; el Día 2 está vacío. */
  function planConDiaVacio() {
    const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 2, 2);
    plan.weeks[0].days[0].blocks = [{ id: 'b1', type: 'fuerza', exercises: [ejercicio] }];
    return plan;
  }

  /** Una IA que completa el día vacío de cada semana con `nombre`. */
  const iaQueCompleta = (nombre) => async (peticion) => {
    const semanas = JSON.parse(peticion.slice(peticion.indexOf('SEMANAS:\n') + 9));
    for (const semana of semanas) {
      semana.days[1].blocks = [
        {
          type: 'hipertrofia',
          exercises: [
            { name: nombre, sets: '3', reps: '10-12', intensityType: 'RIR', intensityValue: '2', rest: '90s' },
          ],
        },
      ];
    }
    return JSON.stringify(semanas);
  };
  const textoDelAviso = () => document.getElementById('app-modal-overlay-aux')?.textContent ?? '';
  const pedir = async (instruccion) => {
    const campo = $('[data-ia-instruccion]');
    campo.value = instruccion;
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    $('[data-click="iaProponer"]').click();
    await vi.waitFor(() => expect($('[data-ia-propuesta]') ?? $('[data-ia-error]')).not.toBeNull());
  };

  beforeEach(async () => {
    await sembrarPlan(ALUMNO.id, planConDiaVacio());
  });

  it('con días vacíos le da a la IA los ejercicios de la biblioteca', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta(OFICIAL));
    await abrir();
    await pedir('Completá el día 2 con trapecio');

    const peticion = vi.mocked(llamarIA).mock.calls[0][0];
    expect(peticion).toContain('BIBLIOTECA');
    expect(peticion).toContain(OFICIAL);
    expect(peticion).not.toContain('Cable Front Squat'); // solo la biblioteca del coach, no toda la base
  });

  it('muestra los ejercicios que agregaría antes de aplicar, y no guarda nada todavía', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta(OFICIAL));
    await abrir();
    await pedir('Completá el día 2 con trapecio');

    const agregados = $$('[data-ia-agregado]');
    expect(agregados).toHaveLength(2); // el día 2 de las dos semanas
    expect(agregados[0].textContent).toContain(OFICIAL);
    expect(agregados[0].textContent).toContain('Semana 1');
    expect(agregados[0].textContent).toContain('Día 2');
    expect(agregados[0].textContent).toContain('3 series');
    expect($('[data-ia-propuesta]').textContent).toContain('2 ejercicios');
    expect((await planActivoDe(ALUMNO.id)).weeks[0].days[1].blocks).toEqual([]);
  });

  it('al aplicar el día queda completo en todas las semanas', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta(OFICIAL));
    await abrir();
    await pedir('Completá el día 2 con trapecio');
    $('[data-click="iaAplicar"]').click();
    await esperar();

    const plan = await planActivoDe(ALUMNO.id);
    for (const semana of plan.weeks) {
      expect(semana.days[1].blocks[0]).toMatchObject({ type: 'hipertrofia' });
      expect(semana.days[1].blocks[0].exercises[0]).toMatchObject({ name: OFICIAL, sets: '3', reps: '10-12' });
    }
    expect($$('[data-ia-agregado]')).toHaveLength(0);
  });

  it('un ejercicio que no está en la biblioteca se avisa: no tiene video de demostración', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta('Sentadilla búlgara inventada'));
    await abrir();
    await pedir('Completá el día 2');

    expect($('[data-ia-agregado]').textContent).toContain('no está en la biblioteca');
  });

  it('un nombre oficial escrito distinto se corrige al de la biblioteca (para que tenga su video)', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta(OFICIAL.toUpperCase()));
    await abrir();
    await pedir('Completá el día 2');
    $('[data-click="iaAplicar"]').click();
    await esperar();

    expect((await planActivoDe(ALUMNO.id)).weeks[0].days[1].blocks[0].exercises[0].name).toBe(OFICIAL);
  });

  it('siempre le manda la biblioteca para que pueda agregar ejercicios, también en días que ya tienen', async () => {
    const plan = planConDiaVacio();
    for (const w of plan.weeks) {
      for (const [d, dia] of w.days.entries()) {
        dia.blocks = [{ id: `b${w.id}${d}`, type: 'fuerza', exercises: [{ ...ejercicio, id: `e${w.id}${d}` }] }];
      }
    }
    await sembrarPlan(ALUMNO.id, plan);
    vi.mocked(llamarIA).mockImplementation(async (peticion) => peticion.slice(peticion.indexOf('SEMANAS:\n') + 9));
    await abrir();
    await pedir('No cambies nada');

    expect(vi.mocked(llamarIA).mock.calls[0][0]).toContain('BIBLIOTECA');
  });

  it('agrega ejercicios a un día que ya tiene y los muestra antes de aplicar', async () => {
    await sembrarPlan(ALUMNO.id, planConDiaVacio());
    vi.mocked(llamarIA).mockImplementation(async (peticion) => {
      const semanas = JSON.parse(peticion.slice(peticion.indexOf('SEMANAS:\n') + 9));
      for (const s of semanas) {
        const bloque = s.days[0].blocks[0];
        if (bloque)
          bloque.exercises.push({ name: OFICIAL, sets: '3', reps: '12', intensityType: 'RIR', intensityValue: '2' });
      }
      return JSON.stringify(semanas);
    });
    await abrir();
    await pedir('Agregá un ejercicio de trapecio al día 1');

    expect($$('[data-ia-agregado]')[0].textContent).toContain(OFICIAL);
    $('[data-click="iaAplicar"]').click();
    await esperar();

    const plan = await planActivoDe(ALUMNO.id);
    expect(plan.weeks[0].days[0].blocks[0].exercises.map((e) => e.name)).toEqual(['Press banca', OFICIAL]);
  });

  it('un nombre de ejercicio con HTML se muestra como texto', async () => {
    vi.mocked(llamarIA).mockImplementation(iaQueCompleta('<img src=x onerror=alert(1)>'));
    await abrir();
    await pedir('Completá el día 2');

    expect($('[data-ia-propuesta] img')).toBeNull();
    expect($('[data-ia-agregado]').textContent).toContain('<img src=x onerror=alert(1)>');
    expect(textoDelAviso()).toBe('');
  });
});

describe('constructor de planes: barra fija y plegables', () => {
  const ej = (id, nombre, extra = {}) => ({
    id,
    name: nombre,
    sets: '4',
    reps: '8-10',
    intensityType: 'RIR',
    intensityValue: '2',
    tech: '',
    rest: '90s',
    notes: '',
    group: '',
    ...extra,
  });

  /** 3 semanas de 2 días; la semana 1 tiene 2 ejercicios el día 1 (7 series) y 1 el día 2. */
  function planConEjercicios() {
    const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 3, 2);
    plan.weeks[0].days[0].blocks = [
      { id: 'b1', type: 'fuerza', exercises: [ej('e1', 'Press banca'), ej('e2', 'Remo', { sets: '3', reps: '12' })] },
    ];
    plan.weeks[0].days[1].blocks = [
      { id: 'b2', type: 'hipertrofia', exercises: [ej('e3', 'Sentadilla', { sets: '5' })] },
    ];
    return plan;
  }
  beforeEach(() => sembrarPlan(ALUMNO.id, planConEjercicios()));

  const barra = () => $('[data-barra-fija]');
  const cuerpoDia = (w, d) => $(`[data-dia="${w}-${d}"] [data-dia-cuerpo]`);
  const cuerpoEj = (pos) => $(`[data-ejercicio="${pos}"] [data-ej-cuerpo]`);
  const tocar = async (selector) => {
    $(selector).click();
    await esperar();
  };

  describe('barra fija', () => {
    it('lleva las semanas y los días de la semana abierta, y queda pegada al tope', async () => {
      await abrir();

      expect(barra().className).toContain('sticky');
      expect(barra().className).toContain('top-0');
      expect(barra().querySelectorAll('[data-click="semanaIr"]')).toHaveLength(3);
      expect(barra().querySelectorAll('[data-click="diaIr"]')).toHaveLength(2);
      expect(barra().querySelector('[data-click="constructorPlegarTodo"]')).not.toBeNull();
      expect(barra().querySelector('[data-click="constructorAbrirTodo"]')).not.toBeNull();
      expect(barra().querySelector('[data-ejercicio]')).toBeNull(); // el contenido scrollea, la barra no
    });

    it('elegir una semana en la barra la abre, marca esa semana y muestra sus días', async () => {
      await abrir();
      await tocar('[data-click="semanaIr"][data-w="2"]');

      expect($('[data-semana]').dataset.semana).toBe('2');
      expect(barra().querySelector('[data-click="semanaIr"][data-w="2"]').getAttribute('aria-current')).toBe('true');
      expect(barra().querySelector('[data-click="semanaIr"][data-w="0"]').getAttribute('aria-current')).toBeNull();
      expect($$('[data-barra-fija]')).toHaveLength(1);
    });

    it('un plan sin semanas no tiene barra', async () => {
      await sembrarPlan(ALUMNO.id, crearPlan({ fechaInicio: '2026-10-19' }));
      await abrir();
      expect(barra()).toBeNull();
    });

    it('tocar un día de la barra lo abre y se desplaza hasta él', async () => {
      const desplazar = vi.fn();
      const original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = desplazar;
      onTestFinished(() => {
        Element.prototype.scrollIntoView = original;
      });
      await abrir();
      expect(cuerpoDia(0, 1).hidden).toBe(true);

      await tocar('[data-click="diaIr"][data-d="1"]');

      expect(cuerpoDia(0, 1).hidden).toBe(false);
      expect(desplazar).toHaveBeenCalledWith({ block: 'start' });
      expect($('[data-dia="0-1"]').className).toContain('scroll-mt'); // deja lugar para que la barra no lo tape
    });
  });

  describe('días plegables', () => {
    it('al abrir una semana el primer día viene abierto y los demás plegados', async () => {
      await abrir();
      expect(cuerpoDia(0, 0).hidden).toBe(false);
      expect(cuerpoDia(0, 1).hidden).toBe(true);
    });

    it('el encabezado del día muestra su nombre editable y cuántos ejercicios y series tiene', async () => {
      await abrir();
      expect($('[data-dia="0-0"] [data-change="diaCampo"]').value).toBe('Día 1');
      expect($('[data-dia-resumen="0-0"]').textContent).toBe('2 ejercicios · 7 series');
      expect($('[data-dia-resumen="0-1"]').textContent).toBe('1 ejercicio · 5 series');
    });

    it('tocar la flecha pliega y despliega el día sin redibujar', async () => {
      await abrir();
      const dia = $('[data-dia="0-1"]');
      await tocar('[data-dia="0-1"] [data-click="diaToggle"]');
      expect(cuerpoDia(0, 1).hidden).toBe(false);
      expect(dia.querySelector('[data-click="diaToggle"]').getAttribute('aria-expanded')).toBe('true');

      await tocar('[data-dia="0-1"] [data-click="diaToggle"]');
      expect(cuerpoDia(0, 1).hidden).toBe(true);
      expect($('[data-dia="0-1"]')).toBe(dia); // el mismo elemento: no se redibujó
    });

    it('cambiar el nombre del día no lo pliega ni lo abre', async () => {
      await abrir();
      cambiar($('[data-dia="0-1"] [data-change="diaCampo"]'), 'Pierna');
      await esperar();
      expect(cuerpoDia(0, 1).hidden).toBe(true);
      expect($('[data-dia="0-1"] [data-change="diaCampo"]').value).toBe('Pierna');
    });

    it('lo que se abrió sigue abierto al cambiar de semana y volver, y la semana nueva abre su primer día', async () => {
      await abrir();
      await tocar('[data-dia="0-1"] [data-click="diaToggle"]');

      await tocar('[data-click="semanaIr"][data-w="1"]');
      expect(cuerpoDia(1, 0).hidden).toBe(false);
      expect(cuerpoDia(1, 1).hidden).toBe(true);

      await tocar('[data-click="semanaIr"][data-w="0"]');
      expect(cuerpoDia(0, 0).hidden).toBe(false);
      expect(cuerpoDia(0, 1).hidden).toBe(false);
    });

    it('un día agregado viene abierto', async () => {
      await abrir();
      await tocar('[data-click="diaAgregar"][data-w="0"]');
      expect(cuerpoDia(0, 2).hidden).toBe(false);
    });

    it('un día que estaba abierto sigue abierto después de otra edición que redibuja', async () => {
      await abrir();
      await tocar('[data-dia="0-1"] [data-click="diaToggle"]');
      await tocar('[data-click="diaAgregar"][data-w="0"]'); // redibuja todo
      expect(cuerpoDia(0, 1).hidden).toBe(false);
      expect(cuerpoDia(0, 0).hidden).toBe(false);
    });
  });

  describe('ejercicios plegables', () => {
    it('los ejercicios que ya existían vienen plegados, con su nombre y un resumen', async () => {
      await abrir();
      expect(cuerpoEj('0-0-0-0').hidden).toBe(true);
      expect($('[data-ejercicio="0-0-0-0"] [data-change="ejercicioCampo"][data-campo="name"]').value).toBe(
        'Press banca',
      );
      expect($('[data-ejercicio="0-0-0-0"] [data-ej-resumen]').textContent).toBe('4 × 8-10 · RIR 2');
      expect($('[data-ejercicio="0-0-0-1"] [data-ej-resumen]').textContent).toBe('3 × 12 · RIR 2');
    });

    it('tocar la flecha despliega los campos y vuelve a plegarlos, sin redibujar', async () => {
      await abrir();
      const tarjeta = $('[data-ejercicio="0-0-0-0"]');
      await tocar('[data-ejercicio="0-0-0-0"] [data-click="ejercicioToggle"]');
      expect(cuerpoEj('0-0-0-0').hidden).toBe(false);
      expect(tarjeta.querySelector('[data-click="ejercicioToggle"]').getAttribute('aria-expanded')).toBe('true');

      await tocar('[data-ejercicio="0-0-0-0"] [data-click="ejercicioToggle"]');
      expect(cuerpoEj('0-0-0-0').hidden).toBe(true);
      expect($('[data-ejercicio="0-0-0-0"]')).toBe(tarjeta);
    });

    it('un ejercicio nuevo viene abierto para cargarlo', async () => {
      await abrir();
      await tocar('[data-click="ejercicioAgregar"][data-w="0"][data-d="0"][data-b="0"]');
      expect(cuerpoEj('0-0-0-2').hidden).toBe(false);
      expect(cuerpoEj('0-0-0-0').hidden).toBe(true); // los demás siguen plegados
    });

    it('cambiar el nombre del ejercicio desde el encabezado no lo pliega ni lo abre', async () => {
      await abrir();
      cambiar($('[data-ejercicio="0-0-0-0"] [data-campo="name"]'), 'Press inclinado');
      await esperar();
      expect(cuerpoEj('0-0-0-0').hidden).toBe(true);
      expect((await guardado()).weeks[0].days[0].blocks[0].exercises[0].name).toBe('Press inclinado');
    });

    it('los campos de un ejercicio plegado se pueden editar igual (siguen en la pantalla)', async () => {
      await abrir();
      cambiar($('[data-ejercicio="0-0-0-0"] [data-campo="sets"]'), '6');
      await esperar();
      expect((await guardado()).weeks[0].days[0].blocks[0].exercises[0].sets).toBe('6');
    });

    it('el resumen del ejercicio y el del día se actualizan al editar, sin redibujar', async () => {
      await abrir();
      const tarjeta = $('[data-ejercicio="0-0-0-0"]');
      cambiar($('[data-ejercicio="0-0-0-0"] [data-campo="sets"]'), '6');
      cambiar($('[data-ejercicio="0-0-0-0"] [data-campo="reps"]'), '5');
      cambiar($('[data-ejercicio="0-0-0-0"] [data-campo="intensityValue"]'), '1');
      await esperar();

      expect($('[data-ejercicio="0-0-0-0"] [data-ej-resumen]').textContent).toBe('6 × 5 · RIR 1');
      expect($('[data-dia-resumen="0-0"]').textContent).toBe('2 ejercicios · 9 series');
      expect($('[data-ejercicio="0-0-0-0"]')).toBe(tarjeta);
    });

    it('un ejercicio abierto sigue abierto después de una edición que redibuja', async () => {
      await abrir();
      await tocar('[data-ejercicio="0-0-0-1"] [data-click="ejercicioToggle"]');
      await tocar('[data-click="diaAgregar"][data-w="0"]');
      expect(cuerpoEj('0-0-0-1').hidden).toBe(false);
      expect(cuerpoEj('0-0-0-0').hidden).toBe(true);
    });
  });

  describe('plegar y abrir todo', () => {
    it('"Abrir todo" despliega los días y ejercicios de la semana abierta', async () => {
      await abrir();
      await tocar('[data-click="constructorAbrirTodo"]');

      expect($$('[data-dia-cuerpo]').every((c) => !c.hidden)).toBe(true);
      expect($$('[data-ej-cuerpo]').every((c) => !c.hidden)).toBe(true);
    });

    it('"Plegar todo" pliega los días y ejercicios de la semana abierta', async () => {
      await abrir();
      await tocar('[data-click="constructorAbrirTodo"]');
      await tocar('[data-click="constructorPlegarTodo"]');

      expect($$('[data-dia-cuerpo]').every((c) => c.hidden)).toBe(true);
      expect($$('[data-ej-cuerpo]').every((c) => c.hidden)).toBe(true);
    });

    it('solo afecta a la semana abierta: las otras conservan lo suyo', async () => {
      await abrir();
      await tocar('[data-click="semanaIr"][data-w="1"]'); // abre su primer día
      await tocar('[data-click="semanaIr"][data-w="0"]');
      await tocar('[data-click="constructorPlegarTodo"]');
      expect($$('[data-dia-cuerpo]').every((c) => c.hidden)).toBe(true);

      await tocar('[data-click="semanaIr"][data-w="1"]');
      expect(cuerpoDia(1, 0).hidden).toBe(false);
    });

    it('lo plegado queda así aunque se redibuje', async () => {
      await abrir();
      await tocar('[data-click="constructorPlegarTodo"]');
      await tocar('[data-click="diaAgregar"][data-w="0"]'); // redibuja; el día nuevo viene abierto
      expect(cuerpoDia(0, 0).hidden).toBe(true);
      expect(cuerpoDia(0, 1).hidden).toBe(true);
      expect(cuerpoDia(0, 2).hidden).toBe(false);
    });
  });

  it('regenerar la estructura arranca de nuevo: primer día abierto', async () => {
    await abrir();
    await tocar('[data-click="constructorAbrirTodo"]');
    await generar(2, 2);
    await responderConfirmacion(true);

    expect(cuerpoDia(0, 0).hidden).toBe(false);
    expect(cuerpoDia(0, 1).hidden).toBe(true);
  });
});
