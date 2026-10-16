import { afterEach, describe, expect, it, vi } from 'vitest';
import { esFechaValida, hoyISO } from './fecha.js';

afterEach(() => vi.useRealTimers());

describe('esFechaValida', () => {
  it.each([['2026-10-16'], ['2028-02-29'], ['2026-12-31']])('acepta %s', (fecha) => {
    expect(esFechaValida(fecha)).toBe(true);
  });

  it.each([[''], ['16/10/2026'], ['2026-13-01'], ['2026-02-30'], ['2027-02-29'], [undefined], [null], [20261016]])(
    'rechaza %j',
    (fecha) => {
      expect(esFechaValida(fecha)).toBe(false);
    },
  );
});

describe('hoyISO', () => {
  it('devuelve la fecha local con ceros a la izquierda', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)); // 5 de enero, casi medianoche (hora local)
    expect(hoyISO()).toBe('2026-01-05');
  });

  it('cambia al pasar la medianoche local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    expect(hoyISO()).toBe('2026-12-31');
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1));
    expect(hoyISO()).toBe('2027-01-01');
  });
});
