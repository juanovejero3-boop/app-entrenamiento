import { beforeEach, describe, expect, it } from 'vitest';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { agregarItem, crearComida } from './comidas.js';
import { alimentosIniciales } from './alimentos.js';
import { parametrosIniciales } from './objetivos.js';
import { crearRepoPlanes } from './repoPlanes.js';

const ANA = 'ana';
const LUIS = 'luis';

let cliente;
let repo;
beforeEach(() => {
  cliente = crearClienteFalso();
  repo = crearRepoPlanes(cliente);
});

function planConAlmuerzo(notas = '') {
  const pollo = alimentosIniciales().find((a) => a.nombre === 'Pechuga de Pollo');
  const c = crearComida({ nombre: 'Almuerzo', hora: '13:00' });
  return {
    parametros: parametrosIniciales({}),
    comidas: agregarItem([c], c.id, c.opciones[0].id, pollo, 2),
    notas,
  };
}

describe('repo de planes de nutrición (Supabase)', () => {
  it('un alumno sin plan devuelve null', async () => {
    expect(await repo.cargarPlan(ANA)).toBeNull();
  });

  it('guarda el plan del alumno y lo vuelve a cargar tal cual, sin publicar', async () => {
    const plan = planConAlmuerzo('Tomar agua');
    await repo.guardarPlan(ANA, plan);
    const cargado = await repo.cargarPlan(ANA);
    expect(cargado.comidas).toEqual(plan.comidas);
    expect(cargado.parametros).toEqual(plan.parametros);
    expect(cargado.notas).toBe('Tomar agua');
    expect(cargado.publicado).toBe(false);
  });

  it('guardar de nuevo actualiza el mismo plan (no lo duplica) y los planes de cada alumno son independientes', async () => {
    await repo.guardarPlan(ANA, planConAlmuerzo('uno'));
    await repo.guardarPlan(ANA, planConAlmuerzo('dos'));
    await repo.guardarPlan(LUIS, planConAlmuerzo('otro'));
    expect(cliente.tablas.nutrition_plans).toHaveLength(2);
    expect((await repo.cargarPlan(ANA)).notas).toBe('dos');
    expect((await repo.cargarPlan(LUIS)).notas).toBe('otro');
  });

  it('guardar los cambios no oculta un plan ya publicado', async () => {
    await repo.guardarPlan(ANA, planConAlmuerzo());
    await repo.publicarPlan(ANA, true);
    await repo.guardarPlan(ANA, planConAlmuerzo('cambio'));
    expect((await repo.cargarPlan(ANA)).publicado).toBe(true);
  });

  it('publicar lo muestra al alumno (con la fecha) y ocultar lo vuelve a esconder', async () => {
    await repo.guardarPlan(ANA, planConAlmuerzo());
    await repo.publicarPlan(ANA, true);
    expect(cliente.tablas.nutrition_plans[0].published).toBe(true);
    expect(cliente.tablas.nutrition_plans[0].published_at).toEqual(expect.any(String));
    await repo.publicarPlan(ANA, false);
    expect(cliente.tablas.nutrition_plans[0].published).toBe(false);
    expect(cliente.tablas.nutrition_plans[0].published_at).toBeNull();
  });

  it('no se puede publicar un alumno que todavía no tiene plan', async () => {
    await expect(repo.publicarPlan(ANA, true)).rejects.toThrow(/todavía no tiene un plan/i);
  });

  it('lo guardado que no sirve se normaliza en vez de romper la pantalla', async () => {
    cliente.tablas.nutrition_plans.push({
      student_id: ANA,
      parametros: 'roto',
      comidas: { no: 'es lista' },
      notas: 'x'.repeat(5000),
      published: true,
    });
    const plan = await repo.cargarPlan(ANA);
    expect(plan.comidas).toEqual([]);
    expect(plan.parametros).toEqual(expect.any(Object));
    expect(plan.notas.length).toBeLessThanOrEqual(2000);
    expect(plan.publicado).toBe(true);
  });

  it('lista qué alumnos tienen plan y cuáles están publicados, en una sola consulta', async () => {
    await repo.guardarPlan(ANA, planConAlmuerzo());
    await repo.guardarPlan(LUIS, planConAlmuerzo());
    await repo.publicarPlan(LUIS, true);
    cliente.llamadas.length = 0;
    const lista = await repo.listarPlanes();
    expect(lista).toEqual(
      expect.arrayContaining([
        { alumnoId: ANA, publicado: false },
        { alumnoId: LUIS, publicado: true },
      ]),
    );
    expect(cliente.llamadas).toHaveLength(1);
  });

  it('si Supabase falla, el error llega como un Error con su mensaje', async () => {
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.cargarPlan(ANA)).rejects.toThrow('sin conexión');
    cliente.fallarLaProxima('sin permisos');
    await expect(repo.guardarPlan(ANA, planConAlmuerzo())).rejects.toThrow('sin permisos');
  });
});
