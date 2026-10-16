import { beforeEach, describe, expect, it } from 'vitest';
import { crearPlan } from '../entrenamiento/plan.js';
import { crearClienteFalso } from './clienteFalso.js';
import { crearRepoSupabase } from './supabase.js';

const ANA = 'ana-id';
const LUIS = 'luis-id';
const TERMINADA = '2026-10-16T21:30:00.000Z';

let cliente;
let repo;
beforeEach(() => {
  cliente = crearClienteFalso();
  repo = crearRepoSupabase(cliente);
});

const planDe = (nombre) => ({ ...crearPlan({ fechaInicio: '2026-10-19' }), macroName: nombre });
const filasDe = (tabla) => cliente.tablas[tabla];
const upserts = (tabla) => cliente.llamadas.filter((l) => l.tabla === tabla && l.op === 'upsert');
const borrados = (tabla) => cliente.llamadas.filter((l) => l.tabla === tabla && l.op === 'delete');
const serieHecha = { kg: '80', reps: '8', done: true, skipped: false };
const diaHecho = { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' };

describe('repo de Supabase: ciclos', () => {
  it('un alumno sin ciclos tiene una lista vacía', async () => {
    expect(await repo.listarCiclos(ANA)).toEqual([]);
  });

  it('crea el ciclo en borrador y lo devuelve con su plan, su alumno y sus fechas', async () => {
    const ciclo = await repo.crearCiclo(ANA, planDe('Fuerza'));

    expect(ciclo).toMatchObject({ alumnoId: ANA, estado: 'borrador', finalizadoEn: null });
    expect(ciclo.id).toBeTruthy();
    expect(ciclo.creadoEn).toBeTruthy();
    expect(ciclo.plan.macroName).toBe('Fuerza');
    expect(filasDe('training_cycles')).toMatchObject([{ student_id: ANA, status: 'borrador' }]);
  });

  it('se puede crear directamente activo', async () => {
    expect((await repo.crearCiclo(ANA, planDe('Fuerza'), 'activo')).estado).toBe('activo');
  });

  it('lista los ciclos del alumno del más viejo al más nuevo, sin mezclar a otros alumnos', async () => {
    await repo.crearCiclo(ANA, planDe('Primero'), 'finalizado');
    await repo.crearCiclo(LUIS, planDe('De Luis'), 'activo');
    await repo.crearCiclo(ANA, planDe('Segundo'), 'borrador');

    const ciclos = await repo.listarCiclos(ANA);
    expect(ciclos.map((c) => c.plan.macroName)).toEqual(['Primero', 'Segundo']);
    expect(ciclos.map((c) => c.estado)).toEqual(['finalizado', 'borrador']);
  });

  it('un plan guardado con campos faltantes se normaliza al listarlo', async () => {
    filasDe('training_cycles').push({
      id: 'c1',
      student_id: ANA,
      status: 'activo',
      plan: { macroName: 'Viejo' },
      finished_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const [ciclo] = await repo.listarCiclos(ANA);
    expect(ciclo.plan.weeks).toEqual([]);
    expect(ciclo.plan.macroName).toBe('Viejo');
  });

  it('guarda el plan de ese ciclo y no toca los demás', async () => {
    const a = await repo.crearCiclo(ANA, planDe('A'), 'finalizado');
    const b = await repo.crearCiclo(ANA, planDe('B'));
    await repo.guardarPlanDelCiclo(b.id, planDe('B editado'));

    const [primero, segundo] = await repo.listarCiclos(ANA);
    expect([primero.id, primero.plan.macroName]).toEqual([a.id, 'A']);
    expect(segundo.plan.macroName).toBe('B editado');
  });

  it('avisa si no se pudo actualizar el ciclo (no existe o no hay permiso)', async () => {
    await expect(repo.guardarPlanDelCiclo('inexistente', planDe('x'))).rejects.toThrow('No se pudo actualizar');
    await expect(repo.cambiarEstadoDelCiclo('inexistente', 'activo')).rejects.toThrow('No se pudo actualizar');
  });

  it('mostrar, ocultar y finalizar: cambia el estado y guarda cuándo se finalizó', async () => {
    const { id } = await repo.crearCiclo(ANA, planDe('Fuerza'));

    await repo.cambiarEstadoDelCiclo(id, 'activo');
    expect((await repo.listarCiclos(ANA))[0]).toMatchObject({ estado: 'activo', finalizadoEn: null });

    await repo.cambiarEstadoDelCiclo(id, 'finalizado');
    const [finalizado] = await repo.listarCiclos(ANA);
    expect(finalizado.estado).toBe('finalizado');
    expect(finalizado.finalizadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    await repo.cambiarEstadoDelCiclo(id, 'borrador');
    expect((await repo.listarCiclos(ANA))[0]).toMatchObject({ estado: 'borrador', finalizadoEn: null });
  });

  it('elimina un ciclo en borrador', async () => {
    const { id } = await repo.crearCiclo(ANA, planDe('Fuerza'));
    await repo.eliminarCiclo(id);
    expect(await repo.listarCiclos(ANA)).toEqual([]);
  });

  it('no elimina un ciclo activo ni uno finalizado (el alumno puede haber anotado en él)', async () => {
    const activo = await repo.crearCiclo(ANA, planDe('Activo'), 'activo');
    const finalizado = await repo.crearCiclo(ANA, planDe('Viejo'), 'finalizado');
    await expect(repo.eliminarCiclo(activo.id)).rejects.toThrow('borrador');
    await expect(repo.eliminarCiclo(finalizado.id)).rejects.toThrow('borrador');
    expect(await repo.listarCiclos(ANA)).toHaveLength(2);
  });

  it('exige el alumno y el ciclo', async () => {
    await expect(repo.listarCiclos('')).rejects.toThrow('alumnoId');
    await expect(repo.crearCiclo(null, planDe('x'))).rejects.toThrow('alumnoId');
    await expect(repo.guardarPlanDelCiclo('', planDe('x'))).rejects.toThrow('cicloId');
    await expect(repo.cargarRegistroDelCiclo('')).rejects.toThrow('cicloId');
    await expect(repo.guardarSesionesDelCiclo(null, {})).rejects.toThrow('cicloId');
  });

  it('si Supabase falla, lanza el error en lugar de perder el dato en silencio', async () => {
    cliente.fallarLaProxima('permission denied');
    await expect(repo.listarCiclos(ANA)).rejects.toThrow('permission denied');
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.crearCiclo(ANA, planDe('x'))).rejects.toThrow('sin conexión');
  });
});

describe('repo de Supabase: registro de series de un ciclo', () => {
  let ciclo;
  beforeEach(async () => {
    ciclo = await repo.crearCiclo(ANA, planDe('Fuerza'), 'activo');
  });

  it('sin nada anotado, el registro está vacío', async () => {
    expect(await repo.cargarRegistroDelCiclo(ciclo.id)).toEqual({});
  });

  it('lo que se guarda se vuelve a cargar igual', async () => {
    const registro = {
      e1: { 1: serieHecha, 2: { kg: '', reps: '', done: false, skipped: true } },
      e2: { 1: { kg: '20', reps: '12', done: false, skipped: false } },
    };
    await repo.guardarRegistroDelCiclo(ciclo.id, registro);
    expect(await repo.cargarRegistroDelCiclo(ciclo.id)).toEqual(registro);
  });

  it('cada serie queda en una fila con su ciclo, su alumno y su número', async () => {
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 3: serieHecha } });

    expect(filasDe('training_set_logs')).toMatchObject([
      { cycle_id: ciclo.id, student_id: ANA, exercise_id: 'e1', set_n: 3, kg: '80', reps: '8', done: true },
    ]);
  });

  it('solo manda las series que cambiaron, no todo el registro', async () => {
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha } });
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha, 2: serieHecha } });

    const [primero, segundo] = upserts('training_set_logs');
    expect(primero.filas).toHaveLength(1);
    expect(segundo.filas).toHaveLength(1);
    expect(segundo.filas[0].set_n).toBe(2);
  });

  it('si no cambió nada no manda nada', async () => {
    const registro = { e1: { 1: serieHecha } };
    await repo.guardarRegistroDelCiclo(ciclo.id, registro);
    await repo.guardarRegistroDelCiclo(ciclo.id, registro);
    expect(upserts('training_set_logs')).toHaveLength(1);
  });

  it('después de cargar, guardar lo mismo tampoco manda nada', async () => {
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha } });
    const otraSesion = crearRepoSupabase(cliente);
    const cargado = await otraSesion.cargarRegistroDelCiclo(ciclo.id);
    const antes = upserts('training_set_logs').length;

    await otraSesion.guardarRegistroDelCiclo(ciclo.id, cargado);
    expect(upserts('training_set_logs')).toHaveLength(antes);
  });

  it('una serie que ya no está en el registro se borra', async () => {
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha, 2: serieHecha } });
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha } });

    expect(filasDe('training_set_logs').map((f) => f.set_n)).toEqual([1]);
    expect(borrados('training_set_logs')).toHaveLength(1);
  });

  it('si falla el guardado, el próximo intento vuelve a mandar el cambio', async () => {
    const registro = { e1: { 1: serieHecha } };
    await repo.guardarRegistroDelCiclo(ciclo.id, registro); // ya conoce el ciclo y su alumno
    cliente.fallarLaProxima('sin conexión');
    const nuevo = { e1: { 1: serieHecha, 2: serieHecha } };
    await expect(repo.guardarRegistroDelCiclo(ciclo.id, nuevo)).rejects.toThrow('sin conexión');
    expect(filasDe('training_set_logs')).toHaveLength(1);

    await repo.guardarRegistroDelCiclo(ciclo.id, nuevo);
    expect(filasDe('training_set_logs')).toHaveLength(2);
  });

  it('un ciclo que no existe no tiene dónde guardar: avisa', async () => {
    await expect(repo.guardarRegistroDelCiclo('inexistente', { e1: { 1: serieHecha } })).rejects.toThrow('ciclo');
  });

  it('cada ciclo tiene su propio registro, aunque sea del mismo alumno', async () => {
    const otro = await repo.crearCiclo(ANA, planDe('Otro'), 'finalizado');
    await repo.guardarRegistroDelCiclo(ciclo.id, { e1: { 1: serieHecha } });

    expect(await repo.cargarRegistroDelCiclo(otro.id)).toEqual({});
    await repo.guardarRegistroDelCiclo(otro.id, { e1: { 1: { ...serieHecha, kg: '100' } } });
    expect((await repo.cargarRegistroDelCiclo(ciclo.id)).e1[1].kg).toBe('80');
    expect((await repo.cargarRegistroDelCiclo(otro.id)).e1[1].kg).toBe('100');
  });
});

describe('repo de Supabase: sesiones de un ciclo', () => {
  let ciclo;
  beforeEach(async () => {
    ciclo = await repo.crearCiclo(ANA, planDe('Fuerza'), 'activo');
  });

  it('sin días terminados las sesiones están vacías', async () => {
    expect(await repo.cargarSesionesDelCiclo(ciclo.id)).toEqual({});
  });

  it('lo que se guarda se vuelve a cargar igual, con su fecha y su estado', async () => {
    const sesiones = { d1: diaHecho, d2: { fecha: '2026-10-18', terminadaEn: TERMINADA, estado: 'omitida' } };
    await repo.guardarSesionesDelCiclo(ciclo.id, sesiones);
    expect(await repo.cargarSesionesDelCiclo(ciclo.id)).toEqual(sesiones);
  });

  it('cada día queda en una fila con su ciclo y su alumno', async () => {
    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho });
    expect(filasDe('training_sessions')).toMatchObject([
      {
        cycle_id: ciclo.id,
        student_id: ANA,
        day_id: 'd1',
        fecha: '2026-10-16',
        estado: 'hecha',
        terminada_en: TERMINADA,
      },
    ]);
  });

  it('reabrir un día (sacarlo de las sesiones) borra su fila; solo manda lo que cambió', async () => {
    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho });
    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho, d2: diaHecho });
    await repo.guardarSesionesDelCiclo(ciclo.id, { d2: diaHecho });

    expect(filasDe('training_sessions').map((f) => f.day_id)).toEqual(['d2']);
    expect(upserts('training_sessions').map((u) => u.filas.length)).toEqual([1, 1]);
  });

  it('si falla el guardado, el próximo intento vuelve a mandar el cambio', async () => {
    await repo.guardarSesionesDelCiclo(ciclo.id, {}); // ya conoce el ciclo y su alumno
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho })).rejects.toThrow('sin conexión');

    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho });
    expect(filasDe('training_sessions')).toHaveLength(1);
  });

  it('una sesión sin el momento exacto se guarda igual', async () => {
    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: { ...diaHecho, terminadaEn: '' } });
    expect(filasDe('training_sessions')[0].terminada_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('un ciclo que no existe no tiene dónde guardar: avisa', async () => {
    await expect(repo.guardarSesionesDelCiclo('inexistente', { d1: diaHecho })).rejects.toThrow('ciclo');
  });

  it('cada ciclo tiene sus propias sesiones', async () => {
    const otro = await repo.crearCiclo(ANA, planDe('Otro'), 'finalizado');
    await repo.guardarSesionesDelCiclo(ciclo.id, { d1: diaHecho });
    expect(await repo.cargarSesionesDelCiclo(otro.id)).toEqual({});
  });
});
