import { describe, expect, it } from 'vitest';
import { diasTerminados, normalizarSesiones, reabrirSesion, sesionDe, terminarSesion } from './sesiones.js';

const TERMINADA = '2026-10-16T21:30:00.000Z';

describe('terminarSesion y sesionDe', () => {
  it('guarda la fecha y el momento en que se terminó el día', () => {
    const s = terminarSesion({}, 'dia-1', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    expect(sesionDe(s, 'dia-1')).toEqual({ fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' });
  });

  it('se puede marcar como no entrenado (estado omitida) y conserva la fecha', () => {
    const s = terminarSesion({}, 'dia-1', { fecha: '2026-10-15', terminadaEn: TERMINADA, estado: 'omitida' });
    expect(sesionDe(s, 'dia-1')).toEqual({ fecha: '2026-10-15', terminadaEn: TERMINADA, estado: 'omitida' });
  });

  it('rechaza un estado desconocido', () => {
    expect(() => terminarSesion({}, 'd', { fecha: '2026-10-15', terminadaEn: TERMINADA, estado: 'quizas' })).toThrow(
      RangeError,
    );
  });

  it('un día sin terminar no tiene sesión', () => {
    expect(sesionDe({}, 'dia-1')).toBeNull();
  });

  it('cada día tiene su propia sesión', () => {
    let s = terminarSesion({}, 'dia-1', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    s = terminarSesion(s, 'dia-2', { fecha: '2026-10-18', terminadaEn: TERMINADA });
    expect(sesionDe(s, 'dia-1').fecha).toBe('2026-10-16');
    expect(sesionDe(s, 'dia-2').fecha).toBe('2026-10-18');
  });

  it('terminar de nuevo un día reemplaza su fecha', () => {
    let s = terminarSesion({}, 'dia-1', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    s = terminarSesion(s, 'dia-1', { fecha: '2026-10-17', terminadaEn: TERMINADA });
    expect(sesionDe(s, 'dia-1').fecha).toBe('2026-10-17');
  });

  it.each([[''], ['16/10/2026'], ['2026-13-01'], ['2026-02-30'], [undefined], [null]])(
    'rechaza una fecha inválida (%j)',
    (fecha) => {
      expect(() => terminarSesion({}, 'dia-1', { fecha, terminadaEn: TERMINADA })).toThrow(RangeError);
    },
  );

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(() => terminarSesion({}, 'd', { fecha: '2028-02-29', terminadaEn: TERMINADA })).not.toThrow();
    expect(() => terminarSesion({}, 'd', { fecha: '2027-02-29', terminadaEn: TERMINADA })).toThrow(RangeError);
  });

  it('no modifica las sesiones originales', () => {
    const original = terminarSesion({}, 'dia-1', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    terminarSesion(original, 'dia-2', { fecha: '2026-10-17', terminadaEn: TERMINADA });
    reabrirSesion(original, 'dia-1');
    expect(Object.keys(original)).toEqual(['dia-1']);
  });
});

describe('reabrirSesion', () => {
  it('quita la sesión de ese día y deja las demás', () => {
    let s = terminarSesion({}, 'dia-1', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    s = terminarSesion(s, 'dia-2', { fecha: '2026-10-17', terminadaEn: TERMINADA });
    s = reabrirSesion(s, 'dia-1');
    expect(sesionDe(s, 'dia-1')).toBeNull();
    expect(sesionDe(s, 'dia-2')).not.toBeNull();
  });

  it('reabrir un día que no estaba terminado no cambia nada', () => {
    expect(reabrirSesion({}, 'dia-1')).toEqual({});
  });
});

describe('diasTerminados', () => {
  const ej = { exercises: [{ id: 'x' }] };
  const semana = {
    days: [
      { id: 'a', blocks: [ej] },
      { id: 'b', blocks: [ej] },
      { id: 'c', blocks: [] }, // sin ejercicios: no se puede terminar, no cuenta
      { id: 'd', blocks: [{ exercises: [] }] }, // bloque vacío: tampoco
    ],
  };

  it('cuenta los días terminados sobre los días que tienen ejercicios', () => {
    const s = terminarSesion({}, 'a', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    expect(diasTerminados(semana, s)).toEqual({ hechos: 1, total: 2 });
  });

  it('una sesión de un día que ya no existe no cuenta', () => {
    const s = terminarSesion({}, 'borrado', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    expect(diasTerminados(semana, s)).toEqual({ hechos: 0, total: 2 });
  });

  it('un día no entrenado no cuenta como hecho', () => {
    let s = terminarSesion({}, 'a', { fecha: '2026-10-16', terminadaEn: TERMINADA });
    s = terminarSesion(s, 'b', { fecha: '2026-10-17', terminadaEn: TERMINADA, estado: 'omitida' });
    expect(diasTerminados(semana, s)).toEqual({ hechos: 1, total: 2 });
  });

  it('una semana sin días no tiene nada para terminar', () => {
    expect(diasTerminados({ days: [] }, {})).toEqual({ hechos: 0, total: 0 });
  });
});

describe('normalizarSesiones', () => {
  it('conserva las sesiones válidas', () => {
    const s = { a: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' } };
    expect(normalizarSesiones(s)).toEqual(s);
  });

  it('conserva el estado omitida y toma como hecha lo guardado sin estado o con un estado raro', () => {
    const r = normalizarSesiones({
      a: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'omitida' },
      b: { fecha: '2026-10-16', terminadaEn: TERMINADA },
      c: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'zzz' },
    });
    expect([r.a.estado, r.b.estado, r.c.estado]).toEqual(['omitida', 'hecha', 'hecha']);
  });

  it('descarta las que no tienen una fecha válida o no son objetos', () => {
    expect(
      normalizarSesiones({
        ok: { fecha: '2026-10-16', terminadaEn: TERMINADA },
        mal: { fecha: 'ayer' },
        basura: 'x',
        nula: null,
      }),
    ).toEqual({ ok: { fecha: '2026-10-16', terminadaEn: TERMINADA, estado: 'hecha' } });
  });

  it('completa el momento si falta', () => {
    expect(normalizarSesiones({ a: { fecha: '2026-10-16' } })).toEqual({
      a: { fecha: '2026-10-16', terminadaEn: '', estado: 'hecha' },
    });
  });

  it.each([[null], ['texto'], [[]], [undefined]])('un dato que no es un objeto (%j) da vacío', (dato) => {
    expect(normalizarSesiones(dato)).toEqual({});
  });
});
