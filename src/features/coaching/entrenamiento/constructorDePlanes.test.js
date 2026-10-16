import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirConstructorDePlanes } from './constructorDePlanes.js';
import { crearPlan } from './plan.js';
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
    expect($$('[data-semana]')).toHaveLength(3);
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
    $('[data-click="semanaDuplicar"][data-w="0"]').click();
    await esperar();
    expect((await guardado()).weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 1 (copia)', 'Semana 2']);

    $('[data-click="semanaEliminar"][data-w="1"]').click();
    await esperar();
    expect(await responderConfirmacion(true)).toContain('Semana 1 (copia)');
    expect((await guardado()).weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 2']);
    expect($$('[data-semana]')).toHaveLength(2);
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
