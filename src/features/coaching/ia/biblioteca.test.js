import { describe, expect, it } from 'vitest';
import exercises from '../../../data/exercises.json';
import { bibliotecaDelCoach, crearIndice, normalizarNombre } from './biblioteca.js';

const catalogo = [
  { n: 'Sentadilla con barra alta - Cuádriceps, glúteo' },
  { n: 'Press de banca con barra - Pectoral, tríceps, deltoides anterior' },
  { n: 'Remo con mancuerna - Dorsal' },
  { n: 'Curl nórdico reverso - Cuadriceps' },
  { n: 'Encogimientos de hombros con mancuernas - Trapecio' },
  { n: 'Dead bug - Abdomen, psoas ilíaco' },
  { n: 'Cable Front Squat' }, // inglés, sin músculo
  { n: 'Air Squat - OPEX Exercise Library' }, // guion pero no es un músculo
  { n: 'Cybex Eagle Row - 2 arm - Lats' }, // músculo en inglés
  { n: 'Planche lean push up -Fullbody' },
];

describe('normalizarNombre', () => {
  it.each([
    ['Sentadilla con Barra', 'sentadilla con barra'],
    ['  Press   de  banca ', 'press de banca'],
    ['Curl nórdico - Isquios', 'curl nordico - isquios'],
    ['PRESS DE BANCA', 'press de banca'],
  ])('%j -> %j', (entrada, esperado) => {
    expect(normalizarNombre(entrada)).toBe(esperado);
  });
});

describe('bibliotecaDelCoach', () => {
  it('toma los ejercicios en español que terminan con el músculo trabajado', () => {
    expect(bibliotecaDelCoach(catalogo)).toEqual([
      'Sentadilla con barra alta - Cuádriceps, glúteo',
      'Press de banca con barra - Pectoral, tríceps, deltoides anterior',
      'Remo con mancuerna - Dorsal',
      'Curl nórdico reverso - Cuadriceps',
      'Encogimientos de hombros con mancuernas - Trapecio',
      'Dead bug - Abdomen, psoas ilíaco',
    ]);
  });

  it('en la base real queda la biblioteca del coach (~1000) y no los ejercicios genéricos en inglés', () => {
    const biblioteca = bibliotecaDelCoach(exercises);
    expect(biblioteca.length).toBeGreaterThan(900);
    expect(biblioteca.length).toBeLessThan(1400);
    expect(biblioteca).toContain('Encogimientos de hombros con barra agarre ancho - Trapecio');
    expect(biblioteca).not.toContain('Cable Front Squat');
    expect(biblioteca.every((nombre) => / - /.test(nombre))).toBe(true);
  });
});

describe('crearIndice', () => {
  const indice = crearIndice(bibliotecaDelCoach(catalogo));

  it('encuentra el nombre oficial aunque varíen mayúsculas, acentos y espacios', () => {
    expect(indice.get(normalizarNombre('remo con mancuerna - dorsal'))).toBe('Remo con mancuerna - Dorsal');
    expect(indice.get(normalizarNombre('  CURL NORDICO REVERSO - cuadriceps '))).toBe(
      'Curl nórdico reverso - Cuadriceps',
    );
  });

  it('un nombre que no está no se encuentra', () => {
    expect(indice.get(normalizarNombre('Sentadilla búlgara'))).toBeUndefined();
  });
});
