import { describe, expect, it } from 'vitest';
import { huecosDeJornada, valoresIniciales } from './agendas.js';

const SABADO = '2026-11-21';
const VIERNES = '2026-11-20';
const seguimiento = {
  agendaId: 'seguimiento',
  fecha: SABADO,
  desde: '08:30',
  hasta: '19:30',
  duracionMin: 30,
  descansoMin: 30,
};

describe('valores iniciales', () => {
  it('el seguimiento propone media hora de llamada y media de descanso, de 8:30 a 19:30', () => {
    expect(valoresIniciales().seguimiento).toMatchObject({
      duracionMin: 30,
      descansoMin: 30,
      desde: '08:30',
      hasta: '19:30',
    });
  });

  it('la primera llamada propone 20 minutos, sin descanso, de 14 a 20', () => {
    expect(valoresIniciales().primera).toMatchObject({
      duracionMin: 20,
      descansoMin: 0,
      desde: '14:00',
      hasta: '20:00',
    });
  });
});

describe('huecos de una jornada generada', () => {
  it('ofrece un inicio cada duración, mientras la llamada entre en el rango', () => {
    const horas = huecosDeJornada(seguimiento, [], [seguimiento]);
    expect(horas[0]).toBe('08:30');
    expect(horas).toContain('11:00');
    expect(horas).toContain('11:30');
    expect(horas).toContain('12:00');
    expect(horas).toContain('12:30');
    expect(horas.at(-1)).toBe('19:00');
    expect(horas).not.toContain('19:30');
  });

  it('un turno de las 11:30 ocupa hasta las 12:30 y saca los huecos que se le pisan', () => {
    const horas = huecosDeJornada(
      seguimiento,
      [{ agendaId: 'seguimiento', fecha: SABADO, hora: '11:30' }],
      [seguimiento],
    );
    expect(horas).not.toContain('11:00');
    expect(horas).not.toContain('11:30');
    expect(horas).not.toContain('12:00');
    expect(horas).toContain('10:30');
    expect(horas).toContain('12:30');
  });

  it('un turno de otra agenda del mismo día también bloquea', () => {
    const primera = {
      agendaId: 'primera',
      fecha: SABADO,
      desde: '14:00',
      hasta: '20:00',
      duracionMin: 20,
      descansoMin: 0,
    };
    const horas = huecosDeJornada(
      seguimiento,
      [{ agendaId: 'primera', fecha: SABADO, hora: '11:30' }],
      [seguimiento, primera],
    );
    expect(horas).not.toContain('11:30');
    expect(horas).toContain('12:00');
  });

  it('un turno de otro día no bloquea', () => {
    const horas = huecosDeJornada(
      seguimiento,
      [{ agendaId: 'seguimiento', fecha: VIERNES, hora: '11:30' }],
      [seguimiento],
    );
    expect(horas).toContain('11:30');
  });

  it('un viernes generado ofrece horarios igual que un sábado', () => {
    const viernes = { ...seguimiento, fecha: VIERNES };
    expect(huecosDeJornada(viernes, [], [viernes])[0]).toBe('08:30');
  });
});
