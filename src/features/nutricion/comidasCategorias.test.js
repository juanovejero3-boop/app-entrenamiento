import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js';
import { alimentosIniciales, CATEGORIAS } from './alimentos.js';
import { agregarItem, crearComida } from './comidas.js';
import { montarComidas } from './comidasVista.js';

const ALIMENTOS = alimentosIniciales();
const alimento = (nombre) => ALIMENTOS.find((a) => a.nombre === nombre);
const POLLO = alimento('Pechuga de Pollo'); // proteínas
const OBJETIVOS = { kcal: 2000, p: 150, c: 200, f: 60 };

let contenedor;
let linea;
let guardadas;
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
const dialogo = () => document.querySelector('#app-modal-overlay [data-dialogo-categoria]');
const montar = (comidas, { alimentos = ALIMENTOS, objetivos = null } = {}) =>
  montarComidas({ contenedor, lineaDeTiempo: linea, comidas, alimentos, objetivos, alCambiar });
const comidaVacia = () => [crearComida({ nombre: 'Almuerzo', hora: '13:00' })];
const botonCategoria = (id) => $(`[data-click="categoriaAbrir"][data-categoria="${id}"]`);
const abrirCategoria = (id) => {
  document.querySelector('#app-modal-overlay')?.remove();
  botonCategoria(id).click();
};
const filas = () => [...dialogo().querySelectorAll('[data-click="categoriaAgregar"]')];
const fila = (nombre) => filas().find((f) => f.querySelector('[data-dialogo-nombre]').textContent === nombre);

describe('comidas: categorías en un diálogo', () => {
  it('debajo del buscador hay un botón por cada categoría que tiene alimentos', () => {
    montar(comidaVacia());
    expect($('[data-buscar-alimento]')).not.toBeNull(); // el buscador sigue
    const categorias = $$('[data-click="categoriaAbrir"]').map((b) => b.dataset.categoria);
    expect(categorias).toEqual(CATEGORIAS.filter((c) => ALIMENTOS.some((a) => a.categoria === c.id)).map((c) => c.id));
  });

  it('una categoría sin alimentos no tiene botón', () => {
    montar(comidaVacia(), { alimentos: ALIMENTOS.filter((a) => a.categoria !== 'fats') });
    expect(botonCategoria('fats')).toBeNull();
    expect(botonCategoria('proteins')).not.toBeNull();
  });

  it('sin alimentos en la biblioteca no hay botones', () => {
    montar(comidaVacia(), { alimentos: [] });
    expect($('[data-categorias]')).toBeNull();
  });

  it('cada opción tiene sus botones', () => {
    const [c] = comidaVacia();
    montar([{ ...c, opciones: [...c.opciones, { id: 'o2', items: [] }] }]);
    expect($$('[data-categorias]')).toHaveLength(2);
  });

  it('tocar una categoría abre un diálogo con todos sus alimentos, ordenados, y lo que aporta cada porción', () => {
    montar(comidaVacia());
    abrirCategoria('proteins');
    expect(dialogo()).not.toBeNull();
    expect(dialogo().textContent).toContain('Proteínas');
    expect(dialogo().textContent).toMatch(/120 kcal/);
    const nombres = filas().map((f) => f.querySelector('[data-dialogo-nombre]').textContent);
    const esperados = ALIMENTOS.filter((a) => a.categoria === 'proteins')
      .map((a) => a.nombre)
      .sort((x, y) => x.localeCompare(y, 'es'));
    expect(nombres).toEqual(esperados);
    expect(fila('Pechuga de Pollo').textContent).toContain('100g');
  });

  it('tocar un alimento lo agrega con 1 porción a esa opción y el diálogo sigue abierto', () => {
    const comidas = comidaVacia();
    montar(comidas);
    abrirCategoria('proteins');
    fila('Pechuga de Pollo').click();
    expect(alCambiar).toHaveBeenCalledTimes(1);
    const items = guardadas[0].opciones[0].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ nombre: 'Pechuga de Pollo', porciones: 1, categoria: 'proteins' });
    expect(dialogo()).not.toBeNull();
  });

  it('se pueden sumar varios alimentos seguidos y el diálogo marca cuántas porciones lleva cada uno', () => {
    montar(comidaVacia());
    abrirCategoria('proteins');
    fila('Pechuga de Pollo').click();
    fila('Pechuga de Pollo').click();
    const otro = filas().find((f) => f.querySelector('[data-dialogo-nombre]').textContent !== 'Pechuga de Pollo');
    otro.click();
    expect(guardadas[0].opciones[0].items.map((i) => i.porciones)).toEqual([2, 1]);
    expect(fila('Pechuga de Pollo').querySelector('[data-dialogo-cantidad]').textContent).toBe('2 × ');
    expect(fila('Pechuga de Pollo').querySelector('[data-dialogo-cantidad]').hidden).toBe(false);
    expect(otro.querySelector('[data-dialogo-cantidad]').textContent).toBe('1 × ');
  });

  it('al abrirlo marca lo que esa opción ya tenía', () => {
    const base = comidaVacia();
    const comidas = agregarItem(base, base[0].id, base[0].opciones[0].id, POLLO, 3);
    montar(comidas);
    abrirCategoria('proteins');
    expect(fila('Pechuga de Pollo').querySelector('[data-dialogo-cantidad]').textContent).toBe('3 × ');
    const sinAgregar = filas().find((f) => f.querySelector('[data-dialogo-nombre]').textContent !== 'Pechuga de Pollo');
    expect(sinAgregar.querySelector('[data-dialogo-cantidad]').hidden).toBe(true);
  });

  it('agrega a la opción desde la que se abrió, no a otra', () => {
    const [c] = comidaVacia();
    montar([{ ...c, opciones: [c.opciones[0], { id: 'o2', items: [] }] }]);
    const segunda = $$('[data-opcion]')[1];
    segunda.querySelector('[data-click="categoriaAbrir"][data-categoria="proteins"]').click();
    fila('Pechuga de Pollo').click();
    expect(guardadas[0].opciones[0].items).toHaveLength(0);
    expect(guardadas[0].opciones[1].items).toHaveLength(1);
  });

  it('la lista de atrás se actualiza mientras el diálogo sigue abierto', () => {
    montar(comidaVacia());
    abrirCategoria('proteins');
    fila('Pechuga de Pollo').click();
    expect($$('[data-item]')).toHaveLength(1);
  });

  it('no le roba el foco al diálogo (en el celular abriría el teclado)', () => {
    montar(comidaVacia());
    abrirCategoria('proteins');
    fila('Pechuga de Pollo').click();
    expect(document.activeElement).not.toBe($('[data-buscar-alimento]'));
  });

  it('Listo y la X cierran el diálogo', () => {
    montar(comidaVacia());
    abrirCategoria('proteins');
    dialogo().querySelectorAll('[data-click="categoriaCerrar"]')[1].click(); // Listo
    expect(document.getElementById('app-modal-overlay').style.display).toBe('none');
    abrirCategoria('proteins');
    dialogo().querySelector('[data-click="categoriaCerrar"]').click(); // la X
    expect(document.getElementById('app-modal-overlay').style.display).toBe('none');
  });

  it('si no se pudo guardar, no aparece como agregado', () => {
    alCambiar.mockReturnValue(false);
    montar(comidaVacia());
    abrirCategoria('proteins');
    fila('Pechuga de Pollo').click();
    expect($$('[data-item]')).toHaveLength(0);
    expect(fila('Pechuga de Pollo').querySelector('[data-dialogo-cantidad]').hidden).toBe(true);
  });

  it('los nombres se muestran como texto, no como HTML', () => {
    const raro = { ...POLLO, id: 'x', nombre: '<img src=x onerror=alert(1)>' };
    montar(comidaVacia(), { alimentos: [raro] });
    abrirCategoria('proteins');
    expect(dialogo().querySelector('img')).toBeNull();
    expect(dialogo().textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('comidas: tablero de nutrientes fijo y con colores', () => {
  const panel = () => $('[data-consumo-panel]');
  const columna = (clave) => $(`[data-consumo="${clave}"]`);

  it('con objetivos queda fijo arriba al scrollear', () => {
    montar(comidaVacia(), { objetivos: OBJETIVOS });
    expect(panel().classList.contains('sticky')).toBe(true);
    expect(panel().classList.contains('top-0')).toBe(true);
  });

  it('sin objetivos no se pega: es solo un aviso', () => {
    montar(comidaVacia());
    expect(panel().classList.contains('sticky')).toBe(false);
  });

  it('cada nutriente tiene su propio color', () => {
    montar(comidaVacia(), { objetivos: OBJETIVOS });
    const colores = ['kcal', 'p', 'c', 'f'].map(
      (k) =>
        columna(k)
          .querySelector('p')
          .className.match(/text-\w+-300/)[0],
    );
    expect(new Set(colores).size).toBe(4);
    const barras = ['kcal', 'p', 'c', 'f'].map(
      (k) =>
        columna(k)
          .querySelector('.h-full')
          .className.match(/bg-\w+-\d+/)[0],
    );
    expect(new Set(barras).size).toBe(4);
  });

  it('muestra lo que lleva y el objetivo de cada uno (actual / objetivo)', () => {
    const base = comidaVacia();
    montar(agregarItem(base, base[0].id, base[0].opciones[0].id, POLLO, 1), { objetivos: OBJETIVOS });
    expect(columna('kcal').textContent.replace(/\s+/g, ' ')).toContain('120 / 2000');
    expect(columna('p').textContent.replace(/\s+/g, ' ')).toContain('25 / 150');
  });

  it('si el plan se pasa del objetivo, la barra se pone roja', () => {
    const base = comidaVacia();
    montar(agregarItem(base, base[0].id, base[0].opciones[0].id, POLLO, 50), { objetivos: OBJETIVOS });
    expect(columna('kcal').dataset.estado).toBe('alto');
    expect(columna('kcal').querySelector('.h-full').className).toContain('bg-red-500');
  });

  it('las cuatro columnas van en una sola fila (ocupa poco alto en el celular)', () => {
    montar(comidaVacia(), { objetivos: OBJETIVOS });
    expect(panel().querySelector('.grid').className).toContain('grid-cols-4');
  });

  it('pasa a ser fijo cuando se completan los datos del alumno, y deja de serlo si faltan', async () => {
    const { actualizarObjetivosDeComidas } = await import('./comidasVista.js');
    montar(comidaVacia());
    actualizarObjetivosDeComidas(OBJETIVOS);
    expect(panel().classList.contains('sticky')).toBe(true);
    actualizarObjetivosDeComidas(null);
    expect(panel().classList.contains('sticky')).toBe(false);
  });
});
