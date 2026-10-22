import { describe, expect, it, vi } from 'vitest';
import { crearPlan, generarEstructura } from '../entrenamiento/plan.js';
import {
  aplicarCambios,
  armarPeticion,
  completarSemanasVacias,
  hayDiasVacios,
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
    const ids = plan.weeks.flatMap((w) => [
      w.id,
      ...w.days.flatMap((d) => [d.id, ...d.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]),
    ]);
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

describe('aplicarCambios', () => {
  it('aplica los cambios de series, reps, intensidad y descanso y los lista', () => {
    const base = planConPrimeraSemana();
    const semanas = conCambios(base, (e) => {
      e.sets = '5';
      e.reps = '6-8';
      e.intensityType = 'RIR';
      e.intensityValue = '2';
      e.rest = '2 min';
    });

    const { plan, cambios } = aplicarCambios(base, semanas);

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

  const sinPrimerEjercicio = (s) => {
    s[0].days[0].blocks[0].exercises.pop();
    return s;
  };
  it.each([
    ['menos semanas', (s) => s.slice(0, 2)],
    ['más semanas', (s) => [...s, structuredClone(s[0])]],
    ['otro id de semana', (s) => s.map((w, i) => (i === 0 ? { ...w, id: 'otro' } : w))],
    ['un día de menos', (s) => s.map((w, i) => (i === 1 ? { ...w, days: [] } : w))],
    ['un ejercicio de menos', sinPrimerEjercicio],
    [
      'otro id de ejercicio',
      (s) => {
        s[0].days[0].blocks[0].exercises[0].id = 'nuevo';
        return s;
      },
    ],
    ['semanas que no son objetos', () => [null, 1, 'x']],
  ])('si la IA cambia la estructura (%s) se rechaza todo', (_, deformar) => {
    const base = planConPrimeraSemana();
    expect(() => aplicarCambios(base, deformar(structuredClone(base.weeks)))).toThrow('cambió la estructura');
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

describe('armarPeticion', () => {
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
});

describe('proponerProgresion', () => {
  it('completa las semanas vacías, pide la progresión y devuelve el plan propuesto con sus cambios', async () => {
    const base = planConPrimeraSemana();
    const llamarIA = vi.fn(async (prompt) => {
      const enviadas = JSON.parse(prompt.slice(prompt.indexOf('[{')));
      // sube 1 de RPE por semana
      const semanas = enviadas.map((w, i) => ({
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
    expect(llamarIA).toHaveBeenCalledTimes(1);
    expect(llamarIA.mock.calls[0][0]).toContain('Sube 1 de RPE por semana');
  });

  it('sin ejercicios cargados no llama a la IA y explica qué falta', async () => {
    const llamarIA = vi.fn();
    const vacio = generarEstructura(crearPlan({ fechaInicio: '2026-10-19' }), 2, 2);
    await expect(proponerProgresion(llamarIA, vacio, 'Sube todo')).rejects.toThrow('Cargá los ejercicios');
    expect(llamarIA).not.toHaveBeenCalled();
  });

  it('si la IA devuelve algo inválido o cambia la estructura, falla sin devolver un plan', async () => {
    const base = planConPrimeraSemana();
    await expect(proponerProgresion(async () => 'hola', base, 'x')).rejects.toThrow('La IA no devolvió un plan válido');
    await expect(proponerProgresion(async () => '[]', base, 'x')).rejects.toThrow('cambió la estructura');
  });

  it('si falla la llamada a la IA, el error se propaga', async () => {
    const falla = async () => Promise.reject(new Error('sin conexión'));
    await expect(proponerProgresion(falla, planConPrimeraSemana(), 'x')).rejects.toThrow('sin conexión');
  });
});

describe('completar días vacíos con ejercicios de la biblioteca', () => {
  const BIBLIOTECA = [
    'Sentadilla con barra alta - Cuádriceps, glúteo',
    'Curl femoral tumbado - Isquios',
    'Press de banca con barra - Pectoral, tríceps',
  ];

  /** 2 semanas de 2 días: el Día 1 tiene ejercicios y el Día 2 está vacío. */
  function planConDiaVacio() {
    const plan = generarEstructura({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: 'Fuerza' }, 2, 2);
    plan.weeks[0].days[0].blocks = [{ id: 'b1', type: 'fuerza', exercises: [ej('e1')] }];
    plan.weeks[1].days[0].blocks = [{ id: 'b2', type: 'fuerza', exercises: [ej('e2')] }];
    return plan;
  }

  /** Semanas del plan con `blocks` puestos en el día vacío (el 2.º) de cada semana. */
  const conDiaCompletado = (plan, blocks) => {
    const semanas = structuredClone(plan.weeks);
    for (const semana of semanas) semana.days[1].blocks = structuredClone(blocks);
    return semanas;
  };
  const bloqueIA = (exercises, type = 'fuerza') => ({ type, exercises });
  const opciones = { permitirAgregar: true, biblioteca: BIBLIOTECA };

  describe('hayDiasVacios', () => {
    it('es cierto si algún día no tiene ejercicios (aunque tenga bloques vacíos)', () => {
      expect(hayDiasVacios(planConDiaVacio())).toBe(true);
      const conBloqueVacio = planConDiaVacio();
      conBloqueVacio.weeks[0].days[1].blocks = [{ id: 'bv', type: 'fuerza', exercises: [] }];
      expect(hayDiasVacios(conBloqueVacio)).toBe(true);
    });

    it('es falso si todos los días tienen ejercicios', () => {
      const plan = planConDiaVacio();
      for (const w of plan.weeks) w.days[1].blocks = [{ id: `x${w.id}`, type: 'fuerza', exercises: [ej(`y${w.id}`)] }];
      expect(hayDiasVacios(plan)).toBe(false);
    });
  });

  describe('armarPeticion', () => {
    it('con biblioteca le da los nombres y le explica cómo completar un día vacío', () => {
      const prompt = armarPeticion(planConDiaVacio(), 'Completá el día 2 con pierna', { biblioteca: BIBLIOTECA });
      expect(prompt).toContain('Curl femoral tumbado - Isquios');
      expect(prompt).toContain('BIBLIOTECA');
      expect(prompt).toContain('nombre exacto');
      expect(prompt).toContain('completo'); // incluido lo que va después del guion
      expect(prompt).toContain('hipertrofia'); // los tipos de bloque que existen
      expect(prompt).toContain('sin ids');
    });

    it('sin biblioteca no menciona nada de eso', () => {
      const prompt = armarPeticion(planConDiaVacio(), 'Subí el RPE');
      expect(prompt).not.toContain('BIBLIOTECA');
      expect(prompt).not.toContain('sin ids');
    });
  });

  describe('aplicarCambios', () => {
    it('agrega al día vacío los bloques y ejercicios que propone la IA, con ids nuevos y los nombres oficiales', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, [
        bloqueIA([
          {
            name: 'sentadilla con barra alta - cuadriceps, gluteo',
            sets: 4,
            reps: '6-8',
            intensityType: 'RPE',
            intensityValue: '8',
            rest: '2 min',
          },
          {
            name: 'Curl femoral tumbado - Isquios',
            sets: '3',
            reps: '10-12',
            intensityType: 'RIR',
            intensityValue: '2',
            rest: '90s',
          },
        ]),
      ]);

      const { plan, cambios } = aplicarCambios(base, semanas, opciones);

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
        intensityValue: '8',
        rest: '2 min',
        tech: '',
        notes: '',
        group: '',
      });
      const ids = plan.weeks.flatMap((w) =>
        w.days.flatMap((d) => [d.id, ...d.blocks.flatMap((b) => [b.id, ...b.exercises.map((e) => e.id)])]),
      );
      expect(new Set(ids).size).toBe(ids.length);
      const agregados = cambios.filter((c) => c.agregado);
      expect(agregados).toHaveLength(4); // 2 ejercicios en cada una de las 2 semanas
      expect(agregados[0]).toMatchObject({
        semana: 'Semana 1',
        dia: 'Día 2',
        ejercicio: 'Sentadilla con barra alta - Cuádriceps, glúteo',
        fueraDeBiblioteca: false,
      });
    });

    it('reemplaza los bloques vacíos que el día ya tenía en vez de dejarlos al lado', () => {
      const base = planConDiaVacio();
      base.weeks[0].days[1].blocks = [{ id: 'bv', type: 'fuerza', exercises: [] }];
      const semanas = conDiaCompletado(base, [bloqueIA([{ name: 'Curl femoral tumbado - Isquios' }])]);
      const { plan } = aplicarCambios(base, semanas, opciones);
      expect(plan.weeks[0].days[1].blocks).toHaveLength(1);
      expect(plan.weeks[0].days[1].blocks[0].id).not.toBe('bv');
    });

    it('si la IA omite el músculo del final del nombre igual lo reconoce y usa el nombre oficial', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, [bloqueIA([{ name: 'Curl femoral tumbado' }])]);
      const { plan, cambios } = aplicarCambios(base, semanas, opciones);

      expect(plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Curl femoral tumbado - Isquios');
      expect(cambios.filter((c) => c.agregado).every((c) => !c.fueraDeBiblioteca)).toBe(true);
    });

    it('un ejercicio que no está en la biblioteca se agrega igual pero queda marcado', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, [bloqueIA([{ name: 'Sentadilla búlgara inventada' }])]);
      const { plan, cambios } = aplicarCambios(base, semanas, opciones);

      expect(plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Sentadilla búlgara inventada');
      expect(cambios.filter((c) => c.agregado).every((c) => c.fueraDeBiblioteca)).toBe(true);
    });

    it('los datos que faltan o no sirven toman valores vacíos y el tipo de bloque desconocido pasa a fuerza', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, [
        bloqueIA(
          [{ name: 'Curl femoral tumbado - Isquios', sets: { x: 1 }, intensityType: 'XYZ', reps: 'x'.repeat(80) }],
          'cualquier cosa',
        ),
      ]);
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
      const semanas = conDiaCompletado(base, [
        bloqueIA([{ name: '' }, { sets: '3' }, null, 'texto']),
        bloqueIA([{ name: 'Curl femoral tumbado - Isquios' }], 'hipertrofia'),
      ]);
      const { plan } = aplicarCambios(base, semanas, opciones);

      expect(plan.weeks[0].days[1].blocks).toHaveLength(1);
      expect(plan.weeks[0].days[1].blocks[0].type).toBe('hipertrofia');
    });

    it('si la IA deja el día vacío (con o sin bloques) no hay cambios', () => {
      const base = planConDiaVacio();
      const { plan, cambios } = aplicarCambios(base, conDiaCompletado(base, []), opciones);
      expect(plan).toEqual(base);
      expect(cambios).toEqual([]);
    });

    it('sin permiso para agregar, sumar ejercicios a un día vacío cuenta como cambiar la estructura', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, [bloqueIA([{ name: 'Curl femoral tumbado - Isquios' }])]);
      expect(() => aplicarCambios(base, semanas)).toThrow('cambió la estructura');
    });

    it('en un día que ya tiene ejercicios no se puede agregar nada', () => {
      const base = planConDiaVacio();
      const semanas = structuredClone(base.weeks);
      semanas[0].days[0].blocks[0].exercises.push({ id: 'nuevo', name: 'Extra' });
      expect(() => aplicarCambios(base, semanas, opciones)).toThrow('cambió la estructura');
    });

    it('rechaza un día con demasiados ejercicios o bloques', () => {
      const base = planConDiaVacio();
      const muchos = Array.from({ length: 13 }, (_, i) => ({ name: `Ejercicio ${i}` }));
      expect(() => aplicarCambios(base, conDiaCompletado(base, [bloqueIA(muchos)]), opciones)).toThrow('demasiados');
      const bloques = Array.from({ length: 7 }, () => bloqueIA([{ name: 'Uno' }]));
      expect(() => aplicarCambios(base, conDiaCompletado(base, bloques), opciones)).toThrow('demasiados');
    });

    it('si los bloques del día no son una lista se rechaza', () => {
      const base = planConDiaVacio();
      const semanas = conDiaCompletado(base, []);
      semanas[0].days[1].blocks = 'texto';
      expect(() => aplicarCambios(base, semanas, opciones)).toThrow('cambió la estructura');
    });

    it('no modifica el plan original', () => {
      const base = planConDiaVacio();
      const copia = structuredClone(base);
      aplicarCambios(base, conDiaCompletado(base, [bloqueIA([{ name: 'Curl femoral tumbado - Isquios' }])]), opciones);
      expect(base).toEqual(copia);
    });
  });

  describe('proponerProgresion', () => {
    const iaQueCompletaElDia = vi.fn(async (peticion) => {
      const semanas = JSON.parse(peticion.slice(peticion.indexOf('[{')));
      for (const s of semanas) {
        s.days[1].blocks = [
          bloqueIA([
            {
              name: 'Curl femoral tumbado - Isquios',
              sets: '3',
              reps: '10-12',
              intensityType: 'RIR',
              intensityValue: '2',
              rest: '90s',
            },
          ]),
        ];
      }
      return JSON.stringify(semanas);
    });

    it('si hay días vacíos y biblioteca, la IA los completa y la propuesta lo cuenta', async () => {
      iaQueCompletaElDia.mockClear();
      const propuesta = await proponerProgresion(
        iaQueCompletaElDia,
        planConDiaVacio(),
        'Completá el día 2 con pierna',
        {
          biblioteca: BIBLIOTECA,
        },
      );

      expect(iaQueCompletaElDia.mock.calls[0][0]).toContain('Curl femoral tumbado - Isquios');
      expect(propuesta.plan.weeks[0].days[1].blocks[0].exercises[0].name).toBe('Curl femoral tumbado - Isquios');
      expect(propuesta.cambios.filter((c) => c.agregado)).toHaveLength(2);
    });

    it('si no hay días vacíos no le manda la biblioteca (el pedido es más corto) ni deja agregar ejercicios', async () => {
      const llena = planConDiaVacio();
      for (const w of llena.weeks) w.days[1].blocks = [{ id: `x${w.id}`, type: 'fuerza', exercises: [ej(`y${w.id}`)] }];
      const llamarIA = vi.fn(async (peticion) => peticion.slice(peticion.indexOf('[{')));

      await proponerProgresion(llamarIA, llena, 'No cambies nada', { biblioteca: BIBLIOTECA });

      expect(llamarIA.mock.calls[0][0]).not.toContain('BIBLIOTECA');
    });

    it('con días vacíos pero sin biblioteca no intenta completarlos', async () => {
      const llamarIA = vi.fn(async (peticion) => peticion.slice(peticion.indexOf('[{')));
      await proponerProgresion(llamarIA, planConDiaVacio(), 'No cambies nada');
      expect(llamarIA.mock.calls[0][0]).not.toContain('BIBLIOTECA');
    });
  });
});
