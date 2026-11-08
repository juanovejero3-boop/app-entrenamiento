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
  it('los alimentos siguen en el navegador del coach, no en Supabase', async () => {
    const lista = repo.cargarAlimentos();
    expect(lista.length).toBeGreaterThan(0);
    repo.guardarAlimentos([lista[0]]);
    expect(repo.cargarAlimentos()).toEqual([lista[0]]);
    expect(cliente.llamadas).toHaveLength(0);
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
