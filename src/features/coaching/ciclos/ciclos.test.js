import { describe, expect, it } from 'vitest';
import { crearPlan, generarEstructura } from '../entrenamiento/plan.js';
import {
  ciclosAnteriores,
  cicloActivo,
  fechaFinDelPlan,
  fechaInicioSugerida,
  planCopiado,
  sumarDias,
} from './ciclos.js';

const plan = (inicio, semanas) =>
  generarEstructura({ ...crearPlan({ fechaInicio: inicio }), macroName: 'M' }, semanas, 2);
const ciclo = (id, estado, planDelCiclo, creadoEn = `2026-01-0${id}T00:00:00Z`) => ({
  id: String(id),
  estado,
  plan: planDelCiclo,
  creadoEn,
});

describe('sumarDias', () => {
  it.each([
    ['2026-10-19', 1, '2026-10-20'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-10-19', -1, '2026-10-18'],
    ['2026-03-28', 2, '2026-03-30'], // cruza el cambio de horario sin correr un día
  ])('%s + %i días = %s', (fecha, dias, esperado) => {
    expect(sumarDias(fecha, dias)).toBe(esperado);
  });
});

describe('fechaFinDelPlan', () => {
  it('es el último día de la última semana (inicio + semanas × 7 − 1)', () => {
    expect(fechaFinDelPlan(plan('2026-10-19', 2))).toBe('2026-11-01');
    expect(fechaFinDelPlan(plan('2026-10-19', 1))).toBe('2026-10-25');
  });

  it('sin fecha de inicio o sin semanas no hay fin', () => {
    expect(fechaFinDelPlan(plan('', 2))).toBeNull();
    expect(fechaFinDelPlan(crearPlan({ fechaInicio: '2026-10-19' }))).toBeNull();
  });
});

describe('fechaInicioSugerida', () => {
  it('el día siguiente al fin del ciclo que termina más tarde', () => {
    const ciclos = [ciclo(1, 'finalizado', plan('2026-09-07', 4)), ciclo(2, 'activo', plan('2026-10-05', 2))];
    expect(fechaInicioSugerida(ciclos, '2026-10-01')).toBe('2026-10-19'); // el 2.º termina el 18/10
  });

  it('ignora los ciclos sin fecha de fin', () => {
    const ciclos = [ciclo(1, 'borrador', plan('', 2)), ciclo(2, 'borrador', crearPlan({ fechaInicio: '2026-10-05' }))];
    expect(fechaInicioSugerida(ciclos, '2026-10-16')).toBe('2026-10-16');
  });

  it('sin ciclos arranca hoy', () => {
    expect(fechaInicioSugerida([], '2026-10-16')).toBe('2026-10-16');
  });
});

describe('cicloActivo y ciclosAnteriores', () => {
  const ciclos = [
    ciclo(1, 'finalizado', plan('2026-08-03', 2)),
    ciclo(2, 'borrador', plan('2026-12-01', 2)),
    ciclo(3, 'finalizado', plan('2026-09-07', 2)),
    ciclo(4, 'activo', plan('2026-10-05', 2)),
  ];

  it('el activo es el único con estado activo (o ninguno)', () => {
    expect(cicloActivo(ciclos).id).toBe('4');
    expect(cicloActivo([ciclos[0], ciclos[1]])).toBeNull();
    expect(cicloActivo([])).toBeNull();
  });

  it('los anteriores son los finalizados, del más reciente al más viejo', () => {
    expect(ciclosAnteriores(ciclos).map((c) => c.id)).toEqual(['3', '1']);
  });
});

describe('planCopiado', () => {
  it('copia el plan con otra fecha de inicio y marca el nombre como copia', () => {
    const original = plan('2026-09-07', 2);
    const copia = planCopiado(original, '2026-10-19');

    expect(copia.startDate).toBe('2026-10-19');
    expect(copia.macroName).toBe('M (copia)');
    expect(copia.weeks).toEqual(original.weeks); // mismo contenido
    expect(original.startDate).toBe('2026-09-07'); // el original no cambia
    expect(copia.weeks).not.toBe(original.weeks);
  });
});
