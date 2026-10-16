// @vitest-environment node
// Genera los PDF de verdad con pdfmake (versión Node) para verificar que la definición del
// documento es válida: tablas con la misma cantidad de columnas en cada fila, estilos existentes, etc.
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { docEntrenamiento } from './entrenamiento.js';
import { docLineamientos } from './lineamientos.js';
import { ALUMNO, planCompleto } from './test-utils.js';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
const fuentes = 'node_modules/pdfmake/build/fonts/Roboto/';
pdfmake.setFonts({
  Roboto: {
    normal: fuentes + 'Roboto-Regular.ttf',
    bold: fuentes + 'Roboto-Medium.ttf',
    italics: fuentes + 'Roboto-Italic.ttf',
    bolditalics: fuentes + 'Roboto-MediumItalic.ttf',
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => ruta.replace(/\\/g, '/').includes(fuentes));

const generarPdf = async (documento) => Buffer.from(await pdfmake.createPdf(documento).getBuffer());

describe('los PDF se generan sin errores', () => {
  it.each([
    ['lineamientos', docLineamientos],
    ['entrenamiento', docEntrenamiento],
  ])('PDF de %s con un plan completo', async (_, armar) => {
    const pdf = await generarPdf(armar(planCompleto(), ALUMNO, { fecha: '2026-10-15' }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it.each([
    ['lineamientos', docLineamientos],
    ['entrenamiento', docEntrenamiento],
  ])('PDF de %s con un plan vacío', async (_, armar) => {
    const vacio = {
      macroName: 'Nuevo Macrociclo',
      startDate: '',
      report: { objective: '', priorities: [], focus: '', evaluation: '', guidelines: '' },
      weeks: [],
    };
    const pdf = await generarPdf(armar(vacio, { id: 'x', email: 'x@ejemplo.com' }, { fecha: '2026-10-15' }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
