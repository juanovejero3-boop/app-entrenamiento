import { describe, expect, it } from 'vitest';
import {
  actualizarEjercicio,
  actualizarSemana,
  agregarBloque,
  agregarDia,
  agregarEjercicio,
  agregarSemana,
  actualizarBloque,
  actualizarDia,
  contarSeries,
  crearPlan,
  duplicarSemana,
  eliminarBloque,
  eliminarDia,
  eliminarEjercicio,
  fechasDeSemana,
  generarEstructura,
  propagarDia,
  propagarEjercicio,
} from './plan.js';

/** Todos los ids del plan (semanas, días, bloques y ejercicios). */
function idsDe(plan) {
  return plan.weeks.flatMap((w) => [
    w.id,
    ...w.days.flatMap((d) => [d.id, ...d.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]),
  ]);
}

/** Plan chico armado a mano: 1 semana, 1 día, 1 bloque con 1 ejercicio. */
function planChico() {
  return {
    macroName: 'Fuerza base',
    startDate: '2026-10-19',
    report: { focus: '', evaluation: '' },
    weeks: [
      {
        id: 'w1',
        name: 'Semana 1',
        objective: 'Hipertrofia',
        targetVolume: '',
        days: [
          {
            id: 'd1',
            name: 'Día 1',
            blocks: [{ id: 'b1', type: 'fuerza', exercises: [{ id: 'e1', name: 'Sentadilla', sets: '4', reps: '6' }] }],
          },
        ],
      },
    ],
  };
}

describe('crearPlan', () => {
  it('crea un macrociclo vacío con la fecha de inicio dada', () => {
    expect(crearPlan({ fechaInicio: '2026-10-19' })).toEqual({
      macroName: 'Nuevo Macrociclo',
      startDate: '2026-10-19',
      report: { focus: '', evaluation: '' },
      weeks: [],
    });
  });
});

describe('generarEstructura', () => {
  it('arma N semanas con M días vacíos cada una, numeradas', () => {
    const plan = generarEstructura(crearPlan({ fechaInicio: '2026-10-19' }), 3, 2);

    expect(plan.weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 2', 'Semana 3']);
    expect(plan.weeks.map((w) => w.days.map((d) => d.name))).toEqual([
      ['Día 1', 'Día 2'],
      ['Día 1', 'Día 2'],
      ['Día 1', 'Día 2'],
    ]);
    expect(plan.weeks[0]).toMatchObject({ objective: '', targetVolume: '' });
    expect(plan.weeks[0].days[0].blocks).toEqual([]);
  });

  it('reemplaza las semanas que ya tenía el plan', () => {
    const plan = generarEstructura(planChico(), 1, 1);
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].days[0].blocks).toEqual([]);
  });

  it('cada semana y cada día tiene un id único', () => {
    const ids = idsDe(generarEstructura(crearPlan({ fechaInicio: '' }), 4, 5));
    expect(ids).toHaveLength(4 + 4 * 5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([
    [0, 3],
    [3, 0],
    [-1, 3],
    [2.5, 3],
  ])('rechaza cantidades inválidas (%s semanas, %s días)', (semanas, dias) => {
    expect(() => generarEstructura(planChico(), semanas, dias)).toThrow(RangeError);
  });
});

describe('agregar y eliminar', () => {
  it('agregarSemana numera la nueva a continuación y la deja sin días', () => {
    const plan = agregarSemana(planChico());
    expect(plan.weeks).toHaveLength(2);
    expect(plan.weeks[1]).toMatchObject({ name: 'Semana 2', objective: '', targetVolume: '', days: [] });
  });

  it('agregarDia numera el nuevo día dentro de su semana', () => {
    const plan = agregarDia(planChico(), 0);
    expect(plan.weeks[0].days.map((d) => d.name)).toEqual(['Día 1', 'Día 2']);
    expect(plan.weeks[0].days[1].blocks).toEqual([]);
  });

  it('agregarBloque agrega un bloque de fuerza vacío', () => {
    const plan = agregarBloque(planChico(), 0, 0);
    expect(plan.weeks[0].days[0].blocks[1]).toMatchObject({ type: 'fuerza', exercises: [] });
  });

  it('agregarEjercicio agrega un ejercicio en blanco con intensidad RIR', () => {
    const plan = agregarEjercicio(planChico(), 0, 0, 0);
    expect(plan.weeks[0].days[0].blocks[0].exercises[1]).toMatchObject({
      name: '',
      sets: '',
      reps: '',
      intensityType: 'RIR',
      intensityValue: '',
      tech: '',
      rest: '',
      notes: '',
      isSuperset: false,
    });
  });

  it('los elementos agregados reciben ids nuevos y únicos', () => {
    let plan = planChico();
    plan = agregarSemana(plan);
    plan = agregarDia(plan, 0);
    plan = agregarBloque(plan, 0, 0);
    plan = agregarEjercicio(plan, 0, 0, 0);
    const ids = idsDe(plan);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('eliminarDia, eliminarBloque y eliminarEjercicio quitan el elemento indicado', () => {
    let plan = agregarDia(planChico(), 0); // días: d1, nuevo
    plan = eliminarDia(plan, 0, 0);
    expect(plan.weeks[0].days.map((d) => d.name)).toEqual(['Día 2']);

    plan = eliminarBloque(planChico(), 0, 0, 0);
    expect(plan.weeks[0].days[0].blocks).toEqual([]);

    plan = eliminarEjercicio(planChico(), 0, 0, 0, 0);
    expect(plan.weeks[0].days[0].blocks[0].exercises).toEqual([]);
  });
});

describe('actualizar', () => {
  it('actualizarSemana aplica los cambios a esa semana', () => {
    const plan = actualizarSemana(planChico(), 0, { name: 'Semana A', objective: 'Fuerza Máxima' });
    expect(plan.weeks[0]).toMatchObject({ id: 'w1', name: 'Semana A', objective: 'Fuerza Máxima' });
  });

  it('actualizarEjercicio aplica los cambios a ese ejercicio y conserva el resto', () => {
    const plan = actualizarEjercicio(planChico(), 0, 0, 0, 0, { sets: '5', isSuperset: true });
    expect(plan.weeks[0].days[0].blocks[0].exercises[0]).toEqual({
      id: 'e1',
      name: 'Sentadilla',
      sets: '5',
      reps: '6',
      isSuperset: true,
    });
  });
});

describe('inmutabilidad', () => {
  it.each([
    ['generarEstructura', (p) => generarEstructura(p, 2, 2)],
    ['agregarSemana', (p) => agregarSemana(p)],
    ['agregarDia', (p) => agregarDia(p, 0)],
    ['agregarBloque', (p) => agregarBloque(p, 0, 0)],
    ['agregarEjercicio', (p) => agregarEjercicio(p, 0, 0, 0)],
    ['eliminarDia', (p) => eliminarDia(p, 0, 0)],
    ['eliminarBloque', (p) => eliminarBloque(p, 0, 0, 0)],
    ['eliminarEjercicio', (p) => eliminarEjercicio(p, 0, 0, 0, 0)],
    ['actualizarSemana', (p) => actualizarSemana(p, 0, { name: 'X' })],
    ['actualizarEjercicio', (p) => actualizarEjercicio(p, 0, 0, 0, 0, { sets: '9' })],
  ])('%s no modifica el plan original', (_, operacion) => {
    const original = planChico();
    operacion(original);
    expect(original).toEqual(planChico());
  });
});

describe('fechasDeSemana', () => {
  it('devuelve el rango de 7 días de la primera semana', () => {
    expect(fechasDeSemana('2026-10-19', 0)).toBe('19/10 - 25/10');
  });

  it('desplaza 7 días por cada semana', () => {
    expect(fechasDeSemana('2026-10-19', 2)).toBe('02/11 - 08/11');
  });

  it('cruza fin de año', () => {
    expect(fechasDeSemana('2026-12-28', 0)).toBe('28/12 - 03/01');
  });

  it('avisa si el plan no tiene fecha de inicio', () => {
    expect(fechasDeSemana('', 0)).toBe('Fechas no definidas');
    expect(fechasDeSemana(null, 1)).toBe('Fechas no definidas');
  });

  it('devuelve vacío si la fecha no tiene formato AAAA-MM-DD', () => {
    expect(fechasDeSemana('19/10/2026', 0)).toBe('');
  });
});

describe('contarSeries', () => {
  const ej = (sets) => ({ name: 'x', sets });

  it('suma las series de todos los ejercicios de todos los días y bloques', () => {
    const semana = {
      days: [
        { blocks: [{ exercises: [ej('4'), ej('3')] }, { exercises: [ej('2')] }] },
        { blocks: [{ exercises: [ej('5')] }] },
      ],
    };
    expect(contarSeries(semana)).toBe(14);
  });

  it('toma el número inicial de valores como "3-4" o "4 x"', () => {
    const semana = { days: [{ blocks: [{ exercises: [ej('3-4'), ej('4 x')] }] }] };
    expect(contarSeries(semana)).toBe(7);
  });

  it('ignora series vacías o no numéricas', () => {
    const semana = { days: [{ blocks: [{ exercises: [ej(''), ej('al fallo'), ej(undefined), ej('2')] }] }] };
    expect(contarSeries(semana)).toBe(2);
  });

  it('una semana sin días cuenta 0', () => {
    expect(contarSeries({ days: [] })).toBe(0);
  });
});

/** Saca los ids recursivamente para comparar solo el contenido. */
function sinIds(x) {
  if (Array.isArray(x)) return x.map(sinIds);
  if (x && typeof x === 'object') {
    const { id, ...resto } = x; // eslint-disable-line no-unused-vars
    return Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, sinIds(v)]));
  }
  return x;
}

/** Plan de 3 semanas: la 1 completa (2 días), la 2 con 1 día y la 3 sin días. */
function planDesparejo() {
  const ej = (id, name) => ({ id, name, sets: '3', reps: '10' });
  return {
    ...planChico(),
    weeks: [
      {
        id: 'w1',
        name: 'Semana 1',
        objective: '',
        targetVolume: '',
        days: [
          {
            id: 'w1d1',
            name: 'Día 1',
            blocks: [{ id: 'w1d1b1', type: 'fuerza', exercises: [ej('x1', 'Sentadilla')] }],
          },
          {
            id: 'w1d2',
            name: 'Día 2',
            blocks: [
              { id: 'w1d2b1', type: 'fuerza', exercises: [ej('x2', 'Press banca')] },
              { id: 'w1d2b2', type: 'hipertrofia', exercises: [ej('x3', 'Remo'), ej('x4', 'Curl')] },
            ],
          },
        ],
      },
      {
        id: 'w2',
        name: 'Semana 2',
        objective: '',
        targetVolume: '',
        days: [{ id: 'w2d1', name: 'Día 1', blocks: [] }],
      },
      { id: 'w3', name: 'Semana 3', objective: '', targetVolume: '', days: [] },
    ],
  };
}

describe('actualizarDia y actualizarBloque', () => {
  it('cambian el nombre del día y el tipo del bloque', () => {
    let plan = actualizarDia(planChico(), 0, 0, { name: 'Lunes - Torso' });
    plan = actualizarBloque(plan, 0, 0, 0, { type: 'hipertrofia' });
    expect(plan.weeks[0].days[0].name).toBe('Lunes - Torso');
    expect(plan.weeks[0].days[0].blocks[0].type).toBe('hipertrofia');
  });
});

describe('duplicarSemana', () => {
  it('inserta la copia justo después de la original con el mismo contenido', () => {
    const plan = duplicarSemana(planDesparejo(), 0);
    expect(plan.weeks.map((w) => w.name)).toEqual(['Semana 1', 'Semana 2', 'Semana 2', 'Semana 3']);
    expect(sinIds(plan.weeks[1].days)).toEqual(sinIds(planDesparejo().weeks[0].days));
  });

  it.each([
    ['Semana 3', 'Semana 4'],
    ['Bloque 2 (descarga)', 'Bloque 3 (descarga)'],
    ['Semana 9', 'Semana 10'],
    ['Descarga', 'Descarga (Copia)'],
  ])('nombra la copia de "%s" como "%s"', (nombre, esperado) => {
    let plan = actualizarSemana(planChico(), 0, { name: nombre });
    plan = duplicarSemana(plan, 0);
    expect(plan.weeks[1].name).toBe(esperado);
  });

  it('la copia tiene ids nuevos en semana, días, bloques y ejercicios', () => {
    const plan = duplicarSemana(planDesparejo(), 0);
    const ids = idsDe(plan);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('propagarDia', () => {
  it('copia el día a la misma posición de todas las semanas siguientes', () => {
    const plan = propagarDia(planDesparejo(), 0, 0);
    expect(sinIds(plan.weeks[1].days[0])).toEqual(sinIds(planDesparejo().weeks[0].days[0]));
    expect(sinIds(plan.weeks[2].days[0])).toEqual(sinIds(planDesparejo().weeks[0].days[0]));
  });

  it('reemplaza el día que ya existía en esa posición', () => {
    const plan = propagarDia(planDesparejo(), 0, 0);
    expect(plan.weeks[1].days).toHaveLength(1);
    expect(plan.weeks[1].days[0].blocks[0].exercises[0].name).toBe('Sentadilla');
  });

  it('si a una semana le faltan días, los completa vacíos hasta la posición (el prototipo lo ponía al final)', () => {
    const plan = propagarDia(planDesparejo(), 0, 1); // Día 2
    // Semana 3 no tenía días: queda "Día 1" vacío y el Día 2 copiado en su lugar
    expect(plan.weeks[2].days.map((d) => d.name)).toEqual(['Día 1', 'Día 2']);
    expect(plan.weeks[2].days[0].blocks).toEqual([]);
    expect(plan.weeks[2].days[1].blocks.map((b) => b.type)).toEqual(['fuerza', 'hipertrofia']);
  });

  it('no toca las semanas anteriores ni la de origen', () => {
    const plan = propagarDia(planDesparejo(), 1, 0);
    expect(plan.weeks[0]).toEqual(planDesparejo().weeks[0]);
    expect(plan.weeks[1]).toEqual(planDesparejo().weeks[1]);
  });

  it('las copias tienen ids nuevos', () => {
    const ids = idsDe(propagarDia(planDesparejo(), 0, 1));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('propagarEjercicio', () => {
  it('agrega una copia del ejercicio al mismo día y bloque de las semanas siguientes', () => {
    const base = propagarDia(planDesparejo(), 0, 1); // las semanas 2 y 3 ya tienen el Día 2
    const plan = propagarEjercicio(base, 0, 1, 1, 0); // Remo
    expect(plan.weeks[1].days[1].blocks[1].exercises.map((e) => e.name)).toEqual(['Remo', 'Curl', 'Remo']);
    expect(plan.weeks[2].days[1].blocks[1].exercises.map((e) => e.name)).toEqual(['Remo', 'Curl', 'Remo']);
  });

  it('si faltan días o bloques los crea sin dejar huecos (el prototipo dejaba posiciones vacías)', () => {
    const plan = propagarEjercicio(planDesparejo(), 0, 1, 1, 0); // Día 2, bloque 2 (hipertrofia), Remo
    const semana3 = plan.weeks[2];
    expect(semana3.days.map((d) => d.name)).toEqual(['Día 1', 'Día 2']);
    expect(semana3.days[1].blocks.map((b) => b.type)).toEqual(['hipertrofia', 'hipertrofia']);
    expect(semana3.days[1].blocks[1].exercises.map((e) => e.name)).toEqual(['Remo']);
    // ningún hueco: todas las posiciones son objetos
    for (const semana of plan.weeks) {
      expect(semana.days.every(Boolean)).toBe(true);
      for (const dia of semana.days) expect(dia.blocks.every(Boolean)).toBe(true);
    }
  });

  it('las copias tienen ids nuevos y no cambia la semana de origen', () => {
    const plan = propagarEjercicio(planDesparejo(), 0, 1, 1, 0);
    expect(plan.weeks[0]).toEqual(planDesparejo().weeks[0]);
    const ids = idsDe(plan);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('inmutabilidad (operaciones de copia)', () => {
  it.each([
    ['duplicarSemana', (p) => duplicarSemana(p, 0)],
    ['propagarDia', (p) => propagarDia(p, 0, 1)],
    ['propagarEjercicio', (p) => propagarEjercicio(p, 0, 1, 1, 0)],
    ['actualizarDia', (p) => actualizarDia(p, 0, 0, { name: 'X' })],
    ['actualizarBloque', (p) => actualizarBloque(p, 0, 0, 0, { type: 'X' })],
  ])('%s no modifica el plan original', (_, operacion) => {
    const original = planDesparejo();
    operacion(original);
    expect(original).toEqual(planDesparejo());
  });
});
