import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { guardarSesionesDe, sembrarPlan } from '../repo/test-utils.js';
import { abrirPlanAlumno } from './planAlumno.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'])) }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

let content;
beforeEach(async () => {
  content = document.createElement('div');
  document.body.appendChild(content);
  await sembrarPlan(ALUMNO.id, planCompleto({ superserie: false }));
  await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const tarjeta = (id) => $(`[data-ejercicio="${id}"]`);
const cabecera = (id) => tarjeta(id).querySelector('[data-ej-cabecera]');
const columnas = (id) => tarjeta(id).querySelector('[data-ej-columnas]');
const abrir = (id) => tarjeta(id).querySelector('button[data-click="alumnoEjercicio"]').click();

describe('vista del alumno: cabecera de cada ejercicio', () => {
  it('reúne el nombre, el avance, los datos, la última marca y los títulos de las columnas', () => {
    abrir('e1');
    const c = cabecera('e1');
    expect(c.textContent).toContain('Press banca');
    expect(c.querySelector('[data-ej-resumen]')).not.toBeNull();
    expect(c.querySelector('[data-insignia]')).not.toBeNull();
    expect(c.querySelector('[data-ultima-marca]')).not.toBeNull();
    expect(columnas('e1').textContent).toMatch(/Serie\s*Kg\s*Reps\s*Listo\s*No/);
  });

  it('no es fija: se va con el scroll como el resto de la tarjeta', () => {
    expect(cabecera('e1').classList.contains('sticky')).toBe(false);
    expect(cabecera('e1').getAttribute('style') ?? '').not.toContain('barra-fija-h');
  });

  it('las columnas solo se ven con el ejercicio desplegado', () => {
    expect(columnas('e1').hidden).toBe(true);
    abrir('e1');
    expect(columnas('e1').hidden).toBe(false);
    abrir('e1');
    expect(columnas('e1').hidden).toBe(true);
  });

  it('en un ejercicio por tiempo la columna se llama Seg', async () => {
    const plan = planCompleto({ superserie: false });
    plan.weeks[0].days[0].blocks[0].exercises[2].reps = '20"';
    await sembrarPlan(ALUMNO.id, plan);
    await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
    expect(columnas('e3').textContent).toMatch(/Seg/);
    expect(columnas('e1').textContent).toMatch(/Reps/);
  });

  it('las insignias (reps, intensidad, descanso) siguen visibles y también abren el ejercicio', () => {
    const insignias = tarjeta('e1').querySelector('[data-insignia]');
    expect(insignias).not.toBeNull();
    insignias.click();
    expect(columnas('e1').hidden).toBe(false);
  });

  it('las insignias van arriba de los títulos de las columnas', () => {
    const insignia = cabecera('e1').querySelector('[data-insignia]');
    expect(insignia.compareDocumentPosition(columnas('e1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la última marca va arriba de los títulos de las columnas', () => {
    abrir('e1');
    const marca = cabecera('e1').querySelector('[data-ultima-marca]');
    expect(
      marca.compareDocumentPosition(columnas('e1').querySelector('.grid')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('la última marca solo se ve con el ejercicio desplegado (con el plegado no ocupa lugar)', () => {
    expect(columnas('e1').hidden).toBe(true);
    expect(columnas('e1').contains(cabecera('e1').querySelector('[data-ultima-marca]'))).toBe(true);
  });
});

describe('vista del alumno: barra fija de semanas y días', () => {
  it('sigue siendo una sola barra pegada al tope, con las semanas, los días y el avance', () => {
    const barra = $('[data-barra-fija]');
    expect(barra.classList.contains('sticky')).toBe(true);
    expect(barra.querySelectorAll('[data-click="alumnoSemana"]')).toHaveLength(2);
    expect(barra.querySelectorAll('[data-click="alumnoDia"]')).toHaveLength(2);
    expect(barra.querySelector('[data-progreso]')).not.toBeNull();
    expect(barra.querySelector('[data-semana-actual]')).toBeNull(); // sin la etiqueta «S1» de la versión chica
  });
});

describe('vista del alumno: fecha en la pestaña del día terminado', () => {
  const abrirConSesiones = async (sesiones) => {
    await guardarSesionesDe(ALUMNO.id, sesiones);
    await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
  };
  const fechaDelDia = (i) => $(`[data-click="alumnoDia"][data-d="${i}"] [data-dia-fecha]`);

  it('un día terminado muestra debajo del nombre el día y el mes en que se entrenó', async () => {
    await abrirConSesiones({ d1: { fecha: '2026-11-08', terminadaEn: '2026-11-08T21:00:00.000Z', estado: 'hecha' } });
    expect(fechaDelDia(0).textContent).toBe('8/11');
  });

  it('un día que no se entrenó también muestra su fecha', async () => {
    await abrirConSesiones({ d1: { fecha: '2026-10-21', terminadaEn: '2026-10-21T21:00:00.000Z', estado: 'omitida' } });
    expect(fechaDelDia(0).textContent).toBe('21/10');
  });

  it('la fecha queda centrada respecto del nombre del día, sin contar el tilde (que va al costado)', async () => {
    await abrirConSesiones({ d1: { fecha: '2026-11-02', terminadaEn: '2026-11-02T21:00:00.000Z', estado: 'hecha' } });
    const chip = $('[data-click="alumnoDia"][data-d="0"]');
    const nombre = chip.querySelector('span.relative');
    expect(nombre.textContent).toContain('Lunes - Torso');
    expect(nombre.querySelector('.fa-check').classList.contains('absolute')).toBe(true); // no ocupa lugar en el centrado
    expect(nombre.contains(fechaDelDia(0))).toBe(false); // la fecha es una línea aparte, debajo
  });

  it('un día sin terminar no muestra fecha', async () => {
    await abrirConSesiones({});
    expect(fechaDelDia(0)).toBeNull();
    expect(fechaDelDia(1)).toBeNull();
  });
});
