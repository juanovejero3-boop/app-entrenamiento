// Plan de entrenamiento (macrociclo): modelo y operaciones puras.
// Las claves del modelo son las del prototipo del entrenador (weeks/days/blocks/exercises)
// para poder portar su pantalla e importar planes armados con él.
//
// Todas las operaciones son inmutables: reciben un plan y devuelven uno nuevo, sin
// modificar el original. Las posiciones (semana, día, bloque, ejercicio) son índices.

/**
 * @typedef {object} Ejercicio
 * @property {string} id
 * @property {string} name
 * @property {string} sets            Series (texto libre: "4", "3-4")
 * @property {string} reps            Repeticiones objetivo (texto libre: "8-10")
 * @property {'RIR'|'RPE'|'%RM'} intensityType
 * @property {string} intensityValue
 * @property {string} tech            Técnica de intensidad (Drop Set, Rest-Pause, ...)
 * @property {string} rest            Descanso ("90s", "2 min")
 * @property {string} notes
 * @property {boolean} isSuperset     Enlazado en superserie con el siguiente
 *
 * @typedef {object} Bloque
 * @property {string} id
 * @property {string} type            Clave de tipo de bloque ('fuerza', 'hipertrofia', ...)
 * @property {Ejercicio[]} exercises
 *
 * @typedef {object} Dia
 * @property {string} id
 * @property {string} name
 * @property {Bloque[]} blocks
 *
 * @typedef {object} Semana
 * @property {string} id
 * @property {string} name
 * @property {string} objective       Fase del macrociclo ('Hipertrofia', 'Descarga / Taper', ...)
 * @property {string} targetVolume    Volumen objetivo en texto libre
 * @property {Dia[]} days
 *
 * @typedef {object} PlanEntrenamiento
 * @property {string} macroName
 * @property {string} startDate       AAAA-MM-DD (vacío si no se definió)
 * @property {{ focus: string, evaluation: string }} report  Foco biomecánico y método de evaluación
 * @property {Semana[]} weeks
 */

const nuevoId = () => crypto.randomUUID();

const copiar = (plan) => structuredClone(plan);

const semanaVacia = (numero) => ({
  id: nuevoId(),
  name: `Semana ${numero}`,
  objective: '',
  targetVolume: '',
  days: [],
});

const diaVacio = (numero) => ({ id: nuevoId(), name: `Día ${numero}`, blocks: [] });

/** @returns {PlanEntrenamiento} */
export function crearPlan({ fechaInicio }) {
  return {
    macroName: 'Nuevo Macrociclo',
    startDate: fechaInicio,
    report: { focus: '', evaluation: '' },
    weeks: [],
  };
}

/** Reemplaza las semanas del plan por `cantSemanas` semanas de `diasPorSemana` días vacíos. */
export function generarEstructura(plan, cantSemanas, diasPorSemana) {
  for (const [nombre, valor] of [
    ['semanas', cantSemanas],
    ['días por semana', diasPorSemana],
  ]) {
    if (!Number.isInteger(valor) || valor < 1) throw new RangeError(`Cantidad de ${nombre} inválida: ${valor}`);
  }
  const nuevo = copiar(plan);
  nuevo.weeks = Array.from({ length: cantSemanas }, (_, w) => ({
    ...semanaVacia(w + 1),
    days: Array.from({ length: diasPorSemana }, (_, d) => diaVacio(d + 1)),
  }));
  return nuevo;
}

export function agregarSemana(plan) {
  const nuevo = copiar(plan);
  nuevo.weeks.push(semanaVacia(nuevo.weeks.length + 1));
  return nuevo;
}

export function agregarDia(plan, w) {
  const nuevo = copiar(plan);
  const dias = nuevo.weeks[w].days;
  dias.push(diaVacio(dias.length + 1));
  return nuevo;
}

export function agregarBloque(plan, w, d) {
  const nuevo = copiar(plan);
  nuevo.weeks[w].days[d].blocks.push({ id: nuevoId(), type: 'fuerza', exercises: [] });
  return nuevo;
}

export function agregarEjercicio(plan, w, d, b) {
  const nuevo = copiar(plan);
  nuevo.weeks[w].days[d].blocks[b].exercises.push({
    id: nuevoId(),
    name: '',
    sets: '',
    reps: '',
    intensityType: 'RIR',
    intensityValue: '',
    tech: '',
    rest: '',
    notes: '',
    isSuperset: false,
  });
  return nuevo;
}

export function eliminarDia(plan, w, d) {
  const nuevo = copiar(plan);
  nuevo.weeks[w].days.splice(d, 1);
  return nuevo;
}

export function eliminarBloque(plan, w, d, b) {
  const nuevo = copiar(plan);
  nuevo.weeks[w].days[d].blocks.splice(b, 1);
  return nuevo;
}

export function eliminarEjercicio(plan, w, d, b, e) {
  const nuevo = copiar(plan);
  nuevo.weeks[w].days[d].blocks[b].exercises.splice(e, 1);
  return nuevo;
}

/** Aplica `cambios` (name, objective, targetVolume) a la semana `w`. */
export function actualizarSemana(plan, w, cambios) {
  const nuevo = copiar(plan);
  Object.assign(nuevo.weeks[w], cambios);
  return nuevo;
}

/** Aplica `cambios` (sets, reps, intensityValue, ...) al ejercicio indicado. */
export function actualizarEjercicio(plan, w, d, b, e, cambios) {
  const nuevo = copiar(plan);
  Object.assign(nuevo.weeks[w].days[d].blocks[b].exercises[e], cambios);
  return nuevo;
}

/**
 * Rango de fechas (dd/mm - dd/mm) de la semana `numeroSemana` (0 = primera) de un plan
 * que arranca en `fechaInicio` (AAAA-MM-DD).
 */
export function fechasDeSemana(fechaInicio, numeroSemana) {
  if (!fechaInicio) return 'Fechas no definidas';
  const partes = fechaInicio.split('-');
  if (partes.length !== 3) return '';
  const inicio = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  inicio.setDate(inicio.getDate() + numeroSemana * 7);
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(inicio)} - ${fmt(fin)}`;
}

/** Total de series de una semana (suma el número inicial del campo `sets` de cada ejercicio). */
export function contarSeries(semana) {
  let total = 0;
  for (const dia of semana.days) {
    for (const bloque of dia.blocks) {
      for (const ejercicio of bloque.exercises) {
        total += parseInt(ejercicio.sets, 10) || 0;
      }
    }
  }
  return total;
}
