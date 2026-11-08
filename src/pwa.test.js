// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const raiz = (ruta) => new URL(`../${ruta}`, import.meta.url);
const html = readFileSync(raiz('index.html'), 'utf8');
const manifest = JSON.parse(readFileSync(raiz('public/manifest.webmanifest'), 'utf8'));

/** Ancho y alto de un PNG, leídos de su cabecera. */
function medidasPng(ruta) {
  const bytes = readFileSync(raiz(ruta));
  return { ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}

describe('manifest de la app (instalable en el celular)', () => {
  it('lleva el nombre de la marca y abre como app, sin la barra del navegador', () => {
    expect(manifest.name).toBe('Prime Physique');
    expect(manifest.short_name).toBe('Prime Physique');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('es');
  });

  it('abre en la raíz y usa los colores de la app', () => {
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.background_color).toBe('#0a0a0a');
    expect(manifest.theme_color).toBe('#0a0a0a');
  });

  it('declara íconos de 192 y 512 px, y uno «maskable» para los Android que recortan el ícono', () => {
    const por = (tamano, proposito) =>
      manifest.icons.find((i) => i.sizes === tamano && (i.purpose ?? 'any') === proposito);
    expect(por('192x192', 'any')).toBeDefined();
    expect(por('512x512', 'any')).toBeDefined();
    expect(por('512x512', 'maskable')).toBeDefined();
  });

  it('cada ícono existe y mide lo que dice', () => {
    for (const icono of manifest.icons) {
      const ruta = `public${icono.src}`;
      expect(existsSync(raiz(ruta)), icono.src).toBe(true);
      const [ancho, alto] = icono.sizes.split('x').map(Number);
      expect(medidasPng(ruta)).toEqual({ ancho, alto });
    }
  });
});

describe('index.html enlaza la marca', () => {
  it('apunta al manifest', () => {
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  });

  it('define el color de la barra del celular igual al del manifest', () => {
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}"`);
  });

  it('tiene favicon e ícono para el iPhone, y existen', () => {
    const favicon = /<link\s+rel="icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
    const apple = /<link\s+rel="apple-touch-icon"\s+href="([^"]+)"/.exec(html)?.[1];
    expect(favicon).toBeDefined();
    expect(apple).toBeDefined();
    expect(existsSync(raiz(`public${favicon}`))).toBe(true);
    expect(existsSync(raiz(`public${apple}`))).toBe(true);
  });

  it('en iPhone se abre como app a pantalla completa con el nombre de la marca', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Prime Physique"');
  });
});
