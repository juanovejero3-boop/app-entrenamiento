import { describe, expect, it } from 'vitest';
import { actualizarSerie, cantidadDeSeries, normalizarRegistro, progresoDelDia, serieDe } from './registro.js';

const ej = (id, sets) => ({ id, name: id, sets });
const dia = (...ejercicios) => ({
  blocks: [{ exercises: ejercicios.slice(0, 1) }, { exercises: ejercicios.slice(1) }],
});

describe('cantidadDeSeries', () => {
  it.each([
    ['4', 4],
    ['3-4', 3],
    ['4 x', 4],
    ['', 1],
    ['al fallo', 1],
    [undefined, 1],
  ])('"%s" -> %i filas de registro', (sets, esperado) => {
    expect(cantidadDeSeries({ sets })).toBe(esperado);
  });
});

describe('serieDe y actualizarSerie', () => {
  it('una serie sin datos viene vacía y sin hacer', () => {
    expect(serieDe({}, 'e1', 1)).toEqual({ kg: '', reps: '', done: false });
  });

  it('guarda kg, reps y check de una serie sin tocar las demás', () => {
    let r = actualizarSerie({}, 'e1', 1, { kg: '80' });
    r = actualizarSerie(r, 'e1', 1, { reps: '8', done: true });
    r = actualizarSerie(r, 'e1', 2, { kg: '82.5' });

    expect(serieDe(r, 'e1', 1)).toEqual({ kg: '80', reps: '8', done: true });
    expect(serieDe(r, 'e1', 2)).toEqual({ kg: '82.5', reps: '', done: false });
    expect(serieDe(r, 'e2', 1)).toEqual({ kg: '', reps: '', done: false });
  });

  it('no modifica el registro original', () => {
    const original = actualizarSerie({}, 'e1', 1, { kg: '80' });
    actualizarSerie(original, 'e1', 1, { kg: '90' });
    expect(serieDe(original, 'e1', 1).kg).toBe('80');
  });
});

describe('progresoDelDia', () => {
  it('cuenta las series hechas sobre el total de todos los bloques del día', () => {
    const d = dia(ej('a', '3'), ej('b', '2'), ej('c', '1'));
    let r = actualizarSerie({}, 'a', 1, { done: true });
    r = actualizarSerie(r, 'a', 2, { done: true });
    r = actualizarSerie(r, 'b', 1, { done: true });

    expect(progresoDelDia(d, r)).toEqual({ hechas: 3, total: 6 });
  });

  it('las series marcadas pero fuera del rango de series del ejercicio no cuentan', () => {
    // el entrenador bajó las series de 3 a 1 después de que el alumno ya había marcado la 3
    const d = dia(ej('a', '1'));
    const r = actualizarSerie({}, 'a', 3, { done: true });
    expect(progresoDelDia(d, r)).toEqual({ hechas: 0, total: 1 });
  });

  it('un día sin ejercicios no tiene progreso', () => {
    expect(progresoDelDia({ blocks: [] }, {})).toEqual({ hechas: 0, total: 0 });
  });
});

describe('normalizarRegistro', () => {
  it('conserva un registro válido', () => {
    const r = { e1: { 1: { kg: '80', reps: '8', done: true } } };
    expect(normalizarRegistro(r)).toEqual(r);
  });

  it('descarta lo que no tiene la forma esperada y fuerza los tipos', () => {
    expect(
      normalizarRegistro({
        e1: { 1: { kg: 80, reps: null, done: 1 }, 2: 'basura', x: { kg: '1' } },
        e2: 'basura',
        e3: null,
      }),
    ).toEqual({ e1: { 1: { kg: '80', reps: '', done: true } } });
  });

  it.each([[null], ['texto'], [[]], [undefined]])('un dato que no es un objeto (%j) da un registro vacío', (dato) => {
    expect(normalizarRegistro(dato)).toEqual({});
  });
});
