import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asentar } from '../../test-helpers.js';
import '../../lib/ui.js';
import { mostrarAlumnosDeNutricion } from './alumnos.js';
import { crearComida } from './comidas.js';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { crearRepoNutricionLocal } from './repoLocal.js';
import { crearRepoNutricion } from './repoNutricion.js';

const SIMON = { id: 'u2', name: 'Simón Álvarez', email: 'simon@ejemplo.com' };
const PARAMETROS = {
  sexo: 'M',
  edad: 28,
  peso: 75,
  altura: 175,
  actividad: 1.55,
  ajuste: 100,
  proteinaGKg: 2.2,
  grasaPct: 25,
};

let content;
let almacen;
let cliente;
let repo;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  cliente = crearClienteFalso();
  repo = crearRepoNutricion(
    cliente,
    crearRepoNutricionLocal(() => almacen),
  );
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const toasts = () => [...document.body.querySelectorAll('div.fixed')].map((e) => e.textContent);
const form = () => $('[data-plan-form]').elements;
/** Lo que quedó guardado en la cuenta del coach para ese alumno (espera a que termine de guardarse). */
const planGuardado = async (id) => {
  await asentar();
  const fila = cliente.tablas.nutrition_plans.find((f) => f.student_id === id);
  return fila && { parametros: fila.parametros, comidas: fila.comidas, notas: fila.notas };
};
const escribir = (campo, valor) => {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
};
const completar = () => {
  escribir(form().edad, '28');
  escribir(form().peso, '75');
  escribir(form().altura, '175');
};
const comidaConPollo = (nombre, hora, porciones) => {
  const c = crearComida({ nombre, hora });
  c.opciones[0].items = [
    { id: `i-${nombre}`, categoria: 'proteins', nombre: 'Pechuga de Pollo', porcion: '100g', porciones },
  ];
  return c;
};
const sugerencia = (avisos = []) => ({
  comidas: [comidaConPollo('Cena', '21:00', 3), comidaConPollo('Desayuno', '08:00', 2)],
  avisos,
});

describe('ficha: sugerir comidas con IA', () => {
  let sugerir;
  const abrir = async (extra = {}) => {
    sugerir = vi.fn(async () => sugerencia());
    await mostrarAlumnosDeNutricion(content, { repo, alumnos: [SIMON], sugerir, ...extra });
    $(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).click();
    await asentar();
  };
  const pedir = async () => {
    $('[data-click="nutricionIASugerir"]').click();
    await vi.waitFor(() => expect($('[data-ia-sugerencia]')).not.toBeNull());
  };

  it('es una sección plegable, cerrada al principio, con 4 comidas y 2 opciones por defecto', async () => {
    await abrir();
    expect($('[data-seccion="ia"] [data-seccion-cuerpo]').hidden).toBe(true);
    expect($('[data-ia-comidas]').value).toBe('4');
    expect($('[data-ia-opciones]').value).toBe('2');
  });

  it('sin los datos para calcular objetivos no llama a la IA y avisa', async () => {
    await abrir();
    $('[data-click="nutricionIASugerir"]').click();
    expect(sugerir).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toMatch(/parámetros/i);
  });

  it('manda a la IA los objetivos calculados, la cantidad de comidas y de opciones y las indicaciones', async () => {
    await abrir();
    completar();
    $('[data-ia-comidas]').value = '5';
    $('[data-ia-opciones]').value = '3';
    escribir($('[data-ia-indicaciones]'), 'Entrena a las 18 hs');
    await pedir();
    expect(sugerir).toHaveBeenCalledTimes(1);
    const datos = sugerir.mock.calls[0][0];
    expect(datos.objetivos).toEqual({ kcal: 2649, p: 165, c: 332, f: 74 });
    expect(datos).toMatchObject({ cantidadComidas: 5, cantidadOpciones: 3, indicaciones: 'Entrena a las 18 hs' });
    expect(datos.alimentos.length).toBeGreaterThan(10);
  });

  it('muestra una vista previa ordenada por hora, con el total del día, y no guarda nada todavía', async () => {
    await abrir();
    completar();
    await pedir();
    expect($$('[data-ia-comida-nombre]').map((e) => e.textContent)).toEqual(['Desayuno', 'Cena']);
    expect($$('[data-ia-alimento]')[0].textContent).toContain('200 g');
    expect($('[data-ia-total]').textContent).toContain('600 kcal'); // 5 porciones de pollo
    expect(await repo.cargarPlan(SIMON.id)).toBeNull();
  });

  it('muestra los avisos de la IA (alimentos omitidos)', async () => {
    await abrir();
    completar();
    sugerir.mockResolvedValue(sugerencia(['«Sushi» no está en tu biblioteca y se omitió.']));
    await pedir();
    expect($('[data-ia-avisos]').textContent).toContain('Sushi');
  });

  it('aplicar guarda las comidas en el plan y las muestra en la ficha', async () => {
    await abrir();
    completar();
    await pedir();
    $('[data-click="nutricionIAAplicar"]').click();
    expect((await planGuardado(SIMON.id)).comidas.map((c) => c.nombre)).toEqual(['Cena', 'Desayuno']);
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(content.textContent).toContain('Desayuno');
    expect(toasts().join(' ')).toContain('Comidas aplicadas');
  });

  it('descartar no guarda nada', async () => {
    await abrir();
    completar();
    await pedir();
    $('[data-click="nutricionIADescartar"]').click();
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(await repo.cargarPlan(SIMON.id)).toBeNull();
  });

  it('si el alumno ya tiene comidas avisa que aplicar las reemplaza', async () => {
    await repo.guardarPlan(SIMON.id, {
      parametros: PARAMETROS,
      comidas: [crearComida({ nombre: 'Vieja', hora: '09:00' })],
      notas: '',
    });
    await abrir();
    await pedir();
    expect($('[data-ia-reemplaza]').textContent).toContain('1 comida');
  });

  it('si la IA falla muestra el mensaje y no deja nada a medias', async () => {
    await abrir();
    completar();
    sugerir.mockRejectedValue(new Error('La IA tiene mucha demanda'));
    $('[data-click="nutricionIASugerir"]').click();
    await vi.waitFor(() => expect(toasts().join(' ')).toContain('La IA tiene mucha demanda'));
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(document.getElementById('app-processing')?.style.display).not.toBe('flex');
  });

  it('el nombre de la comida y los avisos se muestran como texto, no como HTML', async () => {
    await abrir();
    completar();
    const malo = sugerencia(['<img src=x onerror=alert(1)>']);
    malo.comidas[0].nombre = '<b id="x">Cena</b>';
    sugerir.mockResolvedValue(malo);
    await pedir();
    expect($('#x')).toBeNull();
    expect($('[data-ia-avisos] img')).toBeNull();
  });
});

describe('ficha: PDF del plan', () => {
  const abrir = async (pdf) => {
    await mostrarAlumnosDeNutricion(content, { repo, alumnos: [SIMON], pdf });
    $(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).click();
    await asentar();
  };

  it('baja el plan guardado del alumno en PDF', async () => {
    const pdf = vi.fn();
    await repo.guardarPlan(SIMON.id, {
      parametros: PARAMETROS,
      comidas: [comidaConPollo('Almuerzo', '13:00', 2)],
      notas: 'Agua.',
    });
    await abrir(pdf);
    $('[data-click="nutricionPdf"]').click();
    await asentar();
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(pdf.mock.calls[0][0].comidas[0].nombre).toBe('Almuerzo');
    expect(pdf.mock.calls[0][1]).toEqual(SIMON);
  });

  it('sin comidas con alimentos avisa en vez de generar un PDF vacío', async () => {
    const pdf = vi.fn();
    await abrir(pdf);
    $('[data-click="nutricionPdf"]').click();
    await asentar();
    expect(pdf).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toMatch(/al menos una comida/i);
  });
});
