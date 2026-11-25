import { describe, expect, it } from 'vitest';
import { estadoDelDia, fechasDelRango, grupalesVisibles, ofertaDisponible, publicarGrupal, reservar } from './reservaLocal.js';

const SABADO = '2026-11-21';
const VIERNES = '2026-11-20';
const jornada = {
  agendaId: 'seguimiento',
  fecha: SABADO,
  desde: '08:30',
  hasta: '19:30',
  duracionMin: 30,
  descansoMin: 30,
};
const ana = {
  agendaId: 'seguimiento',
  fecha: SABADO,
  hora: '11:30',
  nombre: 'Ana',
  email: 'ana@test.com',
};

describe('reserva local', () => {
  it('un día sin generar no ofrece horarios', () => {
    expect(estadoDelDia('seguimiento', SABADO, [], []).aviso).toMatch(/no tiene horarios/i);
  });

  it('reservar las 11:30 las saca y deja las 12:30', () => {
    const antes = estadoDelDia('seguimiento', SABADO, [jornada], []);
    expect(antes.horas).toContain('11:30');
    expect(antes.horas).toContain('12:00');

    const resultado = reservar([jornada], [], ana);

    expect(resultado.ok).toBe(true);
    const despues = estadoDelDia('seguimiento', SABADO, [jornada], resultado.turnos);
    expect(despues.horas).not.toContain('11:30');
    expect(despues.horas).not.toContain('12:00');
    expect(despues.horas).toContain('12:30');
  });

  it('la misma persona no reserva otro turno el mismo día', () => {
    const primero = reservar([jornada], [], ana);
    const segundo = reservar([jornada], primero.turnos, { ...ana, hora: '12:30' });

    expect(segundo).toEqual({ ok: false, motivo: 'ya-tiene-turno' });
  });

  it('otro día sí puede reservar', () => {
    const viernes = { ...jornada, fecha: VIERNES };
    const primero = reservar([jornada], [], ana);
    const segundo = reservar([jornada, viernes], primero.turnos, { ...ana, fecha: VIERNES, hora: '08:30' });

    expect(segundo.ok).toBe(true);
  });

  it('un horario que ya no está libre no se reserva', () => {
    const primero = reservar([jornada], [], ana);
    const otro = reservar([jornada], primero.turnos, { ...ana, email: 'otro@test.com', hora: '12:00' });

    expect(otro).toEqual({ ok: false, motivo: 'ocupado' });
  });
});

describe('rango y oferta visible', () => {
  it('el rango incluye el primer día y el último', () => {
    expect(fechasDelRango('2026-11-23', '2026-11-25')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
    expect(fechasDelRango('2026-11-25', '2026-11-23')).toEqual([]);
  });

  it('quien reserva ve los días futuros y, en el de hoy, solo los horarios que no pasaron', () => {
    const hoy = { ...jornada, agendaId: 'primera', fecha: '2026-11-23', desde: '14:00', hasta: '18:00', duracionMin: 20, descansoMin: 0 };
    const manana = { ...hoy, fecha: '2026-11-24' };
    const ayer = { ...hoy, fecha: '2026-11-22' };
    const ahora = new Date(2026, 10, 23, 15, 0);

    const dias = ofertaDisponible('primera', [ayer, hoy, manana], [], ahora);

    expect(dias.map((d) => d.fecha)).toEqual(['2026-11-23', '2026-11-24']);
    expect(dias[0].horas).not.toContain('14:00');
    expect(dias[0].horas).toContain('15:00');
    expect(dias[1].horas).toContain('14:00');
  });

  it('la llamada grupal se oculta una hora después de su hora', () => {
    const llamada = { id: 'g1', fecha: '2026-11-23', hora: '18:00', enlace: 'https://meet.google.com/abc' };
    const publicada = publicarGrupal([], llamada);
    expect(publicada.ok).toBe(true);

    const durante = new Date(2026, 10, 23, 18, 59);
    const alCumplir = new Date(2026, 10, 23, 19, 0);
    expect(grupalesVisibles(publicada.grupales, durante)).toHaveLength(1);
    expect(grupalesVisibles(publicada.grupales, alCumplir)).toHaveLength(0);
  });

  it('sin día, hora o enlace no se publica', () => {
    expect(publicarGrupal([], { fecha: '', hora: '18:00', enlace: 'https://meet.google.com/abc' }).ok).toBe(false);
  });
});
