import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALUMNO, planCompleto } from '../coaching/pdf/test-utils.js';
import { sembrarPlan } from '../coaching/repo/test-utils.js';
import { state } from '../../state.js';
import { alimentosIniciales } from '../nutricion/alimentos.js';
import { agregarItem, crearComida } from '../nutricion/comidas.js';
import { parametrosIniciales } from '../nutricion/objetivos.js';
import { repoNutricion } from '../nutricion/repoLocal.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './planilla.js';

vi.mock('../coaching/pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../coaching/pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const PERFIL = {
  ...ALUMNO,
  role: 'alumno',
  sheet_url: 'https://docs.google.com/entrenamiento',
  nutrition_url: 'https://docs.google.com/nutricion',
};

let content;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20));
  localStorage.clear();
  content = document.createElement('div');
  content.id = 'app-content';
  document.body.appendChild(content);
  state.currentUser = { id: ALUMNO.id, email: ALUMNO.email };
  state.userProfile = PERFIL;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  resetPlanillaPestanas();
  Object.assign(state, { currentUser: null, userProfile: null, adminAllUsers: [] });
});

const $ = (selector) => content.querySelector(selector);
const pestana = (nombre) => $(`[data-click="planillaSubpestana"][data-tab="${nombre}"]`);
const panel = (nombre) => $(`[data-panel="${nombre}"]`);
const visible = (nombre) => !panel(nombre).hidden;

function sembrarAlimentacion() {
  const pollo = alimentosIniciales().find((a) => a.nombre === 'Pechuga de Pollo');
  const c = crearComida({ nombre: 'Almuerzo', hora: '13:00' });
  const comidas = agregarItem([c], c.id, c.opciones[0].id, pollo, 2);
  repoNutricion.guardarPlan(ALUMNO.id, { parametros: parametrosIniciales({}), comidas, notas: '' });
}

describe('Planilla del alumno: pestañas Entrenamiento y Nutrición', () => {
  it('tiene dos pestañas y abre en Entrenamiento', async () => {
    await renderTabEntrenamiento(content);
    expect(pestana('entrenamiento').textContent).toMatch(/Entrenamiento/);
    expect(pestana('nutricion').textContent).toMatch(/Nutrici/);
    expect(pestana('entrenamiento').getAttribute('aria-selected')).toBe('true');
    expect(pestana('nutricion').getAttribute('aria-selected')).toBe('false');
    expect(visible('entrenamiento')).toBe(true);
    expect(visible('nutricion')).toBe(false);
  });

  it('tocar Nutrición muestra lo de nutrición y oculta el entrenamiento, y al revés', async () => {
    await renderTabEntrenamiento(content);
    pestana('nutricion').click();
    expect(visible('nutricion')).toBe(true);
    expect(visible('entrenamiento')).toBe(false);
    expect(pestana('nutricion').getAttribute('aria-selected')).toBe('true');
    pestana('entrenamiento').click();
    expect(visible('entrenamiento')).toBe(true);
    expect(visible('nutricion')).toBe(false);
  });

  describe('Entrenamiento', () => {
    it('primero lo que cargó el coach en la app y debajo el link a la planilla de Sheets', async () => {
      await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
      await renderTabEntrenamiento(content);
      const plan = panel('entrenamiento').querySelector('[data-mi-plan]');
      const sheets = panel('entrenamiento').querySelector('a[href="https://docs.google.com/entrenamiento"]');
      expect(plan).not.toBeNull();
      expect(sheets).not.toBeNull();
      expect(plan.compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sin plan en la app queda solo la planilla de Sheets, como siempre', async () => {
      await renderTabEntrenamiento(content);
      expect(panel('entrenamiento').querySelector('[data-mi-plan]')).toBeNull();
      expect(panel('entrenamiento').querySelector('a[href="https://docs.google.com/entrenamiento"]')).not.toBeNull();
    });

    it('sin planilla asignada y sin plan avisa que pronto lo van a cargar', async () => {
      state.userProfile = { ...PERFIL, sheet_url: null };
      await renderTabEntrenamiento(content);
      expect(panel('entrenamiento').textContent).toContain('Pronto te cargaremos tu entrenamiento');
    });

    it('lo de nutrición no aparece dentro de Entrenamiento', async () => {
      await renderTabEntrenamiento(content);
      expect(panel('entrenamiento').textContent).not.toMatch(/plan de nutrici/i);
      expect(panel('entrenamiento').querySelector('a[href="https://docs.google.com/nutricion"]')).toBeNull();
    });
  });

  describe('Nutrición', () => {
    it('muestra el link a Sheets de nutrición como siempre', async () => {
      await renderTabEntrenamiento(content);
      expect(panel('nutricion').querySelector('a[href="https://docs.google.com/nutricion"]')).not.toBeNull();
      expect(panel('nutricion').querySelector('a[href="https://docs.google.com/entrenamiento"]')).toBeNull();
    });

    it('con plan de alimentación en la app, el botón va arriba y el link a Sheets queda debajo', async () => {
      sembrarAlimentacion();
      await renderTabEntrenamiento(content);
      const boton = panel('nutricion').querySelector('[data-click="planillaVerAlimentacion"]');
      const sheets = panel('nutricion').querySelector('a[href="https://docs.google.com/nutricion"]');
      expect(boton).not.toBeNull();
      expect(boton.compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sin nada asignado avisa que pronto lo van a cargar', async () => {
      state.userProfile = { ...PERFIL, nutrition_url: null };
      await renderTabEntrenamiento(content);
      expect(panel('nutricion').textContent).toContain('Pronto te cargaremos tu plan de nutrición');
    });
  });

  describe('recuerda dónde estaba', () => {
    it('al volver del plan de alimentación, vuelve a la pestaña Nutrición', async () => {
      sembrarAlimentacion();
      await renderTabEntrenamiento(content);
      pestana('nutricion').click();
      panel('nutricion').querySelector('[data-click="planillaVerAlimentacion"]').click();
      content.querySelector('[data-click="alimentacionVolver"]').click();
      await vi.waitFor(() => expect($('[data-click="planillaSubpestana"]')).not.toBeNull());
      expect(pestana('nutricion').getAttribute('aria-selected')).toBe('true');
      expect(visible('nutricion')).toBe(true);
    });

    it('cambiar de pestaña no vuelve a cargar el entrenamiento ni pierde lo que estaba abierto', async () => {
      await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
      await renderTabEntrenamiento(content);
      const antes = $('[data-mi-plan]');
      pestana('nutricion').click();
      pestana('entrenamiento').click();
      expect($('[data-mi-plan]')).toBe(antes);
    });
  });
});

describe('Planilla del coach: no cambia', () => {
  it('el coach no ve las pestañas del alumno', async () => {
    state.userProfile = { id: 'coach', role: 'admin', email: 'coach@ejemplo.com' };
    state.adminAllUsers = [{ ...PERFIL }];
    await renderTabEntrenamiento(content);
    expect($('[data-click="planillaSubpestana"]')).toBeNull();
    expect($('#admin-planilla-search')).not.toBeNull();
  });
});
