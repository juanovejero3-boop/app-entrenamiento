import { afterEach, describe, expect, it, vi } from 'vitest';
import { combinarTurnos, crearRepoLlamadas } from './llamadasRepo.js';
import { state } from '../../state.js';
import { agendarCalendario, conectarLlamadas, guardarJornadasRemotas, guardarScriptRemoto } from './llamadasSync.js';

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

  it('anotar manda el id que generó la app (para poder pedir que se agende sin leer la tabla)', async () => {
    const insertados = [];
    const cliente = {
      from: () => ({ insert: (fila) => (insertados.push(fila), Promise.resolve({ data: null, error: null })) }),
    };
    await crearRepoLlamadas(cliente).anotar({
      id: 'b1',
      agendaId: 'primera',
      fecha: '2026-12-20',
      hora: '14:00',
      duracionMin: 20,
      descansoMin: 0,
      nombre: 'Ana',
      email: 'ana@test.com',
    });
    expect(insertados[0].id).toBe('b1');
  });

  it('agendar le pide a la función del servidor que agende ese turno y devuelve cómo quedó', async () => {
    const invoke = vi.fn(async () => ({ data: { estado: 'agendado', error: '' }, error: null }));
    const resultado = await crearRepoLlamadas({ functions: { invoke } }).agendar('b1');
    expect(invoke).toHaveBeenCalledWith('agendar-llamada', { body: { id: 'b1' } });
    expect(resultado).toEqual({ estado: 'agendado', error: '' });
  });

  it('si la función contesta con error, llega su mensaje', async () => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'Solo el coach puede volver a agendar este turno' }) },
      },
    }));
    await expect(crearRepoLlamadas({ functions: { invoke } }).agendar('b1')).rejects.toThrow(
      'Solo el coach puede volver a agendar',
    );
  });

  it('el coach ve en cada turno si quedó en el calendario y por qué falló', async () => {
    const fila = {
      id: 'b1',
      agenda: 'seguimiento',
      fecha: '2026-12-20',
      hora: '09:00:00',
      duracion_min: 30,
      descanso_min: 30,
      nombre: 'Ana',
      email: 'ana@test.com',
      telefono: '',
      notas: '',
      calendario_estado: 'error',
      calendario_error: 'Invalid argument',
    };
    const cliente = {
      from: (tabla) => ({
        select: () => Promise.resolve({ data: tabla === 'call_bookings' ? [fila] : [], error: null }),
      }),
    };
    const { turnos } = await crearRepoLlamadas(cliente).leer('admin');
    expect(turnos[0]).toMatchObject({
      id: 'b1',
      hora: '09:00',
      calendarioEstado: 'error',
      calendarioError: 'Invalid argument',
    });
  });

  it('el script se guarda a nombre del coach que lo carga', async () => {
    const upserts = [];
    conectarLlamadas(
      crearRepoLlamadas({
        from: (tabla) => ({
          upsert: (fila) => (upserts.push({ tabla, fila }), Promise.resolve({ data: null, error: null })),
        }),
      }),
    );
    state.currentUser = { id: 'coach-1', email: 'coach@test.com' };
    await guardarScriptRemoto(' https://script.google.com/macros/s/abc/exec ', 'coach@test.com');
    expect(upserts).toEqual([
      {
        tabla: 'call_coaches',
        fila: {
          coach_id: 'coach-1',
          script_url: 'https://script.google.com/macros/s/abc/exec',
          coach_email: 'coach@test.com',
          updated_at: expect.any(String), // el último cargado pasa a ser el que comparten todos
        },
      },
    ]);
  });

  it('un coach sin script propio usa el que cargó otro coach (el compartido); el propio tiene prioridad', async () => {
    const filas = [
      { coach_id: 'head', script_url: 'https://script.google.com/macros/s/head/exec', coach_email: 'head@test.com' },
      { coach_id: 'vacio', script_url: '', coach_email: '' },
    ];
    const cliente = {
      from: () => ({ select: () => ({ order: () => Promise.resolve({ data: filas, error: null }) }) }),
    };
    expect(await crearRepoLlamadas(cliente).leerScript('otro')).toEqual({
      url: 'https://script.google.com/macros/s/head/exec',
      coachEmail: 'head@test.com',
      propio: false,
    });
    expect((await crearRepoLlamadas(cliente).leerScript('head')).propio).toBe(true);
  });

  it('los días que abre el coach quedan a su nombre', async () => {
    const upserts = [];
    const cliente = {
      from: () => ({
        upsert: (filas) => (upserts.push(...filas), Promise.resolve({ data: null, error: null })),
        select: () => Promise.resolve({ data: [], error: null }),
      }),
    };
    conectarLlamadas(crearRepoLlamadas(cliente));
    state.currentUser = { id: 'coach-1' };
    await guardarJornadasRemotas([
      {
        agendaId: 'seguimiento',
        fecha: '2026-12-20',
        desde: '09:00',
        hasta: '12:00',
        duracionMin: 30,
        descansoMin: 30,
      },
    ]);
    expect(upserts[0]).toMatchObject({ agenda: 'seguimiento', fecha: '2026-12-20', coach_id: 'coach-1' });
  });

  it('agendarCalendario devuelve el estado, o el error como estado si no se pudo', async () => {
    conectarLlamadas({ agendar: async () => ({ estado: 'agendado', error: '' }) });
    expect(await agendarCalendario({ id: 'b1' })).toEqual({ estado: 'agendado', error: '' });
    conectarLlamadas({
      agendar: async () => {
        throw new Error('sin conexión');
      },
    });
    expect(await agendarCalendario({ id: 'b1' })).toEqual({ estado: 'error', error: 'sin conexión' });
    conectarLlamadas(null);
    expect(await agendarCalendario({ id: 'b1' })).toBeNull(); // sin repo (tests): no hay a quién pedirle
  });
});

afterEach(() => {
  conectarLlamadas(null);
  state.currentUser = null;
  vi.unstubAllGlobals();
});
