import { afterEach, describe, expect, it, vi } from 'vitest';
import { registrarAcciones } from './acciones.js';

// El registro es global al módulo: cada test usa nombres de acción únicos.
let n = 0;
const nombre = (base) => `${base}_${++n}`;

function montar(html) {
  const cont = document.createElement('div');
  cont.innerHTML = html;
  document.body.appendChild(cont);
  return cont;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('registrarAcciones', () => {
  it('falla si se registra dos veces el mismo nombre (evita pisadas silenciosas)', () => {
    const a = nombre('dup');
    registrarAcciones({ [a]: () => {} });
    expect(() => registrarAcciones({ [a]: () => {} })).toThrow(`Acción duplicada: ${a}`);
  });
});

describe('despacho de data-click', () => {
  it('llama a la acción con el elemento y el evento, y los data-* llegan como dataset', () => {
    const a = nombre('click');
    const accion = vi.fn();
    registrarAcciones({ [a]: accion });
    const cont = montar(`<button data-click="${a}" data-id="u1" data-dir="-1">x</button>`);
    const btn = cont.querySelector('button');

    btn.click();

    expect(accion).toHaveBeenCalledTimes(1);
    const [el, e] = accion.mock.calls[0];
    expect(el).toBe(btn);
    expect(e.type).toBe('click');
    expect(el.dataset.id).toBe('u1');
    expect(Number(el.dataset.dir)).toBe(-1);
  });

  it('un clic en un hijo (ej. el ícono) dispara la acción del botón', () => {
    const a = nombre('hijo');
    const accion = vi.fn();
    registrarAcciones({ [a]: accion });
    const cont = montar(`<button data-click="${a}"><i class="icono">i</i></button>`);

    cont.querySelector('.icono').click();

    expect(accion).toHaveBeenCalledTimes(1);
    expect(accion.mock.calls[0][0]).toBe(cont.querySelector('button'));
  });

  it('con acciones anidadas corre primero la de adentro y después la de afuera (como el burbujeo inline)', () => {
    const afuera = nombre('afuera');
    const adentro = nombre('adentro');
    const orden = [];
    registrarAcciones({ [afuera]: () => orden.push('afuera'), [adentro]: () => orden.push('adentro') });
    const cont = montar(`<div data-click="${afuera}"><button data-click="${adentro}">x</button></div>`);

    cont.querySelector('button').click();

    expect(orden).toEqual(['adentro', 'afuera']);
  });

  it('stopPropagation en la acción de adentro corta el recorrido', () => {
    const afuera = nombre('afuera');
    const adentro = nombre('adentro');
    const deAfuera = vi.fn();
    registrarAcciones({ [afuera]: deAfuera, [adentro]: (el, e) => e.stopPropagation() });
    const cont = montar(`<div data-click="${afuera}"><button data-click="${adentro}">x</button></div>`);

    cont.querySelector('button').click();

    expect(deAfuera).not.toHaveBeenCalled();
  });

  it('un botón deshabilitado no ejecuta su acción aunque el clic venga de un hijo', () => {
    // Un clic directo sobre un <button disabled> ni siquiera llega al listener (lo frena el
    // navegador), pero uno que sale de un hijo (ej. el ícono) sí: ese caso lo cubre el chequeo.
    const a = nombre('deshabilitado');
    const accion = vi.fn();
    registrarAcciones({ [a]: accion });
    const cont = montar(`<button disabled data-click="${a}"><i class="icono">i</i></button>`);

    cont.querySelector('.icono').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(accion).not.toHaveBeenCalled();
  });

  it('una acción no registrada no rompe: avisa por consola', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cont = montar(`<button data-click="noExiste_${++n}">x</button>`);

    cont.querySelector('button').click();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Acción no registrada'));
  });

  it('ignora clics fuera de elementos con data-click', () => {
    const a = nombre('ajeno');
    const accion = vi.fn();
    registrarAcciones({ [a]: accion });
    const cont = montar(`<button data-click="${a}">x</button><p class="otro">texto</p>`);

    cont.querySelector('.otro').click();

    expect(accion).not.toHaveBeenCalled();
  });
});

describe('otros tipos de evento', () => {
  it('data-input recibe el input con su valor actual', () => {
    const a = nombre('input');
    const valores = [];
    registrarAcciones({ [a]: (el) => valores.push(el.value) });
    const cont = montar(`<input data-input="${a}">`);
    const input = cont.querySelector('input');

    input.value = 'jua';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(valores).toEqual(['jua']);
  });

  it('data-change recibe el valor nuevo (reemplaza a this.value)', () => {
    const a = nombre('change');
    const accion = vi.fn();
    registrarAcciones({ [a]: (el) => accion(el.dataset.id, el.value) });
    const cont = montar(`<input data-change="${a}" data-id="item-1" value="viejo">`);
    const input = cont.querySelector('input');

    input.value = 'nuevo';
    input.dispatchEvent(new Event('change', { bubbles: true }));

    expect(accion).toHaveBeenCalledWith('item-1', 'nuevo');
  });

  it('data-submit recibe el evento y preventDefault evita el envío', () => {
    const a = nombre('submit');
    let evento;
    registrarAcciones({
      [a]: (el, e) => {
        e.preventDefault();
        evento = e;
      },
    });
    const cont = montar(`<form data-submit="${a}"><button type="submit">Enviar</button></form>`);
    const form = cont.querySelector('form');

    const e = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(e);

    expect(evento).toBe(e);
    expect(e.defaultPrevented).toBe(true);
  });
});
