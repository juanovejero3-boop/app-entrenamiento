import { afterEach, describe, expect, it } from 'vitest';
import { iniciarPieFijo } from './pieFijo.js';

/** Un visualViewport de mentira: lo que el celular deja ver de la pantalla (menos el teclado). */
function crearVisor({ height, offsetTop = 0 }) {
  const visor = new EventTarget();
  Object.assign(visor, { height, offsetTop });
  return visor;
}
const ventana = (alto) => ({ innerHeight: alto });
const separacion = () => document.documentElement.style.getPropertyValue('--teclado');

let detener;
afterEach(() => {
  detener?.();
  document.documentElement.style.removeProperty('--teclado');
});

describe('pie de página fijo y teclado del celular', () => {
  it('sin teclado el menú queda pegado abajo (separación 0)', () => {
    detener = iniciarPieFijo({ visor: crearVisor({ height: 800 }), ventana: ventana(800) });
    expect(separacion()).toBe('0px');
  });

  it('con el teclado abierto sube justo lo que ocupa el teclado, así sigue siendo lo último de la pantalla', () => {
    const visor = crearVisor({ height: 800 });
    detener = iniciarPieFijo({ visor, ventana: ventana(800) });

    visor.height = 500; // el teclado ocupa 300px
    visor.dispatchEvent(new Event('resize'));

    expect(separacion()).toBe('300px');
  });

  it('si la página se scrolleó con el teclado abierto, la separación sigue al borde de abajo de lo visible', () => {
    const visor = crearVisor({ height: 500, offsetTop: 120 });
    detener = iniciarPieFijo({ visor, ventana: ventana(800) });
    visor.dispatchEvent(new Event('scroll'));
    expect(separacion()).toBe('180px'); // 800 - 500 - 120
  });

  it('cuando se cierra el teclado vuelve a 0', () => {
    const visor = crearVisor({ height: 500 });
    detener = iniciarPieFijo({ visor, ventana: ventana(800) });
    visor.height = 800;
    visor.dispatchEvent(new Event('resize'));
    expect(separacion()).toBe('0px');
  });

  it('nunca es negativa (el zoom o la barra del navegador pueden hacer que el visor sea más grande)', () => {
    detener = iniciarPieFijo({ visor: crearVisor({ height: 900 }), ventana: ventana(800) });
    expect(separacion()).toBe('0px');
  });

  it('en navegadores que ya achican la pantalla con el teclado no se suma dos veces', () => {
    // la altura de la ventana baja junto con el visor: el menú ya queda sobre el teclado
    detener = iniciarPieFijo({ visor: crearVisor({ height: 500 }), ventana: ventana(500) });
    expect(separacion()).toBe('0px');
  });

  it('sin visualViewport no hace nada y no se rompe', () => {
    detener = iniciarPieFijo({ visor: undefined, ventana: ventana(800) });
    expect(separacion()).toBe('');
  });

  it('la función que devuelve deja de escuchar y limpia la separación', () => {
    const visor = crearVisor({ height: 800 });
    detener = iniciarPieFijo({ visor, ventana: ventana(800) });
    detener();
    visor.height = 500;
    visor.dispatchEvent(new Event('resize'));
    expect(separacion()).toBe('');
  });
});
