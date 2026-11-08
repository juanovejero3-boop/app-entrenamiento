import { beforeEach, describe, expect, it } from 'vitest';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { crearAlimento } from './alimentos.js';
import { crearRepoAlimentos } from './repoAlimentos.js';

let cliente;
let repo;
beforeEach(() => {
  cliente = crearClienteFalso();
  repo = crearRepoAlimentos(cliente);
});

const pollo = () => crearAlimento({ categoria: 'proteins', nombre: 'Pechuga de Pollo', porcion: '100g' });
const queso = () => crearAlimento({ categoria: 'mixed_pf', nombre: 'Queso', porcion: '40g', lacteo: true });
const filas = () => cliente.tablas.nutrition_foods;

describe('repo de la biblioteca de alimentos (Supabase)', () => {
  it('sin alimentos devuelve una lista vacía', async () => {
    expect(await repo.cargarAlimentos()).toEqual([]);
  });

  it('guarda los alimentos y los vuelve a cargar tal cual', async () => {
    const lista = [pollo(), queso()];
    await repo.guardarAlimentos(lista);
    expect(filas()).toHaveLength(2);
    expect(await repo.cargarAlimentos()).toEqual(expect.arrayContaining(lista));
  });

  it('solo manda lo que cambió y solo borra lo que se quitó', async () => {
    const [a, b] = [pollo(), queso()];
    await repo.guardarAlimentos([a, b]);
    cliente.llamadas.length = 0;

    await repo.guardarAlimentos([{ ...a, porcion: '120g' }, b]);
    expect(cliente.llamadas).toHaveLength(1);
    expect(cliente.llamadas[0]).toMatchObject({ op: 'upsert' });
    expect(cliente.llamadas[0].filas.map((f) => f.id)).toEqual([a.id]);
    expect(filas().find((f) => f.id === a.id).porcion).toBe('120g');

    cliente.llamadas.length = 0;
    await repo.guardarAlimentos([{ ...a, porcion: '120g' }]);
    expect(cliente.llamadas.map((l) => l.op)).toEqual(['delete']);
    expect(filas().map((f) => f.id)).toEqual([a.id]);
  });

  it('guardar sin cambios no llama a Supabase', async () => {
    const lista = [pollo()];
    await repo.guardarAlimentos(lista);
    cliente.llamadas.length = 0;
    await repo.guardarAlimentos(lista);
    expect(cliente.llamadas).toHaveLength(0);
  });

  it('no pisa lo que cargó otro coach mientras tanto (solo borra lo que este quitó)', async () => {
    const [a, b] = [pollo(), queso()];
    await repo.guardarAlimentos([a, b]);
    await repo.cargarAlimentos(); // este coach conoce a y b
    const otroCoach = crearRepoAlimentos(cliente);
    const nuevo = crearAlimento({ categoria: 'fats', nombre: 'Aceite', porcion: '10ml' });
    await otroCoach.cargarAlimentos();
    await otroCoach.guardarAlimentos([a, b, nuevo]);

    await repo.guardarAlimentos([a]); // este quita b
    expect(
      filas()
        .map((f) => f.id)
        .sort(),
    ).toEqual([a.id, nuevo.id].sort());
  });

  it('un guardado que falla se puede repetir: no se da por hecho', async () => {
    const lista = [pollo()];
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.guardarAlimentos(lista)).rejects.toThrow('sin conexión');
    expect(filas()).toHaveLength(0);
    await repo.guardarAlimentos(lista);
    expect(filas()).toHaveLength(1);
  });

  it('agrega solo los alimentos que faltan, sin tocar los que ya están', async () => {
    const [a, b] = [pollo(), queso()];
    await repo.guardarAlimentos([a]);
    await repo.agregarAlimentos([a, b]);
    expect(
      filas()
        .map((f) => f.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
  });

  it('lo que viene de la base y no sirve se descarta en vez de romper la pantalla', async () => {
    filas().push({ id: 'x', categoria: 'inventada', nombre: 'Algo', porcion: '1' });
    filas().push({ id: 'y', categoria: 'fats', nombre: '', porcion: '1' });
    filas().push({ id: 'z', categoria: 'fats', nombre: 'Aceite', porcion: '10ml', gluten: null, lacteo: null });
    const lista = await repo.cargarAlimentos();
    expect(lista).toEqual([
      { id: 'z', categoria: 'fats', nombre: 'Aceite', porcion: '10ml', gluten: false, lacteo: false },
    ]);
  });

  it('si Supabase falla, el error llega como un Error con su mensaje', async () => {
    cliente.fallarLaProxima('sin permisos');
    await expect(repo.cargarAlimentos()).rejects.toThrow('sin permisos');
  });
});
