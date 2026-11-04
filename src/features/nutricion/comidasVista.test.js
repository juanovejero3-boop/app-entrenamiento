import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js'; // modales propios: window.alert / window.confirm reales de la app
import { alimentosIniciales } from './alimentos.js';
import { agregarItem, crearComida } from './comidas.js';
import { actualizarObjetivosDeComidas, montarComidas } from './comidasVista.js';

const ALIMENTOS = alimentosIniciales();
const alimento = (nombre) => ALIMENTOS.find((a) => a.nombre === nombre);
const POLLO = alimento('Pechuga de Pollo'); // proteínas: 120 kcal, P 25 por porción
const ARROZ = alimento('Arroz Blanco (Cocido)'); // carbohidratos: 100 kcal, C 20
const PALTA = alimento('Palta / Aguacate'); // grasas: 100 kcal, G 11
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
function agregarAlimento(comidaId, a, porciones = 1) {
  const opcion = $(`[data-comida="${comidaId}"] [data-opcion]`);
  opcion.querySelector('[data-agregar-alimento]').value = a.id;
  opcion.querySelector('[data-agregar-porciones]').value = String(porciones);
  opcion.querySelector('[data-click="itemAgregar"]').click();
}
function escribir(campo, valor) {
  campo.value = valor;
  campo.dispatchEvent(new Event('change', { bubbles: true }));
}

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

  it('cambiar el nombre y la hora', () => {
    const comidas = comidaCon('Comida 1', '', [POLLO, 1]);
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    escribir($('[data-comida-nombre]'), 'Almuerzo');
    escribir($('[data-comida-hora]'), '13:30');
    expect(guardadas[0]).toMatchObject({ nombre: 'Almuerzo', hora: '13:30' });
    expect(comida(comidas[0].id).textContent).toContain('Almuerzo');
    expect(comida(comidas[0].id).textContent).toContain('13:30');
  });

  it('un nombre vacío no pisa el que había', () => {
    const comidas = comidaCon('Cena', '');
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    escribir($('[data-comida-nombre]'), '   ');
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

describe('alimentos de una comida', () => {
  let comidas;
  let id;
  beforeEach(() => {
    comidas = comidaCon('Almuerzo', '13:00');
    id = comidas[0].id;
    montar({ comidas });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
  });

  it('se elige un alimento de la biblioteca y las porciones, y se suma con sus macros', () => {
    agregarAlimento(id, POLLO, 2);
    const fila = $('[data-item]');
    expect(fila.textContent).toContain('Pechuga de Pollo');
    expect(fila.textContent).toContain('100g');
    expect(fila.querySelector('[data-change="itemPorciones"]').value).toBe('2');
    expect(texto($('[data-opcion-macros]'))).toContain('240 kcal');
    expect(texto($('[data-opcion-macros]'))).toContain('P 50');
  });

  it('el selector agrupa los alimentos por categoría', () => {
    const grupos = $$('[data-agregar-alimento] optgroup').map((g) => g.label);
    expect(grupos).toContain('Proteínas');
    expect(grupos).toContain('Carbohidratos');
  });

  it('agregar de nuevo el mismo alimento suma las porciones', () => {
    agregarAlimento(id, POLLO, 1);
    agregarAlimento(id, POLLO, 1.5);
    expect($$('[data-item]')).toHaveLength(1);
    expect($('[data-change="itemPorciones"]').value).toBe('2.5');
  });

  it('sin elegir ningún alimento no agrega nada', () => {
    $('[data-click="itemAgregar"]').click();
    expect($$('[data-item]')).toHaveLength(0);
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it('porciones inválidas en el agregado: no agrega', () => {
    agregarAlimento(id, POLLO, 0);
    expect($$('[data-item]')).toHaveLength(0);
  });

  it('cambiar las porciones recalcula los macros', () => {
    agregarAlimento(id, ARROZ, 1);
    escribir($('[data-change="itemPorciones"]'), '3');
    expect(texto($('[data-opcion-macros]'))).toContain('300 kcal');
    expect(guardadas[0].opciones[0].items[0].porciones).toBe(3);
  });

  it('poner 0 porciones quita el alimento', () => {
    agregarAlimento(id, ARROZ, 1);
    escribir($('[data-change="itemPorciones"]'), '0');
    expect($$('[data-item]')).toHaveLength(0);
  });

  it('el botón quitar saca el alimento', () => {
    agregarAlimento(id, ARROZ, 1);
    agregarAlimento(id, POLLO, 1);
    $('[data-item] [data-click="itemQuitar"]').click();
    expect($$('[data-item]').map((f) => texto(f))).toHaveLength(1);
    expect(guardadas[0].opciones[0].items).toHaveLength(1);
  });

  it('la comida muestra en su encabezado cuánto aporta', () => {
    agregarAlimento(id, POLLO, 1);
    expect(texto(comida(id).querySelector('[data-click="comidaToggle"]'))).toContain('120 kcal');
  });

  it('seguir editando no cierra la comida abierta', () => {
    agregarAlimento(id, POLLO, 1);
    agregarAlimento(id, ARROZ, 1);
    expect(cuerpo(id).hidden).toBe(false);
  });

  it('sin alimentos en la biblioteca lo avisa y no deja agregar', () => {
    montar({ comidas, alimentos: [] });
    $(`[data-click="comidaToggle"][data-id="${id}"]`).click();
    expect(contenedor.textContent).toContain('La biblioteca de alimentos está vacía');
    expect($('[data-agregar-alimento]').disabled).toBe(true);
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

  it('"Variante" suma una opción vacía con sus propios alimentos', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    expect($$('[data-opcion]')).toHaveLength(2);
    const segunda = $$('[data-opcion]')[1];
    segunda.querySelector('[data-agregar-alimento]').value = ARROZ.id;
    segunda.querySelector('[data-agregar-porciones]').value = '2';
    segunda.querySelector('[data-click="itemAgregar"]').click();
    expect($$('[data-opcion]')[0].querySelectorAll('[data-item]')).toHaveLength(1);
    expect($$('[data-opcion]')[1].querySelectorAll('[data-item]')).toHaveLength(1);
  });

  it('explica que la primera opción es la que cuenta para el total', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    expect(comida(id).textContent).toMatch(/primera opción/i);
  });

  it('las variantes no suman al total del día', () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    const segunda = $$('[data-opcion]')[1];
    segunda.querySelector('[data-agregar-alimento]').value = PALTA.id;
    segunda.querySelector('[data-agregar-porciones]').value = '10';
    segunda.querySelector('[data-click="itemAgregar"]').click();
    expect(texto(consumo('kcal'))).toContain('120'); // solo el pollo de la opción 1
  });

  it('se elimina una variante (con confirmación si tiene alimentos)', async () => {
    $(`[data-click="opcionNueva"][data-id="${id}"]`).click();
    const segunda = $$('[data-opcion]')[1];
    segunda.querySelector('[data-agregar-alimento]').value = ARROZ.id;
    segunda.querySelector('[data-click="itemAgregar"]').click();

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
    agregarAlimento(comidas[0].id, PALTA, 2);
    expect(texto(consumo('kcal'))).toContain('200 / 2000');
    expect(texto(consumo('f'))).toContain('22 / 60');
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
    $(`[data-click="comidaToggle"][data-id="${comidas[0].id}"]`).click();
    escribir($('[data-comida-hora]'), '20:15');
    expect(linea.querySelector('[data-linea-comida]').textContent).toContain('20:15');
  });

  it('sin comidas lo dice', () => {
    montar();
    expect(linea.textContent).toContain('Todavía no hay comidas');
  });
});
