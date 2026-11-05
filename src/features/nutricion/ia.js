// Asistente de IA para armar las comidas de un alumno. El coach elige cuántas comidas y opciones quiere y deja
// indicaciones (horario de entrenamiento, restricciones); la IA propone qué alimentos de la biblioteca van en cada
// comida y en qué cantidad, y el CÓDIGO ajusta las porciones para que el día cierre con los objetivos del alumno
// (la IA no es buena haciendo cuentas). El resultado se muestra como vista previa: nada se guarda hasta que el
// coach lo aplica. Este módulo es lógica pura; la llamada a la IA (con la clave en el servidor) vive en
// coaching/ia/gemini.js y reutiliza la misma función `ai-plan`.
import { plano } from '../../lib/texto.js';
import { llamarIA } from '../coaching/ia/gemini.js';
import { categoriaDe, CATEGORIAS } from './alimentos.js';
import { crearComida, crearItem, crearOpcion, macrosDeOpcion } from './comidas.js';

const MAX_COMIDAS = 8;
const MAX_OPCIONES = 4;
const MAX_ALIMENTOS_POR_OPCION = 15;
const MAX_PORCIONES = 20;
const FACTOR_MIN = 0.4;
const FACTOR_MAX = 2.5;
const FACTOR_OPCION_MIN = 0.25; // para igualar las opciones de una comida el rango es más amplio que para el día
const FACTOR_OPCION_MAX = 6;
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

const entre = (n, minimo, maximo) => Math.min(maximo, Math.max(minimo, n));
const aMedias = (n) => Math.round(n * 2) / 2;
const sinRespuestaUtil = () => new Error('La IA no devolvió comidas válidas. Probá de nuevo.');

// ---------------------------------------------------------------------------
// El pedido
// ---------------------------------------------------------------------------

const lineaDeAlimento = (a) => {
  const marcas = [a.gluten ? 'contiene gluten' : '', a.lacteo ? 'contiene lácteos' : ''].filter(Boolean);
  return `- ${a.nombre} — ${a.porcion}${marcas.length ? ` (${marcas.join(', ')})` : ''}`;
};

function listaDeAlimentos(alimentos) {
  return CATEGORIAS.map((categoria) => {
    const propios = alimentos.filter((a) => a.categoria === categoria.id);
    if (!propios.length) return '';
    const { kcal, p, c, f } = categoria.macros;
    return `${categoria.nombre.toUpperCase()} (cada porción: ${kcal} kcal, P ${p} g, C ${c} g, G ${f} g)\n${propios.map(lineaDeAlimento).join('\n')}`;
  })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * El pedido para la IA: reglas, objetivos del alumno, indicaciones del coach y los alimentos que puede usar.
 * @param {{
 *   alimentos: import('./alimentos.js').Alimento[],
 *   objetivos: { kcal: number, p: number, c: number, f: number },
 *   cantidadComidas: number, cantidadOpciones: number, indicaciones: string
 * }} datos
 */
export function armarPeticion({ alimentos, objetivos, cantidadComidas, cantidadOpciones, indicaciones }) {
  const texto = String(indicaciones ?? '').trim();
  const opciones = cantidadOpciones === 1 ? '1 opción' : `${cantidadOpciones} opciones`;
  return `Actuá como un nutricionista deportivo. Armá el plan de comidas de un día para un alumno con el sistema de intercambios: cada alimento de la lista es UNA PORCIÓN equivalente a las demás de su categoría.

OBJETIVOS DEL DÍA: ${objetivos.kcal} kcal, proteína ${objetivos.p} g, carbohidratos ${objetivos.c} g, grasas ${objetivos.f} g.

REGLAS:
- Armá ${cantidadComidas} comidas, cada una con ${opciones}. Las opciones de una misma comida son alternativas equivalentes entre sí (el alumno elige una), con calorías y macros parecidos.
- Usá SOLO alimentos de la lista y copiá el nombre exacto, sin cambiarlo.
- "porciones" es la cantidad de porciones de ese alimento (múltiplos de 0,5, entre 0,5 y ${MAX_PORCIONES}).
- La suma de la primera opción de todas las comidas debe acercarse lo más posible a los objetivos del día.
- Cada comida lleva una hora en formato de 24 horas "HH:MM", repartidas de forma razonable durante el día.
- Armá comidas que se puedan cocinar y comer de verdad (por ejemplo, no pongas un yogur en el almuerzo con arroz).
- Respetá las indicaciones del entrenador.
- Devolvé ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown, con esta forma:
{"comidas":[{"nombre":"Desayuno","hora":"08:00","opciones":[[{"alimento":"Nombre exacto","porciones":1.5}]]}]}
("opciones" es una lista de opciones y cada opción es una lista de alimentos.)

INDICACIONES DEL ENTRENADOR: ${texto || 'Ninguna.'}

ALIMENTOS DISPONIBLES:
${listaDeAlimentos(alimentos)}`;
}

// ---------------------------------------------------------------------------
// La respuesta
// ---------------------------------------------------------------------------

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lee la respuesta de la IA y arma comidas válidas con los alimentos de la biblioteca. Lo que no sirve (alimentos
 * que no existen, opciones vacías) se descarta y se informa en `avisos`. Lanza un error si no queda ninguna comida.
 * @param {string} texto
 * @param {import('./alimentos.js').Alimento[]} alimentos
 * @returns {{ comidas: import('./comidas.js').Comida[], avisos: string[] }}
 */
export function interpretarRespuesta(texto, alimentos) {
  if (typeof texto !== 'string' || !texto.trim()) throw sinRespuestaUtil();
  const sinBloque = texto.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let dato;
  try {
    dato = JSON.parse(sinBloque);
  } catch {
    throw sinRespuestaUtil();
  }
  const lista = Array.isArray(dato) ? dato : dato?.comidas;
  if (!Array.isArray(lista)) throw sinRespuestaUtil();

  const porNombre = new Map(alimentos.map((a) => [plano(a.nombre), a]));
  const avisos = new Set();

  const armarItem = (crudo) => {
    if (!esObjeto(crudo)) return null;
    const nombre = String(crudo.alimento ?? crudo.nombre ?? '').trim();
    const alimento = porNombre.get(plano(nombre));
    if (!alimento || !categoriaDe(alimento.categoria)) {
      if (nombre) avisos.add(`«${nombre}» no está en tu biblioteca y se omitió.`);
      return null;
    }
    const porciones = Number(crudo.porciones);
    if (!(porciones > 0)) return null;
    return crearItem(alimento, entre(aMedias(porciones), 0.5, MAX_PORCIONES));
  };

  const armarOpcion = (cruda) => {
    const items = Array.isArray(cruda) ? cruda : esObjeto(cruda) && Array.isArray(cruda.items) ? cruda.items : [];
    const validos = items.slice(0, MAX_ALIMENTOS_POR_OPCION).map(armarItem).filter(Boolean);
    return validos.length ? crearOpcion(validos) : null;
  };

  const comidas = lista
    .slice(0, MAX_COMIDAS)
    .map((cruda, i) => {
      if (!esObjeto(cruda)) return null;
      const opciones = (Array.isArray(cruda.opciones) ? cruda.opciones : [])
        .slice(0, MAX_OPCIONES)
        .map(armarOpcion)
        .filter(Boolean);
      if (!opciones.length) return null;
      const nombre = typeof cruda.nombre === 'string' ? cruda.nombre.trim() : '';
      const hora = typeof cruda.hora === 'string' && HORA_VALIDA.test(cruda.hora) ? cruda.hora : '';
      return { ...crearComida({ nombre: nombre || `Comida ${i + 1}`, hora }), opciones };
    })
    .filter(Boolean);

  if (!comidas.length) throw sinRespuestaUtil();
  return { comidas, avisos: [...avisos] };
}

// ---------------------------------------------------------------------------
// Ajuste de porciones (lo hace el código, no la IA)
// ---------------------------------------------------------------------------

const seEscala = (item) => (categoriaDe(item.categoria)?.macros.kcal ?? 0) > 0 && !/^libre$/i.test(item.porcion.trim());

const escalarOpcion = (opcion, factor) => ({
  ...opcion,
  items: opcion.items.map((item) =>
    seEscala(item) ? { ...item, porciones: entre(aMedias(item.porciones * factor), 0.5, MAX_PORCIONES) } : item,
  ),
});

const kcalDe = (opcion) => macrosDeOpcion(opcion).kcal;

/**
 * Escala las porciones para que la primera opción de cada comida sume, entre todas, las calorías del día; las otras
 * opciones se escalan para quedar parecidas en calorías a la primera de su comida. Las porciones quedan en
 * múltiplos de 0,5, y no se toca lo que es «Libre» ni lo que no tiene calorías. No modifica las comidas recibidas.
 * @param {import('./comidas.js').Comida[]} comidas
 * @param {{ kcal: number } | null} objetivos
 */
export function ajustarAObjetivos(comidas, objetivos) {
  const total = comidas.reduce((suma, c) => suma + kcalDe(c.opciones[0]), 0);
  if (!objetivos || !(objetivos.kcal > 0) || !(total > 0)) return structuredClone(comidas);
  const factor = entre(objetivos.kcal / total, FACTOR_MIN, FACTOR_MAX);

  return comidas.map((comida) => {
    const [primera, ...otras] = comida.opciones;
    const meta = kcalDe(primera) * factor;
    return {
      ...comida,
      opciones: [
        escalarOpcion(primera, factor),
        ...otras.map((o) =>
          kcalDe(o) > 0 ? escalarOpcion(o, entre(meta / kcalDe(o), FACTOR_OPCION_MIN, FACTOR_OPCION_MAX)) : o,
        ),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Todo junto
// ---------------------------------------------------------------------------

/**
 * Le pide a la IA un plan de comidas y lo deja ajustado a los objetivos.
 * @param {Parameters<typeof armarPeticion>[0] | (Omit<Parameters<typeof armarPeticion>[0], 'objetivos'> & { objetivos: null })} datos
 * @param {(peticion: string) => Promise<string>} [llamar]
 * @returns {Promise<{ comidas: import('./comidas.js').Comida[], avisos: string[] }>}
 */
export async function sugerirComidas(datos, llamar = llamarIA) {
  if (!datos.objetivos) throw new Error('Completá los datos del alumno para calcular sus objetivos.');
  const texto = await llamar(armarPeticion(datos));
  const { comidas, avisos } = interpretarRespuesta(texto, datos.alimentos);
  return { comidas: ajustarAObjetivos(comidas, datos.objetivos), avisos };
}
