// Opciones fijas del constructor de entrenamiento (tomadas del prototipo del entrenador).

/** Fases que se le pueden asignar a una semana del macrociclo. */
export const FASES = [
  'Adaptación Anatómica',
  'Acumulación',
  'Hipertrofia',
  'Fuerza Máxima',
  'Potencia',
  'Intensificación',
  'Peaking',
  'Descarga / Taper',
  'Transición',
];

/** Tipos de bloque de un día, con su color en el constructor. */
export const TIPOS_BLOQUE = {
  fuerza: { label: 'Fuerza Máxima', color: '#e74c3c' },
  hipertrofia: { label: 'Hipertrofia', color: '#f39c12' },
  acondicionamiento: { label: 'Acondicionamiento', color: '#27ae60' },
  activacion: { label: 'Activación / Movilidad', color: '#3498db' },
};

export const TIPOS_INTENSIDAD = ['RIR', 'RPE', '%RM'];

/** Técnicas de intensidad ('' = ninguna). */
export const TECNICAS = [
  '',
  'Drop Set',
  'Rest-Pause',
  'Myo-Reps',
  'Cluster',
  'Fallo Muscular',
  'Isométrica',
  'Excéntrica Lenta',
  'Tempo Contrast',
];

export const DESCANSOS = [
  'Sin descanso',
  '30s',
  '45s',
  '60s',
  '90s',
  '2 min',
  '3 min',
  '4 min',
  '5 min',
  'Autoregulado',
];
