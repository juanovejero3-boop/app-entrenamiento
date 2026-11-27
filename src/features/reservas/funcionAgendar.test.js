// @vitest-environment node
// Prueba la función `agendar-llamada` de Supabase (corre en Deno): se importa su archivo con un `Deno` y un cliente
// de Supabase de mentira, y se le pasan la base y el fetch como dependencias falsas.
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: vi.fn(() => ({})) }));

let agendarTurno;
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (clave) => ({ SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'x' })[clave] },
    serve: vi.fn(),
  });
  ({ agendarTurno } = await import('../../../supabase/functions/agendar-llamada/index.ts'));
});

const ID = '00000000-0000-0000-0000-0000000000b1';
const COACH = '00000000-0000-0000-0000-00000000000c';
const URL_SCRIPT = 'https://script.google.com/macros/s/abc/exec';
const AHORA = Date.UTC(2026, 10, 26, 15, 0);

const turno = (cambios = {}) => ({
  id: ID,
  agenda: 'seguimiento',
  fecha: '2026-12-20',
  hora: '09:00:00',
  duracion_min: 30,
  nombre: 'Ana Pérez',
  email: 'ana@test.com',
  telefono: '+54 9 11 5555',
  notas: 'Rodilla',
  coach_id: COACH,
  calendario_estado: 'pendiente',
  calendario_intentos: 0,
  created_at: new Date(AHORA - 60_000).toISOString(),
  ...cambios,
});

const respuesta = (estado, texto) => ({ ok: estado >= 200 && estado < 300, status: estado, text: async () => texto });
const exito = () => respuesta(200, JSON.stringify({ status: 'success' }));

/** Base y red de mentira: lo que guarda la función queda en `guardados`, y lo que manda al script en `pedidos`. */
function dependencias({
  fila = turno(),
  coach = { script_url: URL_SCRIPT, coach_email: 'coach@test.com' },
  red = exito(),
  unico = null,
} = {}) {
  const guardados = [];
  const pedidos = [];
  return {
    guardados,
    pedidos,
    deps: {
      leerTurno: vi.fn(async () => fila),
      leerCoach: vi.fn(async (id) => (id === COACH ? coach : null)),
      coachUnico: vi.fn(async () => unico),
      guardarResultado: vi.fn(async (id, resultado) => guardados.push({ id, ...resultado })),
      fetchFn: vi.fn(async (url, opciones) => {
        pedidos.push({ url, opciones, cuerpo: JSON.parse(opciones.body) });
        if (red instanceof Error) throw red;
        return red;
      }),
      ahora: () => AHORA,
    },
  };
}

describe('agendar-llamada: lo que le manda al script', () => {
  it('manda al script del coach los mismos datos que su formulario, con la hora sin segundos y la duración del turno', async () => {
    const { deps, pedidos } = dependencias();
    const resultado = await agendarTurno({ id: ID, admin: false }, deps);
    expect(resultado).toMatchObject({ status: 200, cuerpo: { estado: 'agendado' } });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].url).toBe(URL_SCRIPT);
    expect(pedidos[0].opciones.method).toBe('POST');
    expect(pedidos[0].cuerpo).toMatchObject({
      service: 'Seguimiento Semanal de Progreso',
      date: '2026-12-20',
      time: '09:00',
      clientName: 'Ana Pérez',
      clientEmail: 'ana@test.com',
      clientPhone: '+54 9 11 5555',
      notes: 'Rodilla',
      coachEmail: 'coach@test.com',
      attendees: ['ana@test.com', 'coach@test.com'],
      duracionMin: 30,
    });
  });

  it('la primera llamada va con el nombre de servicio de la evaluación inicial', async () => {
    const { deps, pedidos } = dependencias({ fila: turno({ agenda: 'primera', duracion_min: 20 }) });
    await agendarTurno({ id: ID, admin: false }, deps);
    expect(pedidos[0].cuerpo).toMatchObject({ service: 'Evaluación Inicial & Onboarding', duracionMin: 20 });
  });

  it('si el turno no tiene coach y hay uno solo con script, usa ese', async () => {
    const { deps, pedidos } = dependencias({
      fila: turno({ coach_id: null }),
      unico: { script_url: URL_SCRIPT, coach_email: 'coach@test.com' },
    });
    const resultado = await agendarTurno({ id: ID, admin: false }, deps);
    expect(resultado.cuerpo.estado).toBe('agendado');
    expect(pedidos[0].url).toBe(URL_SCRIPT);
  });
});

describe('agendar-llamada: lee lo que contesta el script', () => {
  it('si el script dice que salió bien, el turno queda agendado', async () => {
    const { deps, guardados } = dependencias();
    await agendarTurno({ id: ID, admin: false }, deps);
    expect(guardados).toEqual([
      { id: ID, estado: 'agendado', error: '', intentos: 1, en: new Date(AHORA).toISOString() },
    ]);
  });

  it('si el script contesta con un error, guarda el motivo exacto que dio Google', async () => {
    const { deps, guardados } = dependencias({
      red: respuesta(200, JSON.stringify({ status: 'error', message: 'Invalid argument: startTime' })),
    });
    const resultado = await agendarTurno({ id: ID, admin: false }, deps);
    expect(resultado.cuerpo).toEqual({ estado: 'error', error: 'Invalid argument: startTime' });
    expect(guardados[0]).toMatchObject({ estado: 'error', error: 'Invalid argument: startTime', intentos: 1 });
  });

  it('si en vez de JSON vuelve una página (script sin publicar o sin acceso), lo explica', async () => {
    const { deps, guardados } = dependencias({ red: respuesta(200, '<!DOCTYPE html><html>Iniciar sesión</html>') });
    await agendarTurno({ id: ID, admin: false }, deps);
    expect(guardados[0].estado).toBe('error');
    expect(guardados[0].error).toMatch(/acceso.*cualquier/i);
  });

  it('si el script responde con un error HTTP, lo guarda con el código', async () => {
    const { deps, guardados } = dependencias({ red: respuesta(404, 'Not found') });
    await agendarTurno({ id: ID, admin: false }, deps);
    expect(guardados[0]).toMatchObject({ estado: 'error' });
    expect(guardados[0].error).toContain('404');
  });

  it('si no se puede llegar al script, queda en error y se puede reintentar', async () => {
    const { deps, guardados } = dependencias({ red: new Error('getaddrinfo ENOTFOUND') });
    const resultado = await agendarTurno({ id: ID, admin: false }, deps);
    expect(resultado.cuerpo.estado).toBe('error');
    expect(guardados[0].error).toMatch(/no se pudo llegar al script/i);
  });

  it('sin script conectado, el turno queda marcado y no se llama a nadie', async () => {
    const { deps, guardados, pedidos } = dependencias({ coach: null, unico: null });
    const resultado = await agendarTurno({ id: ID, admin: false }, deps);
    expect(resultado.cuerpo.estado).toBe('sin_script');
    expect(pedidos).toHaveLength(0);
    expect(guardados[0]).toMatchObject({ estado: 'sin_script' });
  });
});

describe('agendar-llamada: quién puede pedirlo', () => {
  it('rechaza un id que no es un uuid y un turno que no existe', async () => {
    expect((await agendarTurno({ id: 'x', admin: true }, dependencias().deps)).status).toBe(400);
    const { deps } = dependencias({ fila: null });
    expect((await agendarTurno({ id: ID, admin: true }, deps)).status).toBe(404);
  });

  it('quien reservó solo lo puede pedir una vez, recién reservado (así nadie lo usa para mandar mails)', async () => {
    const yaIntentado = dependencias({ fila: turno({ calendario_estado: 'error', calendario_intentos: 1 }) });
    expect((await agendarTurno({ id: ID, admin: false }, yaIntentado.deps)).status).toBe(409);
    expect(yaIntentado.pedidos).toHaveLength(0);

    const viejo = dependencias({ fila: turno({ created_at: new Date(AHORA - 60 * 60_000).toISOString() }) });
    expect((await agendarTurno({ id: ID, admin: false }, viejo.deps)).status).toBe(403);
    expect(viejo.pedidos).toHaveLength(0);
  });

  it('el coach puede reintentar uno que falló, y cuenta el intento', async () => {
    const { deps, guardados } = dependencias({ fila: turno({ calendario_estado: 'error', calendario_intentos: 2 }) });
    const resultado = await agendarTurno({ id: ID, admin: true }, deps);
    expect(resultado.cuerpo.estado).toBe('agendado');
    expect(guardados[0].intentos).toBe(3);
  });

  it('uno que ya quedó agendado no se vuelve a mandar (no se duplica el evento)', async () => {
    const { deps, pedidos } = dependencias({ fila: turno({ calendario_estado: 'agendado' }) });
    const resultado = await agendarTurno({ id: ID, admin: true }, deps);
    expect(resultado).toMatchObject({ status: 200, cuerpo: { estado: 'agendado' } });
    expect(pedidos).toHaveLength(0);
  });
});
