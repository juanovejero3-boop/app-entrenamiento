import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asentar } from '../../test-helpers.js';
import { ALUMNO, planCompleto } from '../coaching/pdf/test-utils.js';
import { clienteDePrueba, repo } from '../coaching/repo/index.js';
import { sembrarPlan, registroDe } from '../coaching/repo/test-utils.js';
import { state } from '../../state.js';
import { alimentosIniciales } from '../nutricion/alimentos.js';
import { agregarItem, crearComida } from '../nutricion/comidas.js';
import { parametrosIniciales } from '../nutricion/objetivos.js';
import { repoNutricion } from '../nutricion/repoNutricion.js';
import { renderTabEntrenamiento, resetPlanillaPestanas } from './planilla.js';

// El motor de PDF no se usa acá, pero la vista del alumno lo importa
vi.mock('../coaching/pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../coaching/pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const COACH = { id: 'coach', role: 'admin', email: 'coach@ejemplo.com' };
const PERFIL_ALUMNO = { ...ALUMNO, role: 'alumno', sheet_url: 'https://docs.google.com/hoja' };

let content;
beforeEach(() => {
  // La vista del alumno abre la semana de "hoy": se fija la fecha para que los tests no dependan del día en que corren
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 20)); // el plan de prueba arranca el lunes 19/10/2026
  content = document.createElement('div');
  content.id = 'app-content'; // los botones de la pestaña redibujan en #app-content
  document.body.appendChild(content);
});
afterEach(() => {
  vi.useRealTimers();
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
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));

    await renderTabEntrenamiento(content);

    expect(content.textContent).toContain('Mi plan de entrenamiento');
    expect(content.textContent).toContain('Hipertrofia base');
    expect($('[data-ejercicio="e1"]')).not.toBeNull();
    expect($('a[href="https://docs.google.com/hoja"]')).not.toBeNull(); // la planilla de Sheets sigue
    expect($('[data-click="alumnoVolver"]')).toBeNull(); // el alumno no está en modo lectura
  });

  it('el alumno anota sus series y quedan guardadas', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
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

  it('si tiene ciclos anteriores los ve plegados debajo del activo', async () => {
    await repo.crearCiclo(
      ALUMNO.id,
      { ...planCompleto({ superserie: false }), macroName: 'Ciclo viejo' },
      'finalizado',
    );
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));

    await renderTabEntrenamiento(content);

    expect($('[data-ciclo-anterior-nombre]').textContent).toBe('Ciclo viejo');
    expect($('[data-ciclo-anterior-contenido]').hidden).toBe(true);
  });

  it('un ciclo en borrador no le muestra la sección de plan', async () => {
    await repo.crearCiclo(ALUMNO.id, planCompleto({ superserie: false }), 'borrador');
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  it('no mezcla el plan de otro alumno', async () => {
    await sembrarPlan('otro-alumno', planCompleto({ superserie: false }));
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });
});

describe('Planilla del coach: el entrenamiento del alumno en su ficha', () => {
  const OTRO = { id: 'u2', name: 'Lucía Gómez', email: 'lucia@ejemplo.com', role: 'alumno' };
  beforeEach(() => {
    state.currentUser = { id: COACH.id, email: COACH.email };
    state.userProfile = COACH;
    state.adminAllUsers = [PERFIL_ALUMNO, OTRO];
  });

  const seleccionar = async (id) => {
    $(`[data-click="adminPlanillaSeleccionar"][data-id="${id}"]`).click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno] [data-plan-alumno]')).not.toBeNull());
  };
  async function abrirFichaDelAlumno() {
    await renderTabEntrenamiento(content);
    await seleccionar(ALUMNO.id);
  }
  const anotaElAlumno = async (alumnoId, registro) => {
    const ciclo = (await repo.listarCiclos(alumnoId))[0];
    await repo.guardarRegistroDelCiclo(ciclo.id, registro);
  };

  it('la ficha muestra directo el entrenamiento del alumno, como lo ve él y en solo lectura, sin pantalla aparte', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await abrirFichaDelAlumno();

    const entrenamiento = $('[data-entrenamiento-alumno]');
    expect(entrenamiento.textContent).toContain('Hipertrofia base');
    expect(entrenamiento.querySelector('[data-en-vivo]').textContent).toContain('Observando cambios');
    expect(entrenamiento.querySelector('[data-click="alumnoVolver"]')).toBeNull(); // no hay a dónde volver
    expect([...entrenamiento.querySelectorAll('[data-change="alumnoSerie"]')].every((i) => i.disabled)).toBe(true);
    // y la ficha sigue ahí: pestañas, planilla de Sheets y el acceso a los ciclos
    expect($('[data-click="planillaAbrirCiclos"]')).not.toBeNull();
    expect($('[data-click="adminPlanillaActivar"]')).not.toBeNull();
  });

  it('ya no existe el botón "Ver como alumno", que reemplazaba toda la pantalla', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await abrirFichaDelAlumno();
    expect($('[data-click="planillaVerComoAlumno"]')).toBeNull();
  });

  it('las series que el alumno va completando aparecen en la ficha al instante', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await abrirFichaDelAlumno();
    const check = () => $('[data-click="alumnoCheck"][data-e="e1"][data-n="1"]');
    expect(check().getAttribute('aria-pressed')).toBe('false');

    await anotaElAlumno(ALUMNO.id, { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } });

    await vi.waitFor(() => expect(check().getAttribute('aria-pressed')).toBe('true'));
    expect($('[data-barra-fija] [data-progreso]').textContent).toBe('1 / 11 series');
  });

  it('si el alumno no tiene plan lo avisa dentro de la ficha', async () => {
    await abrirFichaDelAlumno();
    expect($('[data-entrenamiento-alumno]').textContent).toContain('todavía no tiene un plan');
  });

  it('con varios alumnos abiertos en pestañas, cada ficha muestra el entrenamiento del suyo', async () => {
    await sembrarPlan(ALUMNO.id, { ...planCompleto({ superserie: false }), macroName: 'Plan de Franco' });
    await sembrarPlan(OTRO.id, { ...planCompleto({ superserie: false }), macroName: 'Plan de Lucía' });
    await renderTabEntrenamiento(content);
    await seleccionar(ALUMNO.id);
    expect($('[data-entrenamiento-alumno]').textContent).toContain('Plan de Franco');

    // vuelve al buscador (las pestañas quedan abiertas) y abre al otro alumno
    $('[data-click="adminPlanillaMostrarBuscador"]').click();
    await seleccionar(OTRO.id);
    expect($('[data-entrenamiento-alumno]').textContent).toContain('Plan de Lucía');

    // vuelve a la pestaña del primero
    $(`[data-click="adminPlanillaActivar"][data-id="${ALUMNO.id}"]`).click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno]').textContent).toContain('Plan de Franco'));
  });

  it('solo escucha en vivo al alumno de la ficha que está abierta', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await sembrarPlan(OTRO.id, planCompleto({ superserie: false }));
    await renderTabEntrenamiento(content);
    await seleccionar(ALUMNO.id);
    $('[data-click="adminPlanillaMostrarBuscador"]').click();
    await seleccionar(OTRO.id);
    await anotaElAlumno(ALUMNO.id, { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } }); // el que ya no se mira
    await vi.waitFor(() => expect(clienteDePrueba.canalesActivos()).toBe(1));
  });

  it('"Ciclos de entrenamiento" abre los ciclos y "Volver" regresa a la ficha, con el entrenamiento a la vista', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await abrirFichaDelAlumno();
    $('[data-click="planillaAbrirCiclos"]').click();
    await vi.waitFor(() => expect($('[data-click="ciclosVolver"]')).not.toBeNull());

    $('[data-click="ciclosVolver"]').click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno] [data-plan-alumno]')).not.toBeNull());
    expect($('[data-entrenamiento-alumno]').textContent).toContain('Hipertrofia base');
  });

  it('si no se puede cargar el entrenamiento lo avisa en vez de dejar la ficha vacía', async () => {
    await renderTabEntrenamiento(content);
    vi.spyOn(repo, 'listarCiclos').mockRejectedValueOnce(new Error('sin conexión'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    $(`[data-click="adminPlanillaSeleccionar"][data-id="${ALUMNO.id}"]`).click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno]').textContent).toContain('No se pudo cargar'));
    expect($('[data-entrenamiento-alumno]').textContent).toContain('sin conexión');
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
    await sembrarPlan(COACH.id, planCompleto({ superserie: false }));

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

  it('si falla la carga de su plan, la planilla igual se muestra (sin esa sección)', async () => {
    vi.spyOn(repo, 'listarCiclos').mockRejectedValueOnce(new Error('sin conexión'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderTabEntrenamiento(content);
    expect($('#admin-planilla-search')).not.toBeNull();
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  describe('al volver al buscador desde la ficha de un alumno', () => {
    const abrirYVolver = async (cerrar) => {
      await sembrarPlan(COACH.id, planCompleto({ superserie: false }));
      await renderTabEntrenamiento(content);
      $(`[data-click="adminPlanillaSeleccionar"][data-id="${ALUMNO.id}"]`).click();
      await vi.waitFor(() => expect($('[data-entrenamiento-alumno]')).not.toBeNull());
      expect(content.textContent).not.toContain('Mi plan de entrenamiento'); // en la ficha no está
      cerrar();
    };
    const planDelCoach = () => vi.waitFor(() => expect($('[data-mi-plan] [data-plan-alumno]')).not.toBeNull());

    it('con "+" (buscador) el coach sigue viendo su plan', async () => {
      await abrirYVolver(() => $('[data-click="adminPlanillaMostrarBuscador"]').click());
      await planDelCoach();
      expect(content.textContent).toContain('Hipertrofia base');
      expect($('#admin-planilla-search')).not.toBeNull();
    });

    it('al cerrar la última pestaña también', async () => {
      await abrirYVolver(() => $(`[data-click="adminPlanillaCerrarPestana"][data-id="${ALUMNO.id}"]`).click());
      await planDelCoach();
      expect(content.textContent).toContain('Mi plan de entrenamiento');
    });

    it('sin plan propio no aparece la sección', async () => {
      await renderTabEntrenamiento(content);
      $(`[data-click="adminPlanillaSeleccionar"][data-id="${ALUMNO.id}"]`).click();
      await vi.waitFor(() => expect($('[data-entrenamiento-alumno]')).not.toBeNull());
      $('[data-click="adminPlanillaMostrarBuscador"]').click();
      await esperar();
      expect(content.textContent).not.toContain('Mi plan de entrenamiento');
    });
  });

  it('el buscador de alumnos sigue estando', async () => {
    await sembrarPlan(COACH.id, planCompleto({ superserie: false }));
    await renderTabEntrenamiento(content);
    expect($('#admin-planilla-search')).not.toBeNull();
  });

  it('sin un plan propio la pantalla queda como antes', async () => {
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  it('el plan de un alumno no aparece como plan del coach', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
    await renderTabEntrenamiento(content);
    expect(content.textContent).not.toContain('Mi plan de entrenamiento');
  });

  it('en su propia ficha ve su plan para completarlo: no es solo lectura ni en vivo', async () => {
    await sembrarPlan(COACH.id, planCompleto({ superserie: false }));
    await renderTabEntrenamiento(content);
    $(`[data-click="adminPlanillaSeleccionar"][data-id="${COACH.id}"]`).click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno] [data-plan-alumno]')).not.toBeNull());

    expect($('[data-entrenamiento-alumno]').textContent).not.toContain('Modo lectura');
    expect($('[data-en-vivo]')).toBeNull();
    expect(clienteDePrueba.canalesActivos()).toBe(0);
    expect([...content.querySelectorAll('[data-change="alumnoSerie"]')].some((i) => i.disabled)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan de alimentación: el alumno lo ve desde su Planilla y el coach, en modo lectura, desde la ficha
// ---------------------------------------------------------------------------

/** Le arma al usuario un plan de alimentación con un desayuno (guardado en la cuenta y publicado, como lo deja el coach). */
async function sembrarAlimentacion(usuarioId, { notas = 'Tomar agua.' } = {}) {
  const pollo = alimentosIniciales().find((a) => a.nombre === 'Pechuga de Pollo');
  const desayuno = crearComida({ nombre: 'Desayuno', hora: '08:00' });
  const comidas = agregarItem([desayuno], desayuno.id, desayuno.opciones[0].id, pollo, 1);
  const parametros = { ...parametrosIniciales({}), edad: 28, peso: 75, altura: 175 };
  await repoNutricion.guardarPlan(usuarioId, { parametros, comidas, notas });
  await repoNutricion.publicarPlan(usuarioId, true);
}
const botonAlimentacion = () => $('[data-click="planillaVerAlimentacion"]');

describe('Planilla del alumno: mi plan de alimentación', () => {
  beforeEach(() => {
    localStorage.clear();
    state.currentUser = { id: ALUMNO.id, email: ALUMNO.email };
    state.userProfile = { ...PERFIL_ALUMNO, nutrition_url: 'https://docs.google.com/nutricion' };
  });
  afterEach(() => localStorage.clear());

  const planEnLaPestana = () => $('[data-panel="nutricion"] [data-plan-de-alimentacion]');

  it('sin plan de alimentación en la app, la tarjeta queda como siempre (con el link a Sheets)', async () => {
    await renderTabEntrenamiento(content);
    expect(planEnLaPestana()).toBeNull();
    expect($('a[href="https://docs.google.com/nutricion"]')).not.toBeNull();
  });

  it('con plan, se ve directamente en la pestaña Nutrición (sin botón) y el link a Sheets queda debajo como alternativa', async () => {
    await sembrarAlimentacion(ALUMNO.id);
    await renderTabEntrenamiento(content);
    expect(botonAlimentacion()).toBeNull();
    expect(content.textContent).not.toMatch(/ver mi plan de alimentaci/i);
    const plan = planEnLaPestana();
    expect(plan.textContent).toContain('Desayuno');
    expect(plan.textContent).toContain('Tomar agua.');
    expect(plan.textContent).not.toMatch(/modo lectura/i);
    expect(plan.querySelector('[data-click="alimentacionVolver"]')).toBeNull();
    const sheets = $('a[href="https://docs.google.com/nutricion"]');
    expect(plan.compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // igual que en entrenamiento: una tarjeta con su título y el botón grande
    expect(sheets.textContent).toMatch(/abrir plan de nutrici/i);
    expect(sheets.closest('div').querySelector('h3').textContent).toContain('Planilla de Nutrición');
  });

  it('el plan trae el botón para bajarlo en PDF', async () => {
    await sembrarAlimentacion(ALUMNO.id);
    await renderTabEntrenamiento(content);
    expect(planEnLaPestana().querySelector('[data-click="alimentacionPdf"]')).not.toBeNull();
  });

  it('sin link a Sheets, no queda el cartel «Pronto te cargaremos...» cuando ya hay plan', async () => {
    state.userProfile = { ...PERFIL_ALUMNO, nutrition_url: null };
    await sembrarAlimentacion(ALUMNO.id);
    await renderTabEntrenamiento(content);
    expect(planEnLaPestana()).not.toBeNull();
    expect(content.textContent).not.toContain('Pronto te cargaremos tu plan de nutrición');
    expect($('[data-panel="nutricion"] a[href]')).toBeNull();
  });

  it('un plan sin ninguna comida cargada no cambia la tarjeta', async () => {
    await repoNutricion.guardarPlan(ALUMNO.id, {
      parametros: parametrosIniciales({}),
      comidas: [crearComida({ nombre: 'Vacía' })],
      notas: '',
    });
    await renderTabEntrenamiento(content);
    expect(planEnLaPestana()).toBeNull();
    expect($('a[href="https://docs.google.com/nutricion"]')).not.toBeNull();
  });

  it('ve solo su propio plan, aunque haya planes de otros', async () => {
    await sembrarAlimentacion(ALUMNO.id, { notas: 'Plan propio' });
    await sembrarAlimentacion('otro-alumno', { notas: 'Plan ajeno' });
    await renderTabEntrenamiento(content);
    expect(content.textContent).toContain('Plan propio');
    expect(content.textContent).not.toContain('Plan ajeno');
  });

  it('el plan de otro usuario no se muestra', async () => {
    await sembrarAlimentacion('otro-alumno');
    await renderTabEntrenamiento(content);
    expect(planEnLaPestana()).toBeNull();
  });

  it('un alumno no puede abrir el plan de otro aunque fabrique el botón', async () => {
    await sembrarAlimentacion('otro-alumno', { notas: 'Plan ajeno' });
    await renderTabEntrenamiento(content);
    const falso = document.createElement('button');
    falso.dataset.click = 'planillaVerAlimentacion';
    falso.dataset.id = 'otro-alumno';
    content.appendChild(falso);
    falso.click();
    await asentar();
    expect(content.textContent).not.toContain('Plan ajeno');
    expect(content.textContent).toContain('Planilla de Entrenamiento');
  });
});

describe('Planilla del coach: el plan de alimentación del alumno, en modo lectura', () => {
  const OTRO = { ...PERFIL_ALUMNO, nutrition_url: 'https://docs.google.com/nutricion' };
  beforeEach(() => {
    localStorage.clear();
    state.currentUser = { id: COACH.id, email: COACH.email };
    state.userProfile = COACH;
    state.adminAllUsers = [OTRO];
  });
  afterEach(() => localStorage.clear());

  async function abrirFicha() {
    await renderTabEntrenamiento(content);
    $(`[data-click="adminPlanillaSeleccionar"][data-id="${OTRO.id}"]`).click();
    await vi.waitFor(() => expect($('[data-entrenamiento-alumno]')).not.toBeNull());
  }

  const planEnLaFicha = () => $('[data-panel="nutricion"] [data-plan-de-alimentacion]');

  it('el coach ve el plan directamente en la pestaña Nutrición de la ficha, en modo lectura y con el nombre del alumno', async () => {
    await sembrarAlimentacion(OTRO.id);
    await abrirFicha();
    await vi.waitFor(() => expect(planEnLaFicha()).not.toBeNull());

    expect(botonAlimentacion()).toBeNull(); // ya no hace falta tocar nada para verlo
    expect(planEnLaFicha().querySelector('[data-modo-lectura]').textContent).toContain('Franco Soria');
    expect(planEnLaFicha().textContent).toContain('Desayuno');
    expect(planEnLaFicha().textContent).toContain('Tomar agua.');
    expect(planEnLaFicha().querySelectorAll('input, textarea, select')).toHaveLength(0); // solo mirar
  });

  it('el link a la planilla de Sheets queda debajo del plan', async () => {
    await sembrarAlimentacion(OTRO.id);
    await abrirFicha();
    await vi.waitFor(() => expect(planEnLaFicha()).not.toBeNull());
    const sheets = $('[data-panel="nutricion"] a[href="https://docs.google.com/nutricion"]');
    expect(planEnLaFicha().compareDocumentPosition(sheets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('si el alumno no tiene plan, lo dice y el link a Sheets sigue', async () => {
    await abrirFicha();
    await vi.waitFor(() => expect(planEnLaFicha()).not.toBeNull());
    expect(planEnLaFicha().textContent).toContain('Este alumno todavía no tiene un plan de alimentación');
    expect($('a[href="https://docs.google.com/nutricion"]')).not.toBeNull();
  });

  it('si todavía no lo mostró, el coach lo ve igual y se le avisa que el alumno no lo ve', async () => {
    await sembrarAlimentacion(OTRO.id);
    await repoNutricion.publicarPlan(OTRO.id, false);
    await abrirFicha();
    await vi.waitFor(() => expect(planEnLaFicha()).not.toBeNull());
    expect(planEnLaFicha().textContent).toContain('Desayuno');
    expect(planEnLaFicha().querySelector('[data-no-publicado]').textContent).toMatch(/todavía no lo mostraste/i);
  });

  it('con el plan publicado no hay aviso de borrador', async () => {
    await sembrarAlimentacion(OTRO.id);
    await abrirFicha();
    await vi.waitFor(() => expect(planEnLaFicha()).not.toBeNull());
    expect(planEnLaFicha().querySelector('[data-no-publicado]')).toBeNull();
  });
});
