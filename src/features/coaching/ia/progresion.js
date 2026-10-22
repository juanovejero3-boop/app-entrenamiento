// Asistente de progresión con IA: el coach arma las primeras semanas (o solo la primera) y le pide a la
// IA, en lenguaje natural, que complete el ciclo ("sube 1 punto de RPE por semana", "semana 4 de descarga").
// Este módulo es lógica pura: arma el pedido, valida lo que devuelve la IA y calcula qué cambió.
// La llamada a la IA en sí (con la clave en el servidor) vive en gemini.js.
//
// Regla de seguridad del plan: la IA solo puede cambiar series, repeticiones, intensidad y descanso.
// Lo demás (ids, nombres, técnicas, notas, estructura) se toma siempre del plan original, aunque la IA
// lo devuelva distinto, y si cambia la estructura se descarta toda la respuesta.
import { TIPOS_INTENSIDAD } from '../entrenamiento/catalogos.js';
import { conIdsNuevos } from '../entrenamiento/plan.js';

/** Campos de cada ejercicio que la IA puede modificar. */
export const CAMPOS_EDITABLES = ['sets', 'reps', 'intensityType', 'intensityValue', 'rest'];

const LARGO_MAXIMO = 30;
const ESTRUCTURA_CAMBIADA =
  'La IA cambió la estructura del plan (semanas, días o ejercicios), así que no se aplicó nada. Probá de nuevo.';

const tieneEjercicios = (semana) => semana.days.some((d) => d.blocks.some((b) => b.exercises.length));

/** Si alguna semana del plan ya tiene ejercicios (sin eso la IA no tiene nada que completar). */
export const planTieneEjercicios = (plan) => plan.weeks.some(tieneEjercicios);

/**
 * Copia la primera semana con ejercicios a todas las semanas siguientes que no tienen ninguno (con ids
 * nuevos), conservando el nombre, la fase y el volumen de cada una. Así la IA solo ajusta valores.
 * @returns {{ plan: import('../entrenamiento/plan.js').PlanEntrenamiento, copiadas: number[] }} copiadas: posiciones
 */
export function completarSemanasVacias(plan) {
  const nuevo = structuredClone(plan);
  const origen = nuevo.weeks.findIndex(tieneEjercicios);
  const copiadas = [];
  if (origen >= 0) {
    nuevo.weeks.forEach((semana, i) => {
      if (i <= origen || tieneEjercicios(semana)) return;
      semana.days = conIdsNuevos(nuevo.weeks[origen]).days;
      copiadas.push(i);
    });
  }
  return { plan: nuevo, copiadas };
}

/** El pedido para la IA: reglas, instrucción del coach y las semanas del plan en JSON. */
export function armarPeticion(plan, instruccion) {
  const texto = String(instruccion ?? '').trim();
  if (!texto) throw new Error('Escribí qué querés que haga la IA');
  return `Actuá como un entrenador de fuerza e hipertrofia. Vas a recibir las semanas de un macrociclo en JSON y una instrucción del entrenador.
Aplicá la instrucción modificando ÚNICAMENTE estos campos de los ejercicios: ${CAMPOS_EDITABLES.join(', ')}.
REGLAS:
- Mantené iguales los ids, los nombres, las técnicas, las notas, el orden y la cantidad de semanas, días, bloques y ejercicios.
- intensityType solo puede ser ${TIPOS_INTENSIDAD.join(', ')}. Los valores son texto corto (por ejemplo "8", "6-8", "90s").
- Si la instrucción habla de progresar "por semana" o "hasta el final del ciclo", la progresión es acumulativa: la primera semana queda como está y cada semana siguiente suma el incremento sobre la anterior (con +2 repeticiones, 8 pasa a 10 y después a 12).
- Si el valor es un rango, se mueve entero: con +2 repeticiones, "8-10" pasa a "10-12".
- Aplicá la instrucción solo a los ejercicios o a las semanas que menciona; si no menciona ninguno, a todos.
- Devolvé ÚNICAMENTE el arreglo JSON de semanas modificado, sin texto adicional ni markdown.

INSTRUCCIÓN DEL ENTRENADOR: ${texto}

SEMANAS:
${JSON.stringify(plan.weeks)}`;
}

/** Lee la respuesta de la IA: un arreglo JSON de semanas (con o sin bloque de código) u objeto con `weeks`. */
export function interpretarRespuesta(texto) {
  const invalido = () => new Error('La IA no devolvió un plan válido. Probá de nuevo.');
  if (typeof texto !== 'string' || !texto.trim()) throw invalido();
  const sinBloque = texto.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let dato;
  try {
    dato = JSON.parse(sinBloque);
  } catch {
    throw invalido();
  }
  const semanas = Array.isArray(dato) ? dato : dato?.weeks;
  if (!Array.isArray(semanas)) throw invalido();
  return semanas;
}

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Las listas coinciden en largo y en ids, y todos sus elementos son objetos. */
function mismaEstructura(originales, nuevos) {
  return (
    Array.isArray(nuevos) &&
    nuevos.length === originales.length &&
    originales.every((o, i) => esObjeto(nuevos[i]) && nuevos[i].id === o.id)
  );
}

/** Valor que devuelve la IA para un campo, ya limpio, o null si no sirve. */
function valorValido(campo, valor) {
  const limpio = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!limpio || limpio.length > LARGO_MAXIMO) return null;
  if (campo === 'intensityType' && !TIPOS_INTENSIDAD.includes(limpio)) return null;
  return limpio;
}

/**
 * Aplica a `plan` los cambios de la IA sobre los campos permitidos y devuelve el plan nuevo y la lista de
 * lo que cambió. Si la IA tocó la estructura, lanza un error y no devuelve nada.
 * @returns {{ plan: import('../entrenamiento/plan.js').PlanEntrenamiento,
 *   cambios: { semana: string, dia: string, ejercicio: string, campo: string, antes: string, despues: string }[] }}
 */
export function aplicarCambios(plan, semanasIA) {
  const nuevo = structuredClone(plan);
  const cambios = [];
  if (!mismaEstructura(nuevo.weeks, semanasIA)) throw new Error(ESTRUCTURA_CAMBIADA);

  nuevo.weeks.forEach((semana, w) => {
    const diasIA = semanasIA[w].days;
    if (!mismaEstructura(semana.days, diasIA)) throw new Error(ESTRUCTURA_CAMBIADA);
    semana.days.forEach((dia, d) => {
      const bloquesIA = diasIA[d].blocks;
      if (!mismaEstructura(dia.blocks, bloquesIA)) throw new Error(ESTRUCTURA_CAMBIADA);
      dia.blocks.forEach((bloque, b) => {
        const ejerciciosIA = bloquesIA[b].exercises;
        if (!mismaEstructura(bloque.exercises, ejerciciosIA)) throw new Error(ESTRUCTURA_CAMBIADA);
        bloque.exercises.forEach((ejercicio, e) => {
          for (const campo of CAMPOS_EDITABLES) {
            const valor = valorValido(campo, ejerciciosIA[e][campo]);
            if (valor === null || valor === ejercicio[campo]) continue;
            cambios.push({
              semana: semana.name,
              dia: dia.name,
              ejercicio: ejercicio.name,
              campo,
              antes: ejercicio[campo],
              despues: valor,
            });
            ejercicio[campo] = valor;
          }
        });
      });
    });
  });
  return { plan: nuevo, cambios };
}

/**
 * Completa las semanas vacías con la primera y le pide a la IA la progresión. No guarda nada: devuelve
 * la propuesta para que el coach la revise.
 * @param {(peticion: string) => Promise<string>} llamarIA  recibe el pedido y devuelve el texto de la IA
 * @returns {Promise<{ plan: object, cambios: object[], copiadas: number[] }>}
 */
export async function proponerProgresion(llamarIA, plan, instruccion) {
  if (!planTieneEjercicios(plan)) {
    throw new Error('Cargá los ejercicios de la primera semana antes de pedirle a la IA que complete el ciclo.');
  }
  const { plan: completo, copiadas } = completarSemanasVacias(plan);
  const respuesta = await llamarIA(armarPeticion(completo, instruccion));
  const { plan: propuesto, cambios } = aplicarCambios(completo, interpretarRespuesta(respuesta));
  return { plan: propuesto, cambios, copiadas };
}
