import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { registroDe, sembrarPlan } from '../repo/test-utils.js';
import { abrirPlanAlumno } from './planAlumno.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'])) }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

let content;
beforeEach(async () => {
  content = document.createElement('div');
  document.body.appendChild(content);
  const plan = planCompleto({ superserie: false });
  // Fondos (e3) pasa a ser por tiempo: el coach lo anota como 20"
  for (const ej of plan.weeks[0].days[0].blocks.flatMap((b) => b.exercises)) if (ej.id === 'e3') ej.reps = '20"';
  await sembrarPlan(ALUMNO.id, plan);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const esperar = () => new Promise((r) => setTimeout(r, 0));
const abrir = () => abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
const campo = (ejercicio, serie, nombre) =>
  $(`[data-change="alumnoSerie"][data-e="${ejercicio}"][data-n="${serie}"][data-campo="${nombre}"]`);
function escribir(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('vista del alumno: series por tiempo', () => {
  it('el campo sigue con teclado numérico, muestra la unidad aparte y su ayuda es el número', async () => {
    await abrir();
    const reps = campo('e3', 1, 'reps');
    expect(reps.getAttribute('inputmode')).toBe('decimal');
    expect(reps.getAttribute('placeholder')).toBe('20');
    expect(reps.parentElement.querySelector('[data-unidad-tiempo]').textContent).toBe('seg');
    expect(reps.getAttribute('aria-label')).toContain('Segundos');
  });

  it('la columna se llama Seg en el ejercicio por tiempo y Reps en los demás', async () => {
    await abrir();
    const encabezado = (id) => $(`[data-ejercicio="${id}"]`).textContent;
    expect(encabezado('e3')).toMatch(/Seg/);
    expect($('[data-ejercicio="e1"] [data-unidad-tiempo]')).toBeNull();
  });

  it('el alumno escribe solo el número y se guarda como lo anota el coach (20")', async () => {
    await abrir();
    escribir(campo('e3', 1, 'reps'), '25');
    await esperar();
    expect((await registroDe(ALUMNO.id)).e3[1].reps).toBe('25"');
  });

  it('al volver a abrir el campo muestra solo el número', async () => {
    await abrir();
    escribir(campo('e3', 1, 'reps'), '25');
    await esperar();
    await abrir();
    expect(campo('e3', 1, 'reps').value).toBe('25');
  });

  it('los ejercicios con repeticiones no cambian: se guarda tal cual', async () => {
    await abrir();
    escribir(campo('e1', 1, 'reps'), '9');
    await esperar();
    expect((await registroDe(ALUMNO.id)).e1[1].reps).toBe('9');
    expect(campo('e1', 1, 'reps').getAttribute('inputmode')).toBe('numeric');
  });
});
