// PDF corto de "Objetivos y lineamientos del ciclo" para mandarle al alumno.
// No incluye nada del entrenamiento: solo lo que el entrenador escribió en ese bloque.
import { rangoDelPlan } from '../entrenamiento/plan.js';
import { cajaTexto, celdaNombre, documento, encabezado, tabla, tarjeta, tituloSeccion } from './documento.js';

/** Datos del alumno y del ciclo que comparten los dos PDF. */
export function camposDelCiclo(plan, alumno) {
  const rango = rangoDelPlan(plan);
  const semanas = plan.weeks.length;
  return [
    ['Alumno', alumno.name || alumno.email || 'Alumno'],
    ['Macrociclo', plan.macroName],
    ['Fechas', rango ? `${rango.inicio} – ${rango.fin}` : 'Sin fecha de inicio'],
    ['Duración', `${semanas} ${semanas === 1 ? 'semana' : 'semanas'}`],
  ];
}

/**
 * @param {import('../entrenamiento/plan.js').PlanEntrenamiento} plan
 * @param {{ name?: string, email?: string }} alumno
 * @param {{ fecha: string }} opciones  fecha de emisión (AAAA-MM-DD)
 */
export function docLineamientos(plan, alumno, { fecha }) {
  const { report } = plan;
  const contenido = [...encabezado(fecha), tarjeta(camposDelCiclo(plan, alumno))];

  if (report.objective) contenido.push(tituloSeccion('Objetivo del ciclo'), { text: report.objective });

  const prioridades = report.priorities.filter((p) => p.target || p.progression);
  if (prioridades.length) {
    contenido.push(
      tituloSeccion('Prioridades y progresión'),
      tabla(
        ['Ejercicio / músculo', 'Cómo progresar'],
        prioridades.map((p) => [celdaNombre(p.target || '—'), { text: p.progression || '—' }]),
        [170, '*'],
      ),
    );
  }

  if (report.focus) contenido.push(tituloSeccion('Foco biomecánico'), { text: report.focus });
  if (report.evaluation) contenido.push(tituloSeccion('Método de evaluación'), { text: report.evaluation });
  if (report.guidelines) contenido.push(cajaTexto('Lineamientos generales', report.guidelines));

  return documento(contenido);
}
