import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirConstructorDePlanes } from './constructorDePlanes.js';
import { crearRepoLocal } from '../repo/local.js';
import '../../../lib/ui.js'; // modales propios: window.confirm real de la app

const ALUMNO = { id: 'alumno-1', name: 'Ana Pérez', email: 'ana@ejemplo.com' };
const repo = crearRepoLocal();

let content;
let alVolver;

beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
  alVolver = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const guardado = () => repo.cargarPlanEntrenamiento(ALUMNO.id);
const abrir = () => abrirConstructorDePlanes(content, ALUMNO, { alVolver });

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
  it('muestra el alumno y, si no tiene plan, invita a generar la estructura', async () => {
    await abrir();
    expect(content.textContent).toContain('Ana Pérez');
    expect(content.textContent).toContain('todavía no tiene un plan');
    expect($('[data-click="planGenerar"]')).not.toBeNull();
  });

  it('carga el plan guardado del alumno al abrir', async () => {
    await repo.guardarPlanEntrenamiento(ALUMNO.id, {
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
    const superserie = campoEj('isSuperset');
    superserie.checked = true;
    superserie.dispatchEvent(new Event('change', { bubbles: true }));
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
      isSuperset: true,
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
