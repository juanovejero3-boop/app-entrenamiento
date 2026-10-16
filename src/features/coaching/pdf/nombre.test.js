import { describe, expect, it } from 'vitest';
import { nombreArchivo } from './nombre.js';

describe('nombreArchivo', () => {
  it('arma tipo-alumno-fecha.pdf sin acentos ni espacios', () => {
    expect(nombreArchivo('lineamientos', { name: 'Ana Pérez Núñez' }, '2026-10-15')).toBe(
      'lineamientos-ana-perez-nunez-2026-10-15.pdf',
    );
  });

  it('si el alumno no tiene nombre usa el email', () => {
    expect(nombreArchivo('entrenamiento', { email: 'franco.soria@ejemplo.com' }, '2026-10-15')).toBe(
      'entrenamiento-franco-soria-ejemplo-com-2026-10-15.pdf',
    );
  });

  it('si no hay nombre ni email usa "alumno"', () => {
    expect(nombreArchivo('entrenamiento', {}, '2026-10-15')).toBe('entrenamiento-alumno-2026-10-15.pdf');
  });
});
