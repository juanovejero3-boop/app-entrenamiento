import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js'; // modales propios: window.alert / window.confirm reales de la app
import { alimentosIniciales } from './alimentos.js';
import { agregarItem, crearComida } from './comidas.js';
import { actualizarObjetivosDeComidas, montarComidas } from './comidasVista.js';

const ALIMENTOS = alimentosIniciales();
const alimento = (nombre) => ALIMENTOS.find((a) => a.nombre === nombre);
const POLLO = alimento('Pechuga de Pollo'); // proteínas: 120 kcal, P 25 por porción; «100g»
const ARROZ = alimento('Arroz Blanco (Cocido)'); // carbohidratos: 100 kcal, C 20; «75g»
const PALTA = alimento('Palta / Aguacate'); // grasas: 100 kcal, G 11
const PAN = alimento('Pan Integral'); // «1 Rebanada»
const OBJETIVOS = { kcal: 2000, p: 150, c: 200, f: 60 };

let contenedor;
let linea;
let guardadas; // lo último que se le pidió guardar
let alCambiar;
beforeEach(() => {
  contenedor = document.createElement('div');
  linea = document.createElement('div');
  document.body.append(contenedor, linea);
  guardadas = [];
  alCambiar = vi.fn((comidas) => {
    guardadas = comidas;
    return true;
  });
});
afterEach(() => {
  document.body.innerHTML = '';
});

const $ = (selector) => contenedor.querySelector(selector);
const $$ = (selector) => [...contenedor.querySelectorAll(selector)];
const esperar = () => new Promise((r) => setTimeout(r, 0));
const montar = ({ comidas = [], objetivos = null, alimentos = ALIMENTOS } = {}) =>
  montarComidas({ contenedor, lineaDeTiempo: linea, comidas, alimentos, objetivos, alCambiar });

/** Una comida con alimentos ya cargados en su primera opción. */
function comidaCon(nombre, hora, ...pares) {
  let comidas = [crearComida({ nombre, hora })];
  for (const [a, porciones] of pares)
    comidas = agregarItem(comidas, comidas[0].id, comidas[0].opciones[0].id, a, porciones);
  return comidas;
}
const comida = (id) => $(`[data-comida="${id}"]`);
const cuerpo = (id) => $(`[data-comida="${id}"] [data-comida-cuerpo]`);
const consumo = (clave) => $(`[data-consumo="${clave}"]`);
const texto = (el) => el.textContent.replace(/\s+/g, ' ').trim();
async function responderConfirmacion(acepta) {
  document.querySelector(`#app-modal-overlay-aux [data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await esperar();
}
function cambiar(campo, valor) {
  campo.value = valor;
  campo.dispatchEvent(new Event('change', { bubbles: true }));
}
function escribir(campo, valor) {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Elige la hora como el coach: con los selectores de hora y de minutos (la pantalla se redibuja entre uno y otro). */
function ponerHora(comidaId, hora) {
  const [h, m] = hora ? hora.split(':') : ['', '00'];
  cambiar(comida(comidaId).querySelector('[data-hora-h]'), h);
  if (hora) cambiar(comida(comidaId).querySelector('[data-hora-m]'), m);
}
/** Busca un alimento escribiendo en el buscador de una opción y toca el resultado. */
function agregarAlimento(comidaId, a, { opcion = 0, buscar = a.nombre.slice(0, 5) } = {}) {
  const opcionEl = $$(`[data-comida="${comidaId}"] [data-opcion]`)[opcion];
  escribir(opcionEl.querySelector('[data-buscar-alimento]'), buscar);
  opcionEl.querySelector(`[data-click="alimentoElegir"][data-alimento-id="${a.id}"]`).click();
}
const filaDe = (nombre) => $$('[data-item]').find((f) => f.textContent.includes(nombre));
const porcionesDe = (nombre) => filaDe(nombre).querySelector('[data-change="itemPorciones"]').value;

describe('armado de comidas', () => {
  it('sin comidas lo dice y ofrece armar la primera', () => {
    montar();
    expect(contenedor.textContent).toContain('Todavía no armaste comidas');
    expect($('[data-click="comidaNueva"]')).not.toBeNull();
  });

  it('"Agregar comida" suma una con nombre sugerido, abierta, y la manda a guardar', () => {
    montar();
    $('[data-click="comidaNueva"]').click();
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].nombre).toBe('Comida 1');
    expect(cuerpo(guardadas[0].id).hidden).toBe(false);

    $('[data-click="comidaNueva"]').click();
    expect(guardadas.map((c) => c.nombre)).toEqual(['Comida 1', 'Comida 2']);
  });

  it('muestra las comidas que ya tenía el plan, plegadas', () => {
    const comidas = comidaCon('Desayuno', '08:00', [POLLO, 1]);
    montar({ comidas });
    expect(comida(comidas[0].id).textContent).toContain('Desayuno');
    expect(cuerpo(comidas[0].id).hidden).toBe(true);
  });

  it('cada comida se abre y se pliega sin afectar a las otras', () => {
    const [a] = comidaCon('Desayuno', '', [POLLO, 1]);
    const [b] = comidaCon('Cena', '', [ARROZ, 1]);
    montar({ comidas: [a, b] });
    $(`[data-click="comidaToggle"][data-id="${a.id}"]`).click();
    expect(cuerpo(a.id).hidden).toBe(false);
    expect($(`[data-click="comidaToggle"][data-id="${a.id}"]`).getAttribute('aria-expanded')).toBe('true');
    expect(cuerpo(b.id).hidden).toBe(true);
    $(`[data-click="comidaToggle"][data-id="${a.id}"]`).click();
    expect(cuerpo(a.id).hidden).toBe(true);
  });

  it('cambiar el nombre', () => {
    const comidas = comidaCon('Comida 1', '', [POLLO, 1]);
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    cambiar($('[data-comida-nombre]'), 'Almuerzo');
    expect(guardadas[0].nombre).toBe('Almuerzo');
    expect(comida(comidas[0].id).textContent).toContain('Almuerzo');
  });

  it('un nombre vacío no pisa el que había', () => {
    const comidas = comidaCon('Cena', '');
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    cambiar($('[data-comida-nombre]'), '   ');
    expect(comida(comidas[0].id).textContent).toContain('Cena');
  });

  it('eliminar una comida pide confirmación', async () => {
    const comidas = comidaCon('Cena', '', [POLLO, 1]);
    montar({ comidas });
    $(`[data-click="comidaEliminar"][data-id="${comidas[0].id}"]`).click();
    expect(document.getElementById('app-modal-overlay-aux').textContent).toContain('Cena');
    await responderConfirmacion(false);
    expect(comida(comidas[0].id)).not.toBeNull();

    $(`[data-click="comidaEliminar"][data-id="${comidas[0].id}"]`).click();
    await responderConfirmacion(true);
    expect(comida(comidas[0].id)).toBeNull();
    expect(guardadas).toEqual([]);
  });

  it('si no se puede guardar el cambio no se muestra como hecho', () => {
    alCambiar = vi.fn(() => false);
    montar();
    $('[data-click="comidaNueva"]').click();
    expect($$('[data-comida]')).toHaveLength(0);
  });

  it('escapa el HTML de los nombres', () => {
    const comidas = comidaCon('<img src=x onerror=alert(1)>', '');
    montar({ comidas });
    expect(contenedor.querySelector('img')).toBeNull();
  });
});

describe('la hora, en formato de 24 horas', () => {
  let id;
  const horaEl = () => comida(id);
  beforeEach(() => {
    const comidas = comidaCon('Almuerzo', '');
    id = comidas[0].id;
    montar({ comidas });
  });

  it('se elige con una hora de 00 a 23 y los minutos de a 5, sin AM ni PM', () => {
    const horas = [...horaEl().querySelectorAll('[data-hora-h] option')].map((o) => o.value);
    expect(horas).toEqual(['', ...Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))]);
    const minutos = [...horaEl().querySelectorAll('[data-hora-m] option')].map((o) => o.value);
    expect(minutos).toEqual(Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')));
    expect(horaEl().querySelector('[data-comida-hora]').textContent).not.toMatch(/am|pm/i);
  });

  it('elegir hora y minutos guarda la hora, y el encabezado la muestra', () => {
    ponerHora(id, '13:30');
    expect(guardadas[0].hora).toBe('13:30');
    expect(horaEl().querySelector('[data-click="comidaToggle"]').textContent).toContain('13:30');
  });

  it('las 12 del mediodía son 12:00 y la medianoche 00:00', () => {
    ponerHora(id, '12:00');
    expect(guardadas[0].hora).toBe('12:00');
    ponerHora(id, '00:00');
    expect(guardadas[0].hora).toBe('00:00');
  });

  it('elegir solo la hora pone los minutos en 00', () => {
    cambiar(horaEl().querySelector('[data-hora-h]'), '09');
    expect(guardadas[0].hora).toBe('09:00');
  });

  it('cambiar solo los minutos conserva la hora', () => {
    ponerHora(id, '09:00');
    cambiar(horaEl().querySelector('[data-hora-m]'), '45');
    expect(guardadas[0].hora).toBe('09:45');
  });

  it('dejar la hora en «--» la quita', () => {
    ponerHora(id, '09:15');
    cambiar(horaEl().querySelector('[data-hora-h]'), '');
    expect(guardadas[0].hora).toBe('');
    expect(horaEl().querySelector('[data-hora-m]').disabled).toBe(true);
  });

  it('una hora ya guardada se ve en los selectores, aunque los minutos no sean de a 5', () => {
    montar({ comidas: comidaCon('Cena', '20:07') });
    const el = $('[data-comida]');
    expect(el.querySelector('[data-hora-h]').value).toBe('20');
    expect(el.querySelector('[data-hora-m]').value).toBe('07');
  });
});

describe('buscar y agregar alimentos', () => {
  let comidas;
  let id;
  beforeEach(() => {
    comidas = comidaCon('Almuerzo', '13:00');
    id = comidas[0].id;
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
  });
  const resultados = () =>
    $$('[data-click="alimentoElegir"]').map((b) => b.querySelector('[data-resultado-nombre]').textContent);

  it('sin escribir no muestra una lista larga: invita a buscar', () => {
    expect(resultados()).toEqual([]);
    expect($('[data-buscar-alimento]').placeholder).toMatch(/buscar/i);
  });

  it('al escribir filtra los alimentos de la biblioteca, sin importar mayúsculas ni tildes', () => {
    escribir($('[data-buscar-alimento]'), 'POLLO');
    expect(resultados()).toEqual(['Pechuga de Pollo']);
    escribir($('[data-buscar-alimento]'), 'salmon');
    expect(resultados()).toEqual(['Salmón Fresco']);
  });

  it('cada resultado muestra la porción y la categoría', () => {
    escribir($('[data-buscar-alimento]'), 'pollo');
    const resultado = $('[data-click="alimentoElegir"]');
    expect(resultado.textContent).toContain('100g');
    expect(resultado.textContent).toContain('Proteínas');
  });

  it('busca también por categoría', () => {
    escribir($('[data-buscar-alimento]'), 'grasas');
    expect(resultados()).toContain('Palta / Aguacate');
  });

  it('muestra pocos resultados y avisa si hay más', () => {
    escribir($('[data-buscar-alimento]'), 'a');
    expect($$('[data-click="alimentoElegir"]').length).toBeLessThanOrEqual(8);
    expect($('[data-mas-resultados]').textContent).toMatch(/seguí escribiendo/i);
  });

  it('sin coincidencias lo dice', () => {
    escribir($('[data-buscar-alimento]'), 'zzzz');
    expect(contenedor.textContent).toContain('No hay ningún alimento que coincida');
  });

  it('tocar un resultado lo agrega con 1 porción, de una, y limpia la búsqueda', () => {
    agregarAlimento(id, POLLO);
    expect(filaDe('Pechuga de Pollo')).toBeDefined();
    expect(porcionesDe('Pechuga de Pollo')).toBe('1');
    expect(texto($('[data-opcion-macros]'))).toContain('120 kcal');
    expect($('[data-buscar-alimento]').value).toBe('');
    expect($$('[data-click="alimentoElegir"]')).toHaveLength(0);
  });

  it('Enter en el buscador agrega el primer resultado', () => {
    escribir($('[data-buscar-alimento]'), 'arroz');
    $('[data-buscar-alimento]')
      .closest('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(filaDe('Arroz Blanco (Cocido)')).toBeDefined();
  });

  it('Enter sin resultados no hace nada', () => {
    escribir($('[data-buscar-alimento]'), 'zzzz');
    $('[data-buscar-alimento]')
      .closest('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect($$('[data-item]')).toHaveLength(0);
  });

  it('el foco vuelve al buscador para seguir cargando alimentos', () => {
    agregarAlimento(id, POLLO);
    expect(document.activeElement).toBe($('[data-buscar-alimento]'));
  });

  it('agregar de nuevo el mismo alimento suma una porción en vez de repetir la fila', () => {
    agregarAlimento(id, POLLO);
    agregarAlimento(id, POLLO);
    expect($$('[data-item]')).toHaveLength(1);
    expect(porcionesDe('Pechuga de Pollo')).toBe('2');
  });

  it('el buscador de cada opción es independiente', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    agregarAlimento(id, ARROZ, { opcion: 1 });
    expect($$('[data-opcion]')[0].querySelectorAll('[data-item]')).toHaveLength(0);
    expect($$('[data-opcion]')[1].querySelectorAll('[data-item]')).toHaveLength(1);
  });

  it('escapa el HTML de los alimentos', () => {
    montar({
      comidas,
      alimentos: [
        {
          id: 'x',
          categoria: 'fats',
          nombre: '<img src=x onerror=alert(1)>',
          porcion: '1',
          gluten: false,
          lacteo: false,
        },
      ],
    });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
    escribir($('[data-buscar-alimento]'), 'img');
    expect(contenedor.querySelector('img')).toBeNull();
    expect(contenedor.textContent).toContain('<img src=x');
  });

  it('sin alimentos en la biblioteca lo avisa y no deja buscar', () => {
    montar({ comidas, alimentos: [] });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
    expect(contenedor.textContent).toContain('La biblioteca de alimentos está vacía');
    expect($('[data-buscar-alimento]').disabled).toBe(true);
  });

  it('seguir editando no cierra la comida abierta', () => {
    agregarAlimento(id, POLLO);
    agregarAlimento(id, ARROZ);
    expect(cuerpo(id).hidden).toBe(false);
  });

  it('la comida muestra en su encabezado cuánto aporta', () => {
    agregarAlimento(id, POLLO);
    expect(texto(comida(id).querySelector('[data-click="comidaToggle"]'))).toContain('120 kcal');
  });
});

describe('porciones de un alimento', () => {
  let id;
  beforeEach(() => {
    const comidas = comidaCon('Almuerzo', '', [POLLO, 1], [PAN, 1]);
    id = comidas[0].id;
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
  });
  const mas = (nombre) => filaDe(nombre).querySelector('[data-click="itemMas"]');
  const menos = (nombre) => filaDe(nombre).querySelector('[data-click="itemMenos"]');

  it('dice con todas las letras que el número son porciones', () => {
    expect(filaDe('Pechuga de Pollo').textContent).toMatch(/porci(ó|o)n(es)?/i);
  });

  it('explica cuánto es en gramos o ml, y con otras medidas la muestra tal cual', () => {
    expect(filaDe('Pechuga de Pollo').textContent).toContain('= 100 g');
    cambiar(filaDe('Pechuga de Pollo').querySelector('[data-change="itemPorciones"]'), '2.5');
    expect(filaDe('Pechuga de Pollo').textContent).toContain('= 250 g');
    expect(filaDe('Pan Integral').textContent).toContain('1 × 1 Rebanada');
  });

  it('los botones + y − cambian de a media porción y recalculan los macros', () => {
    mas('Pechuga de Pollo').click();
    expect(porcionesDe('Pechuga de Pollo')).toBe('1.5');
    expect(guardadas[0].opciones[0].items[0].porciones).toBe(1.5);
    expect(texto($('[data-opcion-macros]'))).toContain('280 kcal'); // pollo 1,5 (180) + pan (100)
    menos('Pechuga de Pollo').click();
    expect(porcionesDe('Pechuga de Pollo')).toBe('1');
  });

  it('− se frena en media porción (para sacar un alimento está la cruz)', () => {
    menos('Pechuga de Pollo').click(); // 0.5
    expect(porcionesDe('Pechuga de Pollo')).toBe('0.5');
    expect(menos('Pechuga de Pollo').disabled).toBe(true);
  });

  it('+ se frena en el máximo', () => {
    cambiar(filaDe('Pechuga de Pollo').querySelector('[data-change="itemPorciones"]'), '50');
    expect(mas('Pechuga de Pollo').disabled).toBe(true);
  });

  it('también se puede escribir la cantidad', () => {
    cambiar(filaDe('Pan Integral').querySelector('[data-change="itemPorciones"]'), '3');
    expect(guardadas[0].opciones[0].items[1].porciones).toBe(3);
  });

  it('poner 0 porciones escribiéndolo quita el alimento', () => {
    cambiar(filaDe('Pan Integral').querySelector('[data-change="itemPorciones"]'), '0');
    expect(filaDe('Pan Integral')).toBeUndefined();
  });

  it('la cruz saca el alimento', () => {
    filaDe('Pan Integral').querySelector('[data-click="itemQuitar"]').click();
    expect(filaDe('Pan Integral')).toBeUndefined();
    expect(guardadas[0].opciones[0].items).toHaveLength(1);
  });
});

describe('opciones (variantes) de una comida', () => {
  let id;
  beforeEach(() => {
    const comidas = comidaCon('Almuerzo', '', [POLLO, 1]);
    id = comidas[0].id;
    montar({ comidas, objetivos: OBJETIVOS });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
  });

  it('con una sola opción no se puede eliminar', () => {
    expect($('[data-click="opcionEliminar"]')).toBeNull();
  });

  it('duplicar está junto a Variante y copia la última opción', () => {
    const acciones = $('[data-click="opcionNueva"]').parentElement;
    expect(acciones.querySelector('[data-click="opcionDuplicar"]')).not.toBeNull();
    expect($('[data-opcion] [data-click="opcionDuplicar"]')).toBeNull();

    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    agregarAlimento(id, ARROZ, { opcion: 1 });
    $('[data-click="opcionDuplicar"]').click();

    expect($$('[data-opcion]')).toHaveLength(3);
    const opciones = guardadas[0].opciones;
    expect(opciones[2].items.map((i) => [i.nombre, i.porciones])).toEqual([['Arroz Blanco (Cocido)', 1]]);
    expect(opciones[2].id).not.toBe(opciones[1].id);
    expect(opciones[2].items[0].id).not.toBe(opciones[1].items[0].id);
    expect(opciones[0].items.map((i) => i.nombre)).toEqual(['Pechuga de Pollo']);
  });

  it('cambiar un alimento lo reemplaza y conserva las porciones', () => {
    cambiar(filaDe('Pechuga de Pollo').querySelector('[data-change="itemPorciones"]'), '2.5');
    filaDe('Pechuga de Pollo').querySelector('[data-click="itemCambiar"]').click();
    expect(contenedor.textContent).toMatch(/reemplazando/i);
    escribir($('[data-buscar-alimento]'), 'arroz');
    $(`[data-click="alimentoElegir"][data-alimento-id="${ARROZ.id}"]`).click();
    expect(filaDe('Pechuga de Pollo')).toBeUndefined();
    expect(porcionesDe('Arroz Blanco (Cocido)')).toBe('2.5');
    expect(contenedor.textContent).not.toMatch(/reemplazando/i);
  });

  it('cambiar por un alimento que ya está suma las porciones', () => {
    agregarAlimento(id, ARROZ);
    filaDe('Pechuga de Pollo').querySelector('[data-click="itemCambiar"]').click();
    escribir($('[data-buscar-alimento]'), 'arroz');
    $(`[data-click="alimentoElegir"][data-alimento-id="${ARROZ.id}"]`).click();
    expect($$('[data-item]')).toHaveLength(1);
    expect(porcionesDe('Arroz Blanco (Cocido)')).toBe('2');
  });

  it('"Variante" suma una opción vacía con sus propios alimentos', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    expect($$('[data-opcion]')).toHaveLength(2);
    agregarAlimento(id, ARROZ, { opcion: 1 });
    expect($$('[data-opcion]')[0].querySelectorAll('[data-item]')).toHaveLength(1);
    expect($$('[data-opcion]')[1].querySelectorAll('[data-item]')).toHaveLength(1);
  });

  it('explica que la primera opción es la que cuenta para el total', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    expect(comida(id).textContent).toMatch(/primera opción/i);
  });

  it('las variantes no suman al total del día', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    agregarAlimento(id, PALTA, { opcion: 1 });
    expect(texto(consumo('kcal'))).toContain('120'); // solo el pollo de la opción 1
  });

  it('se elimina una variante (con confirmación si tiene alimentos)', async () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    agregarAlimento(id, ARROZ, { opcion: 1 });
    $$('[data-opcion]')[1].querySelector('[data-click="opcionEliminar"]').click();
    await responderConfirmacion(true);
    expect($$('[data-opcion]')).toHaveLength(1);
  });

  it('una variante vacía se elimina sin preguntar', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    $$('[data-opcion]')[1].querySelector('[data-click="opcionEliminar"]').click();
    expect($$('[data-opcion]')).toHaveLength(1);
  });
});

describe('contra los objetivos del alumno', () => {
  it('muestra cuánto suma el plan frente a cada objetivo, con lo que falta', () => {
    montar({ comidas: comidaCon('Desayuno', '', [POLLO, 1], [ARROZ, 1]), objetivos: OBJETIVOS });
    expect(texto(consumo('kcal'))).toContain('220 / 2000');
    expect(texto(consumo('p'))).toContain('28 / 150');
    expect(texto(consumo('c'))).toContain('20 / 200');
    expect(texto(consumo('kcal'))).toMatch(/faltan 1780/i);
  });

  it('marca si el macro está bajo, en el objetivo o por encima', () => {
    montar({ comidas: comidaCon('Desayuno', '', [POLLO, 1]), objetivos: OBJETIVOS });
    expect(consumo('kcal').dataset.estado).toBe('bajo');

    montar({ comidas: comidaCon('Todo', '', [ARROZ, 22]), objetivos: { ...OBJETIVOS, kcal: 2200 } });
    expect(consumo('kcal').dataset.estado).toBe('ok');

    montar({ comidas: comidaCon('Mucho', '', [ARROZ, 30]), objetivos: OBJETIVOS });
    expect(consumo('kcal').dataset.estado).toBe('alto');
    expect(texto(consumo('kcal'))).toMatch(/te pasás 1000/i);
  });

  it('sin objetivos (faltan datos del alumno) pide completarlos y igual muestra lo que suma', () => {
    montar({ comidas: comidaCon('Desayuno', '', [POLLO, 1]), objetivos: null });
    expect(contenedor.textContent).toContain('Completá los parámetros');
    expect(contenedor.textContent).toContain('120 kcal');
    expect(consumo('kcal')).toBeNull();
  });

  it('se actualiza cuando cambian los objetivos, sin tocar las comidas abiertas', () => {
    const comidas = comidaCon('Desayuno', '', [POLLO, 1]);
    montar({ comidas, objetivos: null });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();

    actualizarObjetivosDeComidas(OBJETIVOS);
    expect(texto(consumo('kcal'))).toContain('120 / 2000');
    expect(cuerpo(comidas[0].id).hidden).toBe(false);

    actualizarObjetivosDeComidas(null);
    expect(consumo('kcal')).toBeNull();
  });

  it('se recalcula al agregar alimentos', () => {
    const comidas = comidaCon('Desayuno', '');
    montar({ comidas, objetivos: OBJETIVOS });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    expect(texto(consumo('kcal'))).toContain('0 / 2000');
    agregarAlimento(comidas[0].id, PALTA);
    expect(texto(consumo('kcal'))).toContain('100 / 2000');
    expect(texto(consumo('f'))).toContain('11 / 60');
  });
});

describe('línea de tiempo', () => {
  it('lista las comidas por hora, con lo que aportan, y deja aparte las que no tienen horario', () => {
    const noche = comidaCon('Cena', '21:00', [ARROZ, 1])[0];
    const mañana = comidaCon('Desayuno', '08:00', [POLLO, 1])[0];
    const suelta = comidaCon('Merienda', '', [PALTA, 1])[0];
    montar({ comidas: [noche, mañana, suelta] });

    const horas = [...linea.querySelectorAll('[data-linea-comida]')].map((e) => e.dataset.lineaComida);
    expect(horas).toEqual([mañana.id, noche.id]);
    expect(linea.querySelector(`[data-linea-comida="${mañana.id}"]`).textContent).toContain('08:00');
    expect(linea.querySelector(`[data-linea-comida="${mañana.id}"]`).textContent).toContain('120 kcal');
    expect(linea.querySelector('[data-linea-sinhora]').textContent).toContain('Merienda');
  });

  it('se actualiza al cambiar la hora de una comida', () => {
    const comidas = comidaCon('Cena', '');
    montar({ comidas });
    expect(linea.querySelector('[data-linea-comida]')).toBeNull();
    ponerHora(comidas[0].id, '20:15');
    expect(linea.querySelector('[data-linea-comida]').textContent).toContain('20:15');
  });

  it('sin comidas lo dice', () => {
    montar();
    expect(linea.textContent).toContain('Todavía no hay comidas');
  });
});
