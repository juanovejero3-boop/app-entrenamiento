import { describe, expect, it } from 'vitest';
import { escapeAttr } from './dom.js';

describe('escapeAttr', () => {
  it('escapa los caracteres que rompen un atributo HTML', () => {
    expect(escapeAttr(`a&b"c'd<e>f`)).toBe('a&amp;b&quot;c&#39;d&lt;e&gt;f');
  });

  it('devuelve string vacío para null y undefined', () => {
    expect(escapeAttr(null)).toBe('');
    expect(escapeAttr(undefined)).toBe('');
  });

  it('convierte números a texto', () => {
    expect(escapeAttr(42)).toBe('42');
    expect(escapeAttr(0)).toBe('0');
  });

  it('el valor sobrevive intacto al pasar por un data-* y leerse con dataset', () => {
    const valores = [`o'brien@ejemplo.com`, `cl'ave"<x>`, `Sentadilla "pausa" de Juan's`, `a & b`];
    for (const valor of valores) {
      const div = document.createElement('div');
      div.innerHTML = `<button data-texto="${escapeAttr(valor)}"></button>`;
      expect(div.querySelector('button').dataset.texto).toBe(valor);
    }
  });

  it('un valor malicioso no puede cerrar el atributo e inyectar otro', () => {
    const div = document.createElement('div');
    div.innerHTML = `<button data-id="${escapeAttr('x" onclick="alert(1)')}"></button>`;
    const btn = div.querySelector('button');
    expect(btn.hasAttribute('onclick')).toBe(false);
    expect(btn.dataset.id).toBe('x" onclick="alert(1)');
  });
});
