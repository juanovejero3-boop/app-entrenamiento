// Las comidas de un plan de nutrición: cada comida tiene una o más opciones (variantes) y cada opción una lista
// de alimentos con su cantidad en porciones. Lógica pura (sin DOM): todas las operaciones devuelven listas nuevas.
//
// Las opciones de una comida son alternativas entre sí (el alumno elige una), así que el total del día cuenta
// solo la primera de cada comida. Los alimentos se copian al plan: si después se borra uno de la biblioteca, el
// plan del alumno sigue mostrándose igual.
import { categoriaDe } from './alimentos.js';

/**
 * @typedef {{ id: string, categoria: string, nombre: string, porcion: string, porciones: number }} Item
 * @typedef {{ id: string, items: Item[] }} Opcion
 * @typedef {{ id: string, nombre: string, hora: string, opciones: Opcion[] }} Comida
 * @typedef {{ kcal: number, p: number, c: number, f: number }} Macros
 */

const nuevoId = () => crypto.randomUUID();
const MAX_PORCIONES = 50;
const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
const horaOVacia = (hora) => (typeof hora === 'string' && HORA_VALIDA.test(hora) ? hora : '');
const redondear2 = (n) => Math.round(n * 100) / 100;

/** @returns {Item} */
export function crearItem(alimento, porciones = 1) {
  return {
    id: nuevoId(),
    categoria: alimento.categoria,
    nombre: alimento.nombre,
    porcion: alimento.porcion,
    porciones,
  };
}

/** @returns {Opcion} */
export const crearOpcion = (items = []) => ({ id: nuevoId(), items });

/** @returns {Comida} una comida con una opción vacía */
export function crearComida({ nombre, hora = '' }) {
  return {
    id: nuevoId(),
    nombre: String(nombre ?? '').trim() || 'Comida',
    hora: horaOVacia(hora),
    opciones: [crearOpcion()],
  };
}

/** El nombre que se le propone a la próxima comida. */
export const nombreSugerido = (comidas) => `Comida ${comidas.length + 1}`;

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

const enComida = (comidas, comidaId, cambiar) => comidas.map((c) => (c.id === comidaId ? cambiar(c) : c));
const enOpcion = (comidas, comidaId, opcionId, cambiar) =>
  enComida(comidas, comidaId, (c) => ({ ...c, opciones: c.opciones.map((o) => (o.id === opcionId ? cambiar(o) : o)) }));

export const agregarComida = (comidas, comida) => [...comidas, comida];

export const quitarComida = (comidas, id) => comidas.filter((c) => c.id !== id);

/** Cambia el nombre y/o la hora de una comida; sus opciones no se pueden pisar por acá. */
export function actualizarComida(comidas, id, { nombre, hora }) {
  return enComida(comidas, id, (c) => ({
    ...c,
    nombre: nombre !== undefined && String(nombre).trim() ? String(nombre).trim() : c.nombre,
    hora: hora !== undefined ? horaOVacia(hora) : c.hora,
  }));
}

export const agregarOpcion = (comidas, comidaId) =>
  enComida(comidas, comidaId, (c) => ({ ...c, opciones: [...c.opciones, crearOpcion()] }));

/** Quita una variante; la última opción de una comida no se puede quitar. */
export const quitarOpcion = (comidas, comidaId, opcionId) =>
  enComida(comidas, comidaId, (c) =>
    c.opciones.length > 1 ? { ...c, opciones: c.opciones.filter((o) => o.id !== opcionId) } : c,
  );

/** Suma un alimento a una opción; si ya estaba, se suman las porciones en vez de repetir la fila. */
export function agregarItem(comidas, comidaId, opcionId, alimento, porciones = 1) {
  return enOpcion(comidas, comidaId, opcionId, (o) => {
    const repetido = o.items.find((i) => i.categoria === alimento.categoria && i.nombre === alimento.nombre);
    return repetido
      ? {
          ...o,
          items: o.items.map((i) => (i === repetido ? { ...i, porciones: redondear2(i.porciones + porciones) } : i)),
        }
      : { ...o, items: [...o.items, crearItem(alimento, porciones)] };
  });
}

/** Cambia las porciones de un alimento; con 0, negativo o algo que no es un número, el alimento se quita. */
export function actualizarPorciones(comidas, comidaId, opcionId, itemId, porciones) {
  const n = Number(porciones);
  return enOpcion(comidas, comidaId, opcionId, (o) => ({
    ...o,
    items:
      n > 0
        ? o.items.map((i) => (i.id === itemId ? { ...i, porciones: Math.min(n, MAX_PORCIONES) } : i))
        : o.items.filter((i) => i.id !== itemId),
  }));
}

export const quitarItem = (comidas, comidaId, opcionId, itemId) =>
  enOpcion(comidas, comidaId, opcionId, (o) => ({ ...o, items: o.items.filter((i) => i.id !== itemId) }));

/** Las comidas ordenadas por hora; las que no tienen hora van al final. No modifica la lista. */
export const ordenadasPorHora = (comidas) =>
  [...comidas].sort((a, b) => (a.hora || '99:99').localeCompare(b.hora || '99:99'));

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

const CERO = { kcal: 0, p: 0, c: 0, f: 0 };

/** Lo que aporta un alimento: los macros de su categoría por la cantidad de porciones. @returns {Macros} */
export function macrosDeItem(item) {
  const macros = categoriaDe(item.categoria)?.macros;
  if (!macros) return { ...CERO };
  const { porciones } = item;
  return { kcal: macros.kcal * porciones, p: macros.p * porciones, c: macros.c * porciones, f: macros.f * porciones };
}

const sumar = (lista) =>
  lista.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, c: t.c + m.c, f: t.f + m.f }), { ...CERO });

/** @returns {Macros} */
export const macrosDeOpcion = (opcion) => sumar(opcion.items.map(macrosDeItem));

/** El total del día: la primera opción de cada comida, redondeado a enteros. @returns {Macros} */
export function macrosDelDia(comidas) {
  const t = sumar(comidas.map((c) => macrosDeOpcion(c.opciones[0] ?? { items: [] })));
  return { kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), f: Math.round(t.f) };
}

/**
 * Compara lo que suma el plan con los objetivos del alumno, macro por macro. El estado es «ok» dentro del ±5 %.
 * @returns {Record<keyof Macros, { consumido: number, objetivo: number, restante: number, pct: number | null, estado: 'bajo' | 'ok' | 'alto' }> | null}
 *   null si no hay objetivos (faltan datos del alumno)
 */
export function compararConObjetivos(consumido, objetivos) {
  if (!objetivos) return null;
  return Object.fromEntries(
    ['kcal', 'p', 'c', 'f'].map((clave) => {
      const objetivo = objetivos[clave];
      const razon = objetivo > 0 ? consumido[clave] / objetivo : null;
      const estado = razon === null || (razon >= 0.95 && razon <= 1.05) ? 'ok' : razon < 0.95 ? 'bajo' : 'alto';
      return [
        clave,
        {
          consumido: consumido[clave],
          objetivo,
          restante: objetivo - consumido[clave],
          pct: razon === null ? null : Math.round(razon * 100),
          estado,
        },
      ];
    }),
  );
}

// ---------------------------------------------------------------------------
// Datos que vienen de afuera
// ---------------------------------------------------------------------------

const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida y completa comidas que vienen de afuera (localStorage). No modifica `dato`. Descarta lo que no sirve
 * y repara nombres, horas e ids faltantes o repetidos.
 * @returns {Comida[]}
 */
export function normalizarComidas(dato) {
  if (!Array.isArray(dato)) return [];
  const usados = new Set();
  const id = (candidato) => {
    const valor = typeof candidato === 'string' && candidato && !usados.has(candidato) ? candidato : nuevoId();
    usados.add(valor);
    return valor;
  };

  const item = (i) => {
    const porciones = typeof i.porciones === 'number' || typeof i.porciones === 'string' ? Number(i.porciones) : NaN;
    const nombre = typeof i.nombre === 'string' ? i.nombre.trim() : '';
    if (!categoriaDe(i.categoria) || !nombre || !(porciones > 0 && porciones <= MAX_PORCIONES)) return null;
    return {
      id: id(i.id),
      categoria: i.categoria,
      nombre,
      porcion: typeof i.porcion === 'string' ? i.porcion : '',
      porciones,
    };
  };
  const opcion = (o) => ({
    id: id(o.id),
    items: (Array.isArray(o.items) ? o.items : []).filter(esObjeto).map(item).filter(Boolean),
  });

  return dato.filter(esObjeto).map((c) => {
    const opciones = (Array.isArray(c.opciones) ? c.opciones : []).filter(esObjeto).map(opcion);
    return {
      id: id(c.id),
      nombre: typeof c.nombre === 'string' && c.nombre.trim() ? c.nombre.trim() : 'Comida',
      hora: horaOVacia(c.hora),
      opciones: opciones.length ? opciones : [crearOpcion()],
    };
  });
}
