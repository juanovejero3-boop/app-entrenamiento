import { describe, expect, it } from 'vitest';
import {
  actualizarSerie,
  cantidadDeSeries,
  normalizarRegistro,
  omitirTodasLasSeries,
  pasarPendientesAOmitidas,
  progresoDelDia,
  serieDe,
} from './registro.js';

const ej = (id, sets) => ({ id, name: id, sets });
const dia = (...ejercicios) => ({
  blocks: [{ exercises: ejercicios.slice(0, 1) }, { exercises: ejercicios.slice(1) }],
});
const VACIA = { kg: '', reps: '', done: false, skipped: false };

describe('cantidadDeSeries', () => {
  it.each([
    ['4', 4],
    ['3-4', 4], // un rango se registra hasta el máximo
    ['3 - 4', 4],
    ['3–4', 4], // con guion largo
    ['3 a 4', 4],
    ['10-12', 12],
    ['4-3', 4], // rango al revés
    ['4 x', 4],
    ['', 1],
    ['al fallo', 1],
    [undefined, 1],
  ])('"%s" -> %i filas de registro', (sets, esperado) => {
    expect(cantidadDeSeries({ sets })).toBe(esperado);
  });
});

describe('serieDe y actualizarSerie', () => {
  it('una serie sin datos viene vacía: sin hacer y sin omitir', () => {
    expect(serieDe({}, 'e1', 1)).toEqual(VACIA);
  });

  it('guarda kg, reps y check de una serie sin tocar las demás', () => {
    let r = actualizarSerie({}, 'e1', 1, { kg: '80' });
    r = actualizarSerie(r, 'e1', 1, { reps: '8', done: true });
    r = actualizarSerie(r, 'e1', 2, { kg: '82.5' });

    expect(serieDe(r, 'e1', 1)).toEqual({ kg: '80', reps: '8', done: true, skipped: false });
    expect(serieDe(r, 'e1', 2)).toEqual({ ...VACIA, kg: '82.5' });
    expect(serieDe(r, 'e2', 1)).toEqual(VACIA);
  });

  it('marcar una serie como omitida la saca de hechas, y marcarla como hecha la saca de omitidas', () => {
    let r = actualizarSerie({}, 'e1', 1, { done: true });
    r = actualizarSerie(r, 'e1', 1, { skipped: true });
    expect(serieDe(r, 'e1', 1)).toMatchObject({ done: false, skipped: true });

    r = actualizarSerie(r, 'e1', 1, { done: true });
    expect(serieDe(r, 'e1', 1)).toMatchObject({ done: true, skipped: false });
  });

  it('desmarcar una serie omitida la devuelve a pendiente', () => {
    let r = actualizarSerie({}, 'e1', 1, { skipped: true });
    r = actualizarSerie(r, 'e1', 1, { skipped: false });
    expect(serieDe(r, 'e1', 1)).toMatchObject({ done: false, skipped: false });
  });

  it('omitir una serie no borra lo que ya había anotado en ella', () => {
    let r = actualizarSerie({}, 'e1', 1, { kg: '80', reps: '5' });
    r = actualizarSerie(r, 'e1', 1, { skipped: true });
    expect(serieDe(r, 'e1', 1)).toEqual({ kg: '80', reps: '5', done: false, skipped: true });
  });

  it('no modifica el registro original', () => {
    const original = actualizarSerie({}, 'e1', 1, { kg: '80' });
    actualizarSerie(original, 'e1', 1, { kg: '90' });
    expect(serieDe(original, 'e1', 1).kg).toBe('80');
  });
});

describe('progresoDelDia', () => {
  it('cuenta las series hechas y las omitidas sobre el total de todos los bloques del día', () => {
    const d = dia(ej('a', '3'), ej('b', '2'), ej('c', '1'));
    let r = actualizarSerie({}, 'a', 1, { done: true });
    r = actualizarSerie(r, 'a', 2, { done: true });
    r = actualizarSerie(r, 'a', 3, { skipped: true });
    r = actualizarSerie(r, 'b', 1, { done: true });

    expect(progresoDelDia(d, r)).toEqual({ hechas: 3, omitidas: 1, total: 6 });
  });

  it('un ejercicio con rango cuenta sus filas hasta el máximo', () => {
    expect(progresoDelDia(dia(ej('a', '3-4')), {})).toEqual({ hechas: 0, omitidas: 0, total: 4 });
  });

  it('las series marcadas pero fuera del rango de series del ejercicio no cuentan', () => {
    // el entrenador bajó las series de 3 a 1 después de que el alumno ya había marcado la 3
    const d = dia(ej('a', '1'));
    let r = actualizarSerie({}, 'a', 3, { done: true });
    r = actualizarSerie(r, 'a', 2, { skipped: true });
    expect(progresoDelDia(d, r)).toEqual({ hechas: 0, omitidas: 0, total: 1 });
  });

  it('un día sin ejercicios no tiene progreso', () => {
    expect(progresoDelDia({ blocks: [] }, {})).toEqual({ hechas: 0, omitidas: 0, total: 0 });
  });
});

describe('normalizarRegistro', () => {
  it('conserva un registro válido', () => {
    const r = {
      e1: {
        1: { kg: '80', reps: '8', done: true, skipped: false },
        2: { kg: '', reps: '', done: false, skipped: true },
      },
    };
    expect(normalizarRegistro(r)).toEqual(r);
  });

  it('un registro guardado antes de existir "omitida" se completa con skipped: false', () => {
    expect(normalizarRegistro({ e1: { 1: { kg: '80', reps: '8', done: true } } })).toEqual({
      e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } },
    });
  });

  it('una serie no puede estar hecha y omitida a la vez: gana hecha', () => {
    expect(normalizarRegistro({ e1: { 1: { done: true, skipped: true } } }).e1[1]).toMatchObject({
      done: true,
      skipped: false,
    });
  });

  it('descarta lo que no tiene la forma esperada y fuerza los tipos', () => {
    expect(
      normalizarRegistro({
        e1: { 1: { kg: 80, reps: null, done: 1 }, 2: 'basura', x: { kg: '1' } },
        e2: 'basura',
        e3: null,
      }),
    ).toEqual({ e1: { 1: { kg: '80', reps: '', done: true, skipped: false } } });
  });

  it.each([[null], ['texto'], [[]], [undefined]])('un dato que no es un objeto (%j) da un registro vacío', (dato) => {
    expect(normalizarRegistro(dato)).toEqual({});
  });
});

describe('omitirTodasLasSeries', () => {
  it('marca todas las series del día como omitidas, también las que estaban hechas', () => {
    const d = dia(ej('a', '3'), ej('b', '2-3'));
    let r = actualizarSerie({}, 'a', 1, { done: true });
    r = actualizarSerie(r, 'b', 2, { skipped: true });

    const nuevo = omitirTodasLasSeries(d, r);

    expect(progresoDelDia(d, nuevo)).toEqual({ hechas: 0, omitidas: 6, total: 6 });
    expect(serieDe(nuevo, 'a', 1)).toMatchObject({ done: false, skipped: true });
  });

  it('conserva los kg y las reps que ya se habían anotado y no toca el registro original', () => {
    const d = dia(ej('a', '1'));
    const original = actualizarSerie({}, 'a', 1, { kg: '80', reps: '3', done: true });
    expect(serieDe(omitirTodasLasSeries(d, original), 'a', 1)).toEqual({
      kg: '80',
      reps: '3',
      done: false,
      skipped: true,
    });
    expect(serieDe(original, 'a', 1).done).toBe(true);
  });
});

describe('pasarPendientesAOmitidas', () => {
  it('marca como omitidas las series que no estaban hechas ni omitidas, en todo el día', () => {
    const d = dia(ej('a', '3'), ej('b', '2'));
    let r = actualizarSerie({}, 'a', 1, { done: true });
    r = actualizarSerie(r, 'b', 2, { skipped: true });

    const nuevo = pasarPendientesAOmitidas(d, r);

    expect(progresoDelDia(d, nuevo)).toEqual({ hechas: 1, omitidas: 4, total: 5 });
    expect(serieDe(nuevo, 'a', 1).done).toBe(true); // lo hecho sigue hecho
    expect(serieDe(nuevo, 'a', 2).skipped).toBe(true);
    expect(serieDe(nuevo, 'b', 1).skipped).toBe(true);
  });

  it('no borra lo que ya estaba anotado en una serie pendiente', () => {
    const d = dia(ej('a', '1'));
    const r = actualizarSerie({}, 'a', 1, { kg: '80', reps: '3' });
    expect(serieDe(pasarPendientesAOmitidas(d, r), 'a', 1)).toEqual({
      kg: '80',
      reps: '3',
      done: false,
      skipped: true,
    });
  });

  it('con un rango de series (3-4) llega hasta la última fila', () => {
    const d = dia(ej('a', '3-4'));
    let r = actualizarSerie({}, 'a', 1, { done: true });
    r = actualizarSerie(r, 'a', 2, { done: true });
    r = actualizarSerie(r, 'a', 3, { done: true });
    expect(progresoDelDia(d, pasarPendientesAOmitidas(d, r))).toEqual({ hechas: 3, omitidas: 1, total: 4 });
  });

  it('no toca ejercicios de otros días ni el registro original', () => {
    const d = dia(ej('a', '1'));
    const original = actualizarSerie({}, 'otro', 1, { kg: '5' });
    const nuevo = pasarPendientesAOmitidas(d, original);
    expect(serieDe(nuevo, 'otro', 1)).toEqual({ kg: '5', reps: '', done: false, skipped: false });
    expect(serieDe(original, 'a', 1).skipped).toBe(false);
  });
});
