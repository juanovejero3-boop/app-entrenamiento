import { describe, expect, it, vi } from 'vitest';
import { alimentosIniciales } from './alimentos.js';
import { macrosDeOpcion, macrosDelDia } from './comidas.js';
import { ajustarAObjetivos, armarPeticion, interpretarRespuesta, sugerirComidas } from './ia.js';

const ALIMENTOS = alimentosIniciales();
const OBJETIVOS = { kcal: 2400, p: 160, c: 280, f: 70 };
const respuesta = (comidas) => JSON.stringify({ comidas });
const item = (alimento, porciones) => ({ alimento, porciones });

describe('armarPeticion', () => {
  const peticion = (extra = {}) =>
    armarPeticion({
      alimentos: ALIMENTOS,
      objetivos: OBJETIVOS,
      cantidadComidas: 4,
      cantidadOpciones: 2,
      indicaciones: '',
      ...extra,
    });

  it('incluye los objetivos del día y la cantidad de comidas y de opciones', () => {
    const texto = peticion();
    expect(texto).toContain('2400');
    expect(texto).toContain('160');
    expect(texto).toMatch(/4 comidas/);
    expect(texto).toMatch(/2 opciones/);
  });

  it('lista los alimentos de la biblioteca con su categoría y porción, y marca gluten y lácteos', () => {
    const texto = peticion();
    expect(texto).toContain('Pechuga de Pollo');
    expect(texto).toContain('100g');
    expect(texto).toMatch(/Yogur.*lácteo/i);
  });

  it('pasa las indicaciones del coach (horario de entrenamiento, restricciones)', () => {
    expect(peticion({ indicaciones: 'Entrena a las 18 hs. No come lácteos.' })).toContain('Entrena a las 18 hs');
  });

  it('pide solo alimentos de la lista y JSON', () => {
    const texto = peticion();
    expect(texto).toMatch(/SOLO alimentos de la lista/i);
    expect(texto).toMatch(/JSON/);
  });
});

describe('interpretarRespuesta', () => {
  const POLLO = 'Pechuga de Pollo';
  const ARROZ = 'Arroz Blanco (Cocido)';

  it('arma las comidas con los alimentos de la biblioteca', () => {
    const { comidas, avisos } = interpretarRespuesta(
      respuesta([
        { nombre: 'Almuerzo', hora: '13:00', opciones: [[item(POLLO, 2), item(ARROZ, 3)]] },
        { nombre: 'Cena', hora: '21:00', opciones: [[item(POLLO, 1.5)]] },
      ]),
      ALIMENTOS,
    );
    expect(avisos).toEqual([]);
    expect(comidas.map((c) => [c.nombre, c.hora])).toEqual([
      ['Almuerzo', '13:00'],
      ['Cena', '21:00'],
    ]);
    const [primera] = comidas[0].opciones;
    expect(primera.items.map((i) => [i.nombre, i.porciones, i.categoria, i.porcion])).toEqual([
      [POLLO, 2, 'proteins', '100g'],
      [ARROZ, 3, 'carbs', '75g'],
    ]);
    expect(primera.id).toBeTruthy();
    expect(primera.items[0].id).toBeTruthy();
  });

  it('reconoce el alimento aunque venga sin tildes o en otras mayúsculas', () => {
    const { comidas } = interpretarRespuesta(
      respuesta([{ nombre: 'Desayuno', hora: '08:00', opciones: [[item('pechuga de pollo', 1)]] }]),
      ALIMENTOS,
    );
    expect(comidas[0].opciones[0].items[0].nombre).toBe(POLLO);
  });

  it('acepta la respuesta envuelta en un bloque de código', () => {
    const texto = '```json\n' + respuesta([{ nombre: 'A', hora: '08:00', opciones: [[item(POLLO, 1)]] }]) + '\n```';
    expect(interpretarRespuesta(texto, ALIMENTOS).comidas).toHaveLength(1);
  });

  it('un alimento que no está en la biblioteca se omite y se avisa', () => {
    const { comidas, avisos } = interpretarRespuesta(
      respuesta([{ nombre: 'Cena', hora: '21:00', opciones: [[item('Sushi', 2), item(POLLO, 1)]] }]),
      ALIMENTOS,
    );
    expect(comidas[0].opciones[0].items.map((i) => i.nombre)).toEqual([POLLO]);
    expect(avisos).toEqual([expect.stringContaining('Sushi')]);
  });

  it('las porciones se redondean a medias porciones, con mínimo 0,5 y máximo razonable', () => {
    const { comidas } = interpretarRespuesta(
      respuesta([
        {
          nombre: 'A',
          hora: '08:00',
          opciones: [[item(POLLO, 1.3), item(ARROZ, 0.1), item('Pan Integral', 400)]],
        },
      ]),
      ALIMENTOS,
    );
    expect(comidas[0].opciones[0].items.map((i) => i.porciones)).toEqual([1.5, 0.5, 20]);
  });

  it('una hora inválida queda vacía y un nombre vacío se reemplaza por uno genérico', () => {
    const { comidas } = interpretarRespuesta(
      respuesta([{ nombre: '', hora: '8am', opciones: [[item(POLLO, 1)]] }]),
      ALIMENTOS,
    );
    expect(comidas[0].hora).toBe('');
    expect(comidas[0].nombre).toBe('Comida 1');
  });

  it('descarta las opciones y comidas que quedan sin alimentos', () => {
    const { comidas } = interpretarRespuesta(
      respuesta([
        { nombre: 'A', hora: '08:00', opciones: [[item(POLLO, 1)], [item('Sushi', 1)]] },
        { nombre: 'B', hora: '10:00', opciones: [[item('Sushi', 1)]] },
      ]),
      ALIMENTOS,
    );
    expect(comidas).toHaveLength(1);
    expect(comidas[0].opciones).toHaveLength(1);
  });

  it('limita la cantidad de comidas y de opciones', () => {
    const muchas = Array.from({ length: 15 }, (_, i) => ({
      nombre: `C${i}`,
      hora: '08:00',
      opciones: Array.from({ length: 7 }, () => [item(POLLO, 1)]),
    }));
    const { comidas } = interpretarRespuesta(respuesta(muchas), ALIMENTOS);
    expect(comidas).toHaveLength(8);
    expect(comidas[0].opciones).toHaveLength(4);
  });

  it('acepta una lista de comidas sin el objeto exterior', () => {
    const texto = JSON.stringify([{ nombre: 'A', hora: '08:00', opciones: [[item(POLLO, 1)]] }]);
    expect(interpretarRespuesta(texto, ALIMENTOS).comidas).toHaveLength(1);
  });

  it.each([
    ['', 'vacía'],
    ['no es json', 'texto'],
    [JSON.stringify({ comidas: [] }), 'sin comidas'],
    [JSON.stringify({ otra: 1 }), 'forma incorrecta'],
    [respuesta([{ nombre: 'A', hora: '08:00', opciones: [[item('Sushi', 1)]] }]), 'sin alimentos válidos'],
  ])('una respuesta inservible (%s) da un error claro: %s', (texto) => {
    expect(() => interpretarRespuesta(texto, ALIMENTOS)).toThrow('La IA no devolvió comidas válidas');
  });
});

describe('ajustarAObjetivos', () => {
  const armar = (...opciones) =>
    interpretarRespuesta(
      respuesta([
        { nombre: 'Almuerzo', hora: '13:00', opciones: opciones[0] },
        { nombre: 'Cena', hora: '21:00', opciones: opciones[1] },
      ]),
      ALIMENTOS,
    ).comidas;

  it('acerca las calorías del día al objetivo escalando las porciones', () => {
    const comidas = armar(
      [[item('Pechuga de Pollo', 2), item('Arroz Blanco (Cocido)', 2)]],
      [[item('Pechuga de Pollo', 2), item('Arroz Blanco (Cocido)', 2)]],
    );
    const antes = macrosDelDia(comidas).kcal; // 880
    const despues = macrosDelDia(ajustarAObjetivos(comidas, OBJETIVOS)).kcal;
    expect(Math.abs(despues - OBJETIVOS.kcal)).toBeLessThan(Math.abs(antes - OBJETIVOS.kcal));
    expect(Math.abs(despues - OBJETIVOS.kcal) / OBJETIVOS.kcal).toBeLessThan(0.1);
  });

  it('deja las porciones en múltiplos de 0,5', () => {
    const comidas = ajustarAObjetivos(armar([[item('Pechuga de Pollo', 1.5)]], [[item('Pan Integral', 1)]]), OBJETIVOS);
    for (const c of comidas) for (const i of c.opciones[0].items) expect((i.porciones * 2) % 1).toBe(0);
  });

  it('las opciones de una comida quedan equivalentes en calorías a la primera', () => {
    const comidas = ajustarAObjetivos(
      armar([[item('Pechuga de Pollo', 2)], [item('Arroz Blanco (Cocido)', 1)]], [[item('Pechuga de Pollo', 1)]]),
      { ...OBJETIVOS, kcal: 700 },
    );
    const [a, b] = comidas[0].opciones.map((o) => macrosDeOpcion(o).kcal);
    expect(Math.abs(a - b) / a).toBeLessThan(0.25);
  });

  it('no toca lo que es libre ni lo que no tiene calorías', () => {
    const base = armar(
      [[item('Lechuga / Espinaca / Rúcula', 1), item('Pechuga de Pollo', 1)]],
      [[item('Pechuga de Pollo', 1)]],
    );
    const ajustada = ajustarAObjetivos(base, OBJETIVOS);
    const libre = ajustada[0].opciones[0].items.find((i) => i.nombre.startsWith('Lechuga'));
    expect(libre.porciones).toBe(1);
  });

  it('sin objetivos devuelve las comidas como estaban, y no modifica las originales', () => {
    const base = armar([[item('Pechuga de Pollo', 2)]], [[item('Pechuga de Pollo', 2)]]);
    const copia = structuredClone(base);
    expect(ajustarAObjetivos(base, null)).toEqual(base);
    ajustarAObjetivos(base, OBJETIVOS);
    expect(base).toEqual(copia);
  });

  it('no se dispara con objetivos absurdos: el factor está acotado', () => {
    const base = armar([[item('Pechuga de Pollo', 1)]], [[item('Pechuga de Pollo', 1)]]);
    const ajustada = ajustarAObjetivos(base, { ...OBJETIVOS, kcal: 100000 });
    expect(ajustada[0].opciones[0].items[0].porciones).toBeLessThanOrEqual(2.5);
  });
});

describe('sugerirComidas', () => {
  const parametros = {
    alimentos: ALIMENTOS,
    objetivos: OBJETIVOS,
    cantidadComidas: 3,
    cantidadOpciones: 1,
    indicaciones: '',
  };
  const buenas = respuesta([
    { nombre: 'Desayuno', hora: '08:00', opciones: [[item('Pan Integral', 4), item('Pechuga de Pollo', 3)]] },
    { nombre: 'Almuerzo', hora: '13:00', opciones: [[item('Pechuga de Pollo', 4), item('Arroz Blanco (Cocido)', 6)]] },
  ]);

  it('pide a la IA, interpreta la respuesta y deja las porciones ajustadas a los objetivos', async () => {
    const llamar = vi.fn(async () => buenas);
    const { comidas, avisos } = await sugerirComidas(parametros, llamar);
    expect(llamar).toHaveBeenCalledWith(expect.stringContaining('2400'));
    expect(comidas).toHaveLength(2);
    expect(avisos).toEqual([]);
    const kcal = macrosDelDia(comidas).kcal;
    expect(Math.abs(kcal - OBJETIVOS.kcal) / OBJETIVOS.kcal).toBeLessThan(0.1);
  });

  it('si la IA falla, el error llega tal cual para mostrarlo', async () => {
    const llamar = vi.fn(async () => {
      throw new Error('La IA tiene mucha demanda');
    });
    await expect(sugerirComidas(parametros, llamar)).rejects.toThrow('La IA tiene mucha demanda');
  });

  it('si la IA responde cualquier cosa, avisa que no sirvió', async () => {
    await expect(sugerirComidas(parametros, async () => 'hola')).rejects.toThrow('La IA no devolvió comidas válidas');
  });

  it('sin objetivos no se puede pedir', async () => {
    await expect(sugerirComidas({ ...parametros, objetivos: null }, async () => buenas)).rejects.toThrow(
      'Completá los datos',
    );
  });
});
