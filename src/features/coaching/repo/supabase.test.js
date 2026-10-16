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

describe('repo de Supabase: plan de entrenamiento (el ciclo activo del alumno)', () => {
  it('sin ciclo no hay plan', async () => {
    expect(await repo.cargarPlanEntrenamiento(ANA)).toBeNull();
  });

  it('lo que se guarda se vuelve a cargar, como ciclo activo del alumno', async () => {
    await repo.guardarPlanEntrenamiento(ANA, planDe('Fuerza'));

    expect((await repo.cargarPlanEntrenamiento(ANA)).macroName).toBe('Fuerza');
    expect(filasDe('training_cycles')).toMatchObject([{ student_id: ANA, status: 'activo' }]);
  });

  it('guardar de nuevo actualiza el mismo ciclo en vez de crear otro', async () => {
    await repo.guardarPlanEntrenamiento(ANA, planDe('Fuerza'));
    await repo.guardarPlanEntrenamiento(ANA, planDe('Hipertrofia'));

    expect(filasDe('training_cycles')).toHaveLength(1);
    expect((await repo.cargarPlanEntrenamiento(ANA)).macroName).toBe('Hipertrofia');
  });

  it('cada alumno tiene su plan', async () => {
    await repo.guardarPlanEntrenamiento(ANA, planDe('De Ana'));
    await repo.guardarPlanEntrenamiento(LUIS, planDe('De Luis'));

    expect((await repo.cargarPlanEntrenamiento(ANA)).macroName).toBe('De Ana');
    expect((await repo.cargarPlanEntrenamiento(LUIS)).macroName).toBe('De Luis');
  });

  it('solo toma el ciclo activo: ignora finalizados y borradores', async () => {
    filasDe('training_cycles').push(
      { id: 'c1', student_id: ANA, status: 'finalizado', plan: planDe('Viejo') },
      { id: 'c2', student_id: ANA, status: 'borrador', plan: planDe('Borrador') },
    );
    expect(await repo.cargarPlanEntrenamiento(ANA)).toBeNull();

    await repo.guardarPlanEntrenamiento(ANA, planDe('Nuevo'));
    expect((await repo.cargarPlanEntrenamiento(ANA)).macroName).toBe('Nuevo');
    expect(filasDe('training_cycles')).toHaveLength(3); // no pisó los otros
  });

  it('un plan guardado con campos de más o faltantes se normaliza al cargarlo', async () => {
    filasDe('training_cycles').push({ id: 'c1', student_id: ANA, status: 'activo', plan: { macroName: 'Viejo' } });
    const plan = await repo.cargarPlanEntrenamiento(ANA);
    expect(plan.macroName).toBe('Viejo');
    expect(plan.weeks).toEqual([]);
  });

  it('exige el alumno', async () => {
    await expect(repo.cargarPlanEntrenamiento('')).rejects.toThrow('alumnoId');
    await expect(repo.guardarPlanEntrenamiento(null, planDe('x'))).rejects.toThrow('alumnoId');
  });

  it('si Supabase falla, lanza el error en lugar de perder el dato en silencio', async () => {
    cliente.fallarLaProxima('permission denied');
    await expect(repo.cargarPlanEntrenamiento(ANA)).rejects.toThrow('permission denied');
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.guardarPlanEntrenamiento(ANA, planDe('x'))).rejects.toThrow('sin conexión');
  });
});

describe('repo de Supabase: registro de series', () => {
  beforeEach(() => repo.guardarPlanEntrenamiento(ANA, planDe('Fuerza')));

  it('sin nada anotado, el registro está vacío (también sin plan)', async () => {
    expect(await repo.cargarRegistro(ANA)).toEqual({});
    expect(await repo.cargarRegistro(LUIS)).toEqual({});
  });

  it('lo que se guarda se vuelve a cargar igual', async () => {
    const registro = {
      e1: {
        1: { kg: '80', reps: '8', done: true, skipped: false },
        2: { kg: '', reps: '', done: false, skipped: true },
      },
      e2: { 1: { kg: '20', reps: '12', done: false, skipped: false } },
    };
    await repo.guardarRegistro(ANA, registro);
    expect(await repo.cargarRegistro(ANA)).toEqual(registro);
  });

  it('cada serie queda en una fila con su ciclo, su alumno y su número', async () => {
    await repo.guardarRegistro(ANA, { e1: { 3: { kg: '80', reps: '8', done: true, skipped: false } } });

    expect(filasDe('training_set_logs')).toMatchObject([
      { student_id: ANA, exercise_id: 'e1', set_n: 3, kg: '80', reps: '8', done: true, skipped: false },
    ]);
    expect(filasDe('training_set_logs')[0].cycle_id).toBe(filasDe('training_cycles')[0].id);
  });

  it('solo manda las series que cambiaron, no todo el registro', async () => {
    const hecha = { kg: '80', reps: '8', done: true, skipped: false };
    await repo.guardarRegistro(ANA, { e1: { 1: hecha } });
    await repo.guardarRegistro(ANA, { e1: { 1: hecha, 2: hecha } });

    const [primero, segundo] = upserts('training_set_logs');
    expect(primero.filas).toHaveLength(1);
    expect(segundo.filas).toHaveLength(1);
    expect(segundo.filas[0].set_n).toBe(2);
  });

  it('si no cambió nada no manda nada', async () => {
    const registro = { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } };
    await repo.guardarRegistro(ANA, registro);
    await repo.guardarRegistro(ANA, registro);
    expect(upserts('training_set_logs')).toHaveLength(1);
  });

  it('después de cargar, guardar lo mismo tampoco manda nada', async () => {
    const registro = { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } };
    await repo.guardarRegistro(ANA, registro);
    const otraSesion = crearRepoSupabase(cliente);
    const cargado = await otraSesion.cargarRegistro(ANA);
    const antes = upserts('training_set_logs').length;

    await otraSesion.guardarRegistro(ANA, cargado);
    expect(upserts('training_set_logs')).toHaveLength(antes);
  });

  it('una serie que ya no está en el registro se borra', async () => {
    const serie = { kg: '', reps: '', done: true, skipped: false };
    await repo.guardarRegistro(ANA, { e1: { 1: serie, 2: serie } });
    await repo.guardarRegistro(ANA, { e1: { 1: serie } });

    expect(filasDe('training_set_logs').map((f) => f.set_n)).toEqual([1]);
    expect(borrados('training_set_logs')).toHaveLength(1);
  });

  it('si falla el guardado, el próximo intento vuelve a mandar el cambio', async () => {
    const registro = { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } };
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.guardarRegistro(ANA, registro)).rejects.toThrow('sin conexión');
    expect(filasDe('training_set_logs')).toHaveLength(0);

    await repo.guardarRegistro(ANA, registro);
    expect(filasDe('training_set_logs')).toHaveLength(1);
  });

  it('sin plan activo no hay dónde guardar: avisa', async () => {
    await expect(
      repo.guardarRegistro(LUIS, { e1: { 1: { kg: '', reps: '', done: true, skipped: false } } }),
    ).rejects.toThrow('plan');
  });

  it('el registro de un alumno no se mezcla con el de otro', async () => {
    await repo.guardarPlanEntrenamiento(LUIS, planDe('De Luis'));
    await repo.guardarRegistro(ANA, { e1: { 1: { kg: '80', reps: '', done: true, skipped: false } } });
    expect(await repo.cargarRegistro(LUIS)).toEqual({});
  });
});

describe('repo de Supabase: sesiones', () => {
  beforeEach(() => repo.guardarPlanEntrenamiento(ANA, planDe('Fuerza')));

  it('sin días terminados las sesiones están vacías (también sin plan)', async () => {
    expect(await repo.cargarSesiones(ANA)).toEqual({});
    expect(await repo.cargarSesiones(LUIS)).toEqual({});
  });

  it('lo que se guarda se vuelve a cargar igual, con su fecha y su estado', async () => {
    const sesiones = {
      d1: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' },
      d2: { fecha: '2026-10-18', terminadaEn: TERMINADA, estado: 'omitida' },
    };
    await repo.guardarSesiones(ANA, sesiones);
    expect(await repo.cargarSesiones(ANA)).toEqual(sesiones);
  });

  it('cada día queda en una fila con su ciclo y su alumno', async () => {
    await repo.guardarSesiones(ANA, { d1: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' } });
    expect(filasDe('training_sessions')).toMatchObject([
      { student_id: ANA, day_id: 'd1', fecha: '2026-10-16', estado: 'hecha', terminada_en: TERMINADA },
    ]);
    expect(filasDe('training_sessions')[0].cycle_id).toBe(filasDe('training_cycles')[0].id);
  });

  it('reabrir un día (sacarlo de las sesiones) borra su fila; solo manda lo que cambió', async () => {
    const hecha = { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' };
    await repo.guardarSesiones(ANA, { d1: hecha });
    await repo.guardarSesiones(ANA, { d1: hecha, d2: hecha });
    await repo.guardarSesiones(ANA, { d2: hecha });

    expect(filasDe('training_sessions').map((f) => f.day_id)).toEqual(['d2']);
    expect(upserts('training_sessions').map((u) => u.filas.length)).toEqual([1, 1]);
  });

  it('si falla el guardado, el próximo intento vuelve a mandar el cambio', async () => {
    const sesiones = { d1: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' } };
    cliente.fallarLaProxima('sin conexión');
    await expect(repo.guardarSesiones(ANA, sesiones)).rejects.toThrow('sin conexión');

    await repo.guardarSesiones(ANA, sesiones);
    expect(filasDe('training_sessions')).toHaveLength(1);
  });

  it('una sesión sin el momento exacto se guarda igual', async () => {
    await repo.guardarSesiones(ANA, { d1: { fecha: '2026-10-16', terminadaEn: '', estado: 'hecha' } });
    expect(filasDe('training_sessions')[0].terminada_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sin plan activo avisa', async () => {
    await expect(
      repo.guardarSesiones(LUIS, { d1: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' } }),
    ).rejects.toThrow('plan');
  });
});
