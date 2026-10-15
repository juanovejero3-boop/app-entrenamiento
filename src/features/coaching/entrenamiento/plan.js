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

export function eliminarSemana(plan, w) {
  const nuevo = copiar(plan);
  nuevo.weeks.splice(w, 1);
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

/** Aplica `cambios` (name) al día indicado. */
export function actualizarDia(plan, w, d, cambios) {
  const nuevo = copiar(plan);
  Object.assign(nuevo.weeks[w].days[d], cambios);
  return nuevo;
}

/** Aplica `cambios` (type) al bloque indicado. */
export function actualizarBloque(plan, w, d, b, cambios) {
  const nuevo = copiar(plan);
  Object.assign(nuevo.weeks[w].days[d].blocks[b], cambios);
  return nuevo;
}

/** Copia profunda de un día, bloque o ejercicio con ids nuevos en todos sus niveles. */
function conIdsNuevos(x) {
  const copia = structuredClone(x);
  (function renovar(nodo) {
    nodo.id = nuevoId();
    for (const hijo of nodo.days ?? nodo.blocks ?? nodo.exercises ?? []) renovar(hijo);
  })(copia);
  return copia;
}

/** Completa con días vacíos ("Día N") hasta que exista la posición `d`. */
function asegurarDia(semana, d) {
  while (semana.days.length <= d) semana.days.push(diaVacio(semana.days.length + 1));
}

/**
 * Inserta una copia de la semana `w` justo después, llamada "<nombre> (copia)".
 * No renumera: el entrenador le pone el nombre que quiera.
 */
export function duplicarSemana(plan, w) {
  const nuevo = copiar(plan);
  const original = nuevo.weeks[w];
  const copia = conIdsNuevos(original);
  copia.name = `${original.name} (copia)`;
  nuevo.weeks.splice(w + 1, 0, copia);
  return nuevo;
}

/** Copia el día `d` de la semana `w` a la misma posición de todas las semanas siguientes. */
export function propagarDia(plan, w, d) {
  const nuevo = copiar(plan);
  const dia = nuevo.weeks[w].days[d];
  for (const semana of nuevo.weeks.slice(w + 1)) {
    asegurarDia(semana, d);
    semana.days[d] = conIdsNuevos(dia);
  }
  return nuevo;
}

/**
 * Agrega una copia del ejercicio al mismo día y bloque de todas las semanas siguientes.
 * Si faltan días o bloques los crea (los bloques nuevos toman el tipo del bloque de origen).
 */
export function propagarEjercicio(plan, w, d, b, e) {
  const nuevo = copiar(plan);
  const bloqueOrigen = nuevo.weeks[w].days[d].blocks[b];
  const ejercicio = bloqueOrigen.exercises[e];
  for (const semana of nuevo.weeks.slice(w + 1)) {
    asegurarDia(semana, d);
    const bloques = semana.days[d].blocks;
    while (bloques.length <= b) bloques.push({ id: nuevoId(), type: bloqueOrigen.type, exercises: [] });
    bloques[b].exercises.push(conIdsNuevos(ejercicio));
  }
  return nuevo;
}

const TIPOS_INTENSIDAD = ['RIR', 'RPE', '%RM'];
const texto = (v) => (v === undefined || v === null ? '' : String(v));
const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida y completa un plan que viene de afuera (localStorage, un JSON importado o el
 * prototipo del entrenador). Devuelve un plan nuevo con todos los campos; no modifica `dato`.
 * - ids: los numéricos pasan a texto; los faltantes o repetidos se reemplazan.
 * - días y bloques null (huecos) se reemplazan por vacíos para no correr las posiciones.
 * - ejercicios null se descartan; el campo viejo `intensity` pasa a `intensityValue`.
 * @returns {PlanEntrenamiento}
 */
export function normalizarPlan(dato) {
  if (!esObjeto(dato)) throw new TypeError('El plan debe ser un objeto');
  if (dato.weeks !== undefined && !Array.isArray(dato.weeks)) throw new TypeError('weeks debe ser una lista');

  const usados = new Set();
  const id = (v) => {
    const candidato = v === undefined || v === null || v === '' ? '' : String(v);
    const final = candidato && !usados.has(candidato) ? candidato : nuevoId();
    usados.add(final);
    return final;
  };

  const ejercicio = (e) => ({
    id: id(e.id),
    name: texto(e.name),
    sets: texto(e.sets),
    reps: texto(e.reps),
    intensityType: TIPOS_INTENSIDAD.includes(e.intensityType) ? e.intensityType : 'RIR',
    intensityValue: texto(e.intensityValue ?? e.intensity),
    tech: texto(e.tech),
    rest: texto(e.rest),
    notes: texto(e.notes),
    isSuperset: Boolean(e.isSuperset),
  });

  const bloque = (b) => {
    const x = esObjeto(b) ? b : {};
    return {
      id: id(x.id),
      type: texto(x.type) || 'fuerza',
      exercises: (Array.isArray(x.exercises) ? x.exercises : []).filter(esObjeto).map(ejercicio),
    };
  };

  const dia = (d, i) => {
    const x = esObjeto(d) ? d : {};
    return {
      id: id(x.id),
      name: texto(x.name) || `Día ${i + 1}`,
      blocks: (Array.isArray(x.blocks) ? x.blocks : []).map(bloque),
    };
  };

  const semana = (w, i) => {
    const x = esObjeto(w) ? w : {};
    return {
      id: id(x.id),
      name: texto(x.name) || `Semana ${i + 1}`,
      objective: texto(x.objective),
      targetVolume: texto(x.targetVolume),
      days: (Array.isArray(x.days) ? x.days : []).map(dia),
    };
  };

  const report = esObjeto(dato.report) ? dato.report : {};
  return {
    macroName: texto(dato.macroName) || 'Nuevo Macrociclo',
    startDate: texto(dato.startDate),
    report: { focus: texto(report.focus), evaluation: texto(report.evaluation) },
    weeks: (dato.weeks ?? []).map(semana),
  };
}
