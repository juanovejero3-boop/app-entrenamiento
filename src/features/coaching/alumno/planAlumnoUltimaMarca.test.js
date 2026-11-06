import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { guardarRegistroDe, sembrarPlan } from '../repo/test-utils.js';
import { abrirPlanAlumno } from './planAlumno.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'])) }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

const SEMANA_1 = '2026-10-20';
const SEMANA_2 = '2026-10-27';

/** El plan de prueba con la semana 2 igual a la 1 pero con ids propios (como cuando el coach propaga la semana). */
function planConDosSemanas() {
  const plan = planCompleto();
  const copia = structuredClone(plan.weeks[0]);
  copia.id = 'w2';
  copia.name = 'Semana 2';
  for (const dia of copia.days) {
    dia.id += '-s2';
    for (const bloque of dia.blocks) {
      bloque.id += '-s2';
      for (const ej of bloque.exercises) ej.id += '-s2';
    }
  }
  plan.weeks[1] = copia;
  return plan;
}

let content;
beforeEach(async () => {
  content = document.createElement('div');
  document.body.appendChild(content);
  await sembrarPlan(ALUMNO.id, planConDosSemanas());
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const marcaDe = (ejercicio) => $(`[data-ejercicio="${ejercicio}"] [data-ultima-marca]`);
const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const abrir = (hoy) => abrirPlanAlumno(content, ALUMNO, { hoy });
const hecha = (kg) => ({ kg, reps: '8', done: true, skipped: false });

describe('vista del alumno: última marca de cada ejercicio', () => {
  it('sin registros avisa que todavía no hay marcas en el ciclo', async () => {
    await abrir(SEMANA_1);
    expect(texto(marcaDe('e1'))).toContain('Aún no registras marcas de este ejercicio en el ciclo actual');
    expect(marcaDe('e1').hasAttribute('data-sin-marca')).toBe(true);
  });

  it('en la semana 2 muestra cómo empezó y cómo terminó cada ejercicio la semana 1', async () => {
    await guardarRegistroDe(ALUMNO.id, { e1: { 1: hecha('60'), 2: hecha('62.5'), 3: hecha('65'), 4: hecha('65') } });
    await abrir(SEMANA_2);
    expect(texto(marcaDe('e1-s2'))).toContain(
      'Semana 1 · Lunes - Torso: empezaste con 60 kg y cerraste la serie 4 con 65 kg',
    );
    // otro ejercicio que no se hizo: sigue sin marcas
    expect(texto(marcaDe('e2-s2'))).toContain('Aún no registras marcas');
  });

  it('un ejercicio con el mismo peso en todas las series lo dice una sola vez', async () => {
    await guardarRegistroDe(ALUMNO.id, { e3: { 1: hecha('20'), 2: hecha('20'), 3: hecha('20') } });
    await abrir(SEMANA_2);
    expect(texto(marcaDe('e3-s2'))).toContain('usaste 20 kg en 3 series');
  });

  it('en la semana 1 no mira nada de la semana 2', async () => {
    await guardarRegistroDe(ALUMNO.id, { 'e1-s2': { 1: hecha('70') } });
    await abrir(SEMANA_1);
    expect(texto(marcaDe('e1'))).toContain('Aún no registras marcas');
  });

  it('el coach en modo lectura ve lo mismo', async () => {
    await guardarRegistroDe(ALUMNO.id, { e1: { 1: hecha('60') } });
    await abrirPlanAlumno(content, ALUMNO, { hoy: SEMANA_2, soloLectura: true });
    expect(texto(marcaDe('e1-s2'))).toContain('usaste 60 kg en la serie 1');
  });
});
