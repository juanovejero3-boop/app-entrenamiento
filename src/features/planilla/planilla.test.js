import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALUMNO, planCompleto } from '../coaching/pdf/test-utils.js';
import { sembrarPlan, registroDe } from '../coaching/repo/test-utils.js';
import { state } from '../../state.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './planilla.js';

// El motor de PDF no se usa acá, pero la vista del alumno lo importa
vi.mock('../coaching/pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../coaching/pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const COACH = { id: 'coach', role: 'admin', email: 'coach@ejemplo.com' };
const PERFIL_ALUMNO = { ...ALUMNO, role: 'alumno', sheet_url: 'https://docs.google.com/hoja' };

let content;
beforeEach(() => {
  content = document.createElement('div');
  content.id = 'app-content'; // los botones de la pestaña redibujan en #app-content
  document.body.appendChild(content);
});
afterEach(() => {
  document.body.innerHTML = '';
  resetPlanillaPestanas();
  Object.assign(state, { currentUser: null, userProfile: null, adminAllUsers: [] });
});

const $ = (selector) => content.querySelector(selector);
const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('Planilla del alumno: mi plan de entrenamiento', () => {
  beforeEach(() => {
    state.currentUser = { id: ALUMNO.id, email: ALUMNO.email };
    state.userProfile = PERFIL_ALUMNO;
  });

  it('si el entrenador le armó un plan, lo ve debajo de las tarjetas de siempre', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());

    await renderTabEntrenamiento(content);

    expect(content.textContent).toContain('Mi plan de entrenamiento');
    expect(content.textContent).toContain('Hipertrofia base');
    expect($('[data-ejercicio="e1"]')).not.toBeNull();
    expect($('a[href="https://docs.google.com/hoja"]')).not.toBeNull(); // la planilla de Sheets sigue
    expect($('[data-click="alumnoVolver"]')).toBeNull(); // el alumno no está en modo lectura
  });

  it('el alumno anota sus series y quedan guardadas', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());
    await renderTabEntrenamiento(content);

    const kg = $('[data-change="alumnoSerie"][data-e="e1"][data-n="1"][data-campo="kg"]');
    kg.value = '80';
    kg.dispatchEvent(new Event('change', { bubbles: true }));
    await esperar();

    expect((await registroDe(ALUMNO.id)).e1[1].kg).toBe('80');
  });

  it('si no tiene plan en la app, la pantalla queda como antes (sin sección nueva)', async () => {
    await renderTabEntrenamiento(content);

    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
    expect(content.textContent).not.toContain('todavía no cargó tu plan');
    expect($('a[href="https://docs.google.com/hoja"]')).not.toBeNull();
  });

  it('no mezcla el plan de otro alumno', async () => {
    await sembrarPlan('otro-alumno', planCompleto());
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });
});

describe('Planilla del coach: ver como alumno', () => {
  beforeEach(() => {
    state.currentUser = { id: COACH.id, email: COACH.email };
    state.userProfile = COACH;
    state.adminAllUsers = [PERFIL_ALUMNO];
  });

  async function abrirFichaDelAlumno() {
    await renderTabEntrenamiento(content);
    $('[data-click="adminPlanillaSeleccionar"]').click();
  }

  it('la ficha del alumno tiene "Ver como alumno" junto a "Armar / editar macrociclo"', async () => {
    await abrirFichaDelAlumno();
    expect($('[data-click="planillaAbrirConstructorDePlanes"]')).not.toBeNull();
    expect($('[data-click="planillaVerComoAlumno"]')).not.toBeNull();
  });

  it('abre el plan de ese alumno en modo lectura, sin poder anotar', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());
    await abrirFichaDelAlumno();

    $('[data-click="planillaVerComoAlumno"]').click();
    await esperar();

    expect(content.textContent).toContain('Modo lectura');
    expect(content.textContent).toContain('Hipertrofia base');
    expect([...content.querySelectorAll('[data-change="alumnoSerie"]')].every((i) => i.disabled)).toBe(true);
  });

  it('"Volver" regresa a la ficha del alumno', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());
    await abrirFichaDelAlumno();
    $('[data-click="planillaVerComoAlumno"]').click();
    await esperar();

    $('[data-click="alumnoVolver"]').click();

    expect($('[data-click="planillaAbrirConstructorDePlanes"]')).not.toBeNull();
    expect(content.textContent).not.toContain('Modo lectura');
  });

  it('si el alumno no tiene plan lo avisa', async () => {
    await abrirFichaDelAlumno();
    $('[data-click="planillaVerComoAlumno"]').click();
    await esperar();
    expect(content.textContent).toContain('todavía no tiene un plan');
  });
});

describe('Planilla del coach: su propio plan', () => {
  const PERFIL_COACH = { ...COACH, name: 'Coach Prime' };
  beforeEach(() => {
    state.currentUser = { id: COACH.id, email: COACH.email };
    state.userProfile = PERFIL_COACH;
    state.adminAllUsers = [PERFIL_COACH, PERFIL_ALUMNO];
  });

  it('si tiene un plan asignado lo ve en su Planilla y puede completarlo', async () => {
    await sembrarPlan(COACH.id, planCompleto());

    await renderTabEntrenamiento(content);

    expect(content.textContent).toContain('Mi plan de entrenamiento');
    expect(content.textContent).toContain('Hipertrofia base');
    expect(content.textContent).not.toContain('Modo lectura');
    const inputs = [...content.querySelectorAll('[data-change="alumnoSerie"]')];
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.some((i) => i.disabled)).toBe(false);

    inputs[0].value = '100';
    inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
    await esperar();
    expect(Object.values((await registroDe(COACH.id)).e1)[0].kg).toBe('100');
  });

  it('el buscador de alumnos sigue estando', async () => {
    await sembrarPlan(COACH.id, planCompleto());
    await renderTabEntrenamiento(content);
    expect($('#admin-planilla-search')).not.toBeNull();
  });

  it('sin un plan propio la pantalla queda como antes', async () => {
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  it('el plan de un alumno no aparece como plan del coach', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  it('en su propia ficha, "Ver mi plan" abre el plan para completarlo (no en solo lectura)', async () => {
    await sembrarPlan(COACH.id, planCompleto());
    await renderTabEntrenamiento(content);
    $(`[data-click="adminPlanillaSeleccionar"][data-id="${COACH.id}"]`).click();

    const boton = $('[data-click="planillaVerComoAlumno"]');
    expect(boton.textContent).toContain('Ver mi plan');
    boton.click();
    await esperar();

    expect(content.textContent).not.toContain('Modo lectura');
    expect([...content.querySelectorAll('[data-change="alumnoSerie"]')].some((i) => i.disabled)).toBe(false);
    $('[data-click="alumnoVolver"]').click(); // y se puede volver a la ficha
    expect($('[data-click="planillaAbrirConstructorDePlanes"]')).not.toBeNull();
  });
});
