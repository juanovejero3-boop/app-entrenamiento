import { describe, expect, it } from 'vitest';
import { docEntrenamiento } from './entrenamiento.js';
import { ALUMNO, planCompleto, textoDe } from './test-utils.js';

const generar = (plan = planCompleto()) => textoDe(docEntrenamiento(plan, ALUMNO, { fecha: '2026-10-15' }));

describe('PDF del entrenamiento', () => {
  it('tiene el encabezado y los datos del alumno y del ciclo', () => {
    const texto = generar();
    expect(texto).toContain('RIME');
    expect(texto).toContain('Franco Soria');
    expect(texto).toContain('Hipertrofia base');
    expect(texto).toContain('19/10/2026');
  });

  it('incluye el mapa del macrociclo: semanas, fechas, fases, volumen y series', () => {
    const texto = generar();
    expect(texto).toContain('19/10 - 25/10');
    expect(texto).toContain('26/10 - 01/11');
    expect(texto).toContain('Acumulación');
    expect(texto).toContain('Pecho 12s, Espalda 14s');
    expect(texto).toMatch(/\b11\b/); // 4 + 4 + 3 series en la semana 1
  });

  it('cada semana con sus días y cada ejercicio con series, reps, intensidad y descanso', () => {
    const texto = generar();
    for (const esperado of [
      'Semana 1',
      'Lunes - Torso',
      'Jueves - Pierna',
      'Press banca',
      'Remo con barra',
      '8-10',
      'RIR 2',
      'RPE 8',
      '2 min',
      'Fuerza Máxima',
    ]) {
      // los títulos de día y de bloque van en mayúsculas (estilo del PDF)
      expect(texto.toLowerCase()).toContain(esperado.toLowerCase());
    }
  });

  it('marca las superseries con A1, A2 y muestra técnica y notas', () => {
    const texto = generar();
    expect(texto).toContain('A1');
    expect(texto).toContain('A2');
    expect(texto).toContain('Rest-Pause');
    expect(texto).toContain('Pausa abajo');
  });

  it('avisa en los días y semanas que todavía no tienen ejercicios', () => {
    const texto = generar();
    expect(texto).toContain('Sin ejercicios cargados'); // Jueves - Pierna
    expect(texto).toContain('Sin días cargados'); // Semana 2
  });

  it('no incluye los lineamientos del ciclo (van en su propio PDF)', () => {
    const texto = generar();
    expect(texto).not.toContain('Dormir 8 horas.');
    expect(texto).not.toContain('Retracción escapular en empujes');
  });

  it('lleva título y autor en los metadatos (lo que muestra el visor de PDF)', () => {
    const doc = docEntrenamiento(planCompleto(), ALUMNO, { fecha: '2026-10-15' });
    expect(doc.info).toEqual({ title: 'Entrenamiento · Franco Soria', author: 'Prime Physique' });
  });
});
