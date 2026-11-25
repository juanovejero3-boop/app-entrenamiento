import { afterEach, describe, expect, it, vi } from 'vitest';
import { combinarTurnos, crearRepoLlamadas } from './llamadasRepo.js';
import { avisarCalendario, conectarLlamadas, pedidoCalendario } from './llamadasSync.js';

describe('repo de llamadas', () => {
  it('el turno propio pisa el hueco ocupado', () => {
    const ocupados = [{ agendaId: 'seguimiento', fecha: '2026-12-20', hora: '09:00', nombre: '' }];
    const propios = [{ agendaId: 'seguimiento', fecha: '2026-12-20', hora: '09:00', nombre: 'Ana', telefono: '111' }];
    expect(combinarTurnos(ocupados, propios)).toEqual([propios[0]]);
  });

  it('anotar manda el turno sin el id de la persona', async () => {
    const insertados = [];
    const cliente = {
      from() {
        return {
          insert(fila) {
            insertados.push(fila);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
    await crearRepoLlamadas(cliente).anotar({
      agendaId: 'seguimiento',
      fecha: '2026-12-20',
      hora: '09:00',
      duracionMin: 30,
      descansoMin: 30,
      nombre: 'Ana',
      email: 'ana@test.com',
      telefono: '111',
      notas: '',
    });
    expect(insertados[0]).toMatchObject({
      agenda: 'seguimiento',
      hora: '09:00',
      duracion_min: 30,
      email: 'ana@test.com',
      telefono: '111',
    });
    expect(insertados[0].user_id).toBeUndefined();
  });

  it('el pedido de calendario invita al alumno y al coach', () => {
    const pedido = pedidoCalendario(
      {
        agendaId: 'primera',
        fecha: '2026-12-20',
        hora: '14:00',
        nombre: 'Ana',
        email: 'ana@test.com',
        telefono: '111',
        notas: '',
      },
      { duracionMin: 20 },
      'coach@test.com',
    );
    expect(pedido.clientEmail).toBe('ana@test.com');
    expect(pedido.coachEmail).toBe('coach@test.com');
    expect(pedido.attendees).toEqual(['ana@test.com', 'coach@test.com']);
    expect(pedido.date).toBe('2026-12-20');
    expect(pedido.time).toBe('14:00');
    expect(pedido.service).toBe('Evaluación Inicial & Onboarding');
  });

  it('avisar manda ese pedido al script del coach', async () => {
    const fetchMock = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', fetchMock);
    conectarLlamadas({
      leerScript: async () => ({ url: 'https://script.google.com/macros/s/abc/exec', coachEmail: 'coach@test.com' }),
    });

    const ok = await avisarCalendario(
      { agendaId: 'seguimiento', fecha: '2026-12-20', hora: '09:00', nombre: 'Ana', email: 'ana@test.com', telefono: '111', notas: '' },
      { duracionMin: 30 },
    );

    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.attendees).toEqual(['ana@test.com', 'coach@test.com']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://script.google.com/macros/s/abc/exec');
  });
});

afterEach(() => {
  conectarLlamadas(null);
  vi.unstubAllGlobals();
});
