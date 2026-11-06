import { describe, expect, it } from 'vitest';
import { textoUltimaMarca, ultimaMarca } from './ultimaMarca.js';

const ej = (id, name = 'Press banca') => ({ id, name, sets: '4', reps: '8', blocks: [] });
const dia = (id, name, ...ejercicios) => ({
  id,
  name,
  blocks: [{ id: `b-${id}`, type: 'fuerza', exercises: ejercicios }],
});
const semana = (n, ...dias) => ({ id: `w${n}`, name: `Semana ${n}`, days: dias });
const hecha = (kg) => ({ kg, reps: '8', done: true, skipped: false });

// Ciclo de 3 semanas con dos días de torso cada una (mismo ejercicio, ids distintos en cada semana)
const plan = {
  weeks: [
    semana(1, dia('d1', 'Lunes', ej('s1l')), dia('d2', 'Jueves', ej('s1j'))),
    semana(2, dia('d3', 'Lunes', ej('s2l')), dia('d4', 'Jueves', ej('s2j'))),
    semana(3, dia('d5', 'Lunes', ej('s3l')), dia('d6', 'Jueves', ej('s3j'))),
  ],
};
const press = (id) => ej(id);

describe('ultimaMarca', () => {
  it('sin ningún registro anterior no hay marca', () => {
    expect(ultimaMarca(plan, {}, { w: 0, d: 0 }, press('s1l'))).toBeNull();
    expect(ultimaMarca(plan, {}, { w: 2, d: 1 }, press('s3j'))).toBeNull();
  });

  it('toma lo que se hizo la semana anterior, desde la primera hasta la última serie hecha', () => {
    const registro = { s1l: { 1: hecha('60'), 2: hecha('62.5'), 3: hecha('65') } };
    expect(ultimaMarca(plan, registro, { w: 1, d: 0 }, press('s2l'))).toMatchObject({
      semana: 'Semana 1',
      dia: 'Lunes',
      primera: { n: 1, kg: '60' },
      ultima: { n: 3, kg: '65' },
      cantidad: 3,
    });
  });

  it('si no entrenó en la semana anterior, busca más atrás dentro del ciclo', () => {
    const registro = { s1l: { 1: hecha('60') } };
    expect(ultimaMarca(plan, registro, { w: 2, d: 0 }, press('s3l'))?.semana).toBe('Semana 1');
  });

  it('si no lo hizo ese día pero sí otro día de la misma semana, usa ese', () => {
    const registro = { s2j: { 1: hecha('70') } }; // jueves de la semana 2
    const marca = ultimaMarca(plan, registro, { w: 2, d: 0 }, press('s3l'));
    expect(marca).toMatchObject({ semana: 'Semana 2', dia: 'Jueves' });
  });

  it('el día anterior de la misma semana también cuenta, y gana al de una semana anterior', () => {
    const registro = { s1j: { 1: hecha('60') }, s2l: { 1: hecha('65') } };
    expect(ultimaMarca(plan, registro, { w: 1, d: 1 }, press('s2j'))).toMatchObject({
      semana: 'Semana 2',
      dia: 'Lunes',
    });
  });

  it('no mira el mismo día ni los días que vienen después', () => {
    const registro = { s2l: { 1: hecha('65') }, s2j: { 1: hecha('70') }, s3l: { 1: hecha('72') } };
    expect(ultimaMarca(plan, registro, { w: 1, d: 0 }, press('s2l'))).toBeNull();
  });

  it('solo cuentan las series hechas: ni las omitidas ni los pesos que quedaron copiados sin hacer', () => {
    const registro = {
      s1l: {
        1: hecha('60'),
        2: hecha('62.5'),
        3: { kg: '62.5', reps: '', done: false, skipped: false }, // peso copiado de la serie anterior, sin hacer
        4: { kg: '', reps: '', done: false, skipped: true },
      },
    };
    const marca = ultimaMarca(plan, registro, { w: 1, d: 0 }, press('s2l'));
    expect(marca).toMatchObject({ primera: { n: 1, kg: '60' }, ultima: { n: 2, kg: '62.5' }, cantidad: 2 });
  });

  it('una serie hecha sin peso (peso corporal) no cuenta como marca', () => {
    const registro = { s1l: { 1: { kg: '', reps: '10', done: true, skipped: false } } };
    expect(ultimaMarca(plan, registro, { w: 1, d: 0 }, press('s2l'))).toBeNull();
  });

  it('reconoce el ejercicio por nombre aunque cambien mayúsculas, tildes o espacios', () => {
    const otro = {
      weeks: [
        semana(1, dia('d1', 'Lunes', ej('a', 'Sentadilla Búlgara'))),
        semana(2, dia('d2', 'Lunes', ej('b', '  sentadilla bulgara '))),
      ],
    };
    const registro = { a: { 1: hecha('30') } };
    expect(ultimaMarca(otro, registro, { w: 1, d: 0 }, ej('b', '  sentadilla bulgara '))?.primera.kg).toBe('30');
  });

  it('no mezcla ejercicios con otro nombre', () => {
    const otro = {
      weeks: [
        semana(1, dia('d1', 'Lunes', ej('a', 'Press banca'))),
        semana(2, dia('d2', 'Lunes', ej('b', 'Press inclinado'))),
      ],
    };
    expect(ultimaMarca(otro, { a: { 1: hecha('60') } }, { w: 1, d: 0 }, ej('b', 'Press inclinado'))).toBeNull();
  });

  it('un ejercicio sin nombre no tiene marca', () => {
    expect(ultimaMarca(plan, {}, { w: 1, d: 0 }, ej('x', '  '))).toBeNull();
  });

  it('con una semana o un día sin la estructura esperada no se rompe', () => {
    const raro = {
      weeks: [
        { id: 'w', name: 'S1', days: [{ id: 'd', name: 'L', blocks: [] }] },
        { id: 'w2', name: 'S2', days: [] },
      ],
    };
    expect(ultimaMarca(raro, {}, { w: 1, d: 0 }, press('x'))).toBeNull();
  });
});

describe('textoUltimaMarca', () => {
  const marca = (primera, ultima, cantidad) => ({
    semana: 'Semana 2',
    dia: 'Lunes - Torso',
    primera,
    ultima,
    cantidad,
  });

  it('sin marcas avisa que todavía no hay en el ciclo', () => {
    expect(textoUltimaMarca(null)).toBe('Aún no registras marcas de este ejercicio en el ciclo actual');
  });

  it('con pesos distintos cuenta cómo empezó y cómo terminó', () => {
    expect(textoUltimaMarca(marca({ n: 1, kg: '60' }, { n: 4, kg: '65' }, 4))).toBe(
      'Semana 2 · Lunes - Torso: empezaste con 60 kg y cerraste la serie 4 con 65 kg',
    );
  });

  it('con el mismo peso en todas, lo dice una sola vez', () => {
    expect(textoUltimaMarca(marca({ n: 1, kg: '60' }, { n: 4, kg: '60' }, 4))).toBe(
      'Semana 2 · Lunes - Torso: usaste 60 kg en 4 series',
    );
  });

  it('con una sola serie hecha', () => {
    expect(textoUltimaMarca(marca({ n: 2, kg: '60' }, { n: 2, kg: '60' }, 1))).toBe(
      'Semana 2 · Lunes - Torso: usaste 60 kg en la serie 2',
    );
  });
});
