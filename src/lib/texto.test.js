import { describe, expect, it } from 'vitest';
import { plano, sinEmojis, valoresSinEmojis } from './texto.js';

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

describe('sinEmojis', () => {
  it('saca emojis y deja el resto del texto', () => {
    expect(sinEmojis('Sentadilla 💪 con barra')).toBe('Sentadilla  con barra');
    expect(sinEmojis('Tomar agua 💧🔥')).toBe('Tomar agua ');
    expect(sinEmojis('RIR 2')).toBe('RIR 2');
  });

  it('saca secuencias unidas, tono de piel y el selector de color', () => {
    expect(sinEmojis('Hola 👨‍👩‍👧')).toBe('Hola ');
    expect(sinEmojis('Ok 👍🏽')).toBe('Ok ');
    expect(sinEmojis('❤️')).toBe('');
  });

  it('recorre un documento y no toca las funciones', () => {
    const pie = () => 'Página 1';
    const limpio = valoresSinEmojis({ content: [{ text: 'Nota ✅' }], footer: pie, n: 2 });
    expect(limpio.content[0].text).toBe('Nota ');
    expect(limpio.footer).toBe(pie);
    expect(limpio.n).toBe(2);
  });
});
