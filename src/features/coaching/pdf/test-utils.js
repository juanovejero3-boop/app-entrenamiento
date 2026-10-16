// Ayudantes para los tests de los PDF (no se usan en la app).

/** Todo el texto de una definición de documento de pdfmake, unido por espacios. */
export function textoDe(documento) {
  const partes = [];
  (function recorrer(x) {
    if (typeof x === 'string') partes.push(x);
    else if (Array.isArray(x)) x.forEach(recorrer);
    else if (x && typeof x === 'object') {
      for (const [clave, valor] of Object.entries(x)) {
        // propiedades de estilo, no contenido
        if (['color', 'fillColor', 'style', 'alignment', 'font', 'lineColor', 'layout'].includes(clave)) continue;
        recorrer(valor);
      }
    }
  })(documento.content);
  return partes.join(' ');
}

export const ALUMNO = { id: 'u1', name: 'Franco Soria', email: 'franco@ejemplo.com', goal: 'Aumento de masa muscular' };

/** Plan completo: 2 semanas, la 1 con un día con superserie A (2 ejercicios) y un ejercicio suelto. */
export function planCompleto() {
  const ej = (id, name, extra = {}) => ({
    id,
    name,
    sets: '4',
    reps: '8-10',
    intensityType: 'RIR',
    intensityValue: '2',
    tech: '',
    rest: '90s',
    notes: '',
    group: '',
    ...extra,
  });
  return {
    macroName: 'Hipertrofia base',
    startDate: '2026-10-19',
    report: {
      objective: 'Ganar masa muscular en tren superior',
      priorities: [
        { id: 'p1', target: 'Press banca', progression: '+2,5 kg cuando complete 10 reps' },
        { id: 'p2', target: 'Dorsal ancho', progression: 'Sumar una serie cada 2 semanas' },
      ],
      focus: 'Retracción escapular en empujes',
      evaluation: 'Test de 5RM en la semana 4',
      guidelines: 'Dormir 8 horas.\nHidratarse bien.',
    },
    weeks: [
      {
        id: 'w1',
        name: 'Semana 1',
        objective: 'Acumulación',
        targetVolume: 'Pecho 12s, Espalda 14s',
        days: [
          {
            id: 'd1',
            name: 'Lunes - Torso',
            blocks: [
              {
                id: 'b1',
                type: 'fuerza',
                exercises: [
                  ej('e1', 'Press banca', { group: 'A', rest: '2 min' }),
                  ej('e2', 'Remo con barra', { group: 'A', intensityType: 'RPE', intensityValue: '8' }),
                  ej('e3', 'Fondos', { sets: '3', reps: '10', tech: 'Rest-Pause', notes: 'Pausa abajo' }),
                ],
              },
            ],
          },
          { id: 'd2', name: 'Jueves - Pierna', blocks: [] },
        ],
      },
      { id: 'w2', name: 'Semana 2', objective: '', targetVolume: '', days: [] },
    ],
  };
}
