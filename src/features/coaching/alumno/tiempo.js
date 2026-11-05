// Reps que son segundos. El coach las anota como 20" (o 30s, 45 seg) y el teclado numérico del celular no tiene
// comillas: por eso, cuando la serie es por tiempo, el alumno escribe solo el número, la unidad se ve aparte
// dentro del campo y al guardar se le agrega (20 → 20"), igual que lo anota el coach.

const UNIDAD = String.raw`(?:["”″]|''|’’|s|seg\w*)`;
const TERMINA_EN_UNIDAD = new RegExp(String.raw`\d\s*${UNIDAD}\s*$`, 'i');
const UNIDAD_AL_FINAL = new RegExp(String.raw`(?<=\d)\s*${UNIDAD}\s*$`, 'i');
const SOLO_NUMERO = /^\d+(?:[.,]\d+)?$/;

/** ¿Las reps que indicó el coach son segundos? (20", 30s, 45 seg, 30-40") */
export const esTiempo = (reps) => TERMINA_EN_UNIDAD.test(String(reps ?? ''));

/** Lo que se guarda cuando el alumno escribe un tiempo: «20» pasa a «20"»; lo que ya trae unidad no se toca. */
export function conUnidadDeTiempo(valor) {
  const texto = String(valor ?? '').trim();
  return SOLO_NUMERO.test(texto) ? `${texto}"` : texto;
}

/** Lo que se muestra dentro del campo: sin la unidad, que se dibuja al lado. */
export const sinUnidadDeTiempo = (valor) => String(valor ?? '').replace(UNIDAD_AL_FINAL, '');
