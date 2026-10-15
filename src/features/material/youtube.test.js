import { describe, expect, it } from 'vitest';
import { materialEsYouTube } from './youtube.js';

describe('materialEsYouTube', () => {
  it.each([
    ['https://www.youtube.com/watch?v=lnMehhkv56Y', 'lnMehhkv56Y'],
    ['https://youtube.com/watch?v=lnMehhkv56Y', 'lnMehhkv56Y'],
    ['https://m.youtube.com/watch?v=lnMehhkv56Y', 'lnMehhkv56Y'],
    ['https://youtu.be/_mDaAiF_AG0', '_mDaAiF_AG0'],
    ['https://youtu.be/SJ5-BlZ-kQY?si=abc123', 'SJ5-BlZ-kQY'],
    ['https://www.youtube.com/watch?v=lnMehhkv56Y&t=30s', 'lnMehhkv56Y'],
  ])('extrae el id de %s', (link, id) => {
    expect(materialEsYouTube(link)).toBe(id);
  });

  it.each([['https://drive.google.com/file/d/123/view'], ['https://ejemplo.com/guia.pdf'], [''], [null], [undefined]])(
    'devuelve null si no es un video de YouTube: %s',
    (link) => {
      expect(materialEsYouTube(link)).toBeNull();
    },
  );

  // Comportamiento actual documentado: estos formatos de YouTube no se reconocen
  // y se abren en una pestaña nueva en lugar del modal.
  it.each([['https://www.youtube.com/shorts/lnMehhkv56Y'], ['https://www.youtube.com/embed/lnMehhkv56Y']])(
    'hoy no reconoce %s',
    (link) => {
      expect(materialEsYouTube(link)).toBeNull();
    },
  );
});
