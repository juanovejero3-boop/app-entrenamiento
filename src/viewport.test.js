// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';

describe('viewport del celular', () => {
  it('con el teclado abierto la página se achica a lo que se ve (así los encabezados fijos y el menú no quedan tapados)', () => {
    expect(viewport).toContain('interactive-widget=resizes-content');
  });

  it('sigue sin hacer zoom', () => {
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('user-scalable=no');
  });
});
