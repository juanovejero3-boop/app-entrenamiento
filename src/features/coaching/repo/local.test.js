import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearRepoLocal } from './local.js';

const plan = (nombre) => ({
  macroName: nombre,
  startDate: '2026-10-19',
  report: { objective: '', priorities: [], focus: 'Rodilla', evaluation: '', guidelines: '' },
  weeks: [{ id: 'w1', name: 'Semana 1', objective: 'Hipertrofia', targetVolume: '', days: [] }],
});

afterEach(() => {
  localStorage.clear();
});

describe('repositorio local: plan de entrenamiento', () => {
  it('lo que se guarda para un alumno se vuelve a cargar igual', async () => {
    const repo = crearRepoLocal();
    await repo.guardarPlanEntrenamiento('alumno-1', plan('Fuerza base'));

    expect(await repo.cargarPlanEntrenamiento('alumno-1')).toEqual(plan('Fuerza base'));
  });

  it('un alumno sin plan devuelve null', async () => {
    expect(await crearRepoLocal().cargarPlanEntrenamiento('sin-plan')).toBeNull();
  });

  it('cada alumno tiene su propio plan', async () => {
    const repo = crearRepoLocal();
    await repo.guardarPlanEntrenamiento('alumno-1', plan('Plan de Ana'));
    await repo.guardarPlanEntrenamiento('alumno-2', plan('Plan de Beto'));

    expect((await repo.cargarPlanEntrenamiento('alumno-1')).macroName).toBe('Plan de Ana');
    expect((await repo.cargarPlanEntrenamiento('alumno-2')).macroName).toBe('Plan de Beto');
  });

  it('guardar de nuevo reemplaza el plan anterior', async () => {
    const repo = crearRepoLocal();
    await repo.guardarPlanEntrenamiento('alumno-1', plan('Versión 1'));
    await repo.guardarPlanEntrenamiento('alumno-1', plan('Versión 2'));

    expect((await repo.cargarPlanEntrenamiento('alumno-1')).macroName).toBe('Versión 2');
  });

  it('persiste en localStorage bajo una clave versionada por alumno', async () => {
    await crearRepoLocal().guardarPlanEntrenamiento('alumno-1', plan('X'));

    expect(JSON.parse(localStorage.getItem('pp:v1:entrenamiento:alumno-1')).macroName).toBe('X');
  });

  it('eliminar borra solo el plan de ese alumno', async () => {
    const repo = crearRepoLocal();
    await repo.guardarPlanEntrenamiento('alumno-1', plan('A'));
    await repo.guardarPlanEntrenamiento('alumno-2', plan('B'));

    await repo.eliminarPlanEntrenamiento('alumno-1');

    expect(await repo.cargarPlanEntrenamiento('alumno-1')).toBeNull();
    expect(await repo.cargarPlanEntrenamiento('alumno-2')).not.toBeNull();
  });

  it('al cargar normaliza lo guardado (ej. un plan exportado del prototipo)', async () => {
    localStorage.setItem(
      'pp:v1:entrenamiento:alumno-1',
      JSON.stringify({ weeks: [{ id: 17, days: [{ blocks: [{ exercises: [{ name: 'Remo', intensity: '2' }] }] }] }] }),
    );

    const cargado = await crearRepoLocal().cargarPlanEntrenamiento('alumno-1');

    expect(cargado.macroName).toBe('Nuevo Macrociclo');
    expect(cargado.weeks[0].id).toBe('17');
    expect(cargado.weeks[0].days[0].blocks[0].exercises[0]).toMatchObject({ name: 'Remo', intensityValue: '2' });
  });

  it('si lo guardado está corrupto devuelve null, avisa por consola y no borra el dato', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('pp:v1:entrenamiento:alumno-1', '{esto no es json');

    expect(await crearRepoLocal().cargarPlanEntrenamiento('alumno-1')).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('alumno-1'), expect.anything());
    expect(localStorage.getItem('pp:v1:entrenamiento:alumno-1')).toBe('{esto no es json');
  });

  it('si el navegador no tiene espacio, guardar falla con un error (no se pierde en silencio)', async () => {
    const lleno = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
      removeItem: () => {},
    };

    await expect(crearRepoLocal(lleno).guardarPlanEntrenamiento('alumno-1', plan('X'))).rejects.toThrow(
      'Quota exceeded',
    );
  });

  it.each([[''], [null], [undefined]])('exige un id de alumno (%j)', async (alumnoId) => {
    const repo = crearRepoLocal();
    await expect(repo.guardarPlanEntrenamiento(alumnoId, plan('X'))).rejects.toThrow('alumnoId');
    await expect(repo.cargarPlanEntrenamiento(alumnoId)).rejects.toThrow('alumnoId');
  });
});

describe('repositorio local: registro del alumno', () => {
  const registro = { e1: { 1: { kg: '80', reps: '8', done: true, skipped: false } } };

  it('lo que se guarda se vuelve a cargar igual', async () => {
    const repo = crearRepoLocal();
    await repo.guardarRegistro('alumno-1', registro);
    expect(await repo.cargarRegistro('alumno-1')).toEqual(registro);
  });

  it('un alumno sin registro devuelve uno vacío', async () => {
    expect(await crearRepoLocal().cargarRegistro('sin-registro')).toEqual({});
  });

  it('cada alumno tiene su propio registro, aparte de su plan', async () => {
    const repo = crearRepoLocal();
    await repo.guardarRegistro('alumno-1', registro);
    await repo.guardarRegistro('alumno-2', { e9: { 1: { kg: '50', reps: '10', done: false } } });
    await repo.guardarPlanEntrenamiento('alumno-1', plan('Plan de Ana'));

    expect(Object.keys(await repo.cargarRegistro('alumno-1'))).toEqual(['e1']);
    expect(Object.keys(await repo.cargarRegistro('alumno-2'))).toEqual(['e9']);
    expect((await repo.cargarPlanEntrenamiento('alumno-1')).macroName).toBe('Plan de Ana');
  });

  it('persiste bajo una clave versionada por alumno', async () => {
    await crearRepoLocal().guardarRegistro('alumno-1', registro);
    expect(JSON.parse(localStorage.getItem('pp:v1:registro:alumno-1'))).toEqual(registro);
  });

  it('al cargar normaliza lo guardado', async () => {
    localStorage.setItem('pp:v1:registro:alumno-1', JSON.stringify({ e1: { 1: { kg: 80 } }, e2: 'basura' }));
    expect(await crearRepoLocal().cargarRegistro('alumno-1')).toEqual({
      e1: { 1: { kg: '80', reps: '', done: false, skipped: false } },
    });
  });

  it('si lo guardado está corrupto devuelve vacío, avisa por consola y no lo borra', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('pp:v1:registro:alumno-1', '{no es json');

    expect(await crearRepoLocal().cargarRegistro('alumno-1')).toEqual({});
    expect(error).toHaveBeenCalledWith(expect.stringContaining('alumno-1'), expect.anything());
    expect(localStorage.getItem('pp:v1:registro:alumno-1')).toBe('{no es json');
  });

  it('exige un id de alumno', async () => {
    const repo = crearRepoLocal();
    await expect(repo.cargarRegistro('')).rejects.toThrow('alumnoId');
    await expect(repo.guardarRegistro(null, registro)).rejects.toThrow('alumnoId');
  });
});
