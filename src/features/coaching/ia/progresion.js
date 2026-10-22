// Asistente de progresión con IA: el coach arma las primeras semanas (o solo la primera) y le pide a la
// IA, en lenguaje natural, que complete el ciclo ("sube 1 punto de RPE por semana", "agregá un ejercicio de
// espalda"). Este módulo es lógica pura: arma el pedido, combina lo que devuelve la IA con el plan y calcula
// qué cambió. La llamada a la IA en sí (con la clave en el servidor) vive en gemini.js.
//
// Reglas de seguridad del plan. La respuesta de la IA nunca reemplaza el plan: se COMBINA por id.
// - De los ejercicios que ya existen solo se toman series, repeticiones, intensidad y descanso. Lo demás
//   (ids, nombres, técnicas, notas, orden) sale siempre del plan original.
// - La IA puede AGREGAR ejercicios (y bloques) nuevos, siempre que haya biblioteca de ejercicios.
// - Lo que la IA quita, mueve o inventa en la estructura (semanas, días) se ignora y se informa en `avisos`,
//   para mostrarlo en la vista previa: el coach decide si aplica lo que sí se pudo aplicar.
import { TIPOS_BLOQUE, TIPOS_INTENSIDAD } from '../entrenamiento/catalogos.js';
import { conIdsNuevos } from '../entrenamiento/plan.js';
import { crearIndice, normalizarNombre } from './biblioteca.js';

/** Campos de cada ejercicio que la IA puede modificar. */
export const CAMPOS_EDITABLES = ['sets', 'reps', 'intensityType', 'intensityValue', 'rest'];

const LARGO_MAXIMO = 30;
const LARGO_MAXIMO_NOMBRE = 150;
const MAXIMO_BLOQUES_NUEVOS_POR_DIA = 6;
const MAXIMO_EJERCICIOS_NUEVOS_POR_DIA = 12;

const tieneEjercicios = (semana) => semana.days.some((d) => d.blocks.some((b) => b.exercises.length));

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

/** Reglas extra cuando la IA puede agregar ejercicios nuevos con los de la biblioteca. */
const reglasParaAgregar = () =>
  `- Podés agregar ejercicios nuevos a cualquier día si la instrucción lo pide: ponelos en "exercises" del bloque que corresponda, o en un bloque nuevo dentro de "blocks" del día, sin ids. Un bloque nuevo es un objeto con "type" (uno de: ${Object.keys(TIPOS_BLOQUE).join(', ')}) y "exercises"; un ejercicio nuevo es un objeto con "name", "sets", "reps", "intensityType", "intensityValue" y "rest".
- Elegí SOLO ejercicios de la BIBLIOTECA y copiá el nombre exacto y completo de la lista, incluido lo que va después del guion (los músculos). Máximo ${MAXIMO_BLOQUES_NUEVOS_POR_DIA} bloques nuevos y ${MAXIMO_EJERCICIOS_NUEVOS_POR_DIA} ejercicios nuevos por día.
- Si agregás ejercicios nuevos, agregá los mismos en todas las semanas (salvo que la instrucción diga otra cosa) y aplicales la progresión que pida la instrucción.
`;

/**
 * El pedido para la IA: reglas, instrucción del coach y las semanas del plan en JSON.
 * Con `biblioteca` también le da los ejercicios que puede usar para agregar ejercicios nuevos.
 */
export function armarPeticion(plan, instruccion, { biblioteca = [] } = {}) {
  const texto = String(instruccion ?? '').trim();
  if (!texto) throw new Error('Escribí qué querés que haga la IA');
  const puedeAgregar = biblioteca.length > 0;
  return `Actuá como un entrenador de fuerza e hipertrofia. Vas a recibir las semanas de un macrociclo en JSON y una instrucción del entrenador.
En los ejercicios que ya existen modificá ÚNICAMENTE estos campos: ${CAMPOS_EDITABLES.join(', ')}.
REGLAS:
- Mantené iguales los ids, los nombres, las técnicas, las notas, el orden y la cantidad de semanas, días, bloques y ejercicios que ya existen.
- intensityType solo puede ser ${TIPOS_INTENSIDAD.join(', ')}. Los valores son texto corto (por ejemplo "8", "6-8", "90s").
- Si la instrucción habla de progresar "por semana" o "hasta el final del ciclo", la progresión es acumulativa: la primera semana queda como está y cada semana siguiente suma el incremento sobre la anterior (con +2 repeticiones, 8 pasa a 10 y después a 12).
- Si el valor es un rango, se mueve entero: con +2 repeticiones, "8-10" pasa a "10-12".
- Aplicá la instrucción solo a los ejercicios o a las semanas que menciona; si no menciona ninguno, a todos.
${puedeAgregar ? reglasParaAgregar() : ''}- Devolvé ÚNICAMENTE el arreglo JSON de semanas modificado, sin texto adicional ni markdown.

INSTRUCCIÓN DEL ENTRENADOR: ${texto}
${puedeAgregar ? `\nBIBLIOTECA DE EJERCICIOS (usá el nombre exacto):\n${biblioteca.join('\n')}\n` : ''}
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
const comoLista = (v) => (Array.isArray(v) ? v : []);
/** Los objetos de la lista indexados por id (lo demás se ignora). */
const porId = (lista) =>
  new Map(
    comoLista(lista)
      .filter(esObjeto)
      .map((x) => [x.id, x]),
  );

/** "4 series · 6-8 reps · RPE 8 · 2 min": lo que se muestra de un ejercicio nuevo. */
function resumirEjercicio(e) {
  return [
    e.sets && `${e.sets} series`,
    e.reps && `${e.reps} reps`,
    e.intensityValue && `${e.intensityType} ${e.intensityValue}`,
    e.rest,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Valor que devuelve la IA para un campo, ya limpio, o null si no sirve. */
function valorValido(campo, valor) {
  const limpio = typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '';
  if (!limpio || limpio.length > LARGO_MAXIMO) return null;
  if (campo === 'intensityType' && !TIPOS_INTENSIDAD.includes(limpio)) return null;
  return limpio;
}

/** Un ejercicio nuevo propuesto por la IA, limpio y sin id, o null si no tiene un nombre usable. */
function leerEjercicioNuevo(ejercicioIA, indice) {
  const nombre = esObjeto(ejercicioIA) && typeof ejercicioIA.name === 'string' ? ejercicioIA.name.trim() : '';
  if (!nombre || nombre.length > LARGO_MAXIMO_NOMBRE) return null;
  const oficial = indice.get(normalizarNombre(nombre));
  const ejercicio = {
    name: oficial ?? nombre,
    sets: '',
    reps: '',
    intensityType: 'RIR',
    intensityValue: '',
    tech: '',
    rest: '',
    notes: '',
    group: '',
  };
  for (const campo of CAMPOS_EDITABLES) ejercicio[campo] = valorValido(campo, ejercicioIA[campo]) ?? ejercicio[campo];
  return { ejercicio, fueraDeBiblioteca: !oficial };
}

/**
 * Combina la respuesta de la IA con `plan` y devuelve el plan nuevo, lo que cambió y los avisos. Nunca lanza por
 * una respuesta rara: lo que no se puede aplicar se ignora y queda en `avisos`.
 * @returns {{ plan: import('../entrenamiento/plan.js').PlanEntrenamiento,
 *   cambios: { semana: string, dia: string, ejercicio: string, campo: string, antes: string, despues: string,
 *     agregado?: boolean, fueraDeBiblioteca?: boolean }[],
 *   avisos: string[] }}
 */
export function aplicarCambios(plan, semanasIA, { biblioteca = [] } = {}) {
  const indice = crearIndice(biblioteca);
  const puedeAgregar = biblioteca.length > 0;
  const nuevo = structuredClone(plan);
  const cambios = [];
  const avisos = new Set();
  const idsDeEjercicios = new Set(
    nuevo.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.flatMap((b) => b.exercises.map((e) => e.id)))),
  );
  const semanasPorId = porId(semanasIA);
  const sinBiblioteca = () =>
    avisos.add('La IA propuso ejercicios nuevos, pero no hay biblioteca de ejercicios cargada; se ignoraron.');

  if (comoLista(semanasIA).some((s) => !esObjeto(s) || !nuevo.weeks.some((w) => w.id === s.id))) {
    avisos.add('La IA propuso semanas que no existen; se ignoraron.');
  }

  for (const semana of nuevo.weeks) {
    const semanaIA = semanasPorId.get(semana.id);
    if (!semanaIA) {
      avisos.add(`La IA no devolvió la "${semana.name}": se dejó como estaba.`);
      continue;
    }
    if (comoLista(semanaIA.days).some((d) => !esObjeto(d) || !semana.days.some((x) => x.id === d.id))) {
      avisos.add('La IA propuso días que no existen; se ignoraron.');
    }
    const diasPorId = porId(semanaIA.days);

    for (const dia of semana.days) {
      const diaIA = diasPorId.get(dia.id);
      const donde = `${semana.name} · ${dia.name}`;
      if (!diaIA) {
        avisos.add(`La IA no devolvió "${donde}": se dejó como estaba.`);
        continue;
      }
      const bloquesIA = comoLista(diaIA.blocks);
      const bloquesIAPorId = porId(bloquesIA);
      const idsDeBloques = new Set(dia.blocks.map((b) => b.id));
      let ejerciciosNuevos = 0;
      let bloquesNuevos = 0;
      let demasiadosEjercicios = false;

      /** Agrega a `bloque` un ejercicio nuevo de la IA (si hay lugar) y lo anota en los cambios. */
      const agregarEjercicio = (bloque, ejercicioIA) => {
        const leido = leerEjercicioNuevo(ejercicioIA, indice);
        if (!leido) return;
        if (ejerciciosNuevos >= MAXIMO_EJERCICIOS_NUEVOS_POR_DIA) {
          demasiadosEjercicios = true;
          return;
        }
        ejerciciosNuevos++;
        const ejercicio = conIdsNuevos({ exercises: [leido.ejercicio] }).exercises[0];
        bloque.exercises.push(ejercicio);
        cambios.push({
          semana: semana.name,
          dia: dia.name,
          ejercicio: ejercicio.name,
          campo: 'nuevo',
          antes: '',
          despues: resumirEjercicio(ejercicio),
          agregado: true,
          fueraDeBiblioteca: leido.fueraDeBiblioteca,
        });
      };

      for (const bloque of dia.blocks) {
        const ejerciciosIA = comoLista(bloquesIAPorId.get(bloque.id)?.exercises);
        const ejerciciosIAPorId = porId(ejerciciosIA);

        // Los ejercicios que ya estaban: solo se toman los campos permitidos
        for (const ejercicio of [...bloque.exercises]) {
          const ejercicioIA = ejerciciosIAPorId.get(ejercicio.id);
          if (!ejercicioIA) {
            avisos.add(`La IA quitó "${ejercicio.name}"; se mantuvo.`);
            continue;
          }
          for (const campo of CAMPOS_EDITABLES) {
            const valor = valorValido(campo, ejercicioIA[campo]);
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
        }

        // Los ejercicios sin id conocido son nuevos (uno con id de otro ejercicio es un movimiento: se ignora)
        for (const ejercicioIA of ejerciciosIA) {
          if (esObjeto(ejercicioIA) && idsDeEjercicios.has(ejercicioIA.id)) continue;
          if (!puedeAgregar) sinBiblioteca();
          else agregarEjercicio(bloque, ejercicioIA);
        }
      }

      // Los bloques nuevos: los que la IA agrega sin id conocido (los vacíos que había se reemplazan)
      const bloquesNuevosIA = bloquesIA.filter((b) => esObjeto(b) && !idsDeBloques.has(b.id));
      const hayEjerciciosEnBloquesNuevos = bloquesNuevosIA.some((b) => comoLista(b.exercises).length > 0);
      if (hayEjerciciosEnBloquesNuevos && !puedeAgregar) sinBiblioteca();
      if (hayEjerciciosEnBloquesNuevos && puedeAgregar) {
        const hechos = [];
        for (const bloqueIA of bloquesNuevosIA) {
          const bloque = {
            id: crypto.randomUUID(),
            type: TIPOS_BLOQUE[bloqueIA.type] ? bloqueIA.type : 'fuerza',
            exercises: [],
          };
          for (const ejercicioIA of comoLista(bloqueIA.exercises)) agregarEjercicio(bloque, ejercicioIA);
          if (!bloque.exercises.length) continue;
          if (bloquesNuevos >= MAXIMO_BLOQUES_NUEVOS_POR_DIA) {
            // el bloque no entra: se deshacen sus cambios
            ejerciciosNuevos -= bloque.exercises.length;
            cambios.length -= bloque.exercises.length;
            avisos.add(
              `La IA propuso demasiados bloques para "${donde}": se agregaron solo ${MAXIMO_BLOQUES_NUEVOS_POR_DIA}.`,
            );
            continue;
          }
          bloquesNuevos++;
          hechos.push(bloque);
        }
        if (hechos.length) {
          // un día que tenía solo bloques vacíos los reemplaza; si no, los nuevos van al final
          dia.blocks = [...dia.blocks.filter((b) => b.exercises.length > 0), ...hechos];
        }
      }
      if (demasiadosEjercicios) {
        avisos.add(
          `La IA propuso demasiados ejercicios para "${donde}": se agregaron solo ${MAXIMO_EJERCICIOS_NUEVOS_POR_DIA}.`,
        );
      }
    }
  }
  return { plan: nuevo, cambios, avisos: [...avisos] };
}

/**
 * Completa las semanas vacías con la primera y le pide a la IA la progresión (y los ejercicios nuevos, si la
 * instrucción los pide y hay biblioteca). No guarda nada: devuelve la propuesta para que el coach la revise.
 * @param {(peticion: string) => Promise<string>} llamarIA  recibe el pedido y devuelve el texto de la IA
 * @param {{ biblioteca?: string[] }} [opciones]  biblioteca: ejercicios con los que puede agregar ejercicios nuevos
 * @returns {Promise<{ plan: object, cambios: object[], avisos: string[], copiadas: number[] }>}
 */
export async function proponerProgresion(llamarIA, plan, instruccion, { biblioteca = [] } = {}) {
  if (!plan.weeks.length) {
    throw new Error('Generá primero la estructura del ciclo (semanas y días) para poder usar la IA.');
  }
  const { plan: completo, copiadas } = completarSemanasVacias(plan);
  const respuesta = await llamarIA(armarPeticion(completo, instruccion, { biblioteca }));
  const {
    plan: propuesto,
    cambios,
    avisos,
  } = aplicarCambios(completo, interpretarRespuesta(respuesta), { biblioteca });
  return { plan: propuesto, cambios, avisos, copiadas };
}
