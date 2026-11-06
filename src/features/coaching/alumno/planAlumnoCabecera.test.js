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
  await sembrarPlan(ALUMNO.id, planCompleto());
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

describe('vista del alumno: cabecera fija de cada ejercicio', () => {
  it('el nombre, el resumen y los títulos de las columnas están en una cabecera que se pega al scrollear', () => {
    abrir('e1');
    const c = cabecera('e1');
    expect(c.classList.contains('sticky')).toBe(true);
    expect(c.textContent).toContain('Press banca');
    expect(c.querySelector('[data-ej-resumen]')).not.toBeNull();
    expect(columnas('e1').textContent).toMatch(/Serie\s*Kg\s*Reps\s*Listo\s*No/);
  });

  it('se pega justo debajo de la barra fija de semanas, días y progreso', () => {
    expect(cabecera('e1').getAttribute('style')).toContain('var(--barra-fija-h');
    expect(content.style.getPropertyValue('--barra-fija-h')).toMatch(/^\d+px$/);
    expect($('[data-barra-fija]').classList.contains('sticky')).toBe(true);
  });

  it('cada ejercicio tiene la suya: con varios desplegados no se pisan entre sí', () => {
    abrir('e1');
    abrir('e2');
    expect(cabecera('e1')).not.toBe(cabecera('e2'));
    expect(tarjeta('e1').contains(cabecera('e1'))).toBe(true);
    expect(tarjeta('e2').contains(cabecera('e2'))).toBe(true);
  });

  it('las columnas solo se ven con el ejercicio desplegado', () => {
    expect(columnas('e1').hidden).toBe(true);
    abrir('e1');
    expect(columnas('e1').hidden).toBe(false);
    abrir('e1');
    expect(columnas('e1').hidden).toBe(true);
  });

  it('en un ejercicio por tiempo la columna se llama Seg', async () => {
    const plan = planCompleto();
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

  it('las insignias van arriba de los títulos de las columnas, dentro de la parte fija', () => {
    const c = cabecera('e1');
    const insignia = c.querySelector('[data-insignia]');
    expect(insignia).not.toBeNull();
    expect(insignia.compareDocumentPosition(columnas('e1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('la última marca no va en la parte fija: se va con el scroll', () => {
    expect(cabecera('e1').querySelector('[data-ultima-marca]')).toBeNull();
    expect(tarjeta('e1').querySelector('[data-ultima-marca]')).not.toBeNull();
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

  it('un día sin terminar no muestra fecha', async () => {
    await abrirConSesiones({});
    expect(fechaDelDia(0)).toBeNull();
    expect(fechaDelDia(1)).toBeNull();
  });
});
