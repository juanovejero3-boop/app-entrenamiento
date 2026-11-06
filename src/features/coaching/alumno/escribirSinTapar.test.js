import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desplazamientoParaVer, vigilarTeclado } from './escribirSinTapar.js';

describe('desplazamientoParaVer: cuánto hay que scrollear para que el campo quede a la vista', () => {
  const libre = { arriba: 330, abajo: 460 }; // lo que no tapan ni la barra fija ni el teclado

  it('si el campo ya se ve entero no hay que mover nada', () => {
    expect(desplazamientoParaVer({ top: 360, bottom: 404 }, libre)).toBe(0);
  });

  it('si lo tapa la barra fija, lo baja hasta dejarlo centrado en el espacio libre', () => {
    // campo de 44 px: el centro del espacio libre (130 px) lo deja entre 373 y 417
    expect(desplazamientoParaVer({ top: 209, bottom: 253 }, libre)).toBe(209 - 373);
  });

  it('si lo tapa el teclado, lo sube', () => {
    expect(desplazamientoParaVer({ top: 500, bottom: 544 }, libre)).toBe(500 - 373);
  });

  it('un campo justo pegado al borde también se corrige (se deja un margen)', () => {
    expect(desplazamientoParaVer({ top: 332, bottom: 376 }, libre)).not.toBe(0);
    expect(desplazamientoParaVer({ top: 400, bottom: 458 }, libre)).not.toBe(0);
  });
});

describe('vigilarTeclado: al tocar un campo de una serie lo deja a la vista', () => {
  let content;
  let campo;
  let barra;
  beforeEach(() => {
    vi.useFakeTimers();
    content = document.createElement('div');
    content.innerHTML = `
      <div data-barra-fija></div>
      <article>
        <div data-serie="e1-1"><input data-campo="kg"></div>
        <div data-serie="e1-2"><input data-campo="kg"></div>
      </article>
      <input data-otro>`;
    document.body.appendChild(content);
    barra = content.querySelector('[data-barra-fija]');
    barra.getBoundingClientRect = () => ({ top: 0, bottom: 329 });
    campo = content.querySelector('[data-serie="e1-1"] input');
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(460);
    window.scrollBy = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.visualViewport;
    document.body.innerHTML = '';
  });
  const enfocar = (el, rect) => {
    el.getBoundingClientRect = () => rect;
    el.focus();
    vi.advanceTimersByTime(400);
  };

  it('si el campo queda tapado por la barra fija, scrollea para que se vea', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 209, bottom: 253 });
    expect(window.scrollBy).toHaveBeenCalled();
    expect(window.scrollBy.mock.calls[0][1]).toBeLessThan(0); // sube el contenido: scrollea hacia arriba
  });

  it('si el campo ya se ve, no mueve nada', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 360, bottom: 404 });
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('si lo tapa el teclado, lo sube', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 500, bottom: 544 });
    expect(window.scrollBy.mock.calls[0][1]).toBeGreaterThan(0);
  });

  it('pasando de un campo a otro (tecla Siguiente) acomoda también el siguiente', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 360, bottom: 404 });
    const siguiente = content.querySelector('[data-serie="e1-2"] input');
    siguiente.getBoundingClientRect = () => ({ top: 420, bottom: 464 });
    siguiente.focus();
    vi.advanceTimersByTime(400);
    expect(window.scrollBy).toHaveBeenCalled(); // este quedaba tapado por el teclado
  });

  it('los campos que no son de una serie se dejan en paz', () => {
    vigilarTeclado(content);
    enfocar(content.querySelector('[data-otro]'), { top: 100, bottom: 140 });
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('vigilar dos veces el mismo contenedor no duplica la corrección', () => {
    vigilarTeclado(content);
    vigilarTeclado(content);
    enfocar(campo, { top: 209, bottom: 253 });
    // una sola corrección (el mock no mueve el campo, por eso se reintenta un par de veces como máximo)
    expect(window.scrollBy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('al scrollear con el teclado abierto no se le pelea: los cambios de tamaño de pantalla tardíos no mueven nada', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 440 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    vigilarTeclado(content);
    enfocar(campo, { top: 360, bottom: 404 });
    window.scrollBy.mockClear();
    vi.advanceTimersByTime(5000); // pasó un buen rato: el alumno está scrolleando
    campo.getBoundingClientRect = () => ({ top: 100, bottom: 144 }); // el campo quedó tapado por el scroll del alumno
    viewport.dispatchEvent(new Event('resize')); // el navegador esconde su barra de direcciones
    vi.advanceTimersByTime(1000);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('si el alumno empieza a scrollear antes de que se acomode, se cancela la corrección', () => {
    vigilarTeclado(content);
    campo.getBoundingClientRect = () => ({ top: 209, bottom: 253 });
    campo.focus();
    vi.advanceTimersByTime(100); // todavía no se acomodó
    content.dispatchEvent(new Event('touchmove', { bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(window.scrollBy).not.toHaveBeenCalled();
  });

  it('mientras sube el teclado, el cambio de tamaño de la pantalla vuelve a acomodar el campo', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 700 }); // todavía sin teclado
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    vigilarTeclado(content);
    enfocar(campo, { top: 400, bottom: 444 });
    expect(window.scrollBy).not.toHaveBeenCalled(); // con 700 px se ve de sobra
    viewport.height = 440; // aparece el teclado
    campo.getBoundingClientRect = () => ({ top: 400, bottom: 444 });
    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(400);
    expect(window.scrollBy).toHaveBeenCalled();
  });
});
