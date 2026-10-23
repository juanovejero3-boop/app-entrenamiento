// @vitest-environment node
// Prueba la lógica de reintentos de la función `ai-plan` de Supabase (corre en Deno): se importa su archivo con
// un `Deno` y un cliente de Supabase de mentira, y se le pasa un fetch y una espera falsos.
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: vi.fn(() => ({})) }));

let consultarGemini;
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (clave) => ({ SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'x' })[clave] },
    serve: vi.fn(),
  });
  ({ consultarGemini } = await import('../../../../supabase/functions/ai-plan/index.ts'));
});

const respuesta = (estado, cuerpo) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo });
const bien = (text = '[]') => respuesta(200, { candidates: [{ content: { parts: [{ text }] } }] });
const error = (estado) => respuesta(estado, { error: { code: estado, message: 'x', status: 'X' } });

/** Dependencias falsas: respuestas en orden, esperas registradas y un reloj que avanza `paso` ms por consulta. */
function dependencias(respuestas, { paso = 0, listado = null } = {}) {
  let reloj = 0;
  const esperas = [];
  const pedidos = [];
  const fetchFn = vi.fn(async (url, opciones) => {
    pedidos.push({ url, opciones });
    // el listado de modelos disponibles es otra consulta: no gasta una de las respuestas en cola
    if (/\/models\?/.test(url)) {
      if (listado instanceof Error) throw listado;
      return respuesta(200, { models: listado ?? [] });
    }
    reloj += paso;
    const siguiente = respuestas.shift();
    if (siguiente instanceof Error) throw siguiente;
    return siguiente ?? error(503);
  });
  return {
    deps: {
      fetchFn,
      esperar: async (ms) => {
        esperas.push(ms);
      },
      ahora: () => reloj,
      modelos: ['principal', 'liviano'],
    },
    esperas,
    pedidos,
    fetchFn,
  };
}

const consultar = (deps) => consultarGemini('pedido', 'clave', deps);

describe('función ai-plan: reintentos con Gemini', () => {
  it('si responde bien a la primera, devuelve el texto y el modelo usado, sin esperar', async () => {
    const { deps, esperas, fetchFn } = dependencias([bien('[1]')]);
    expect(await consultar(deps)).toEqual({ ok: true, text: '[1]', modelo: 'principal' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('manda la clave en un encabezado (no en la URL) y pide JSON', async () => {
    const { deps, pedidos } = dependencias([bien()]);
    await consultar(deps);
    expect(pedidos[0].url).toContain('/models/principal:generateContent');
    expect(pedidos[0].url).not.toContain('clave');
    expect(pedidos[0].opciones.headers['x-goog-api-key']).toBe('clave');
    expect(JSON.parse(pedidos[0].opciones.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('si Gemini está saturado (503) espera y vuelve a intentar con el mismo modelo', async () => {
    const { deps, esperas, fetchFn } = dependencias([error(503), bien('[2]')]);
    expect(await consultar(deps)).toMatchObject({ ok: true, text: '[2]', modelo: 'principal' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([1500]);
  });

  it('la espera crece entre intentos y, si el modelo principal no se recupera, prueba con el liviano', async () => {
    const { deps, esperas } = dependencias([error(503), error(503), error(503), bien('[3]')]);
    expect(await consultar(deps)).toMatchObject({ ok: true, text: '[3]', modelo: 'liviano' });
    expect(esperas).toEqual([1500, 3000]); // 3 intentos con el principal; el liviano arranca sin esperar
  });

  it('si todo está saturado, avisa con un mensaje claro y estado 503 después de todos los intentos', async () => {
    const { deps, fetchFn } = dependencias([]);
    const resultado = await consultar(deps);
    expect(resultado).toMatchObject({ ok: false, estado: 503 });
    expect(resultado.mensaje).toContain('mucha demanda');
    expect(fetchFn).toHaveBeenCalledTimes(5); // 3 con el principal + 2 con el liviano
  });

  it('cuando falla, el resultado detalla qué respondió cada intento (para saber qué pasó sin mirar los registros)', async () => {
    const { deps } = dependencias([error(503), error(503), error(503), error(429), error(500)]);
    const resultado = await consultar(deps);
    expect(resultado.detalle).toBe('principal 503, principal 503, principal 503, liviano 429, liviano 500');
  });

  it('un corte de red o un timeout figuran como tales en el detalle', async () => {
    const abortado = new DOMException('cancelado', 'AbortError');
    const { deps } = dependencias([new Error('red caída'), abortado, error(503), error(503), error(503)]);
    expect((await consultar(deps)).detalle).toBe(
      'principal red, principal timeout, principal 503, liviano 503, liviano 503',
    );
  });

  it('si salió bien después de reintentar no hay detalle de errores', async () => {
    const { deps } = dependencias([error(503), bien()]);
    expect(await consultar(deps)).not.toHaveProperty('detalle');
  });

  describe('cuando un modelo ya no existe', () => {
    const modelo = (name, metodos = ['generateContent']) => ({ name, supportedGenerationMethods: metodos });
    const listado = [
      modelo('models/gemini-3.5-flash'),
      modelo('models/gemini-3.5-flash-lite'),
      modelo('models/gemini-embedding-001', ['embedContent']),
      modelo('models/imagen-4.0', ['predict']),
    ];

    it('si al final no logra responder, lista los modelos que sí tiene disponibles la clave', async () => {
      const { deps } = dependencias([error(404), error(404)], { listado });
      const resultado = await consultar(deps);
      expect(resultado.ok).toBe(false);
      expect(resultado.disponibles).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']); // sin "models/" y solo los que generan texto
    });

    it('si responde bien con otro modelo no hace falta listar nada', async () => {
      const { deps, pedidos } = dependencias([error(404), bien()], { listado });
      expect((await consultar(deps)).ok).toBe(true);
      expect(pedidos.some((p) => /\/models\?/.test(p.url))).toBe(false);
    });

    it('no pide el listado cuando el fallo no tiene que ver con modelos inexistentes', async () => {
      const { deps, pedidos } = dependencias([error(503), error(503), error(503), error(503), error(503)], { listado });
      expect(await consultar(deps)).not.toHaveProperty('disponibles');
      expect(pedidos.some((p) => /\/models\?/.test(p.url))).toBe(false);
    });

    it('el listado se pide con la clave en el encabezado', async () => {
      const { deps, pedidos } = dependencias([error(404), error(404)], { listado });
      await consultar(deps);
      const pedido = pedidos.find((p) => /\/models\?/.test(p.url));
      expect(pedido.opciones.headers['x-goog-api-key']).toBe('clave');
      expect(pedido.url).not.toContain('clave');
    });

    it('si el listado falla, el error original igual se devuelve', async () => {
      const { deps } = dependencias([error(404), error(404)], { listado: new Error('red caída') });
      const resultado = await consultar(deps);
      expect(resultado.ok).toBe(false);
      expect(resultado.disponibles).toEqual([]);
    });
  });

  it('un 429 (demasiadas consultas) se trata igual que la saturación', async () => {
    const { deps } = dependencias([error(429), error(429), error(429), error(429), error(429)]);
    expect(await consultar(deps)).toMatchObject({ ok: false, estado: 503 });
  });

  it.each([500, 502, 504])('un error temporal %i también se reintenta, con mensaje genérico', async (estado) => {
    const { deps, fetchFn } = dependencias([error(estado), error(estado), error(estado), error(estado), error(estado)]);
    const resultado = await consultar(deps);
    expect(resultado).toMatchObject({ ok: false, estado: 502 });
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  it('un error que reintentar no arregla (pedido inválido) se devuelve enseguida', async () => {
    const { deps, fetchFn, esperas } = dependencias([error(400)]);
    expect(await consultar(deps)).toMatchObject({ ok: false, estado: 502 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('una clave rechazada (401 o 403) lo dice y no reintenta', async () => {
    const { deps, fetchFn } = dependencias([error(403)]);
    const resultado = await consultar(deps);
    expect(resultado.mensaje).toContain('GEMINI_API_KEY');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('si el modelo principal no existe (404) pasa al liviano sin esperar', async () => {
    const { deps, esperas } = dependencias([error(404), bien('[4]')]);
    expect(await consultar(deps)).toMatchObject({ ok: true, modelo: 'liviano' });
    expect(esperas).toEqual([]);
  });

  it('un corte de red o una respuesta sin texto también se reintentan', async () => {
    const { deps, fetchFn } = dependencias([new Error('red caída'), respuesta(200, { candidates: [] }), bien('[5]')]);
    expect(await consultar(deps)).toMatchObject({ ok: true, text: '[5]' });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('si una consulta tarda demasiado (se cancela) lo avisa', async () => {
    const abortado = new DOMException('cancelado', 'AbortError');
    const { deps } = dependencias([abortado, abortado, abortado, abortado, abortado]);
    expect((await consultar(deps)).mensaje).toContain('tardó demasiado');
  });

  it('deja de intentar cuando se acaba el tiempo total, con lo último que pasó', async () => {
    const { deps, fetchFn } = dependencias([], { paso: 60_000 }); // cada consulta "tarda" un minuto
    const resultado = await consultar(deps);
    expect(resultado).toMatchObject({ ok: false, estado: 503 });
    expect(fetchFn.mock.calls.length).toBeLessThan(5);
  });
});
