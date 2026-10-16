import { describe, expect, it } from 'vitest';
import { nombreDelAlumno } from './alumno.js';
import { nombreArchivo } from './nombre.js';
import { docEntrenamiento } from './entrenamiento.js';
import { docLineamientos } from './lineamientos.js';
import { planCompleto, textoDe } from './test-utils.js';

describe('nombreDelAlumno', () => {
  it('usa el nombre si lo tiene', () => {
    expect(nombreDelAlumno({ name: 'Franco Soria', email: 'franco@ejemplo.com' })).toBe('Franco Soria');
  });

  it('si no tiene nombre usa el correo', () => {
    expect(nombreDelAlumno({ email: 'franco@ejemplo.com' })).toBe('franco@ejemplo.com');
    expect(nombreDelAlumno({ name: null, email: 'franco@ejemplo.com' })).toBe('franco@ejemplo.com');
    expect(nombreDelAlumno({ name: '', email: 'franco@ejemplo.com' })).toBe('franco@ejemplo.com');
  });

  it('un nombre con solo espacios cuenta como vacío', () => {
    expect(nombreDelAlumno({ name: '   ', email: 'franco@ejemplo.com' })).toBe('franco@ejemplo.com');
  });

  it('recorta los espacios sobrantes', () => {
    expect(nombreDelAlumno({ name: '  Franco Soria ' })).toBe('Franco Soria');
    expect(nombreDelAlumno({ email: ' franco@ejemplo.com ' })).toBe('franco@ejemplo.com');
  });

  it('sin nombre ni correo usa "Alumno"', () => {
    expect(nombreDelAlumno({})).toBe('Alumno');
  });
});

describe('el alumno en los PDF: nombre, o el correo si no tiene', () => {
  const sinNombre = { id: 'u2', email: 'franco.soria@ejemplo.com' };
  const nombreEnBlanco = { id: 'u3', name: '  ', email: 'ana@ejemplo.com' };
  const opciones = { fecha: '2026-10-15' };

  it.each([
    ['lineamientos', docLineamientos],
    ['entrenamiento', docEntrenamiento],
  ])('el contenido del PDF de %s muestra el correo si no hay nombre', (_, armar) => {
    expect(textoDe(armar(planCompleto(), sinNombre, opciones))).toContain('franco.soria@ejemplo.com');
    expect(textoDe(armar(planCompleto(), nombreEnBlanco, opciones))).toContain('ana@ejemplo.com');
  });

  it.each([
    ['lineamientos', docLineamientos, 'Lineamientos'],
    ['entrenamiento', docEntrenamiento, 'Entrenamiento'],
  ])('el título del PDF de %s lleva el correo si no hay nombre', (_, armar, prefijo) => {
    expect(armar(planCompleto(), sinNombre, opciones).info.title).toBe(`${prefijo} · franco.soria@ejemplo.com`);
    expect(armar(planCompleto(), nombreEnBlanco, opciones).info.title).toBe(`${prefijo} · ana@ejemplo.com`);
  });

  it('el nombre del archivo lleva el correo si no hay nombre (también con el nombre en blanco)', () => {
    expect(nombreArchivo('lineamientos', sinNombre, '2026-10-15')).toBe(
      'lineamientos-franco-soria-ejemplo-com-2026-10-15.pdf',
    );
    expect(nombreArchivo('lineamientos', nombreEnBlanco, '2026-10-15')).toBe(
      'lineamientos-ana-ejemplo-com-2026-10-15.pdf',
    );
  });
});
