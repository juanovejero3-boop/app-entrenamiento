import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js';
import { mostrarAlumnosDeNutricion } from './alumnos.js';
import { claveDelPlan, crearRepoNutricionLocal } from './repoLocal.js';

const ALDY = { id: 'u1', name: 'Aldy Taranto', email: 'aldy@ejemplo.com', weight_kg: 62, height_cm: 164 };
const SIMON = { id: 'u2', name: 'Simón Álvarez', email: 'simon@ejemplo.com' };
const SIN_NOMBRE = { id: 'u3', name: '', email: 'sin-nombre@ejemplo.com' };

let content;
let almacen;
let repo;
let alumnos;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  repo = crearRepoNutricionLocal(() => almacen);
  alumnos = [ALDY, SIMON, SIN_NOMBRE];
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const abrir = async () => mostrarAlumnosDeNutricion(content, { repo, alumnos });
const nombres = () => $$('[data-click="nutricionAlumno"] [data-nombre]').map((e) => e.textContent.trim());
const toasts = () => [...document.body.querySelectorAll('div.fixed')].map((e) => e.textContent);
const form = () => $('[data-plan-form]').elements;
const planGuardado = (id) => JSON.parse(almacen.datos.get(claveDelPlan(id)));

function escribir(campo, valor) {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Un cambio confirmado (al salir del campo): dispara input y change, como el navegador. */
function cambiar(campo, valor) {
  escribir(campo, valor);
  campo.dispatchEvent(new Event('change', { bubbles: true }));
}
const abrirAlumno = async (alumno = ALDY) => {
  await abrir();
  $(`[data-click="nutricionAlumno"][data-id="${alumno.id}"]`).click();
};
const resultado = (clave) => $(`[data-resultados] [data-${clave}]`)?.textContent.replace(/\s+/g, ' ').trim();

describe('alumnos: buscador', () => {
  it('lista a los alumnos con su nombre y correo', async () => {
    await abrir();
    expect(nombres()).toEqual(['Aldy Taranto', 'Simón Álvarez', 'sin-nombre@ejemplo.com']);
    expect(content.textContent).toContain('aldy@ejemplo.com');
  });

  it('muestra solo los primeros y avisa que hay más para buscar', async () => {
    alumnos = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, name: `Alumno ${i}`, email: `a${i}@ej.com` }));
    await abrir();
    expect($$('[data-click="nutricionAlumno"]')).toHaveLength(8);
    expect(content.textContent).toContain('8 de 12');
  });

  it('filtra por nombre o correo, sin importar mayúsculas ni tildes, sin perder el foco', async () => {
    await abrir();
    const campo = $('[data-alumno-filtro]');
    campo.focus();
    escribir(campo, 'SIMON');
    expect(nombres()).toEqual(['Simón Álvarez']);
    expect($('[data-alumno-filtro]')).toBe(campo);
    expect(document.activeElement).toBe(campo);

    escribir(campo, 'sin-nombre@');
    expect(nombres()).toEqual(['sin-nombre@ejemplo.com']);
  });

  it('el filtro encuentra alumnos que están más allá de los primeros', async () => {
    alumnos = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, name: `Alumno ${i}`, email: `a${i}@ej.com` }));
    await abrir();
    escribir($('[data-alumno-filtro]'), 'Alumno 11');
    expect(nombres()).toEqual(['Alumno 11']);
  });

  it('sin coincidencias lo dice', async () => {
    await abrir();
    escribir($('[data-alumno-filtro]'), 'zzz');
    expect(content.textContent).toContain('Ningún alumno coincide');
  });

  it('sin alumnos lo dice', async () => {
    alumnos = [];
    await abrir();
    expect(content.textContent).toContain('Todavía no hay alumnos');
  });

  it('marca a los que ya tienen un plan guardado', async () => {
    repo.guardarPlan(SIMON.id, { parametros: {} });
    await abrir();
    const fila = (a) => $(`[data-click="nutricionAlumno"][data-id="${a.id}"]`);
    expect(fila(SIMON).textContent).toContain('Con plan');
    expect(fila(ALDY).textContent).not.toContain('Con plan');
  });

  it('escapa el HTML de los nombres', async () => {
    alumnos = [{ id: 'x', name: '<img src=x onerror=alert(1)>', email: 'x@ej.com' }];
    await abrir();
    expect($('img')).toBeNull();
  });
});

describe('alumnos: la calculadora', () => {
  it('abre al alumno con su peso y altura del perfil, y la edad vacía para que la cargue el coach', async () => {
    await abrirAlumno();
    expect(content.textContent).toContain('Aldy Taranto');
    expect(form().peso.value).toBe('62');
    expect(form().altura.value).toBe('164');
    expect(form().edad.value).toBe('');
    expect($('[data-alumno-filtro]')).toBeNull(); // ya no está el buscador
  });

  it('mientras falte un dato no inventa números: pide el que falta', async () => {
    await abrirAlumno();
    expect($('[data-parametros-error]').textContent).toMatch(/edad/i);
    expect(resultado('kcal')).toBeUndefined();
  });

  it('al completar la edad calcula las calorías y los macros al instante', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '75');
    escribir(form().altura, '175');

    expect($('[data-parametros-error]')).toBeNull();
    expect(resultado('kcal')).toContain('2649');
    expect(resultado('tdee')).toContain('2649');
    expect(resultado('tmb')).toContain('1709');
    expect(resultado('macro-p')).toContain('165 g');
    expect(resultado('macro-c')).toContain('332 g');
    expect(resultado('macro-f')).toContain('74 g');
    expect(resultado('macro-p')).toContain('25%');
    expect(resultado('macro-c')).toContain('50%');
  });

  it('seguir escribiendo no redibuja el formulario (el campo conserva el foco)', async () => {
    await abrirAlumno();
    const edad = form().edad;
    edad.focus();
    escribir(edad, '3');
    escribir(edad, '30');
    expect(form().edad).toBe(edad);
    expect(document.activeElement).toBe(edad);
  });

  it('el ajuste calórico muestra si es mantenimiento, déficit o superávit, y cambia las calorías', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '75');
    escribir(form().altura, '175');
    expect($('[data-ajuste-etiqueta]').textContent).toContain('Mantenimiento (100%)');

    escribir(form().ajuste, '85');
    expect($('[data-ajuste-etiqueta]').textContent).toContain('Déficit (85%)');
    expect(resultado('kcal')).toContain('2251');
    expect(resultado('tdee')).toContain('2649'); // el gasto no cambia

    escribir(form().ajuste, '115');
    expect($('[data-ajuste-etiqueta]').textContent).toContain('Superávit (115%)');
  });

  it('el porcentaje de grasa es editable y mueve los macros', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '75');
    escribir(form().altura, '175');
    escribir(form().grasaPct, '35');
    expect(resultado('macro-f')).toContain('35%');
    expect(resultado('macro-c')).toContain('40%');
  });

  it('el sexo y la actividad cambian el gasto', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '75');
    escribir(form().altura, '175');
    const hombre = resultado('tdee');
    escribir(form().sexo, 'F');
    expect(resultado('tdee')).not.toBe(hombre);
    const moderada = resultado('tdee');
    escribir(form().actividad, '1.9');
    expect(resultado('tdee')).not.toBe(moderada);
  });

  it('avisa cuando proteína y grasa superan las calorías', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '120');
    escribir(form().altura, '175');
    escribir(form().proteinaGKg, '4');
    escribir(form().ajuste, '65');
    escribir(form().grasaPct, '45');
    expect($('[data-advertencia]').textContent).toMatch(/superan/i);
  });

  it('un valor fuera de rango muestra el error en vez de calcular', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '10');
    escribir(form().altura, '175');
    expect($('[data-parametros-error]').textContent).toMatch(/peso/i);
    expect(resultado('kcal')).toBeUndefined();
  });

  it('un nombre con HTML no se interpreta', async () => {
    alumnos = [{ id: 'x', name: '<img src=x onerror=alert(1)>', email: 'x@ej.com' }];
    await abrirAlumno({ id: 'x' });
    expect($('img')).toBeNull();
  });
});

describe('alumnos: se guarda en el navegador', () => {
  it('al confirmar un cambio guarda el plan del alumno, y al volver a abrirlo está todo', async () => {
    await abrirAlumno(SIMON);
    cambiar(form().edad, '28');
    cambiar(form().peso, '75');
    cambiar(form().altura, '175');
    cambiar(form().ajuste, '90');

    expect(planGuardado(SIMON.id).parametros).toMatchObject({ edad: '28', peso: '75', ajuste: '90' });

    $('[data-click="nutricionVolverAlumnos"]').click();
    $(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).click();
    expect(form().edad.value).toBe('28');
    expect(form().ajuste.value).toBe('90');
    expect(resultado('kcal')).toBeTruthy();
  });

  it('mientras se escribe no guarda en cada tecla: guarda al confirmar', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    expect(almacen.datos.has(claveDelPlan(SIMON.id))).toBe(false);
    form().edad.dispatchEvent(new Event('change', { bubbles: true }));
    expect(almacen.datos.has(claveDelPlan(SIMON.id))).toBe(true);
  });

  it('cada alumno tiene su plan', async () => {
    await abrirAlumno(SIMON);
    cambiar(form().edad, '28');
    $('[data-click="nutricionVolverAlumnos"]').click();
    $(`[data-click="nutricionAlumno"][data-id="${ALDY.id}"]`).click();
    expect(form().edad.value).toBe('');
    expect(form().peso.value).toBe('62');
  });

  it('al volver al buscador el alumno aparece marcado con plan', async () => {
    await abrirAlumno(SIMON);
    cambiar(form().edad, '28');
    $('[data-click="nutricionVolverAlumnos"]').click();
    expect($(`[data-click="nutricionAlumno"][data-id="${SIMON.id}"]`).textContent).toContain('Con plan');
  });

  it('si el navegador no deja guardar lo avisa', async () => {
    await abrirAlumno(SIMON);
    almacen.setItem = () => {
      throw new Error('sin espacio');
    };
    cambiar(form().edad, '28');
    expect(toasts().join()).toMatch(/no se pudo guardar/i);
  });
});

describe('alumnos: secciones plegables', () => {
  const cuerpo = (id) => $(`[data-seccion="${id}"] [data-seccion-cuerpo]`);
  const boton = (id) => $(`[data-seccion="${id}"] [data-click="nutricionSeccion"]`);

  it('los parámetros y los objetivos se pueden plegar y abrir', async () => {
    await abrirAlumno();
    expect(cuerpo('parametros').hidden).toBe(false);
    boton('parametros').click();
    expect(cuerpo('parametros').hidden).toBe(true);
    expect(boton('parametros').getAttribute('aria-expanded')).toBe('false');
    expect(cuerpo('objetivos').hidden).toBe(false); // la otra no se toca
    boton('parametros').click();
    expect(cuerpo('parametros').hidden).toBe(false);
  });

  it('plegar no pierde lo escrito ni los resultados', async () => {
    await abrirAlumno(SIMON);
    escribir(form().edad, '28');
    escribir(form().peso, '75');
    escribir(form().altura, '175');
    boton('parametros').click();
    boton('parametros').click();
    expect(form().edad.value).toBe('28');
    expect(resultado('kcal')).toContain('2649');
  });
});
