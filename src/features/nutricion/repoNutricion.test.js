import { beforeEach, describe, expect, it } from 'vitest';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { agregarItem, crearComida } from './comidas.js';
import { alimentosIniciales } from './alimentos.js';
import { parametrosIniciales } from './objetivos.js';
import { crearRepoNutricion } from './repoNutricion.js';
import { crearRepoNutricionLocal } from './repoLocal.js';

const ANA = 'ana';
const LUIS = 'luis';

let cliente;
let local;
let repo;
beforeEach(() => {
  cliente = crearClienteFalso();
  const datos = new Map();
  const almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  local = crearRepoNutricionLocal(() => almacen);
  repo = crearRepoNutricion(cliente, local);
});

function plan(notas) {
  const pollo = alimentosIniciales().find((a) => a.nombre === 'Pechuga de Pollo');
  const c = crearComida({ nombre: 'Almuerzo', hora: '13:00' });
  return {
    parametros: parametrosIniciales({}),
    comidas: agregarItem([c], c.id, c.opciones[0].id, pollo, 2),
    notas,
  };
}

describe('repo de nutrición de la app', () => {
  describe('biblioteca de alimentos', () => {
    const queso = {
      id: 'q1',
      categoria: 'mixed_pf',
      nombre: 'Queso casero',
      porcion: '40g',
      gluten: false,
      lacteo: true,
    };

    it('guarda y carga desde Supabase, compartida entre coaches', async () => {
      const lista = await repo.cargarAlimentos();
      await repo.guardarAlimentos([...lista, queso]);
      expect(cliente.tablas.nutrition_foods.some((f) => f.id === 'q1')).toBe(true);
      const otroCoach = crearRepoNutricion(
        cliente,
        crearRepoNutricionLocal(() => ({ getItem: () => null, setItem() {} })),
      );
      expect((await otroCoach.cargarAlimentos()).some((a) => a.id === 'q1')).toBe(true);
    });

    it('la primera vez arma la biblioteca con la base inicial', async () => {
      const lista = await repo.cargarAlimentos();
      expect(lista.length).toBeGreaterThan(20);
      expect(cliente.tablas.nutrition_foods).toHaveLength(lista.length);
      expect(lista.some((a) => a.nombre === 'Pechuga de Pollo')).toBe(true);
    });

    it('trae la biblioteca que el coach ya tenía en su navegador (con lo que agregó o cambió)', async () => {
      local.guardarAlimentos([queso]);
      const lista = await repo.cargarAlimentos();
      expect(lista).toEqual([queso]);
    });

    it('si la base ya tenía alimentos, suma solo los del navegador que no estaban (sin repetir nombres)', async () => {
      await repo.guardarAlimentos([
        { id: 'p1', categoria: 'proteins', nombre: 'Pechuga de Pollo', porcion: '100g', gluten: false, lacteo: false },
      ]);
      local.guardarAlimentos([
        {
          id: 'otro-id',
          categoria: 'proteins',
          nombre: 'pechuga de pollo',
          porcion: '100g',
          gluten: false,
          lacteo: false,
        },
        queso,
      ]);
      const lista = await repo.cargarAlimentos();
      expect(lista.map((a) => a.nombre).sort()).toEqual(['Pechuga de Pollo', 'Queso casero']);
    });

    it('trae lo del navegador una sola vez: lo que se borra después no vuelve', async () => {
      local.guardarAlimentos([queso]);
      const lista = await repo.cargarAlimentos();
      await repo.guardarAlimentos(lista.filter((a) => a.id !== 'q1'));
      expect(await repo.cargarAlimentos()).toEqual([]);
    });

    it('si no se pudo traer lo del navegador, carga igual y lo vuelve a intentar la próxima vez', async () => {
      local.guardarAlimentos([queso]);
      const desde = cliente.from;
      let consultas = 0;
      cliente.from = (tabla) => {
        if (++consultas === 2) cliente.fallarLaProxima('sin conexión'); // la 1.ª lee y la 2.ª intenta sumar
        return desde(tabla);
      };
      expect(await repo.cargarAlimentos()).toEqual([]); // carga lo que hay, sin romper la pantalla
      cliente.from = desde;
      expect(await repo.cargarAlimentos()).toEqual([queso]); // y esta vez lo trae
    });

    it('los alimentos ya no se guardan en el navegador', async () => {
      const lista = await repo.cargarAlimentos();
      local.guardarAlimentos([queso]);
      await repo.guardarAlimentos(lista.slice(0, 3));
      expect(local.cargarAlimentos()).toEqual([queso]);
    });
  });

  it('los planes se guardan en Supabase, no en el navegador', async () => {
    await repo.guardarPlan(ANA, plan('desde la nube'));
    expect(cliente.tablas.nutrition_plans).toHaveLength(1);
    expect(local.cargarPlan(ANA)).toBeNull();
    expect((await repo.cargarPlan(ANA)).notas).toBe('desde la nube');
  });

  it('un plan de prueba que el coach tenía en su navegador se sigue viendo hasta que lo guarda en su cuenta', async () => {
    local.guardarPlan(ANA, plan('del prototipo'));
    const cargado = await repo.cargarPlan(ANA);
    expect(cargado.notas).toBe('del prototipo');
    expect(cargado.publicado).toBe(false);
    expect(cliente.tablas.nutrition_plans).toHaveLength(0);
    await repo.guardarPlan(ANA, cargado);
    expect(cliente.tablas.nutrition_plans).toHaveLength(1);
  });

  it('si hay un plan en Supabase, gana sobre el del navegador', async () => {
    local.guardarPlan(ANA, plan('viejo'));
    await repo.guardarPlan(ANA, plan('nuevo'));
    expect((await repo.cargarPlan(ANA)).notas).toBe('nuevo');
  });

  it('sin plan en ningún lado devuelve null', async () => {
    expect(await repo.cargarPlan(ANA)).toBeNull();
  });

  it('listarPlanes suma los planes de Supabase y los que solo están en el navegador de los alumnos pedidos', async () => {
    await repo.guardarPlan(ANA, plan('a'));
    await repo.publicarPlan(ANA, true);
    local.guardarPlan(LUIS, plan('l'));
    const lista = await repo.listarPlanes([ANA, LUIS, 'otro']);
    expect(lista).toEqual(
      expect.arrayContaining([
        { alumnoId: ANA, publicado: true },
        { alumnoId: LUIS, publicado: false },
      ]),
    );
    expect(lista).toHaveLength(2);
  });

  it('publicar y ocultar funcionan sobre el plan guardado en Supabase', async () => {
    await repo.guardarPlan(ANA, plan('a'));
    await repo.publicarPlan(ANA, true);
    expect((await repo.cargarPlan(ANA)).publicado).toBe(true);
    await repo.publicarPlan(ANA, false);
    expect((await repo.cargarPlan(ANA)).publicado).toBe(false);
  });
});
