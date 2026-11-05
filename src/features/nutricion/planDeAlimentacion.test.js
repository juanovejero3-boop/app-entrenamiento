import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { alimentosIniciales } from './alimentos.js';
import { agregarItem, agregarOpcion, crearComida } from './comidas.js';
import { abrirPlanDeAlimentacion } from './planDeAlimentacion.js';
import { parametrosIniciales } from './objetivos.js';
import { crearRepoNutricionLocal } from './repoLocal.js';

const ALIMENTOS = alimentosIniciales();
const alimento = (nombre) => ALIMENTOS.find((a) => a.nombre === nombre);
const POLLO = alimento('Pechuga de Pollo'); // «100g», 120 kcal, P 25
const ARROZ = alimento('Arroz Blanco (Cocido)'); // «75g», 100 kcal, C 20
const PAN = alimento('Pan Integral'); // «1 Rebanada»
const VERDURA = alimento('Lechuga / Espinaca / Rúcula'); // «Libre»

const FRANCO = { id: 'u1', name: 'Franco Soria', email: 'franco@ejemplo.com' };
const PARAMETROS = { ...parametrosIniciales({}), edad: 28, peso: 75, altura: 175 }; // 2649 kcal, P 165, C 332, G 74

let content;
let almacen;
let repo;
let alVolver;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  repo = crearRepoNutricionLocal(() => almacen);
  alVolver = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const abrir = (opciones = {}) => abrirPlanDeAlimentacion(content, FRANCO, { repo, alVolver, ...opciones });

/** Una comida con alimentos en su primera opción. */
function comida(nombre, hora, ...pares) {
  let comidas = [crearComida({ nombre, hora })];
  for (const [a, porciones] of pares)
    comidas = agregarItem(comidas, comidas[0].id, comidas[0].opciones[0].id, a, porciones);
  return comidas[0];
}
function guardarPlan({ comidas = [], parametros = PARAMETROS, notas = '' } = {}) {
  repo.guardarPlan(FRANCO.id, { parametros, comidas, notas });
}
const comidaEl = (id) => $(`[data-comida-alumno="${id}"]`);
const nombresDeComidas = () => $$('[data-comida-alumno] [data-comida-nombre]').map((e) => texto(e));
const abrirComida = (id) => $(`[data-comida-alumno="${id}"] [data-click="alimentacionToggle"]`).click();

describe('plan de alimentación: sin plan', () => {
  it('el alumno ve un aviso amable, no una pantalla rota', async () => {
    await abrir();
    expect(content.textContent).toContain('Todavía no tenés un plan de alimentación');
    expect($('[data-comida-alumno]')).toBeNull();
  });

  it('el coach ve que ese alumno todavía no tiene plan', async () => {
    await abrir({ soloLectura: true });
    expect(content.textContent).toContain('Este alumno todavía no tiene un plan de alimentación');
  });

  it('un plan sin ninguna comida con alimentos cuenta como sin plan', async () => {
    guardarPlan({ comidas: [comida('Desayuno', '08:00')] }); // la comida está vacía
    await abrir();
    expect(content.textContent).toContain('Todavía no tenés un plan de alimentación');
  });

  it('siempre se puede volver', async () => {
    await abrir();
    $('[data-click="alimentacionVolver"]').click();
    expect(alVolver).toHaveBeenCalledTimes(1);
  });
});

describe('plan de alimentación: lo que ve el alumno', () => {
  beforeEach(() => {
    guardarPlan({
      comidas: [comida('Cena', '21:00', [ARROZ, 2]), comida('Desayuno', '08:00', [POLLO, 1], [PAN, 2])],
      notas: 'Tomar 2 litros de agua.\nNo saltear el desayuno.',
    });
  });

  it('el título es «Mi plan de alimentación»', async () => {
    await abrir();
    expect($('h2').textContent).toContain('Mi plan de alimentación');
  });

  it('arriba están sus objetivos del día', async () => {
    await abrir();
    expect(texto($('[data-objetivo="kcal"]'))).toContain('2649');
    expect(texto($('[data-objetivo="p"]'))).toContain('165');
    expect(texto($('[data-objetivo="c"]'))).toContain('332');
    expect(texto($('[data-objetivo="f"]'))).toContain('74');
  });

  it('si faltan datos para calcular los objetivos, no los muestra (sin errores ni números raros)', async () => {
    guardarPlan({ comidas: [comida('Desayuno', '08:00', [POLLO, 1])], parametros: parametrosIniciales({}) });
    await abrir();
    expect($('[data-objetivo]')).toBeNull();
    expect($('[data-comida-alumno]')).not.toBeNull();
  });

  it('las comidas van por horario, con la hora y lo que aportan', async () => {
    await abrir();
    expect(nombresDeComidas()).toEqual(['Desayuno', 'Cena']);
    const encabezado = texto($('[data-comida-alumno] [data-click="alimentacionToggle"]'));
    expect(encabezado).toContain('08:00');
    expect(encabezado).toContain('320 kcal'); // pollo 120 + pan 2 × 100
  });

  it('las comidas sin horario van al final y las vacías no aparecen', async () => {
    guardarPlan({
      comidas: [comida('Merienda', '', [PAN, 1]), comida('Vacía', '07:00'), comida('Desayuno', '08:00', [POLLO, 1])],
    });
    await abrir();
    expect(nombresDeComidas()).toEqual(['Desayuno', 'Merienda']);
  });

  it('arrancan plegadas y se abren con un toque', async () => {
    await abrir();
    const [primera] = $$('[data-comida-alumno]');
    const id = primera.dataset.comidaAlumno;
    expect(primera.querySelector('[data-comida-cuerpo]').hidden).toBe(true);
    abrirComida(id);
    expect(comidaEl(id).querySelector('[data-comida-cuerpo]').hidden).toBe(false);
    expect($(`[data-comida-alumno="${id}"] [data-click="alimentacionToggle"]`).getAttribute('aria-expanded')).toBe(
      'true',
    );
    abrirComida(id);
    expect(comidaEl(id).querySelector('[data-comida-cuerpo]').hidden).toBe(true);
  });

  it('cada alimento muestra su nombre, la cantidad bien clara y sus macros', async () => {
    await abrir();
    const filas = $$('[data-comida-alumno]')[0].querySelectorAll('[data-alimento-fila]');
    expect([...filas].map((f) => texto(f.querySelector('[data-alimento-nombre]')))).toEqual([
      'Pechuga de Pollo',
      'Pan Integral',
    ]);
    expect(texto(filas[0].querySelector('[data-alimento-cantidad]'))).toBe('100 g');
    expect(texto(filas[1].querySelector('[data-alimento-cantidad]'))).toBe('2 × 1 Rebanada');
    expect(texto(filas[0].querySelector('[data-alimento-macros]'))).toMatch(/P 25.*C 0.*G 2/);
  });

  it('un alimento «Libre» dice Libre', async () => {
    guardarPlan({ comidas: [comida('Almuerzo', '13:00', [VERDURA, 1])] });
    await abrir();
    expect(texto($('[data-alimento-cantidad]'))).toBe('Libre');
  });

  it('las aclaraciones aparecen al final, plegadas, con sus saltos de línea', async () => {
    await abrir();
    const cuerpo = $('[data-aclaraciones] [data-comida-cuerpo]');
    expect(cuerpo.hidden).toBe(true);
    $('[data-aclaraciones] [data-click="alimentacionToggle"]').click();
    expect(cuerpo.hidden).toBe(false);
    expect(cuerpo.textContent).toContain('Tomar 2 litros de agua.');
    expect(cuerpo.textContent).toContain('No saltear el desayuno.');
    expect(cuerpo.className).toContain('whitespace-pre-line');
  });

  it('sin aclaraciones no hay sección', async () => {
    guardarPlan({ comidas: [comida('Desayuno', '08:00', [POLLO, 1])], notas: '   ' });
    await abrir();
    expect($('[data-aclaraciones]')).toBeNull();
  });

  it('es solo para mirar: no hay ningún campo ni botón que edite', async () => {
    await abrir();
    expect($$('input, textarea, select')).toHaveLength(0);
    const acciones = $$('[data-click]').map((b) => b.dataset.click);
    expect(new Set(acciones)).toEqual(new Set(['alimentacionVolver', 'alimentacionToggle', 'alimentacionPdf']));
  });

  it('el HTML de los nombres y de las aclaraciones no se interpreta', async () => {
    guardarPlan({
      comidas: [comida('<img src=x onerror=alert(1)>', '08:00', [POLLO, 1])],
      notas: '<img src=y onerror=alert(2)>',
    });
    await abrir();
    expect($('img')).toBeNull();
    expect(content.textContent).toContain('<img src=x');
    expect(content.textContent).toContain('<img src=y');
  });

  it('para el alumno no hay cartel de modo lectura', async () => {
    await abrir();
    expect(content.textContent).not.toMatch(/modo lectura/i);
  });
});

describe('plan de alimentación: opciones de una comida', () => {
  let desayuno;
  beforeEach(() => {
    desayuno = comida('Desayuno', '08:00', [POLLO, 1]);
    let comidas = agregarOpcion([desayuno], desayuno.id);
    comidas = agregarItem(comidas, desayuno.id, comidas[0].opciones[1].id, ARROZ, 2);
    guardarPlan({ comidas });
  });
  const pestanas = () => $$('[data-click="alimentacionOpcion"]');
  const paneles = () => $$('[data-opcion-panel]');
  const visible = () => paneles().filter((p) => !p.hidden);

  it('con más de una opción hay pestañas «Opción 1», «Opción 2» y se ve la primera', async () => {
    await abrir();
    expect(pestanas().map(texto)).toEqual(['Opción 1', 'Opción 2']);
    expect(visible()).toHaveLength(1);
    expect(texto(visible()[0])).toContain('Pechuga de Pollo');
    expect(pestanas()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('tocar otra pestaña muestra los alimentos de esa opción', async () => {
    await abrir();
    pestanas()[1].click();
    expect(visible()).toHaveLength(1);
    expect(texto(visible()[0])).toContain('Arroz Blanco (Cocido)');
    expect(texto(visible()[0])).toContain('150 g');
    expect(pestanas()[1].getAttribute('aria-selected')).toBe('true');
    expect(pestanas()[0].getAttribute('aria-selected')).toBe('false');
  });

  it('cada opción muestra lo que aporta', async () => {
    await abrir();
    expect(texto(visible()[0])).toContain('120 kcal');
    pestanas()[1].click();
    expect(texto(visible()[0])).toContain('200 kcal');
  });

  it('las opciones vacías no se ofrecen', async () => {
    const comidas = agregarOpcion([desayuno], desayuno.id); // la segunda opción queda sin alimentos
    guardarPlan({ comidas });
    await abrir();
    expect(pestanas()).toHaveLength(0); // una sola opción con alimentos: sin pestañas
    expect(visible()).toHaveLength(1);
  });

  it('cada comida elige su opción por separado', async () => {
    // el desayuno ya tiene dos opciones (del beforeEach); la cena también
    const cena = comida('Cena', '21:00', [ARROZ, 1]);
    let comidas = agregarOpcion([desayuno, cena], cena.id);
    comidas = agregarItem(comidas, desayuno.id, comidas[0].opciones[0].id, PAN, 1);
    comidas = agregarOpcion(comidas, desayuno.id);
    comidas = agregarItem(comidas, desayuno.id, comidas[0].opciones[1].id, ARROZ, 2);
    comidas = agregarItem(comidas, cena.id, comidas[1].opciones[1].id, POLLO, 1);
    guardarPlan({ comidas });
    await abrir();
    const pestana = (id, n) => $$(`[data-comida-alumno="${id}"] [data-click="alimentacionOpcion"]`)[n];
    pestana(cena.id, 1).click();
    expect(pestana(cena.id, 1).getAttribute('aria-selected')).toBe('true');
    expect(pestana(desayuno.id, 0).getAttribute('aria-selected')).toBe('true'); // el desayuno sigue en su opción 1
  });
});

describe('plan de alimentación: lo que ve el coach (mismo contenido, en modo lectura)', () => {
  beforeEach(() => {
    guardarPlan({ comidas: [comida('Desayuno', '08:00', [POLLO, 1])], notas: 'Sin lácteos.' });
  });

  it('muestra un cartel de modo lectura con el nombre del alumno', async () => {
    await abrir({ soloLectura: true });
    expect(texto($('[data-modo-lectura]'))).toMatch(/modo lectura/i);
    expect(texto($('[data-modo-lectura]'))).toContain('Franco Soria');
  });

  it('el título nombra al alumno', async () => {
    await abrir({ soloLectura: true });
    expect($('h2').textContent).toContain('Franco Soria');
  });

  it('ve exactamente las mismas comidas, objetivos y aclaraciones que el alumno', async () => {
    await abrir();
    const comoAlumno = {
      objetivos: $$('[data-objetivo]').map(texto),
      comidas: nombresDeComidas(),
      notas: texto($('[data-aclaraciones]')),
    };
    await abrir({ soloLectura: true });
    const comoCoach = {
      objetivos: $$('[data-objetivo]').map(texto),
      comidas: nombresDeComidas(),
      notas: texto($('[data-aclaraciones]')),
    };
    expect(comoCoach).toEqual(comoAlumno);
  });

  it('tampoco se puede editar nada', async () => {
    await abrir({ soloLectura: true });
    expect($$('input, textarea, select')).toHaveLength(0);
  });

  it('puede volver a la ficha', async () => {
    await abrir({ soloLectura: true });
    $('[data-click="alimentacionVolver"]').click();
    expect(alVolver).toHaveBeenCalledTimes(1);
  });
});

describe('plan de alimentación: PDF', () => {
  const planConComida = () => guardarPlan({ comidas: [comida('Almuerzo', '13:00', [POLLO, 2])], notas: 'Hidratarse.' });

  it('el alumno baja su plan en PDF con un botón', async () => {
    planConComida();
    const pdf = vi.fn();
    await abrir({ pdf });
    $('[data-click="alimentacionPdf"]').click();
    expect(pdf).toHaveBeenCalledTimes(1);
    const [plan, alumno] = pdf.mock.calls[0];
    expect(alumno).toEqual(FRANCO);
    expect(plan.comidas[0].nombre).toBe('Almuerzo');
    expect(plan.notas).toBe('Hidratarse.');
  });

  it('el coach también puede bajarlo desde el modo lectura', async () => {
    planConComida();
    const pdf = vi.fn();
    await abrir({ pdf, soloLectura: true });
    $('[data-click="alimentacionPdf"]').click();
    expect(pdf).toHaveBeenCalledTimes(1);
  });

  it('sin comidas no hay nada para bajar: no se ofrece el botón', async () => {
    await abrir();
    expect($('[data-click="alimentacionPdf"]')).toBeNull();
  });
});
