import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { guardarSesionesDe, sembrarPlan } from '../repo/test-utils.js';
import { abrirPlanAlumno } from './planAlumno.js';
import { diaPendiente } from './sesiones.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'])) }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

const SEMANA_1 = '2026-10-20';
const SEMANA_2 = '2026-10-27';

const hecha = { fecha: SEMANA_1, terminadaEn: '', estado: 'hecha' };
const omitida = { fecha: SEMANA_1, terminadaEn: '', estado: 'omitida' };

/** Semana 1: Lunes (d1), Miércoles (d2), Jueves sin ejercicios (d3, descanso) y Viernes (d4). Semana 2: dos días. */
function planDeVariosDias() {
  const plan = planCompleto({ superserie: false });
  const ejercicio = (id) => ({ ...plan.weeks[0].days[0].blocks[0].exercises[0], id });
  const dia = (id, name, ejercicios) => ({
    id,
    name,
    blocks: ejercicios.length ? [{ id: `b-${id}`, type: 'fuerza', exercises: ejercicios.map(ejercicio) }] : [],
  });
  plan.weeks[0].days = [
    plan.weeks[0].days[0],
    dia('d2', 'Miércoles - Pierna', ['x2']),
    dia('d3', 'Jueves - Descanso', []),
    dia('d4', 'Viernes - Full', ['x4']),
  ];
  plan.weeks[1].days = [dia('d5', 'Lunes - Torso', ['x5']), dia('d6', 'Jueves - Pierna', ['x6'])];
  return plan;
}

describe('diaPendiente', () => {
  const semana = planDeVariosDias().weeks[0];

  it('sin nada terminado es el primer día con ejercicios', () => {
    expect(diaPendiente(semana, {})).toBe(0);
  });

  it('es el primer día que todavía no se terminó', () => {
    expect(diaPendiente(semana, { d1: hecha })).toBe(1);
  });

  it('un día que se marcó como no entrenado también cuenta como completo', () => {
    expect(diaPendiente(semana, { d1: hecha, d2: omitida })).toBe(3);
  });

  it('salta los días sin ejercicios (el descanso)', () => {
    expect(diaPendiente(semana, { d1: hecha, d2: hecha })).toBe(3);
  });

  it('con todos completos queda en el último día con ejercicios', () => {
    expect(diaPendiente(semana, { d1: hecha, d2: hecha, d4: hecha })).toBe(3);
  });

  it('una semana sin ejercicios cae en el primer día', () => {
    expect(diaPendiente({ days: [{ id: 'z', name: 'Descanso', blocks: [] }] }, {})).toBe(0);
    expect(diaPendiente({ days: [] }, {})).toBe(0);
  });
});

describe('vista del alumno: el día seleccionado al abrir', () => {
  let content;
  beforeEach(async () => {
    content = document.createElement('div');
    document.body.appendChild(content);
    await sembrarPlan(ALUMNO.id, planDeVariosDias());
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const abrir = (hoy, opciones) => abrirPlanAlumno(content, ALUMNO, { hoy, ...opciones });
  const seleccionado = () => content.querySelector('[data-click="alumnoDia"][aria-current="true"]')?.dataset.d;

  it('sin días terminados abre en el primero', async () => {
    await abrir(SEMANA_1);
    expect(seleccionado()).toBe('0');
  });

  it('abre en el primer día de la semana actual que todavía no se completó', async () => {
    await guardarSesionesDe(ALUMNO.id, { d1: hecha });
    await abrir(SEMANA_1);
    expect(seleccionado()).toBe('1');
    expect(content.textContent).toContain('Miércoles - Pierna');
  });

  it('un día no entrenado no se vuelve a ofrecer', async () => {
    await guardarSesionesDe(ALUMNO.id, { d1: hecha, d2: omitida });
    await abrir(SEMANA_1);
    expect(seleccionado()).toBe('3');
  });

  it('con la semana completa abre en el último día', async () => {
    await guardarSesionesDe(ALUMNO.id, { d1: hecha, d2: hecha, d4: hecha });
    await abrir(SEMANA_1);
    expect(seleccionado()).toBe('3');
  });

  it('en la semana siguiente mira solo los días de esa semana', async () => {
    await guardarSesionesDe(ALUMNO.id, { d1: hecha, d2: hecha, d4: hecha });
    await abrir(SEMANA_2);
    expect(seleccionado()).toBe('0');
    expect(content.textContent).toContain('Lunes - Torso');
  });

  it('el coach en modo lectura ve el mismo día', async () => {
    await guardarSesionesDe(ALUMNO.id, { d1: hecha });
    await abrir(SEMANA_1, { soloLectura: true });
    expect(seleccionado()).toBe('1');
  });
});
