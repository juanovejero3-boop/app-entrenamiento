import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js';
import { mostrarAlumnosDeNutricion } from './alumnos.js';
import { crearComida } from './comidas.js';
import { claveDelPlan, crearRepoNutricionLocal } from './repoLocal.js';

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
let repo;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  repo = crearRepoNutricionLocal(() => almacen);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const toasts = () => [...document.body.querySelectorAll('div.fixed')].map((e) => e.textContent);
const form = () => $('[data-plan-form]').elements;
const planGuardado = (id) => JSON.parse(almacen.datos.get(claveDelPlan(id)));
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
  const abrir = (extra = {}) => {
    sugerir = vi.fn(async () => sugerencia());
    mostrarAlumnosDeNutricion(content, { repo, alumnos: [SIMON], sugerir, ...extra });
    $(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).click();
  };
  const pedir = async () => {
    $('[data-click="nutricionIASugerir"]').click();
    await vi.waitFor(() => expect($('[data-ia-sugerencia]')).not.toBeNull());
  };

  it('es una sección plegable, cerrada al principio, con 4 comidas y 2 opciones por defecto', () => {
    abrir();
    expect($('[data-seccion="ia"] [data-seccion-cuerpo]').hidden).toBe(true);
    expect($('[data-ia-comidas]').value).toBe('4');
    expect($('[data-ia-opciones]').value).toBe('2');
  });

  it('sin los datos para calcular objetivos no llama a la IA y avisa', () => {
    abrir();
    $('[data-click="nutricionIASugerir"]').click();
    expect(sugerir).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toMatch(/parámetros/i);
  });

  it('manda a la IA los objetivos calculados, la cantidad de comidas y de opciones y las indicaciones', async () => {
    abrir();
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
    abrir();
    completar();
    await pedir();
    expect($$('[data-ia-comida-nombre]').map((e) => e.textContent)).toEqual(['Desayuno', 'Cena']);
    expect($$('[data-ia-alimento]')[0].textContent).toContain('200 g');
    expect($('[data-ia-total]').textContent).toContain('600 kcal'); // 5 porciones de pollo
    expect(repo.cargarPlan(SIMON.id)).toBeNull();
  });

  it('muestra los avisos de la IA (alimentos omitidos)', async () => {
    abrir();
    completar();
    sugerir.mockResolvedValue(sugerencia(['«Sushi» no está en tu biblioteca y se omitió.']));
    await pedir();
    expect($('[data-ia-avisos]').textContent).toContain('Sushi');
  });

  it('aplicar guarda las comidas en el plan y las muestra en la ficha', async () => {
    abrir();
    completar();
    await pedir();
    $('[data-click="nutricionIAAplicar"]').click();
    expect(planGuardado(SIMON.id).comidas.map((c) => c.nombre)).toEqual(['Cena', 'Desayuno']);
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(content.textContent).toContain('Desayuno');
    expect(toasts().join(' ')).toContain('Comidas aplicadas');
  });

  it('descartar no guarda nada', async () => {
    abrir();
    completar();
    await pedir();
    $('[data-click="nutricionIADescartar"]').click();
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(repo.cargarPlan(SIMON.id)).toBeNull();
  });

  it('si el alumno ya tiene comidas avisa que aplicar las reemplaza', async () => {
    repo.guardarPlan(SIMON.id, {
      parametros: PARAMETROS,
      comidas: [crearComida({ nombre: 'Vieja', hora: '09:00' })],
      notas: '',
    });
    abrir();
    await pedir();
    expect($('[data-ia-reemplaza]').textContent).toContain('1 comida');
  });

  it('si la IA falla muestra el mensaje y no deja nada a medias', async () => {
    abrir();
    completar();
    sugerir.mockRejectedValue(new Error('La IA tiene mucha demanda'));
    $('[data-click="nutricionIASugerir"]').click();
    await vi.waitFor(() => expect(toasts().join(' ')).toContain('La IA tiene mucha demanda'));
    expect($('[data-ia-sugerencia]')).toBeNull();
    expect(document.getElementById('app-processing')?.style.display).not.toBe('flex');
  });

  it('el nombre de la comida y los avisos se muestran como texto, no como HTML', async () => {
    abrir();
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
  const abrir = (pdf) => {
    mostrarAlumnosDeNutricion(content, { repo, alumnos: [SIMON], pdf });
    $(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).click();
  };

  it('baja el plan guardado del alumno en PDF', () => {
    const pdf = vi.fn();
    repo.guardarPlan(SIMON.id, {
      parametros: PARAMETROS,
      comidas: [comidaConPollo('Almuerzo', '13:00', 2)],
      notas: 'Agua.',
    });
    abrir(pdf);
    $('[data-click="nutricionPdf"]').click();
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(pdf.mock.calls[0][0].comidas[0].nombre).toBe('Almuerzo');
    expect(pdf.mock.calls[0][1]).toEqual(SIMON);
  });

  it('sin comidas con alimentos avisa en vez de generar un PDF vacío', () => {
    const pdf = vi.fn();
    abrir(pdf);
    $('[data-click="nutricionPdf"]').click();
    expect(pdf).not.toHaveBeenCalled();
    expect(toasts().join(' ')).toMatch(/al menos una comida/i);
  });
});
