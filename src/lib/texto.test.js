import { describe, expect, it } from 'vitest';
import { plano } from './texto.js';

describe('plano (para comparar y buscar texto)', () => {
  it('pasa a minúsculas y quita las tildes', () => {
    expect(plano('PECHUGA de Pollo Ñandú')).toBe('pechuga de pollo nandu');
    expect(plano('Árbol')).toBe('arbol');
  });

  it('recorta los espacios de los extremos', () => {
    expect(plano('  hola  ')).toBe('hola');
  });

  it('con null, undefined o números no se rompe', () => {
    expect(plano(null)).toBe('');
    expect(plano(undefined)).toBe('');
    expect(plano(12)).toBe('12');
  });
});
