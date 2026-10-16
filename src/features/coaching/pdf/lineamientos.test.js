import { describe, expect, it } from 'vitest';
import { docLineamientos } from './lineamientos.js';
import { ALUMNO, planCompleto, textoDe } from './test-utils.js';

const generar = (plan = planCompleto()) => textoDe(docLineamientos(plan, ALUMNO, { fecha: '2026-10-15' }));

describe('PDF de lineamientos', () => {
  it('tiene el encabezado de la marca, la fecha y los datos del alumno y del ciclo', () => {
    const texto = generar();
    expect(texto).toContain('RIME');
    expect(texto).toContain('2026-10-15');
    expect(texto).toContain('Franco Soria');
    expect(texto).toContain('Hipertrofia base');
    expect(texto).toContain('19/10/2026');
    expect(texto).toContain('01/11/2026'); // fin de la semana 2
    expect(texto).toContain('2 semanas');
  });

  it('incluye objetivo, prioridades con su progresión, foco, evaluación y lineamientos', () => {
    const texto = generar();
    for (const esperado of [
      'Ganar masa muscular en tren superior',
      'Press banca',
      '+2,5 kg cuando complete 10 reps',
      'Dorsal ancho',
      'Sumar una serie cada 2 semanas',
      'Retracción escapular en empujes',
      'Test de 5RM en la semana 4',
      'Dormir 8 horas.',
    ]) {
      expect(texto).toContain(esperado);
    }
  });

  it('no incluye nada del entrenamiento (ni días ni ejercicios)', () => {
    const texto = generar();
    expect(texto).not.toContain('Lunes - Torso');
    expect(texto).not.toContain('Remo con barra');
    expect(texto).not.toContain('8-10');
  });

  it('omite las secciones vacías', () => {
    const plan = planCompleto();
    plan.report = { objective: 'Solo objetivo', priorities: [], focus: '', evaluation: '', guidelines: '' };
    const texto = generar(plan);
    expect(texto).toContain('Solo objetivo');
    expect(texto).not.toMatch(/PRIORIDADES/i);
    expect(texto).not.toMatch(/FOCO BIOMEC/i);
    expect(texto).not.toMatch(/EVALUACI/i);
    expect(texto).not.toMatch(/LINEAMIENTOS GENERALES/i);
  });

  it('sin fecha de inicio no inventa fechas', () => {
    const plan = { ...planCompleto(), startDate: '' };
    expect(generar(plan)).toContain('Sin fecha de inicio');
  });

  it('lleva título y autor en los metadatos (lo que muestra el visor de PDF)', () => {
    const doc = docLineamientos(planCompleto(), ALUMNO, { fecha: '2026-10-15' });
    expect(doc.info).toEqual({ title: 'Lineamientos · Franco Soria', author: 'Prime Physique' });
  });
});
