import { describe, expect, it } from 'vitest';
import { ALUMNO, textoDe } from '../coaching/pdf/test-utils.js';
import { alimentosIniciales } from './alimentos.js';
import { agregarItem, agregarOpcion, crearComida } from './comidas.js';
import { parametrosIniciales } from './objetivos.js';
import { docPlanDeAlimentacion } from './pdfAlimentacion.js';

const ALIMENTOS = alimentosIniciales();
const alimento = (nombre) => ALIMENTOS.find((a) => a.nombre === nombre);
const POLLO = alimento('Pechuga de Pollo');
const ARROZ = alimento('Arroz Blanco (Cocido)');
const PAN = alimento('Pan Integral');
const PARAMETROS = { ...parametrosIniciales({}), edad: 28, peso: 75, altura: 175 }; // 2649 kcal, P 165, C 332, G 74

function comida(nombre, hora, ...pares) {
  let comidas = [crearComida({ nombre, hora })];
  for (const [a, porciones] of pares)
    comidas = agregarItem(comidas, comidas[0].id, comidas[0].opciones[0].id, a, porciones);
  return comidas[0];
}
const generar = (plan) => textoDe(docPlanDeAlimentacion(plan, ALUMNO, { fecha: '2026-11-05' }));
const planCompleto = () => ({
  parametros: PARAMETROS,
  comidas: [comida('Cena', '21:00', [POLLO, 2]), comida('Desayuno', '08:00', [PAN, 2], [POLLO, 1])],
  notas: 'Tomar 2 litros de agua.',
});

describe('PDF del plan de alimentación', () => {
  it('tiene la marca, la fecha, el alumno y sus objetivos del día', () => {
    const texto = generar(planCompleto());
    for (const esperado of ['RIME', '2026-11-05', 'Franco Soria', '2649', '165', '332', '74']) {
      expect(texto).toContain(esperado);
    }
  });

  it('lista las comidas ordenadas por hora con sus alimentos y cantidades claras', () => {
    const texto = generar(planCompleto());
    expect(texto.indexOf('DESAYUNO')).toBeLessThan(texto.indexOf('CENA'));
    expect(texto).toContain('08:00');
    expect(texto).toContain('Pechuga de Pollo');
    expect(texto).toContain('200 g'); // 2 porciones de 100 g
    expect(texto).toContain('2 × 1 Rebanada');
  });

  it('muestra las opciones de una comida con su número, y las comidas sin alimentos no aparecen', () => {
    const base = comida('Almuerzo', '13:00', [POLLO, 2]);
    const conOpciones = agregarOpcion([base], base.id)[0];
    const segunda = agregarItem([conOpciones], base.id, conOpciones.opciones[1].id, ARROZ, 3)[0];
    const texto = generar({ parametros: PARAMETROS, comidas: [segunda, comida('Vacía', '10:00')], notas: '' });
    expect(texto).toContain('Opción 1');
    expect(texto).toContain('Opción 2');
    expect(texto).toContain('Arroz Blanco (Cocido)');
    expect(texto).not.toMatch(/VAC[ÍI]A/i);
  });

  it('con una sola opción no la numera', () => {
    expect(generar(planCompleto())).not.toContain('Opción 1');
  });

  it('incluye el total del día y las aclaraciones', () => {
    const texto = generar(planCompleto());
    expect(texto).toMatch(/TOTAL DEL D[ÍI]A/i);
    expect(texto).toContain('Tomar 2 litros de agua.');
  });

  it('sin aclaraciones no deja la caja vacía', () => {
    expect(generar({ ...planCompleto(), notas: '  ' })).not.toMatch(/ACLARACIONES/i);
  });

  it('sin parámetros válidos no inventa objetivos', () => {
    const texto = generar({ ...planCompleto(), parametros: { ...PARAMETROS, peso: '' } });
    expect(texto).not.toMatch(/OBJETIVO/i);
    expect(texto).toContain('Pechuga de Pollo');
  });

  it('sin comidas con alimentos avisa que el plan está vacío', () => {
    expect(generar({ parametros: PARAMETROS, comidas: [], notas: '' })).toContain('todavía no tiene comidas');
  });

  it('lleva título y autor en los metadatos', () => {
    const doc = docPlanDeAlimentacion(planCompleto(), ALUMNO, { fecha: '2026-11-05' });
    expect(doc.info).toEqual({ title: 'Plan de alimentación · Franco Soria', author: 'Prime Physique' });
  });
});
