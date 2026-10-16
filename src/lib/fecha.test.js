import { afterEach, describe, expect, it, vi } from 'vitest';
import { hoyISO } from './fecha.js';

afterEach(() => vi.useRealTimers());

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
