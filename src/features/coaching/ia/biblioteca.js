// La biblioteca de ejercicios del coach, para que la IA sepa con qué ejercicios puede completar un día.
// La base de la app (src/data/exercises.json) mezcla ~4000 ejercicios; los del coach están en español y
// terminan con el músculo trabajado ("Remo con mancuerna - Dorsal"). Esos son los que se le ofrecen a la IA
// (son ~1000, así el pedido es corto) y los que tienen el video de demostración.

/** Sin mayúsculas, acentos ni espacios de más: para comparar nombres sin que importe cómo se escribieron. */
export function normalizarNombre(nombre) {
  return String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const MUSCULOS = [
  'dorsal',
  'cuadriceps',
  'pectoral',
  'gluteo',
  'lumbares',
  'trapecio',
  'deltoides',
  'isquios',
  'triceps',
  'biceps',
  'abdomen',
  'aductores',
  'abductores',
  'oblicuos',
  'gemelos',
  'antebrazo',
  'rotadores',
  'psoas',
  'soleo',
];

/** Nombres de la biblioteca del coach: los que terminan con " - <músculo>". */
export function bibliotecaDelCoach(catalogo) {
  return catalogo
    .map((ejercicio) => ejercicio.n)
    .filter((nombre) => {
      const partes = nombre.split(' - ');
      if (partes.length < 2) return false;
      const musculo = normalizarNombre(partes.at(-1).split(',')[0]);
      return MUSCULOS.some((m) => musculo.startsWith(m));
    });
}

/** Índice nombre normalizado -> nombre oficial, para encontrar un ejercicio aunque lo escriban distinto. */
export function crearIndice(nombres) {
  return new Map(nombres.map((nombre) => [normalizarNombre(nombre), nombre]));
}

let biblioteca = null;

/** La biblioteca del coach (se lee de la base de ejercicios la primera vez). */
export async function cargarBiblioteca() {
  biblioteca ??= bibliotecaDelCoach((await import('../../../data/exercises.json')).default);
  return biblioteca;
}
