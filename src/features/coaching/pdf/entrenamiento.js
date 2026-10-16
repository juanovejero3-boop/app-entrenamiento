// PDF con todo el entrenamiento del ciclo, para el alumno que prefiera tenerlo en papel o como
// respaldo: mapa del macrociclo y, por semana, cada día con sus ejercicios.
import { TIPOS_BLOQUE, GRUPOS_SUPERSERIE } from '../entrenamiento/catalogos.js';
import { contarSeries, etiquetasSuperserie, fechasDeSemana } from '../entrenamiento/plan.js';
import {
  COLOR,
  barra,
  celdaNombre,
  celdaValor,
  documento,
  encabezado,
  tabla,
  tarjeta,
  textoVacio,
  tituloSeccion,
} from './documento.js';
import { camposDelCiclo } from './lineamientos.js';

const guion = (texto) => texto || '—';

function mapaDelCiclo(plan) {
  return tabla(
    ['Semana', 'Fechas', 'Fase', 'Volumen objetivo', 'Series'],
    plan.weeks.map((semana, w) => [
      { text: semana.name, bold: true },
      { text: fechasDeSemana(plan.startDate, w) || '—', alignment: 'center' },
      { text: guion(semana.objective), alignment: 'center' },
      { text: guion(semana.targetVolume), alignment: 'center' },
      celdaValor(contarSeries(semana)),
    ]),
    ['auto', 'auto', '*', '*', 'auto'],
  );
}

function tablaDelBloque(bloque) {
  const etiquetas = etiquetasSuperserie(bloque);
  return tabla(
    ['', 'Ejercicio', 'Series', 'Reps', 'Intensidad', 'Descanso'],
    bloque.exercises.map((ej, e) => {
      const detalle = [ej.tech, ej.notes].filter(Boolean).join(' · ');
      const intensidad = ej.intensityValue ? `${ej.intensityType} ${ej.intensityValue}` : '—';
      return [
        { text: etiquetas[e], bold: true, color: GRUPOS_SUPERSERIE[ej.group] ?? COLOR.gris, alignment: 'center' },
        celdaNombre(ej.name || 'Ejercicio', detalle),
        celdaValor(guion(ej.sets)),
        celdaValor(guion(ej.reps)),
        { text: intensidad, alignment: 'center' },
        { text: guion(ej.rest), alignment: 'center' },
      ];
    }),
    [22, '*', 40, 48, 58, 52],
  );
}

function dia(diaPlan) {
  const bloques = diaPlan.blocks.filter((b) => b.exercises.length);
  if (!bloques.length) return [barra(diaPlan.name), textoVacio('Sin ejercicios cargados.')];
  return [
    barra(diaPlan.name),
    ...bloques.flatMap((bloque) => {
      const tipo = TIPOS_BLOQUE[bloque.type] ?? { label: bloque.type, color: COLOR.gris };
      return [
        { text: tipo.label.toUpperCase(), color: tipo.color, bold: true, fontSize: 8, margin: [0, 4, 0, 2] },
        tablaDelBloque(bloque),
      ];
    }),
  ];
}

/**
 * @param {import('../entrenamiento/plan.js').PlanEntrenamiento} plan
 * @param {{ name?: string, email?: string }} alumno
 * @param {{ fecha: string }} opciones  fecha de emisión (AAAA-MM-DD)
 */
export function docEntrenamiento(plan, alumno, { fecha }) {
  const contenido = [...encabezado(fecha), tarjeta(camposDelCiclo(plan, alumno))];

  if (plan.weeks.length) contenido.push(tituloSeccion('Mapa del macrociclo'), mapaDelCiclo(plan));
  else contenido.push(textoVacio('Este plan todavía no tiene semanas.'));

  plan.weeks.forEach((semana, w) => {
    const fechas = fechasDeSemana(plan.startDate, w);
    const titulo = [semana.name, plan.startDate ? fechas : ''].filter(Boolean).join(' · ');
    // La primera semana sigue debajo del mapa; las demás arrancan en página nueva (cómodo para imprimir)
    contenido.push(tituloSeccion(titulo, w > 0 ? { pageBreak: 'before' } : {}));
    if (semana.objective || semana.targetVolume) {
      contenido.push({
        text: [
          semana.objective && `Fase: ${semana.objective}`,
          semana.targetVolume && `Volumen: ${semana.targetVolume}`,
        ]
          .filter(Boolean)
          .join('   ·   '),
        color: COLOR.gris,
        margin: [0, 0, 0, 4],
      });
    }
    if (!semana.days.length) contenido.push(textoVacio('Sin días cargados.'));
    semana.days.forEach((d) => contenido.push(...dia(d)));
  });

  return documento(contenido);
}
