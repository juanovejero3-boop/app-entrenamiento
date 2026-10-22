// Llamada a la IA (Gemini) a través de la Edge Function `ai-plan` de Supabase: la clave de Gemini vive
// como secreto en el servidor y la función solo atiende a un admin con sesión iniciada.
import { supaClient } from '../../../lib/supabase.js';

/** El mensaje que mandó el servidor (si lo hay) o el del propio error. */
async function mensajeDeError(error) {
  try {
    const detalle = await error.context?.json?.();
    if (detalle?.error) return detalle.error;
  } catch {
    // la respuesta no era JSON: se usa el mensaje del error
  }
  return error.message;
}

/**
 * @param {string} peticion
 * @param {{ functions: { invoke: Function } }} [cliente]
 * @returns {Promise<string>} el texto que devolvió la IA
 */
export async function llamarIA(peticion, cliente = supaClient) {
  const { data, error } = await cliente.functions.invoke('ai-plan', { body: { prompt: peticion } });
  if (error) throw new Error(await mensajeDeError(error));
  if (typeof data?.text !== 'string') throw new Error('La IA no respondió');
  return data.text;
}
