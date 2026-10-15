import { describe, expect, it } from 'vitest';
import {
  actualizarEjercicio,
  actualizarSemana,
  agregarBloque,
  agregarDia,
  agregarEjercicio,
  agregarSemana,
  contarSeries,
  crearPlan,
  eliminarBloque,
  eliminarDia,
  eliminarEjercicio,
  fechasDeSemana,
  generarEstructura,
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
