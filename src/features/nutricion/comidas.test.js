import { describe, expect, it } from 'vitest';
import { crearAlimento } from './alimentos.js';
import {
  actualizarComida,
  actualizarPorciones,
  agregarComida,
  agregarItem,
  agregarOpcion,
  cantidadEquivalente,
  compararConObjetivos,
  crearComida,
  crearItem,
  macrosDeItem,
  macrosDeOpcion,
  macrosDelDia,
  nombreSugerido,
  normalizarComidas,
  ordenadasPorHora,
  quitarComida,
  quitarItem,
  quitarOpcion,
} from './comidas.js';

const pollo = crearAlimento({ categoria: 'proteins', nombre: 'Pechuga de pollo', porcion: '100 g' });
const arroz = crearAlimento({ categoria: 'carbs', nombre: 'Arroz', porcion: '75 g' });
const palta = crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' });

/** Una comida con una opción que ya tiene alimentos. */
function comidaCon(...pares) {
  let comidas = agregarComida([], crearComida({ nombre: 'Almuerzo', hora: '13:00' }));
  const [comida] = comidas;
  for (const [alimento, porciones] of pares) {
    comidas = agregarItem(comidas, comida.id, comida.opciones[0].id, alimento, porciones);
  }
  return comidas;
}

describe('crear comidas, opciones e items', () => {
  it('una comida nace con su nombre, su hora y una opción vacía', () => {
    const c = crearComida({ nombre: ' Desayuno ', hora: '08:30' });
    expect(c).toMatchObject({ nombre: 'Desayuno', hora: '08:30' });
    expect(c.opciones).toHaveLength(1);
    expect(c.opciones[0].items).toEqual([]);
    expect(c.id).toBeTruthy();
    expect(crearComida({ nombre: 'x' }).id).not.toBe(c.id);
  });

  it('la hora es opcional y una hora inválida queda vacía', () => {
    expect(crearComida({ nombre: 'x' }).hora).toBe('');
    expect(crearComida({ nombre: 'x', hora: '25:99' }).hora).toBe('');
    expect(crearComida({ nombre: 'x', hora: 'tarde' }).hora).toBe('');
  });

  it('un item copia los datos del alimento (si se borra de la biblioteca, el plan no se rompe)', () => {
    expect(crearItem(pollo, 2)).toMatchObject({
      categoria: 'proteins',
      nombre: 'Pechuga de pollo',
      porcion: '100 g',
      porciones: 2,
    });
  });

  it('nombreSugerido numera las comidas', () => {
    expect(nombreSugerido([])).toBe('Comida 1');
    expect(nombreSugerido(comidaCon())).toBe('Comida 2');
  });
});

describe('operaciones (no modifican la lista original)', () => {
  it('agregar y quitar comidas', () => {
    const original = comidaCon();
    const nueva = agregarComida(original, crearComida({ nombre: 'Cena' }));
    expect(nueva.map((c) => c.nombre)).toEqual(['Almuerzo', 'Cena']);
    expect(original).toHaveLength(1);
    expect(quitarComida(nueva, nueva[0].id).map((c) => c.nombre)).toEqual(['Cena']);
  });

  it('cambiar el nombre y la hora, sin tocar el resto', () => {
    const [comida] = comidaCon([pollo, 1]);
    const [cambiada] = actualizarComida([comida], comida.id, {
      nombre: 'Comida del mediodía',
      hora: '14:15',
      opciones: [],
    });
    expect(cambiada).toMatchObject({ id: comida.id, nombre: 'Comida del mediodía', hora: '14:15' });
    expect(cambiada.opciones).toEqual(comida.opciones); // las opciones no se pueden pisar por acá
  });

  it('una hora inválida al editar la deja vacía', () => {
    const [comida] = comidaCon();
    expect(actualizarComida([comida], comida.id, { hora: '99:99' })[0].hora).toBe('');
  });

  it('un nombre vacío al editar conserva el anterior', () => {
    const [comida] = comidaCon();
    expect(actualizarComida([comida], comida.id, { nombre: '   ' })[0].nombre).toBe('Almuerzo');
  });

  it('agregar una variante suma una opción vacía', () => {
    const [comida] = comidaCon([pollo, 1]);
    const [con] = agregarOpcion([comida], comida.id);
    expect(con.opciones).toHaveLength(2);
    expect(con.opciones[1].items).toEqual([]);
    expect(comida.opciones).toHaveLength(1);
  });

  it('quitar una variante; la última no se puede quitar', () => {
    let comidas = comidaCon();
    comidas = agregarOpcion(comidas, comidas[0].id);
    const [primera, segunda] = comidas[0].opciones;
    comidas = quitarOpcion(comidas, comidas[0].id, primera.id);
    expect(comidas[0].opciones.map((o) => o.id)).toEqual([segunda.id]);
    expect(quitarOpcion(comidas, comidas[0].id, segunda.id)[0].opciones).toHaveLength(1);
  });

  it('agregar un alimento a una opción', () => {
    const [comida] = comidaCon([pollo, 1], [arroz, 2]);
    expect(comida.opciones[0].items.map((i) => [i.nombre, i.porciones])).toEqual([
      ['Pechuga de pollo', 1],
      ['Arroz', 2],
    ]);
  });

  it('agregar de nuevo el mismo alimento suma las porciones en vez de repetir la fila', () => {
    const [comida] = comidaCon([pollo, 1], [pollo, 1.5]);
    expect(comida.opciones[0].items).toHaveLength(1);
    expect(comida.opciones[0].items[0].porciones).toBe(2.5);
  });

  it('cada opción tiene sus propios alimentos', () => {
    let comidas = comidaCon([pollo, 1]);
    comidas = agregarOpcion(comidas, comidas[0].id);
    comidas = agregarItem(comidas, comidas[0].id, comidas[0].opciones[1].id, arroz, 1);
    expect(comidas[0].opciones[0].items.map((i) => i.nombre)).toEqual(['Pechuga de pollo']);
    expect(comidas[0].opciones[1].items.map((i) => i.nombre)).toEqual(['Arroz']);
  });

  it('cambiar las porciones de un alimento', () => {
    const [comida] = comidaCon([pollo, 1]);
    const item = comida.opciones[0].items[0];
    const [nueva] = actualizarPorciones([comida], comida.id, comida.opciones[0].id, item.id, 3);
    expect(nueva.opciones[0].items[0].porciones).toBe(3);
  });

  it.each([0, -1, NaN, 'abc'])('con %j de porciones el alimento se quita', (valor) => {
    const [comida] = comidaCon([pollo, 1]);
    const item = comida.opciones[0].items[0];
    expect(
      actualizarPorciones([comida], comida.id, comida.opciones[0].id, item.id, valor)[0].opciones[0].items,
    ).toEqual([]);
  });

  it('quitar un alimento', () => {
    const [comida] = comidaCon([pollo, 1], [arroz, 1]);
    const [pollito] = comida.opciones[0].items;
    const [nueva] = quitarItem([comida], comida.id, comida.opciones[0].id, pollito.id);
    expect(nueva.opciones[0].items.map((i) => i.nombre)).toEqual(['Arroz']);
  });

  it('con ids que no existen no cambia nada', () => {
    const comidas = comidaCon([pollo, 1]);
    expect(agregarItem(comidas, 'x', 'y', arroz, 1)).toEqual(comidas);
    expect(quitarItem(comidas, comidas[0].id, 'y', 'z')).toEqual(comidas);
    expect(actualizarComida(comidas, 'x', { nombre: 'a' })).toEqual(comidas);
  });
});

describe('macros', () => {
  it('un alimento aporta los macros de su categoría por la cantidad de porciones', () => {
    expect(macrosDeItem(crearItem(pollo, 2))).toEqual({ kcal: 240, p: 50, c: 0, f: 4 });
    expect(macrosDeItem(crearItem(arroz, 0.5))).toEqual({ kcal: 50, p: 1.5, c: 10, f: 0 });
  });

  it('una categoría que ya no existe aporta cero (no rompe)', () => {
    expect(macrosDeItem({ categoria: 'inexistente', porciones: 3 })).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });

  it('una opción suma sus alimentos', () => {
    const [comida] = comidaCon([pollo, 1], [arroz, 2]);
    expect(macrosDeOpcion(comida.opciones[0])).toEqual({ kcal: 320, p: 31, c: 40, f: 2 });
  });

  it('una opción vacía suma cero', () => {
    expect(macrosDeOpcion(crearComida({ nombre: 'x' }).opciones[0])).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });

  it('el día suma la primera opción de cada comida: las variantes son alternativas, no se suman', () => {
    let comidas = comidaCon([pollo, 1], [arroz, 2]);
    comidas = agregarOpcion(comidas, comidas[0].id);
    comidas = agregarItem(comidas, comidas[0].id, comidas[0].opciones[1].id, palta, 5); // la variante no cuenta
    const cena = crearComida({ nombre: 'Cena' });
    comidas = agregarItem(agregarComida(comidas, cena), cena.id, cena.opciones[0].id, palta, 1);
    expect(macrosDelDia(comidas)).toEqual({ kcal: 420, p: 31, c: 40, f: 13 });
  });

  it('el total del día sale redondeado a números enteros', () => {
    const dia = macrosDelDia(comidaCon([pollo, 0.33], [arroz, 0.33]));
    expect(Object.values(dia).every(Number.isInteger)).toBe(true);
    expect(dia).toEqual({ kcal: 73, p: 9, c: 7, f: 1 }); // 72,6 · 9,24 · 6,6 · 0,66
  });

  it('sin comidas suma cero', () => {
    expect(macrosDelDia([])).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });
});

describe('compararConObjetivos', () => {
  const objetivos = { kcal: 2000, p: 150, c: 200, f: 60 };

  it('para cada macro da lo consumido, el objetivo, lo que falta y el porcentaje', () => {
    const r = compararConObjetivos({ kcal: 1000, p: 75, c: 100, f: 30 }, objetivos);
    expect(r.kcal).toMatchObject({ consumido: 1000, objetivo: 2000, restante: 1000, pct: 50 });
    expect(r.p).toMatchObject({ consumido: 75, objetivo: 150, restante: 75, pct: 50 });
  });

  it('marca si está por debajo, en el objetivo (±5 %) o por encima', () => {
    const estados = (consumido) => compararConObjetivos(consumido, objetivos).kcal.estado;
    expect(estados({ kcal: 1500, p: 0, c: 0, f: 0 })).toBe('bajo');
    expect(estados({ kcal: 1910, p: 0, c: 0, f: 0 })).toBe('ok'); // 95,5 %
    expect(estados({ kcal: 2090, p: 0, c: 0, f: 0 })).toBe('ok'); // 104,5 %
    expect(estados({ kcal: 2200, p: 0, c: 0, f: 0 })).toBe('alto');
  });

  it('lo que se pasó da un restante negativo', () => {
    expect(compararConObjetivos({ kcal: 2300, p: 0, c: 0, f: 0 }, objetivos).kcal.restante).toBe(-300);
  });

  it('sin objetivos (faltan datos del alumno) devuelve null', () => {
    expect(compararConObjetivos({ kcal: 100, p: 1, c: 1, f: 1 }, null)).toBeNull();
  });

  it('un objetivo en 0 no divide por cero', () => {
    const r = compararConObjetivos({ kcal: 10, p: 5, c: 0, f: 0 }, { kcal: 2000, p: 150, c: 0, f: 60 });
    expect(r.c.pct).toBeNull();
    expect(r.c.estado).toBe('ok'); // sin objetivo no hay desvío
  });
});

describe('cantidadEquivalente (cuánto es en gramos o ml)', () => {
  it.each([
    ['100g', 2, '200 g'],
    ['120g', 1.5, '180 g'],
    ['200ml', 0.5, '100 ml'],
    ['10ml', 3, '30 ml'],
    ['75g', 0.5, '37,5 g'],
    ['100 g', 1, '100 g'],
  ])('«%s» por %s porciones es %s', (porcion, porciones, esperado) => {
    expect(cantidadEquivalente(porcion, porciones)).toBe(esperado);
  });

  it.each(['1 scoop (30g)', '1 Rebanada', '2 unidades', 'Libre', '', '1 taza'])(
    'si la porción no es una medida simple («%s») no inventa una equivalencia',
    (porcion) => {
      expect(cantidadEquivalente(porcion, 2)).toBeNull();
    },
  );
});

describe('ordenadasPorHora', () => {
  it('ordena por hora y deja al final las que no tienen', () => {
    const [a, b, c, d] = ['', '20:00', '08:00', ''].map((hora, i) => crearComida({ nombre: `c${i}`, hora }));
    expect(ordenadasPorHora([a, b, c, d]).map((x) => x.nombre)).toEqual(['c2', 'c1', 'c0', 'c3']);
  });

  it('no modifica la lista original', () => {
    const lista = [crearComida({ nombre: 'b', hora: '20:00' }), crearComida({ nombre: 'a', hora: '08:00' })];
    ordenadasPorHora(lista);
    expect(lista.map((c) => c.nombre)).toEqual(['b', 'a']);
  });
});

describe('normalizarComidas (lo que viene de localStorage)', () => {
  it('conserva las comidas válidas', () => {
    const comidas = comidaCon([pollo, 1], [arroz, 2]);
    expect(normalizarComidas(JSON.parse(JSON.stringify(comidas)))).toEqual(comidas);
  });

  it('si no es una lista devuelve una lista vacía', () => {
    for (const dato of [null, undefined, {}, 'x', 7]) expect(normalizarComidas(dato)).toEqual([]);
  });

  it('descarta lo que no es una comida', () => {
    expect(normalizarComidas([null, 'x', 5])).toEqual([]);
  });

  it('completa lo que falta: nombre, hora válida, una opción y ids', () => {
    const [c] = normalizarComidas([{ nombre: '', hora: 'mal' }]);
    expect(c.nombre).toBe('Comida');
    expect(c.hora).toBe('');
    expect(c.opciones).toHaveLength(1);
    expect(c.id).toBeTruthy();
  });

  it('descarta los items con categoría inexistente o porciones que no sirven', () => {
    const [c] = normalizarComidas([
      {
        id: 'c1',
        nombre: 'x',
        opciones: [
          {
            id: 'o1',
            items: [
              { id: 'i1', categoria: 'proteins', nombre: 'Pollo', porcion: '100 g', porciones: 1 },
              { id: 'i2', categoria: 'nada', nombre: 'Raro', porcion: '1', porciones: 1 },
              { id: 'i3', categoria: 'carbs', nombre: 'Arroz', porcion: '75 g', porciones: 0 },
              { id: 'i4', categoria: 'carbs', nombre: 'Pan', porcion: '1', porciones: 'mucho' },
              { id: 'i5', categoria: 'carbs', nombre: 'Papa', porcion: '1', porciones: 999 },
            ],
          },
        ],
      },
    ]);
    expect(c.opciones[0].items.map((i) => i.nombre)).toEqual(['Pollo']);
  });

  it('repara ids repetidos', () => {
    const lista = normalizarComidas([
      { id: 'a', nombre: 'uno', opciones: [{ id: 'o', items: [] }] },
      { id: 'a', nombre: 'dos', opciones: [{ id: 'o', items: [] }] },
    ]);
    expect(new Set(lista.map((c) => c.id)).size).toBe(2);
  });
});
