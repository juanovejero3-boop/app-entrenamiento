import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { guardarRegistroDe, registroDe, sembrarPlan } from '../repo/test-utils.js';
import { abrirPlanAlumno } from './planAlumno.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn(async () => new Blob(['%PDF-1.7'])) }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn(async () => {}) }));

// El plan de prueba trae la superserie A (Press banca + Remo con barra, 4 series cada uno) y Fondos suelto (3 series)
let content;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const esperar = () => new Promise((r) => setTimeout(r, 0));
const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const abrir = async (plan = planCompleto(), opciones = {}) => {
  await sembrarPlan(ALUMNO.id, plan);
  await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20', ...opciones });
};
const tarjeta = () => $('[data-superserie="A"]');
const cabecera = () => tarjeta().querySelector('[data-click="alumnoEjercicio"]');
const cuerpo = () => tarjeta().querySelector('[data-ej-cuerpo]');
const ronda = (n) => $(`[data-ronda="${n}"]`);
const campo = (ejercicio, serie, nombre) =>
  $(`[data-change="alumnoSerie"][data-e="${ejercicio}"][data-n="${serie}"][data-campo="${nombre}"]`);
const check = (ejercicio, serie) => $(`[data-click="alumnoCheck"][data-e="${ejercicio}"][data-n="${serie}"]`);
const omitir = (ejercicio, serie) => $(`[data-click="alumnoOmitir"][data-e="${ejercicio}"][data-n="${serie}"]`);
const hecha = (kg = '50') => ({ kg, reps: '8', done: true, skipped: false });

describe('superseries: una sola tarjeta', () => {
  it('los ejercicios de una superserie van juntos en una tarjeta y el suelto sigue en la suya', async () => {
    await abrir();
    expect($$('[data-superserie]')).toHaveLength(1);
    expect($('[data-ejercicio="e1"]')).toBeNull();
    expect($('[data-ejercicio="e2"]')).toBeNull();
    expect($('[data-ejercicio="e3"]')).not.toBeNull();
    expect(tarjeta().dataset.ids).toBe('e1 e2');
  });

  it('el título dice cuántas rondas son', async () => {
    await abrir();
    expect(texto(cabecera())).toContain('Superserie · 4 rondas');
  });

  it('con una sola ronda lo dice en singular', async () => {
    const plan = planCompleto();
    for (const ej of plan.weeks[0].days[0].blocks[0].exercises) if (ej.group) ej.sets = '1';
    await abrir(plan);
    expect(texto(cabecera())).toContain('Superserie · 1 ronda');
  });

  it('arriba se ven siempre los ejercicios que la forman, con su nombre y sus datos, aunque esté plegada', async () => {
    await abrir();
    expect(cuerpo().hidden).toBe(true);
    const leyenda = $$('[data-ss-ejercicio]').map((e) => texto(e));
    expect(leyenda).toHaveLength(2);
    expect(leyenda[0]).toContain('Press banca');
    expect(leyenda[0]).toContain('Reps 8-10');
    expect(leyenda[0]).toContain('Descanso 2 min');
    expect(leyenda[1]).toContain('Remo con barra');
    expect(leyenda[1]).toContain('RPE 8');
  });

  it('no usa códigos como A1 o A2: los ejercicios se identifican por su nombre y su color', async () => {
    await abrir();
    cabecera().click();
    expect(texto(tarjeta())).not.toMatch(/\bA[12]\b/);
    expect(tarjeta().querySelector('[data-etiqueta]')).toBeNull();
  });

  it('tocar el nombre de un ejercicio de la leyenda despliega la superserie, y volver a tocarlo la pliega', async () => {
    await abrir();
    const nombre = $('[data-ss-ejercicio="e2"] [data-click="alumnoEjercicio"]');
    nombre.click();
    expect(cuerpo().hidden).toBe(false);
    expect(cabecera().getAttribute('aria-expanded')).toBe('true');
    $('[data-ss-ejercicio="e1"] [data-click="alumnoEjercicio"]').click();
    expect(cuerpo().hidden).toBe(true);
  });

  it('el rojo de la app es el único color: la barra y el borde son rojos, el nombre es blanco y no hay estilos de color sueltos', async () => {
    await abrir();
    cabecera().click();
    expect(tarjeta().className).toContain('border-neonRed');
    for (const barra of $$('[data-ss-ejercicio] [data-click="alumnoEjercicio"]')) {
      expect(barra.className).toContain('border-neonRed');
      expect(barra.getAttribute('style')).toBeNull();
    }
    for (const nombre of $$('[data-fila-nombre]')) {
      expect(nombre.className).toContain('text-white'); // el nombre en blanco se lee mejor; el rojo va en la barra
      expect(nombre.getAttribute('style')).toBeNull();
    }
  });

  it('un grupo con un solo ejercicio es una tarjeta común (con su etiqueta)', async () => {
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[1].group = ''; // Remo ya no es de la superserie
    await abrir(plan);
    expect($('[data-superserie]')).toBeNull();
    expect($('[data-ejercicio="e1"]')).not.toBeNull();
  });

  it('dos superseries en un mismo bloque son dos tarjetas', async () => {
    const plan = planCompleto();
    const ejercicios = plan.weeks[0].days[0].blocks[0].exercises;
    ejercicios.push({ ...structuredClone(ejercicios[0]), id: 'e4', name: 'Dominadas', group: 'B' });
    ejercicios.push({ ...structuredClone(ejercicios[0]), id: 'e5', name: 'Fondos paralelas', group: 'B' });
    await abrir(plan);
    expect($$('[data-superserie]').map((a) => a.dataset.superserie)).toEqual(['A', 'B']);
  });

  it('la tarjeta aparece en el lugar del primer ejercicio de la superserie', async () => {
    const plan = planCompleto();
    const ejercicios = plan.weeks[0].days[0].blocks[0].exercises;
    ejercicios.unshift(ejercicios.pop()); // Fondos (suelto) pasa primero
    await abrir(plan);
    const orden = $$('[data-ejercicio], [data-superserie]').map(
      (a) => a.dataset.ejercicio ?? `ss-${a.dataset.superserie}`,
    );
    expect(orden).toEqual(['e3', 'ss-A']);
  });
});

describe('superseries: las series van por ronda', () => {
  beforeEach(() => abrir());

  it('cada ronda tiene la serie de cada ejercicio, en el orden en que se entrena (A1, A2, A1, A2...)', () => {
    const filas = $$('[data-superserie="A"] [data-serie]').map((f) => f.dataset.serie);
    expect(filas).toEqual(['e1-1', 'e2-1', 'e1-2', 'e2-2', 'e1-3', 'e2-3', 'e1-4', 'e2-4']);
    expect($$('[data-ronda]')).toHaveLength(4);
    expect(texto(ronda(2))).toContain('Ronda 2');
  });

  it('cada fila lleva el nombre de su ejercicio arriba de los campos, con una barra roja al costado', () => {
    const nombres = [...ronda(1).querySelectorAll('[data-fila-nombre]')].map((e) => e.textContent.trim());
    expect(nombres).toEqual(['Press banca', 'Remo con barra']);
    expect(ronda(1).querySelector('[data-serie="e1-1"]').className).toContain('border-neonRed');
  });

  it('un nombre largo se muestra sin la lista de músculos, en hasta 2 líneas, y el nombre completo queda al mantener apretado', async () => {
    document.body.innerHTML = '';
    content = document.createElement('div');
    document.body.appendChild(content);
    const plan = planCompleto();
    const [e1] = plan.weeks[0].days[0].blocks[0].exercises;
    e1.name = 'Peso muerto convencional (mayor flexión cadera) - Lumbares, aductores, glúteo';
    await abrir(plan);
    const fila = $('[data-serie="e1-1"] [data-fila-nombre]');
    expect(fila.textContent.trim()).toBe('Peso muerto convencional (mayor flexión cadera)');
    expect(fila.title).toBe(e1.name);
    expect(fila.className).toContain('line-clamp-2'); // no corta con puntos suspensivos en una sola línea
    expect(fila.className).not.toContain('truncate');
    // la leyenda de arriba sí lleva el nombre completo
    expect(texto($('[data-ss-ejercicio="e1"]'))).toContain('Lumbares, aductores, glúteo');
  });

  it('un nombre sin guion se muestra completo', async () => {
    await abrir();
    expect($('[data-serie="e2-1"] [data-fila-nombre]').textContent.trim()).toBe('Remo con barra');
  });

  it('las filas no repiten el número de serie: está el título de la ronda', () => {
    expect(ronda(1).querySelector('[data-serie="e1-1"] .text-gray-500')).toBeNull();
  });

  it('los títulos de las columnas están una sola vez', () => {
    expect(texto(tarjeta().querySelector('.grid'))).toMatch(/Kg\s*Reps\s*Listo\s*No/);
    expect($$('[data-superserie] .grid').filter((g) => /Kg\s*Reps/.test(g.textContent))).toHaveLength(1);
  });

  it('la ayuda de reps de cada fila es la de su ejercicio', () => {
    expect(campo('e1', 1, 'reps').getAttribute('placeholder')).toBe('8-10');
    expect(campo('e2', 1, 'reps').getAttribute('placeholder')).toBe('8-10');
  });

  it('lo que anota se guarda en el registro de su ejercicio, como siempre', async () => {
    const cambiar = (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    cambiar(campo('e1', 2, 'kg'), '82.5');
    cambiar(campo('e2', 2, 'reps'), '9');
    await esperar();
    const registro = await registroDe(ALUMNO.id);
    expect(registro.e1[2].kg).toBe('82.5');
    expect(registro.e2[2].reps).toBe('9');
  });

  it('una superserie con ejercicios de distinta cantidad de series: las rondas largas solo tienen a los que llegan', async () => {
    document.body.innerHTML = '';
    content = document.createElement('div');
    document.body.appendChild(content);
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[1].sets = '2'; // Remo: 2 series; Press: 4
    await abrir(plan);
    expect(texto(cabecera())).toContain('4 rondas');
    expect([...ronda(2).querySelectorAll('[data-serie]')].map((f) => f.dataset.serie)).toEqual(['e1-2', 'e2-2']);
    expect([...ronda(3).querySelectorAll('[data-serie]')].map((f) => f.dataset.serie)).toEqual(['e1-3']);
    expect([...ronda(4).querySelectorAll('[data-serie]')].map((f) => f.dataset.serie)).toEqual(['e1-4']);
  });
});

describe('superseries: avance y rondas completas', () => {
  beforeEach(() => abrir());
  const resumen = () => tarjeta().querySelector('[data-ej-resumen]');

  it('el encabezado cuenta las series hechas de todos los ejercicios', async () => {
    expect(resumen().textContent).toBe('0/8');
    check('e1', 1).click();
    await esperar();
    expect(resumen().textContent).toBe('1/8');
    check('e2', 1).click();
    await esperar();
    expect(resumen().textContent).toBe('2/8');
  });

  it('las omitidas se cuentan aparte', async () => {
    omitir('e2', 1).click();
    await esperar();
    expect(resumen().textContent).toBe('0/8 · 1 omitida');
  });

  it('con todo hecho el resumen queda como completo', async () => {
    for (const e of ['e1', 'e2']) for (let n = 1; n <= 4; n++) check(e, n).click();
    await esperar();
    expect(resumen().dataset.completo).toBe('true');
    expect(resumen().textContent).toBe('8/8');
  });

  it('una ronda se marca como completa cuando todas sus series están hechas u omitidas, y deja de estarlo si se desmarca', async () => {
    expect(ronda(1).dataset.completa).toBeUndefined();
    check('e1', 1).click();
    await esperar();
    expect(ronda(1).dataset.completa).toBeUndefined(); // falta A2
    omitir('e2', 1).click();
    await esperar();
    expect(ronda(1).dataset.completa).toBe('true');
    expect(ronda(2).dataset.completa).toBeUndefined();
    check('e1', 1).click(); // la desmarca
    await esperar();
    expect(ronda(1).dataset.completa).toBeUndefined();
  });

  it('el avance del día sigue contando todas las series (11)', async () => {
    expect($('[data-progreso]').textContent).toBe('0 / 11 series');
    check('e1', 1).click();
    await esperar();
    expect($('[data-progreso]').textContent).toBe('1 / 11 series');
  });

  it('marcar una serie no redibuja la tarjeta (no se pierde lo que se está escribiendo)', async () => {
    const antes = tarjeta();
    check('e1', 1).click();
    await esperar();
    expect(tarjeta()).toBe(antes);
  });

  it('con registros guardados, al abrir ya viene todo marcado', async () => {
    document.body.innerHTML = '';
    content = document.createElement('div');
    document.body.appendChild(content);
    await sembrarPlan(ALUMNO.id, planCompleto());
    await guardarRegistroDe(ALUMNO.id, { e1: { 1: hecha(), 2: hecha() }, e2: { 1: hecha() } });
    await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
    expect(tarjeta().querySelector('[data-ej-resumen]').textContent).toBe('3/8');
    expect(campo('e1', 1, 'kg').value).toBe('50');
  });
});

describe('superseries: plegar y desplegar', () => {
  beforeEach(() => abrir());

  it('arranca plegada y tocar el título la despliega y la pliega', () => {
    expect(cuerpo().hidden).toBe(true);
    expect(cabecera().getAttribute('aria-expanded')).toBe('false');
    cabecera().click();
    expect(cuerpo().hidden).toBe(false);
    expect(cabecera().getAttribute('aria-expanded')).toBe('true');
    cabecera().click();
    expect(cuerpo().hidden).toBe(true);
  });

  it('«Abrir todos» y «Plegar todos» también la incluyen', () => {
    const todos = () => $('[data-click="alumnoEjerciciosTodos"]');
    expect(todos().textContent).toMatch(/abrir todos/i);
    todos().click();
    expect(cuerpo().hidden).toBe(false);
    expect($('[data-ejercicio="e3"] [data-ej-cuerpo]').hidden).toBe(false);
    expect(todos().textContent).toMatch(/plegar todos/i);
    todos().click();
    expect(cuerpo().hidden).toBe(true);
  });

  it('abrirla a mano y abrir el otro ejercicio cambia el botón a «Plegar todos»', () => {
    cabecera().click();
    $('[data-ejercicio="e3"] [data-click="alumnoEjercicio"]').click();
    expect($('[data-click="alumnoEjerciciosTodos"]').textContent).toMatch(/plegar todos/i);
  });

  it('sin ninguna marca todavía, una sola línea avisa para toda la superserie', () => {
    cabecera().click();
    const marcas = $$('[data-superserie] [data-ultima-marca]');
    expect(marcas).toHaveLength(1);
    expect(texto(marcas[0])).toContain('Aún no registras marcas');
  });

  it('la última marca de cada ejercicio sale de la semana anterior', async () => {
    document.body.innerHTML = '';
    content = document.createElement('div');
    document.body.appendChild(content);
    const plan = planCompleto();
    const semana2 = structuredClone(plan.weeks[0]);
    semana2.id = 'w2';
    semana2.name = 'Semana 2';
    for (const d of semana2.days) {
      d.id += '-s2';
      for (const b of d.blocks) {
        b.id += '-s2';
        for (const e of b.exercises) e.id += '-s2';
      }
    }
    plan.weeks[1] = semana2;
    await sembrarPlan(ALUMNO.id, plan);
    await guardarRegistroDe(ALUMNO.id, { e1: { 1: hecha('60'), 2: hecha('65') }, e2: { 1: hecha('40') } });
    await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-27' }); // semana 2
    $('[data-superserie] [data-click="alumnoEjercicio"]').click();
    const marcas = $$('[data-superserie] [data-ultima-marca]').map((m) => texto(m));
    expect(marcas[0]).toContain('empezaste con 60 kg y cerraste la serie 2 con 65 kg');
    expect(marcas[1]).toContain('usaste 40 kg en la serie 1');
  });

  it('las notas de cada ejercicio se muestran con su nombre', async () => {
    document.body.innerHTML = '';
    content = document.createElement('div');
    document.body.appendChild(content);
    const plan = planCompleto();
    plan.weeks[0].days[0].blocks[0].exercises[1].notes = 'Codos pegados';
    await abrir(plan);
    expect(texto(cuerpo())).toContain('Remo con barra · Codos pegados');
  });
});

describe('superseries: seguridad y modo lectura', () => {
  it('muestra los nombres y las notas como texto, sin interpretar HTML', async () => {
    const plan = planCompleto();
    const [e1, e2] = plan.weeks[0].days[0].blocks[0].exercises;
    e1.name = '<img src=x onerror="window.__xss=1"> Press';
    e2.notes = '<b id="x">negrita</b>';
    await abrir(plan);
    expect(content.querySelector('img')).toBeNull();
    expect($('#x')).toBeNull();
    expect(window.__xss).toBeUndefined();
    expect(texto(tarjeta())).toContain('<img src=x onerror="window.__xss=1"> Press');
  });

  it('en modo lectura del coach no se puede anotar, pero se ve todo y se puede plegar', async () => {
    await abrir(planCompleto(), { soloLectura: true });
    expect(campo('e1', 1, 'kg').disabled).toBe(true);
    expect(check('e2', 1).disabled).toBe(true);
    cabecera().click();
    expect(cuerpo().hidden).toBe(false);
  });

  it('con el día terminado los campos quedan bloqueados', async () => {
    await sembrarPlan(ALUMNO.id, planCompleto());
    const { guardarSesionesDe } = await import('../repo/test-utils.js');
    await guardarSesionesDe(ALUMNO.id, {
      d1: { fecha: '2026-10-20', terminadaEn: '2026-10-20T20:00:00.000Z', estado: 'hecha' },
    });
    await abrirPlanAlumno(content, ALUMNO, { hoy: '2026-10-20' });
    expect(campo('e1', 1, 'kg').disabled).toBe(true);
  });
});
