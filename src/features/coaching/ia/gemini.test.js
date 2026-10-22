import { describe, expect, it, vi } from 'vitest';
import { llamarIA } from './gemini.js';

const clienteCon = (respuesta) => ({ functions: { invoke: vi.fn(async () => respuesta) } });

describe('llamarIA', () => {
  it('manda el pedido a la función ai-plan y devuelve el texto de la IA', async () => {
    const cliente = clienteCon({ data: { text: '[]' }, error: null });
    expect(await llamarIA('Sube el RPE', cliente)).toBe('[]');
    expect(cliente.functions.invoke).toHaveBeenCalledWith('ai-plan', { body: { prompt: 'Sube el RPE' } });
  });

  it('si la función responde con un error, muestra el mensaje que mandó el servidor', async () => {
    const context = { json: async () => ({ error: 'Solo un admin puede usar la IA' }) };
    const cliente = clienteCon({ data: null, error: { message: 'non-2xx', context } });
    await expect(llamarIA('x', cliente)).rejects.toThrow('Solo un admin puede usar la IA');
  });

  it('si el error no trae detalle usa su propio mensaje', async () => {
    const cliente = clienteCon({ data: null, error: { message: 'Failed to fetch' } });
    await expect(llamarIA('x', cliente)).rejects.toThrow('Failed to fetch');
  });

  it('si la respuesta no trae texto avisa que la IA no respondió', async () => {
    await expect(llamarIA('x', clienteCon({ data: {}, error: null }))).rejects.toThrow('La IA no respondió');
    await expect(llamarIA('x', clienteCon({ data: null, error: null }))).rejects.toThrow('La IA no respondió');
  });
});
