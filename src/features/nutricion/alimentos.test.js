import { describe, expect, it } from 'vitest';
import {
  actualizarAlimento,
  agregarAlimento,
  agruparPorCategoria,
  alimentosIniciales,
  CATEGORIAS,
  categoriaDe,
  crearAlimento,
  normalizarAlimentos,
  quitarAlimento,
  validarAlimento,
} from './alimentos.js';

const pollo = () => crearAlimento({ categoria: 'proteins', nombre: 'Pechuga de pollo', porcion: '100 g' });

describe('categorías de intercambio', () => {
  it('cada categoría tiene nombre y los macros de una porción', () => {
    expect(CATEGORIAS.length).toBeGreaterThan(0);
    for (const c of CATEGORIAS) {
      expect(c.nombre).toBeTruthy();
      expect(Object.keys(c.macros).sort()).toEqual(['c', 'f', 'kcal', 'p']);
    }
  });

  it('los ids no se repiten', () => {
    const ids = CATEGORIAS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('categoriaDe devuelve la categoría o undefined', () => {
    expect(categoriaDe('proteins').nombre).toBe('Proteínas');
    expect(categoriaDe('inexistente')).toBeUndefined();
  });
});

describe('crearAlimento', () => {
  it('arma el alimento con id propio y sin marcas por defecto', () => {
    const a = pollo();
    expect(a).toMatchObject({
      categoria: 'proteins',
      nombre: 'Pechuga de pollo',
      porcion: '100 g',
      gluten: false,
      lacteo: false,
    });
    expect(a.id).toBeTruthy();
    expect(pollo().id).not.toBe(a.id);
  });

  it('recorta los espacios', () => {
    expect(crearAlimento({ categoria: 'fats', nombre: '  Palta ', porcion: ' 60 g  ' })).toMatchObject({
      nombre: 'Palta',
      porcion: '60 g',
    });
  });

  it('guarda el gluten y los lácteos solo si vienen en true', () => {
    expect(
      crearAlimento({ categoria: 'carbs', nombre: 'Pan', porcion: '1 rebanada', gluten: true, lacteo: 'si' }),
    ).toMatchObject({
      gluten: true,
      lacteo: false,
    });
  });
});

describe('validarAlimento', () => {
  const lista = [pollo()];

  it('un alimento correcto no tiene error', () => {
    expect(validarAlimento(crearAlimento({ categoria: 'carbs', nombre: 'Arroz', porcion: '75 g' }), lista)).toBeNull();
  });

  it('pide nombre', () => {
    expect(validarAlimento({ ...pollo(), nombre: '   ' }, [])).toMatch(/nombre/i);
  });

  it('pide porción', () => {
    expect(validarAlimento({ ...pollo(), porcion: '' }, [])).toMatch(/porción/i);
  });

  it('pide una categoría que exista', () => {
    expect(validarAlimento({ ...pollo(), categoria: 'otra' }, [])).toMatch(/categoría/i);
  });

  it('no permite repetir el nombre en la misma categoría (sin importar mayúsculas ni tildes)', () => {
    const repetido = crearAlimento({ categoria: 'proteins', nombre: 'PECHUGA DE POLLÓ', porcion: '120 g' });
    expect(validarAlimento(repetido, lista)).toMatch(/ya existe/i);
  });

  it('el mismo nombre en otra categoría sí se puede', () => {
    const otro = crearAlimento({ categoria: 'mixed_pf', nombre: 'Pechuga de pollo', porcion: '100 g' });
    expect(validarAlimento(otro, lista)).toBeNull();
  });

  it('al editar, el alimento no choca consigo mismo', () => {
    expect(validarAlimento({ ...lista[0], porcion: '150 g' }, lista)).toBeNull();
  });
});

describe('operaciones sobre la lista (no modifican la original)', () => {
  it('agregar suma al final', () => {
    const lista = [pollo()];
    const nueva = agregarAlimento(lista, crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' }));
    expect(nueva.map((a) => a.nombre)).toEqual(['Pechuga de pollo', 'Palta']);
    expect(lista).toHaveLength(1);
  });

  it('actualizar cambia solo ese alimento y conserva su id', () => {
    const [a, b] = [pollo(), crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' })];
    const nueva = actualizarAlimento([a, b], a.id, { nombre: 'Pollo', gluten: true });
    expect(nueva[0]).toMatchObject({ id: a.id, nombre: 'Pollo', gluten: true, porcion: '100 g' });
    expect(nueva[1]).toBe(b);
    expect(a.nombre).toBe('Pechuga de pollo');
  });

  it('actualizar no deja pisar el id', () => {
    const a = pollo();
    expect(actualizarAlimento([a], a.id, { id: 'otro' })[0].id).toBe(a.id);
  });

  it('quitar saca solo ese alimento', () => {
    const [a, b] = [pollo(), crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' })];
    expect(quitarAlimento([a, b], a.id)).toEqual([b]);
  });

  it('con un id que no existe no cambia nada', () => {
    const lista = [pollo()];
    expect(quitarAlimento(lista, 'nada')).toEqual(lista);
    expect(actualizarAlimento(lista, 'nada', { nombre: 'x' })).toEqual(lista);
  });
});

describe('agruparPorCategoria', () => {
  const lista = [
    crearAlimento({ categoria: 'fats', nombre: 'Palta', porcion: '60 g' }),
    crearAlimento({ categoria: 'proteins', nombre: 'Whey', porcion: '30 g' }),
    crearAlimento({ categoria: 'proteins', nombre: 'Árbol de pollo', porcion: '100 g' }),
    crearAlimento({ categoria: 'proteins', nombre: 'Carne magra', porcion: '100 g' }),
  ];

  it('sigue el orden de las categorías y ordena los alimentos por nombre', () => {
    const grupos = agruparPorCategoria(lista);
    expect(grupos.map((g) => g.categoria.id)).toEqual(['proteins', 'fats']);
    expect(grupos[0].alimentos.map((a) => a.nombre)).toEqual(['Árbol de pollo', 'Carne magra', 'Whey']);
  });

  it('no incluye categorías vacías', () => {
    expect(agruparPorCategoria([]).length).toBe(0);
  });

  it('filtra por nombre sin importar mayúsculas ni tildes', () => {
    const grupos = agruparPorCategoria(lista, 'ARBOL');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].alimentos.map((a) => a.nombre)).toEqual(['Árbol de pollo']);
  });

  it('filtrar también busca en la porción y en el nombre de la categoría', () => {
    expect(agruparPorCategoria(lista, '60 g')[0].alimentos[0].nombre).toBe('Palta');
    expect(agruparPorCategoria(lista, 'grasas')[0].alimentos[0].nombre).toBe('Palta');
  });

  it('un filtro sin coincidencias devuelve vacío', () => {
    expect(agruparPorCategoria(lista, 'zzz')).toEqual([]);
  });
});

describe('alimentosIniciales (los del prototipo del coach)', () => {
  const iniciales = alimentosIniciales();

  it('trae una base lista para usar y todos son válidos', () => {
    expect(iniciales.length).toBeGreaterThan(20);
    for (const a of iniciales)
      expect(
        validarAlimento(
          a,
          iniciales.filter((x) => x !== a),
        ),
      ).toBeNull();
  });

  it('separa el nombre de la porción del texto "nombre → porción"', () => {
    expect(iniciales.find((a) => a.nombre === 'Pechuga de Pollo')).toMatchObject({
      categoria: 'proteins',
      porcion: '100g',
    });
  });

  it('conserva las marcas de gluten del prototipo', () => {
    expect(iniciales.find((a) => a.nombre.startsWith('Pasta')).gluten).toBe(true);
    expect(iniciales.find((a) => a.nombre === 'Pechuga de Pollo').gluten).toBe(false);
  });

  it('cada llamada devuelve alimentos nuevos (ids propios)', () => {
    expect(alimentosIniciales()[0].id).not.toBe(iniciales[0].id);
  });
});

describe('normalizarAlimentos (lo que viene de localStorage)', () => {
  it('conserva los alimentos válidos', () => {
    const lista = [pollo()];
    expect(normalizarAlimentos(JSON.parse(JSON.stringify(lista)))).toEqual(lista);
  });

  it('descarta lo que no es un alimento y lo que no se puede arreglar', () => {
    const buenos = pollo();
    const lista = normalizarAlimentos([
      buenos,
      null,
      'x',
      { nombre: 'sin categoría', porcion: '1' },
      { categoria: 'nada', nombre: 'a', porcion: 'b' },
    ]);
    expect(lista).toEqual([buenos]);
  });

  it('completa los campos que faltan y repara ids faltantes o repetidos', () => {
    const lista = normalizarAlimentos([
      { id: 'a', categoria: 'fats', nombre: 'Palta', porcion: '60 g' },
      { id: 'a', categoria: 'fats', nombre: 'Aceite', porcion: '10 ml' },
      { categoria: 'carbs', nombre: 'Arroz', porcion: '75 g' },
    ]);
    expect(lista).toHaveLength(3);
    expect(new Set(lista.map((a) => a.id)).size).toBe(3);
    expect(lista[0]).toMatchObject({ gluten: false, lacteo: false });
  });

  it('si no es una lista devuelve null (el que llama decide qué hacer)', () => {
    expect(normalizarAlimentos(null)).toBeNull();
    expect(normalizarAlimentos({})).toBeNull();
    expect(normalizarAlimentos('hola')).toBeNull();
  });
});
