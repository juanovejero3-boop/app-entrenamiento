import { describe, expect, it } from 'vitest';
import { conUnidadDeTiempo, esTiempo, sinUnidadDeTiempo } from './tiempo.js';

describe('esTiempo: las reps que indicó el coach son segundos', () => {
  it.each(['20"', '30s', '45 s', '30 seg', '30 segs', '45 segundos', "20''", '20”', '20″', '30-40"', '30-40s', '1 s'])(
    'reconoce %s',
    (reps) => expect(esTiempo(reps)).toBe(true),
  );

  it.each(['8-10', '12', 'Al fallo', '', undefined, null, 's', '"', '3 series', '10 reps'])(
    'no confunde %s con tiempo',
    (reps) => expect(esTiempo(reps)).toBe(false),
  );
});

describe('conUnidadDeTiempo: lo que se guarda cuando el alumno escribe solo el número', () => {
  it('agrega las comillas, que es como lo anota el coach', () => {
    expect(conUnidadDeTiempo('20')).toBe('20"');
    expect(conUnidadDeTiempo(' 45 ')).toBe('45"');
    expect(conUnidadDeTiempo('7,5')).toBe('7,5"');
  });

  it('lo que ya trae unidad o no es un número se guarda como está', () => {
    expect(conUnidadDeTiempo('20"')).toBe('20"');
    expect(conUnidadDeTiempo('20 s')).toBe('20 s');
    expect(conUnidadDeTiempo('')).toBe('');
    expect(conUnidadDeTiempo('hasta que aguanté')).toBe('hasta que aguanté');
  });
});

describe('sinUnidadDeTiempo: lo que se ve dentro del campo (la unidad se muestra aparte)', () => {
  it('quita la unidad del final', () => {
    expect(sinUnidadDeTiempo('20"')).toBe('20');
    expect(sinUnidadDeTiempo('30 s')).toBe('30');
    expect(sinUnidadDeTiempo('45 seg')).toBe('45');
    expect(sinUnidadDeTiempo("20''")).toBe('20');
  });

  it('lo que no tiene unidad queda igual', () => {
    expect(sinUnidadDeTiempo('20')).toBe('20');
    expect(sinUnidadDeTiempo('')).toBe('');
    expect(sinUnidadDeTiempo('hasta que aguanté')).toBe('hasta que aguanté');
  });
});
