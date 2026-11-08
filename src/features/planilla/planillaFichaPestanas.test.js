import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALUMNO, planCompleto } from '../coaching/pdf/test-utils.js';
import { sembrarPlan } from '../coaching/repo/test-utils.js';
import { state } from '../../state.js';
import { alimentosIniciales } from '../nutricion/alimentos.js';
import { agregarItem, crearComida } from '../nutricion/comidas.js';
import { parametrosIniciales } from '../nutricion/objetivos.js';
import { repoNutricion } from '../nutricion/repoNutricion.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './planilla.js';

vi.mock('../coaching/pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../coaching/pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const COACH = { id: 'coach', role: 'admin', email: 'coach@ejemplo.com' };
const ALUMNA = {
  ...ALUMNO,
  role: 'alumno',
  sheet_url: 'https://docs.google.com/entrenamiento',
  nutrition_url: 'https://docs.google.com/nutricion',
};

let content;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20));
  content = document.createElement('div');
  content.id = 'app-content';
  document.body.appendChild(content);
  Object.assign(state, { currentUser: { id: COACH.id }, userProfile: COACH, adminAllUsers: [ALUMNA] });
  await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
  const pollo = alimentosIniciales().find((a) => a.nombre === 'Pechuga de Pollo');
  const almuerzo = crearComida({ nombre: 'Almuerzo', hora: '13:00' });
  await repoNutricion.guardarPlan(ALUMNO.id, {
    parametros: parametrosIniciales({}),
    comidas: agregarItem([almuerzo], almuerzo.id, almuerzo.opciones[0].id, pollo, 2),
    notas: '',
  });
  await renderTabEntrenamiento(content);
  content.querySelector(`[data-click="adminPlanillaSeleccionar"][data-id="${ALUMNO.id}"]`).click();
  await vi.waitFor(() => expect(content.querySelector('[data-click="planillaSubpestana"]')).not.toBeNull());
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  resetPlanillaPestanas();
  Object.assign(state, { currentUser: null, userProfile: null, adminAllUsers: [] });
});

const $ = (selector) => content.querySelector(selector);
const pestana = (nombre) => $(`[data-click="planillaSubpestana"][data-tab="${nombre}"]`);
const panel = (nombre) => $(`[data-panel="${nombre}"]`);
const visible = (nombre) => !panel(nombre).hidden;

describe('ficha del alumno (coach): pestañas Entrenamiento y Nutrición', () => {
  it('tiene las dos pestañas y abre en Entrenamiento', () => {
    expect(pestana('entrenamiento').textContent).toMatch(/Entrenamiento/);
    expect(pestana('nutricion').textContent).toMatch(/Nutrici/);
    expect(pestana('entrenamiento').getAttribute('aria-selected')).toBe('true');
    expect(visible('entrenamiento')).toBe(true);
    expect(visible('nutricion')).toBe(false);
  });

  it('los datos del alumno quedan arriba de las pestañas', () => {
    const datos = [...content.querySelectorAll('h3')].find((h) => h.textContent.includes('Franco Soria'));
    expect(datos.compareDocumentPosition(pestana('entrenamiento')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('tocar Nutrición muestra lo de nutrición y oculta lo de entrenamiento, y al revés', () => {
    pestana('nutricion').click();
    expect(visible('nutricion')).toBe(true);
    expect(visible('entrenamiento')).toBe(false);
    expect(pestana('nutricion').getAttribute('aria-selected')).toBe('true');
    pestana('entrenamiento').click();
    expect(visible('entrenamiento')).toBe(true);
  });

  describe('Entrenamiento', () => {
    it('lleva los ciclos, el entrenamiento del alumno y, al final, el link a la planilla de Sheets', () => {
      const p = panel('entrenamiento');
      const ciclos = p.querySelector('[data-click="planillaAbrirCiclos"]');
      const alumno = p.querySelector('[data-entrenamiento-alumno]');
      const sheets = p.querySelector('a[href="https://docs.google.com/entrenamiento"]');
      expect(ciclos).not.toBeNull();
      expect(alumno).not.toBeNull();
      expect(sheets).not.toBeNull();
      expect(ciclos.compareDocumentPosition(alumno) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(alumno.compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sigue mostrando el entrenamiento del alumno en solo lectura', async () => {
      await vi.waitFor(() => expect(panel('entrenamiento').querySelector('[data-ejercicio="e1"]')).not.toBeNull());
      expect(panel('entrenamiento').querySelector('[data-change="alumnoSerie"]').disabled).toBe(true); // el coach no anota
    });

    it('no incluye nada de nutrición', () => {
      expect(panel('entrenamiento').querySelector('[data-click="planillaVerAlimentacion"]')).toBeNull();
      expect(panel('entrenamiento').querySelector('a[href="https://docs.google.com/nutricion"]')).toBeNull();
    });
  });

  describe('Nutrición', () => {
    it('lleva el plan de alimentación del alumno (directo, sin botón) y debajo el link a Sheets', async () => {
      const p = panel('nutricion');
      await vi.waitFor(() => expect(p.querySelector('[data-plan-de-alimentacion]')).not.toBeNull());
      const plan = p.querySelector('[data-plan-de-alimentacion]');
      const sheets = p.querySelector('a[href="https://docs.google.com/nutricion"]');
      expect(p.querySelector('[data-click="planillaVerAlimentacion"]')).toBeNull();
      expect(plan.textContent).toContain('Almuerzo');
      expect(plan.compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('no incluye nada de entrenamiento', () => {
      expect(panel('nutricion').querySelector('[data-click="planillaAbrirCiclos"]')).toBeNull();
      expect(panel('nutricion').querySelector('[data-entrenamiento-alumno]')).toBeNull();
    });
  });

  describe('recuerda dónde estaba', () => {
    it('cambiar de pestaña no recarga el entrenamiento del alumno', async () => {
      await vi.waitFor(() => expect(panel('entrenamiento').querySelector('[data-ejercicio="e1"]')).not.toBeNull());
      const antes = panel('entrenamiento').querySelector('[data-ejercicio="e1"]');
      pestana('nutricion').click();
      pestana('entrenamiento').click();
      expect(panel('entrenamiento').querySelector('[data-ejercicio="e1"]')).toBe(antes);
    });

    it('la pestaña del coach es independiente de la que usa un alumno en su propia Planilla', async () => {
      pestana('nutricion').click();
      resetPlanillaPestanas();
      Object.assign(state, { userProfile: { ...ALUMNA }, adminAllUsers: [] });
      await renderTabEntrenamiento(content);
      expect(pestana('entrenamiento').getAttribute('aria-selected')).toBe('true');
    });
  });
});
