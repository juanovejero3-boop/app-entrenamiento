import { describe, expect, it, vi } from 'vitest';
import { crearPlan, generarEstructura } from '../entrenamiento/plan.js';
import {
  aplicarCambios,
  armarPeticion,
  completarSemanasVacias,
  interpretarRespuesta,
  proponerProgresion,
} from './progresion.js';

const ej = (id, extra = {}) => ({
  id,
  name: `Ejercicio ${id}`,
  sets: '4',
  reps: '8',
  intensityType: 'RPE',
  intensityValue: '7',
  tech: 'Drop Set',
  rest: '90s',
  notes: 'Con pausa',
  group: '',
  ...extra,
});

/** 3 semanas de 1 día: solo la primera tiene ejercicios. */
function planConPrimeraSemana() {
  const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 3, 1);
  plan.weeks[0].days[0].blocks = [{ id: 'b1', type: 'fuerza', exercises: [ej('e1'), ej('e2', { group: 'A' })] }];
  plan.weeks[1].objective = 'Hipertrofia';
  plan.weeks[1].targetVolume = '12 series';
  return plan;
}

/** Semanas del plan con `fn(ejercicio, semana, posición)` aplicada a cada ejercicio (lo que haría la IA). */
function conCambios(plan, fn) {
  const copia = structuredClone(plan);
  for (const w of copia.weeks)
    for (const d of w.days) for (const b of d.blocks) b.exercises.forEach((e, i) => fn(e, w, i));
  return copia.weeks;
}

const todosLosIds = (plan) =>
  plan.weeks.flatMap((w) => [
    w.id,
    ...w.days.flatMap((d) => [d.id, ...d.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]),
  ]);

describe('completarSemanasVacias', () => {
  it('copia la primera semana con ejercicios a las semanas siguientes que están vacías', () => {
    const { plan, copiadas } = completarSemanasVacias(planConPrimeraSemana());

    expect(copiadas).toEqual([1, 2]);
    for (const w of [1, 2]) {
      const bloque = plan.weeks[w].days[0].blocks[0];
      expect(bloque.type).toBe('fuerza');
      expect(bloque.exercises.map((e) => [e.name, e.sets, e.group])).toEqual([
        ['Ejercicio e1', '4', ''],
        ['Ejercicio e2', '4', 'A'],
      ]);
    }
  });

  it('conserva el nombre, la fase y el volumen de cada semana destino', () => {
    const { plan } = completarSemanasVacias(planConPrimeraSemana());
    expect(plan.weeks[1]).toMatchObject({ name: 'Semana 2', objective: 'Hipertrofia', targetVolume: '12 series' });
  });

  it('las copias tienen ids nuevos y únicos en todo el plan', () => {
    const { plan } = completarSemanasVacias(planConPrimeraSemana());
    const ids = todosLosIds(plan);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no toca las semanas que ya tienen ejercicios', () => {
    const base = planConPrimeraSemana();
    base.weeks[1].days[0].blocks = [{ id: 'bx', type: 'hipertrofia', exercises: [ej('ex', { sets: '3' })] }];
    const { plan, copiadas } = completarSemanasVacias(base);

    expect(copiadas).toEqual([2]);
    expect(plan.weeks[1]).toEqual(base.weeks[1]);
  });

  it('no completa las semanas anteriores a la que tiene ejercicios', () => {
    const base = planConPrimeraSemana();
    base.weeks[1].days[0].blocks = base.weeks[0].days[0].blocks;
    base.weeks[0].days[0].blocks = [];
    const { plan, copiadas } = completarSemanasVacias(base);
    expect(copiadas).toEqual([2]);
    expect(plan.weeks[0].days[0].blocks).toEqual([]);
  });

  it('sin ninguna semana con ejercicios no copia nada', () => {
    const base = generarEstructura(crearPlan({ fechaInicio: '2026-10-19' }), 2, 2);
    expect(completarSemanasVacias(base)).toEqual({ plan: base, copiadas: [] });
  });

  it('no modifica el plan original', () => {
    const base = planConPrimeraSemana();
    const copia = structuredClone(base);
    completarSemanasVacias(base);
    expect(base).toEqual(copia);
  });
});

describe('interpretarRespuesta', () => {
  const semanas = [{ id: 'w1', days: [] }];

  it('lee un arreglo JSON puro', () => {
    expect(interpretarRespuesta(JSON.stringify(semanas))).toEqual(semanas);
  });

  it('acepta el JSON envuelto en un bloque de código markdown', () => {
    expect(interpretarRespuesta('```json\n' + JSON.stringify(semanas) + '\n```')).toEqual(semanas);
    expect(interpretarRespuesta('```\n' + JSON.stringify(semanas) + '\n```')).toEqual(semanas);
  });

  it('acepta un objeto con las semanas adentro', () => {
    expect(interpretarRespuesta(JSON.stringify({ weeks: semanas }))).toEqual(semanas);
  });

  it.each([[''], ['no es json'], ['{"a": 1}'], ['"texto"'], ['42'], [null], [undefined]])(
    'rechaza una respuesta que no es un arreglo de semanas (%j)',
    (texto) => {
      expect(() => interpretarRespuesta(texto)).toThrow('La IA no devolvió un plan válido');
    },
  );
});

describe('aplicarCambios: valores de los ejercicios que ya existen', () => {
  it('aplica los cambios de series, reps, intensidad y descanso y los lista', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.sets = '5';
      e.reps = '6-8';
      e.intensityType = 'RIR';
      e.intensityValue = '2';
      e.rest = '2 min';
    });

    const { plan, cambios, avisos } = aplicarCambios(base, semanas);

    expect(plan.weeks[0].days[0].blocks[0].exercises[0]).toMatchObject({
      sets: '5',
      reps: '6-8',
      intensityType: 'RIR',
      intensityValue: '2',
      rest: '2 min',
    });
    expect(cambios).toHaveLength(10); // 2 ejercicios × 5 campos
    expect(cambios[0]).toEqual({
      semana: 'Semana 1',
      dia: 'Día 1',
      ejercicio: 'Ejercicio e1',
      campo: 'sets',
      antes: '4',
      despues: '5',
    });
    expect(avisos).toEqual([]);
  });

  it('solo se aplican los campos permitidos: nombre, técnica, notas y grupo se ignoran', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.name = 'Otro ejercicio';
      e.tech = 'Myo-Reps';
      e.notes = 'Inventado';
      e.group = 'Z';
    });

    const { plan, cambios } = aplicarCambios(base, semanas);

    expect(plan).toEqual(base);
    expect(cambios).toEqual([]);
  });

  it('convierte números a texto y no registra como cambio lo que quedó igual', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.sets = 4; // igual que '4'
      e.intensityValue = 8;
    });
    const { plan, cambios } = aplicarCambios(base, semanas);
    expect(plan.weeks[0].days[0].blocks[0].exercises[0]).toMatchObject({ sets: '4', intensityValue: '8' });
    expect(cambios.map((c) => c.campo)).toEqual(['intensityValue', 'intensityValue']);
  });

  it('ignora un tipo de intensidad desconocido y los valores vacíos, muy largos o que no son texto ni número', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.intensityType = 'XYZ';
      e.sets = '';
      e.reps = 'x'.repeat(100);
      e.rest = { a: 1 };
      e.intensityValue = null;
    });
    const { plan, cambios } = aplicarCambios(base, semanas);
    expect(plan).toEqual(base);
    expect(cambios).toEqual([]);
  });

  it('los textos que devuelve la IA se guardan recortados', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.reps = '  10-12  ';
    });
    expect(aplicarCambios(base, semanas).plan.weeks[0].days[0].blocks[0].exercises[0].reps).toBe('10-12');
  });

  it('no modifica el plan original', () => {
    const base = planConPrimeraSemana();
    const copia = structuredClone(base);
    aplicarCambios(
      base,
      conCambios(base, (e) => {
        e.sets = '9';
      }),
    );
    expect(base).toEqual(copia);
  });
});

describe('aplicarCambios: lo que la IA omite o inventa en la estructura se ignora con un aviso', () => {
  it('una semana que la IA no devuelve se deja como estaba', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.sets = '9';
    }).slice(0, 2);
    const { plan, cambios, avisos } = aplicarCambios(base, semanas);

    expect(plan.weeks[0].days[0].blocks[0].exercises[0].sets).toBe('9');
    expect(plan.weeks[2]).toEqual(base.weeks[2]);
    expect(cambios.every((c) => c.semana !== 'Semana 3')).toBe(true);
    expect(avisos).toEqual(['La IA no devolvió la "Semana 3": se dejó como estaba.']);
  });

  it('un día que la IA no devuelve se deja como estaba', () => {
    const base = planConPrimeraSemana();
    const semanas = structuredClone(base.weeks);
    semanas[0].days = [];
    const { plan, avisos } = aplicarCambios(base, semanas);
    expect(plan).toEqual(base);
    expect(avisos).toContain('La IA no devolvió "Semana 1 · Día 1": se dejó como estaba.');
  });

  it('un ejercicio que la IA quita se mantiene y se avisa', () => {
    const base = planConPrimeraSemana();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[0].blocks[0].exercises.pop();
    const { plan, avisos } = aplicarCambios(base, semanas);
    expect(plan.weeks[0].days[0].blocks[0].exercises).toHaveLength(2);
    expect(avisos).toContain('La IA quitó "Ejercicio e2"; se mantuvo.');
  });

  it('un bloque que la IA quita mantiene sus ejercicios y avisa', () => {
    const base = planConPrimeraSemana();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[0].blocks = [];
    const { plan, avisos } = aplicarCambios(base, semanas);
    expect(plan).toEqual(base);
    expect(avisos).toContain('La IA quitó "Ejercicio e1"; se mantuvo.');
  });

  it('semanas y días que la IA inventa se ignoran', () => {
    const base = planConPrimeraSemana();
    const semanas = structuredClone(base.weeks);
    semanas.push({ id: 'inventada', name: 'Semana X', days: [] });
    semanas[0].days.push({ id: 'dia-inventado', name: 'Día X', blocks: [] });
    const { plan, avisos } = aplicarCambios(base, semanas);

    expect(plan).toEqual(base);
    expect(avisos).toContain('La IA propuso semanas que no existen; se ignoraron.');
    expect(avisos).toContain('La IA propuso días que no existen; se ignoraron.');
  });

  it('una respuesta vacía no cambia nada y avisa de cada semana', () => {
    const base = planConPrimeraSemana();
    const { plan, cambios, avisos } = aplicarCambios(base, []);
    expect(plan).toEqual(base);
    expect(cambios).toEqual([]);
    expect(avisos).toHaveLength(3);
  });

  it('elementos que no son objetos se ignoran sin romper', () => {
    const base = planConPrimeraSemana();
    const { plan, avisos } = aplicarCambios(base, [null, 1, 'x']);
    expect(plan).toEqual(base);
    expect(avisos).toContain('La IA propuso semanas que no existen; se ignoraron.');
  });

  it('cambiar el id de un ejercicio equivale a quitarlo y no lo duplica', () => {
    const base = planConPrimeraSemana();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[0].blocks[0].exercises[0].id = 'otro-id';
    const { plan, avisos } = aplicarCambios(base, semanas);
    expect(plan.weeks[0].days[0].blocks[0].exercises).toHaveLength(2);
    expect(avisos).toContain('La IA quitó "Ejercicio e1"; se mantuvo.');
  });

  it('un ejercicio existente que la IA mueve a otro bloque no se duplica', () => {
    const base = planConPrimeraSemana();
    base.weeks[0].days[0].blocks.push({ id: 'b2', type: 'hipertrofia', exercises: [ej('e3')] });
    const semanas = structuredClone(base.weeks);
    const [movido] = semanas[0].days[0].blocks[0].exercises.splice(0, 1);
    semanas[0].days[0].blocks[1].exercises.push(movido);
    const { plan } = aplicarCambios(base, semanas, { biblioteca: ['Algo - Dorsal'] });
    expect(todosLosIds(plan).filter((id) => id === 'e1')).toHaveLength(1);
    expect(plan.weeks[0].days[0].blocks[0].exercises.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('aplicarCambios: ejercicios nuevos', () => {
  const BIBLIOTECA = [
    'Sentadilla con barra alta - Cuádriceps, glúteo',
    'Curl femoral tumbado - Isquios',
    'Press de banca con barra - Pectoral, tríceps',
  ];
  const nuevoEj = (name, extra = {}) => ({
    name,
    sets: '3',
    reps: '10-12',
    intensityType: 'RIR',
    intensityValue: '2',
    rest: '90s',
    ...extra,
  });

  /** 2 semanas de 2 días: el Día 1 tiene ejercicios y el Día 2 está vacío. */
  function planConDiaVacio() {
    const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 2, 2);
    plan.weeks[0].days[0].blocks = [{ id: 'b1', type: 'fuerza', exercises: [ej('e1')] }];
    plan.weeks[1].days[0].blocks = [{ id: 'b2', type: 'fuerza', exercises: [ej('e2')] }];
    return plan;
  }
  const opciones = { biblioteca: BIBLIOTECA };

  it('en un día vacío agrega los bloques y ejercicios que propone la IA, con ids nuevos y nombres oficiales', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    for (const semana of semanas) {
      semana.days[1].blocks = [
        {
          type: 'fuerza',
          exercises: [
            nuevoEj('sentadilla con barra alta - cuadriceps, gluteo', { sets: 4, reps: '6-8', intensityType: 'RPE' }),
            nuevoEj('Curl femoral tumbado - Isquios'),
          ],
        },
      ];
    }

    const { plan, cambios, avisos } = aplicarCambios(base, semanas, opciones);

    const dia = plan.weeks[1].days[1];
    expect(dia.blocks).toHaveLength(1);
    expect(dia.blocks[0].type).toBe('fuerza');
    expect(dia.blocks[0].exercises.map((e) => e.name)).toEqual([
      'Sentadilla con barra alta - Cuádriceps, glúteo',
      'Curl femoral tumbado - Isquios',
    ]);
    expect(dia.blocks[0].exercises[0]).toMatchObject({
      sets: '4',
      reps: '6-8',
      intensityType: 'RPE',
      tech: '',
      notes: '',
      group: '',
    });
    const ids = todosLosIds(plan);
    expect(new Set(ids).size).toBe(ids.length);
    const agregados = cambios.filter((c) => c.agregado);
    expect(agregados).toHaveLength(4); // 2 ejercicios en cada una de las 2 semanas
    expect(agregados[0]).toMatchObject({
      semana: 'Semana 1',
      dia: 'Día 2',
      ejercicio: 'Sentadilla con barra alta - Cuádriceps, glúteo',
      fueraDeBiblioteca: false,
    });
    expect(avisos).toEqual([]);
  });

  it('también puede sumar ejercicios a un día que ya tiene: van al final del bloque, sin tocar los existentes', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[0].blocks[0].exercises.push(nuevoEj('Press de banca con barra - Pectoral, tríceps'));

    const { plan, cambios } = aplicarCambios(base, semanas, opciones);

    const ejercicios = plan.weeks[0].days[0].blocks[0].exercises;
    expect(ejercicios.map((e) => e.name)).toEqual(['Ejercicio e1', 'Press de banca con barra - Pectoral, tríceps']);
    expect(ejercicios[0]).toEqual(base.weeks[0].days[0].blocks[0].exercises[0]);
    expect(cambios.filter((c) => c.agregado)).toHaveLength(1);
  });

  it('puede agregar un bloque nuevo a un día que ya tiene bloques', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[0].blocks.push({ type: 'hipertrofia', exercises: [nuevoEj('Curl femoral tumbado - Isquios')] });

    const { plan } = aplicarCambios(base, semanas, opciones);

    expect(plan.weeks[0].days[0].blocks.map((b) => b.type)).toEqual(['fuerza', 'hipertrofia']);
    expect(plan.weeks[0].days[0].blocks[0]).toEqual(base.weeks[0].days[0].blocks[0]);
  });

  it('si la IA omite el músculo del final del nombre igual lo reconoce y usa el nombre oficial', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: [nuevoEj('Curl femoral tumbado')] }];
    const { plan, cambios } = aplicarCambios(base, semanas, opciones);

    expect(plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Curl femoral tumbado - Isquios');
    expect(cambios.filter((c) => c.agregado).every((c) => !c.fueraDeBiblioteca)).toBe(true);
  });

  it('un ejercicio que no está en la biblioteca se agrega igual pero queda marcado', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: [nuevoEj('Sentadilla búlgara inventada')] }];
    const { plan, cambios } = aplicarCambios(base, semanas, opciones);

    expect(plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Sentadilla búlgara inventada');
    expect(cambios.filter((c) => c.agregado).every((c) => c.fueraDeBiblioteca)).toBe(true);
  });

  it('los datos que faltan o no sirven quedan vacíos, y el tipo de bloque desconocido pasa a fuerza', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [
      {
        type: 'cualquier cosa',
        exercises: [
          { name: 'Curl femoral tumbado - Isquios', sets: { x: 1 }, intensityType: 'XYZ', reps: 'x'.repeat(80) },
        ],
      },
    ];
    const { plan } = aplicarCambios(base, semanas, opciones);

    const bloque = plan.weeks[0].days[1].blocks[0];
    expect(bloque.type).toBe('fuerza');
    expect(bloque.exercises[0]).toMatchObject({
      sets: '',
      reps: '',
      intensityType: 'RIR',
      intensityValue: '',
      rest: '',
    });
  });

  it('descarta los ejercicios sin nombre y los bloques que quedan sin ejercicios', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [
      { type: 'fuerza', exercises: [{ name: '' }, { sets: '3' }, null, 'texto'] },
      { type: 'hipertrofia', exercises: [nuevoEj('Curl femoral tumbado - Isquios')] },
    ];
    const { plan } = aplicarCambios(base, semanas, opciones);

    expect(plan.weeks[0].days[1].blocks).toHaveLength(1);
    expect(plan.weeks[0].days[1].blocks[0].type).toBe('hipertrofia');
  });

  it('reemplaza los bloques vacíos que el día ya tenía en vez de dejarlos al lado', () => {
    const base = planConDiaVacio();
    base.weeks[0].days[1].blocks = [{ id: 'bv', type: 'fuerza', exercises: [] }];
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: [nuevoEj('Curl femoral tumbado - Isquios')] }];
    const { plan } = aplicarCambios(base, semanas, opciones);
    expect(plan.weeks[0].days[1].blocks).toHaveLength(1);
    expect(plan.weeks[0].days[1].blocks[0].id).not.toBe('bv');
  });

  it('también se pueden poner ejercicios dentro de un bloque vacío que ya existía', () => {
    const base = planConDiaVacio();
    base.weeks[0].days[1].blocks = [{ id: 'bv', type: 'hipertrofia', exercises: [] }];
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks[0].exercises = [nuevoEj('Curl femoral tumbado - Isquios')];
    const { plan } = aplicarCambios(base, semanas, opciones);
    expect(plan.weeks[0].days[1].blocks).toHaveLength(1);
    expect(plan.weeks[0].days[1].blocks[0]).toMatchObject({ id: 'bv', type: 'hipertrofia' });
    expect(plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Curl femoral tumbado - Isquios');
  });

  it('sin biblioteca no se agrega nada y se avisa', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: [nuevoEj('Curl femoral tumbado - Isquios')] }];
    semanas[0].days[0].blocks[0].exercises.push(nuevoEj('Otro'));
    const { plan, avisos } = aplicarCambios(base, semanas);

    expect(plan).toEqual(base);
    expect(avisos).toEqual([
      'La IA propuso ejercicios nuevos, pero no hay biblioteca de ejercicios cargada; se ignoraron.',
    ]);
  });

  it('si propone demasiados ejercicios o bloques para un día, agrega solo hasta el máximo y avisa', () => {
    const base = planConDiaVacio();
    const muchos = Array.from({ length: 15 }, (_, i) => nuevoEj(`Ejercicio inventado ${i}`));
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: muchos }];
    const { plan, avisos } = aplicarCambios(base, semanas, opciones);
    expect(plan.weeks[0].days[1].blocks[0].exercises).toHaveLength(12);
    expect(avisos).toContain('La IA propuso demasiados ejercicios para "Semana 1 · Día 2": se agregaron solo 12.');

    const bloques = Array.from({ length: 8 }, () => ({ type: 'fuerza', exercises: [nuevoEj('Uno')] }));
    const otras = structuredClone(base.weeks);
    otras[0].days[1].blocks = bloques;
    const { plan: conBloques, avisos: avisosBloques } = aplicarCambios(base, otras, opciones);
    expect(conBloques.weeks[0].days[1].blocks).toHaveLength(6);
    expect(avisosBloques).toContain('La IA propuso demasiados bloques para "Semana 1 · Día 2": se agregaron solo 6.');
  });

  it('si los bloques del día no son una lista se ignoran', () => {
    const base = planConDiaVacio();
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = 'texto';
    expect(aplicarCambios(base, semanas, opciones).plan).toEqual(base);
  });

  it('no modifica el plan original', () => {
    const base = planConDiaVacio();
    const copia = structuredClone(base);
    const semanas = structuredClone(base.weeks);
    semanas[0].days[1].blocks = [{ type: 'fuerza', exercises: [nuevoEj('Curl femoral tumbado - Isquios')] }];
    aplicarCambios(base, semanas, opciones);
    expect(base).toEqual(copia);
  });
});

describe('armarPeticion', () => {
  const BIBLIOTECA = ['Sentadilla con barra alta - Cuádriceps, glúteo', 'Curl femoral tumbado - Isquios'];

  it('lleva la instrucción, las reglas y las semanas del plan', () => {
    const plan = planConPrimeraSemana();
    const prompt = armarPeticion(plan, '  Sube 1 punto de RPE por semana  ');

    expect(prompt).toContain('Sube 1 punto de RPE por semana');
    expect(prompt).toContain('intensityValue');
    expect(prompt).toContain('"id":"e1"');
    expect(prompt).not.toContain('Fuerza'); // el nombre del macrociclo no hace falta
  });

  it('explica que una progresión por semana es acumulativa y que un rango de repeticiones se mueve entero', () => {
    const prompt = armarPeticion(planConPrimeraSemana(), 'Aumentame 2 repeticiones por semana en el press');
    expect(prompt).toContain('acumulativa');
    expect(prompt).toContain('la primera semana queda como está');
    expect(prompt).toContain('"8-10"');
    expect(prompt).toContain('"10-12"');
  });

  it('sin instrucción no arma nada', () => {
    expect(() => armarPeticion(planConPrimeraSemana(), '   ')).toThrow('Escribí qué querés que haga la IA');
  });

  it('con biblioteca le da los nombres y le explica cómo agregar ejercicios', () => {
    const prompt = armarPeticion(planConPrimeraSemana(), 'Agregá pierna', { biblioteca: BIBLIOTECA });
    expect(prompt).toContain('Curl femoral tumbado - Isquios');
    expect(prompt).toContain('BIBLIOTECA');
    expect(prompt).toContain('nombre exacto');
    expect(prompt).toContain('completo'); // incluido lo que va después del guion
    expect(prompt).toContain('hipertrofia'); // los tipos de bloque que existen
    expect(prompt).toContain('sin ids');
    expect(prompt).toContain('los mismos en todas las semanas');
  });

  it('sin biblioteca no ofrece agregar ejercicios', () => {
    const prompt = armarPeticion(planConPrimeraSemana(), 'Subí el RPE');
    expect(prompt).not.toContain('BIBLIOTECA');
    expect(prompt).not.toContain('sin ids');
  });
});

describe('proponerProgresion', () => {
  const BIBLIOTECA = ['Curl femoral tumbado - Isquios'];
  const semanasDe = (prompt) => JSON.parse(prompt.slice(prompt.indexOf('SEMANAS:\n') + 9));

  it('completa las semanas vacías, pide la progresión y devuelve el plan propuesto con sus cambios', async () => {
    const base = planConPrimeraSemana();
    const llamarIA = vi.fn(async (prompt) => {
      // sube 1 de RPE por semana
      const semanas = semanasDe(prompt).map((w, i) => ({
        ...w,
        days: w.days.map((d) => ({
          ...d,
          blocks: d.blocks.map((b) => ({
            ...b,
            exercises: b.exercises.map((e) => ({ ...e, intensityValue: String(7 + i) })),
          })),
        })),
      }));
      return JSON.stringify(semanas);
    });

    const propuesta = await proponerProgresion(llamarIA, base, 'Sube 1 de RPE por semana');

    expect(propuesta.copiadas).toEqual([1, 2]);
    const rpe = (w) => propuesta.plan.weeks[w].days[0].blocks[0].exercises[0].intensityValue;
    expect([rpe(0), rpe(1), rpe(2)]).toEqual(['7', '8', '9']);
    expect(propuesta.cambios).toHaveLength(4); // semanas 2 y 3, 2 ejercicios (la 1 queda igual)
    expect(propuesta.avisos).toEqual([]);
    expect(llamarIA).toHaveBeenCalledTimes(1);
    expect(llamarIA.mock.calls[0][0]).toContain('Sube 1 de RPE por semana');
  });

  it('sin estructura (ninguna semana) no llama a la IA y explica qué falta', async () => {
    const llamarIA = vi.fn();
    await expect(proponerProgresion(llamarIA, crearPlan({ fechaInicio: '2026-10-19' }), 'Sube todo')).rejects.toThrow(
      'Generá primero la estructura',
    );
    expect(llamarIA).not.toHaveBeenCalled();
  });

  it('con la estructura generada pero sin ejercicios la IA puede armar los días con la biblioteca', async () => {
    const vacio = generarEstructura(crearPlan({ fechaInicio: '2026-10-19' }), 2, 1);
    const llamarIA = vi.fn(async (prompt) => {
      const semanas = semanasDe(prompt);
      for (const s of semanas) {
        s.days[0].blocks = [
          { type: 'fuerza', exercises: [{ name: 'Curl femoral tumbado - Isquios', sets: '3', reps: '10' }] },
        ];
      }
      return JSON.stringify(semanas);
    });

    const propuesta = await proponerProgresion(llamarIA, vacio, 'Armá un día de pierna', { biblioteca: BIBLIOTECA });

    expect(propuesta.copiadas).toEqual([]); // no hay semana con ejercicios para copiar
    expect(propuesta.cambios.filter((c) => c.agregado)).toHaveLength(2);
  });

  it('siempre le manda la biblioteca cuando la hay, para que pueda agregar ejercicios donde haga falta', async () => {
    const llamarIA = vi.fn(async (peticion) => peticion.slice(peticion.indexOf('SEMANAS:\n') + 9));
    await proponerProgresion(llamarIA, planConPrimeraSemana(), 'Agregá un ejercicio de pierna', {
      biblioteca: BIBLIOTECA,
    });
    expect(llamarIA.mock.calls[0][0]).toContain('BIBLIOTECA');
    expect(llamarIA.mock.calls[0][0]).toContain('Curl femoral tumbado - Isquios');
  });

  it('si la IA devuelve algo que no es un plan, falla; si omite cosas de la estructura, avisa pero devuelve la propuesta', async () => {
    const base = planConPrimeraSemana();
    await expect(proponerProgresion(async () => 'hola', base, 'x')).rejects.toThrow('La IA no devolvió un plan válido');

    const propuesta = await proponerProgresion(async () => '[]', base, 'x');
    expect(propuesta.cambios).toEqual([]);
    expect(propuesta.avisos.length).toBeGreaterThan(0);
  });

  it('si falla la llamada a la IA, el error se propaga', async () => {
    const falla = async () => Promise.reject(new Error('sin conexión'));
    await expect(proponerProgresion(falla, planConPrimeraSemana(), 'x')).rejects.toThrow('sin conexión');
  });
});
