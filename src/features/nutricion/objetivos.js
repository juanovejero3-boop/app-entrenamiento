// Objetivos de nutrición de un alumno: el gasto diario (fórmula Mifflin-St Jeor por el nivel de actividad),
// el ajuste calórico del coach y cómo se reparten los macros. Lógica pura, sin DOM.
//   proteína      = peso × g por kg
//   grasa         = un porcentaje de las calorías (antes estaba fijo en 25 %)
//   carbohidratos = lo que queda

/**
 * @typedef {{
 *   sexo: 'M' | 'F', edad: number | string, peso: number | string, altura: number | string,
 *   actividad: number | string, ajuste: number | string, proteinaGKg: number | string, grasaPct: number | string
 * }} Parametros
 * @typedef {{
 *   tmb: number, tdee: number, kcal: number, p: number, c: number, f: number,
 *   porcentajes: { p: number, c: number, f: number }, advertencia: string | null
 * }} Objetivos
 */

export const ACTIVIDADES = [
  { valor: 1.2, nombre: 'Muy ligera' },
  { valor: 1.375, nombre: 'Ligera' },
  { valor: 1.55, nombre: 'Moderada' },
  { valor: 1.725, nombre: 'Alta' },
  { valor: 1.9, nombre: 'Muy alta' },
];

// Rangos que acepta el formulario: [mínimo, máximo]
const LIMITES = {
  edad: [10, 100],
  peso: [30, 300],
  altura: [100, 250],
  actividad: [1.2, 1.9],
  ajuste: [65, 165],
  proteinaGKg: [1, 4],
  grasaPct: [10, 60],
};

/** Un número, o NaN si está vacío o no es un número (los formularios entregan texto). */
const numero = (valor) => (valor === '' || valor === null || valor === undefined ? NaN : Number(valor));

const ETIQUETAS = {
  edad: 'la edad',
  peso: 'el peso',
  altura: 'la altura',
  actividad: 'el nivel de actividad',
  ajuste: 'el ajuste calórico',
  proteinaGKg: 'la proteína (g por kg)',
  grasaPct: 'el porcentaje de grasa',
};

/** El mensaje para mostrarle al coach si los parámetros no sirven para calcular, o null si están bien. */
export function validarParametros(p) {
  if (p.sexo !== 'M' && p.sexo !== 'F') return 'Elegí el sexo.';
  for (const [campo, [minimo, maximo]] of Object.entries(LIMITES)) {
    const valor = numero(p[campo]);
    if (!Number.isFinite(valor)) return `Completá ${ETIQUETAS[campo]}.`;
    if (valor < minimo || valor > maximo)
      return `Revisá ${ETIQUETAS[campo]}: tiene que estar entre ${minimo} y ${maximo}.`;
  }
  return null;
}

/**
 * @param {Parametros} parametros
 * @returns {Objetivos | null} null si faltan datos o están fuera de rango
 */
export function calcularObjetivos(parametros) {
  if (validarParametros(parametros)) return null;
  const peso = numero(parametros.peso);
  const tmb =
    10 * peso + 6.25 * numero(parametros.altura) - 5 * numero(parametros.edad) + (parametros.sexo === 'M' ? 5 : -161);
  const tdee = tmb * numero(parametros.actividad);
  const kcal = (tdee * numero(parametros.ajuste)) / 100;

  const p = peso * numero(parametros.proteinaGKg);
  const f = (kcal * numero(parametros.grasaPct)) / 100 / 9;
  const restantes = kcal - p * 4 - f * 9;
  const c = Math.max(0, restantes / 4);

  // Los porcentajes se reparten sobre las calorías que de verdad suman los macros
  const calorias = p * 4 + c * 4 + f * 9;
  const pctP = Math.round(((p * 4) / calorias) * 100);
  const pctC = Math.round(((c * 4) / calorias) * 100);

  return {
    tmb: Math.round(tmb),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    p: Math.round(p),
    c: Math.round(c),
    f: Math.round(f),
    porcentajes: { p: pctP, c: pctC, f: 100 - pctP - pctC },
    advertencia:
      restantes < 0 ? 'La proteína y la grasa superan las calorías del objetivo: los carbohidratos quedan en 0.' : null,
  };
}

/**
 * Completa y sanea parámetros que vienen de afuera (localStorage): se quedan solo las claves conocidas, y lo
 * que falta o tiene un tipo raro vuelve al valor inicial. No modifica `dato`.
 * @returns {Parametros}
 */
export function normalizarParametros(dato) {
  const iniciales = parametrosIniciales({});
  if (typeof dato !== 'object' || dato === null || Array.isArray(dato)) return iniciales;
  const esValor = (v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
  return Object.fromEntries(
    Object.entries(iniciales).map(([clave, inicial]) => {
      const valor = dato[clave];
      if (clave === 'sexo') return [clave, valor === 'F' ? 'F' : 'M'];
      // un número o un texto (los formularios lo guardan así); si el inicial es un número y llega un texto
      // que no lo es ("mucha"), vuelve al inicial
      const sirve = esValor(valor) && (typeof inicial === 'string' || Number.isFinite(numero(valor)));
      return [clave, sirve ? valor : inicial];
    }),
  );
}

/** Los parámetros con los que arranca la calculadora de un alumno: el peso y la altura salen de su perfil. */
export function parametrosIniciales(perfil) {
  return {
    sexo: 'M',
    edad: '',
    peso: perfil?.weight_kg ?? '',
    altura: perfil?.height_cm ?? '',
    actividad: 1.55,
    ajuste: 100,
    proteinaGKg: 2.2,
    grasaPct: 25,
  };
}
