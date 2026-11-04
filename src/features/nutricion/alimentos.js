// Biblioteca de alimentos del coach: las categorías de intercambio y los alimentos de cada una.
// Es lógica pura (sin DOM ni almacenamiento): todas las operaciones devuelven listas nuevas.
//
// Una categoría tiene macros fijos por porción (así armaba las comidas el prototipo del coach) y cada
// alimento es una porción equivalente de esa categoría: «Pechuga de pollo → 100 g».

/**
 * @typedef {{ id: string, nombre: string, macros: { kcal: number, p: number, c: number, f: number } }} Categoria
 * @typedef {{ id: string, categoria: string, nombre: string, porcion: string, gluten: boolean, lacteo: boolean }} Alimento
 */

/** @type {Categoria[]} Macros de una porción (kcal, proteínas, carbohidratos y grasas en gramos). */
export const CATEGORIAS = [
  { id: 'proteins', nombre: 'Proteínas', macros: { kcal: 120, p: 25, c: 0, f: 2 } },
  { id: 'carbs', nombre: 'Carbohidratos', macros: { kcal: 100, p: 3, c: 20, f: 0 } },
  { id: 'fats', nombre: 'Grasas', macros: { kcal: 100, p: 0, c: 0, f: 11 } },
  { id: 'mixed_pf', nombre: 'Mixto: Proteína + Grasa', macros: { kcal: 150, p: 14, c: 1, f: 10 } },
  { id: 'mixed_pc', nombre: 'Mixto: Proteína + Carbo', macros: { kcal: 130, p: 8, c: 20, f: 1 } },
  { id: 'mixed_fc', nombre: 'Mixto: Grasa + Carbo', macros: { kcal: 140, p: 2, c: 15, f: 8 } },
  { id: 'vegetables', nombre: 'Verduras de Hoja y Fibra', macros: { kcal: 25, p: 1, c: 5, f: 0 } },
  { id: 'beverages', nombre: 'Bebidas e Infusiones', macros: { kcal: 0, p: 0, c: 0, f: 0 } },
];

/** @returns {Categoria | undefined} */
export const categoriaDe = (id) => CATEGORIAS.find((c) => c.id === id);

const nuevoId = () => crypto.randomUUID();

/** Minúsculas y sin tildes, para comparar y buscar. */
const plano = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * @param {{ categoria: string, nombre: string, porcion: string, gluten?: boolean, lacteo?: boolean }} datos
 * @returns {Alimento}
 */
export function crearAlimento({ categoria, nombre, porcion, gluten = false, lacteo = false }) {
  return {
    id: nuevoId(),
    categoria,
    nombre: String(nombre ?? '').trim(),
    porcion: String(porcion ?? '').trim(),
    gluten: gluten === true,
    lacteo: lacteo === true,
  };
}

/**
 * El mensaje para mostrarle al coach si el alimento no se puede guardar, o null si está bien.
 * @param {Alimento} alimento
 * @param {Alimento[]} lista  los alimentos que ya existen (el mismo alimento, por id, no cuenta como repetido)
 */
export function validarAlimento(alimento, lista) {
  const categoria = categoriaDe(alimento.categoria);
  if (!String(alimento.nombre ?? '').trim()) return 'Escribí el nombre del alimento.';
  if (!String(alimento.porcion ?? '').trim()) return 'Indicá la porción (por ejemplo, 100 g).';
  if (!categoria) return 'Elegí una categoría.';
  const repetido = lista.some(
    (a) => a.id !== alimento.id && a.categoria === alimento.categoria && plano(a.nombre) === plano(alimento.nombre),
  );
  return repetido ? `Ya existe «${alimento.nombre.trim()}» en ${categoria.nombre}.` : null;
}

/** @param {Alimento[]} lista @param {Alimento} alimento */
export const agregarAlimento = (lista, alimento) => [...lista, alimento];

/** Cambia los campos indicados de un alimento; el id no se puede pisar. */
export const actualizarAlimento = (lista, id, cambios) =>
  lista.map((a) => (a.id === id ? { ...a, ...cambios, id: a.id } : a));

export const quitarAlimento = (lista, id) => lista.filter((a) => a.id !== id);

/**
 * Los alimentos agrupados por categoría (en el orden de CATEGORIAS, sin las vacías) y ordenados por nombre.
 * El filtro busca en el nombre, la porción y el nombre de la categoría.
 * @returns {{ categoria: Categoria, alimentos: Alimento[] }[]}
 */
export function agruparPorCategoria(lista, filtro = '') {
  const buscado = plano(filtro);
  return CATEGORIAS.map((categoria) => ({
    categoria,
    alimentos: lista
      .filter((a) => a.categoria === categoria.id)
      .filter((a) => !buscado || plano(`${a.nombre} ${a.porcion} ${categoria.nombre}`).includes(buscado))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es')),
  })).filter((g) => g.alimentos.length);
}

/**
 * Valida y completa una lista que viene de afuera (localStorage, un archivo importado). No modifica `dato`.
 * Descarta lo que no se puede usar y repara los ids faltantes o repetidos.
 * @returns {Alimento[] | null} null si lo recibido ni siquiera es una lista
 */
export function normalizarAlimentos(dato) {
  if (!Array.isArray(dato)) return null;
  const usados = new Set();
  const lista = [];
  for (const a of dato) {
    if (typeof a !== 'object' || a === null || !categoriaDe(a.categoria)) continue;
    const alimento = crearAlimento(a);
    if (!alimento.nombre || !alimento.porcion) continue;
    const id = typeof a.id === 'string' && a.id && !usados.has(a.id) ? a.id : alimento.id;
    usados.add(id);
    lista.push({ ...alimento, id });
  }
  return lista;
}

// Los alimentos del prototipo del coach, como punto de partida de la biblioteca: «nombre → porción»
// y, cuando corresponde, g = tiene gluten, l = tiene lácteo.
const BASE = {
  proteins: [
    ['Pechuga de Pollo', '100g'],
    ['Carne Magra Vacuna', '100g'],
    ['Pescado Blanco', '120g'],
    ['Claras de Huevo', '200ml'],
    ['Whey Protein', '1 scoop (30g)', { l: true }],
  ],
  carbs: [
    ['Arroz Blanco (Cocido)', '75g'],
    ['Pasta de Trigo (Cocida)', '75g', { g: true }],
    ['Papa (Cocida)', '110g'],
    ['Avena en Hojuelas', '25g'],
    ['Pan Integral', '1 Rebanada'],
  ],
  fats: [
    ['Aceite de Oliva', '10ml'],
    ['Nueces / Almendras', '15g'],
    ['Palta / Aguacate', '60g'],
    ['Mantequilla de Maní', '15g'],
  ],
  mixed_pf: [
    ['Huevo Entero', '2 unidades'],
    ['Salmón Fresco', '80g'],
    ['Queso Semiduro', '40g', { l: true }],
  ],
  mixed_pc: [
    ['Lentejas (Cocidas)', '100g'],
    ['Garbanzos (Cocidos)', '100g'],
    ['Yogur Descremado', '200g', { l: true }],
  ],
  mixed_fc: [
    ['Chocolate Negro (>70%)', '25g'],
    ['Galletas de Arroz c/ Mantequilla Maní', '1 porción'],
  ],
  vegetables: [
    ['Lechuga / Espinaca / Rúcula', 'Libre'],
    ['Tomate', '1 mediano'],
    ['Brócoli / Coliflor', '1 taza'],
    ['Cebolla / Morrón', '1/2 taza'],
    ['Zanahoria', '1 mediana'],
  ],
  beverages: [
    ['Agua Mineral / Gasificada', 'Libre'],
    ['Café Negro (Sin Azúcar)', 'Libre'],
    ['Té Verde / Negro / Hierbas', 'Libre'],
    ['Mate (Sin Azúcar)', 'Libre'],
  ],
};

/** @returns {Alimento[]} La base inicial, con ids nuevos en cada llamada. */
export function alimentosIniciales() {
  return Object.entries(BASE).flatMap(([categoria, items]) =>
    items.map(([nombre, porcion, marcas = {}]) =>
      crearAlimento({ categoria, nombre, porcion, gluten: marcas.g === true, lacteo: marcas.l === true }),
    ),
  );
}
