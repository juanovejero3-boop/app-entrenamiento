import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desplazamientoParaVer, faltaEspacio, vigilarTeclado } from './escribirSinTapar.js';

describe('desplazamientoParaVer: cuánto hay que scrollear para que el campo quede a la vista', () => {
  const libre = { arriba: 330, abajo: 460 }; // lo que no tapan ni los encabezados fijos ni el teclado

  it('si el campo ya se ve entero no hay que mover nada', () => {
    expect(desplazamientoParaVer({ top: 360, bottom: 404 }, libre)).toBe(0);
  });

  it('si lo tapan los encabezados fijos, lo baja hasta dejarlo centrado en el espacio libre', () => {
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

describe('faltaEspacio: con el teclado abierto, ¿las cabeceras fijas dejan poco lugar para escribir?', () => {
  it('con mucho lugar libre no', () => {
    expect(faltaEspacio({ areaVisible: 800, tapa: 329 })).toBe(false);
  });

  it('con el teclado abierto en un celular chico sí', () => {
    expect(faltaEspacio({ areaVisible: 460, tapa: 329 })).toBe(true);
    expect(faltaEspacio({ areaVisible: 407, tapa: 329 })).toBe(true);
  });

  it('el límite son 200 px libres', () => {
    expect(faltaEspacio({ areaVisible: 529, tapa: 329 })).toBe(false);
    expect(faltaEspacio({ areaVisible: 528, tapa: 329 })).toBe(true);
  });
});

describe('vigilarTeclado: al tocar un campo de una serie lo deja a la vista', () => {
  let content;
  let campo;
  let barra;
  let cabecera;
  beforeEach(() => {
    vi.useFakeTimers();
    content = document.createElement('div');
    content.innerHTML = `
      <div data-barra-fija></div>
      <article>
        <div data-ej-cabecera></div>
        <div data-serie="e1-1"><input data-campo="kg"></div>
        <div data-serie="e1-2"><input data-campo="kg"></div>
      </article>
      <input data-otro>`;
    document.body.appendChild(content);
    barra = content.querySelector('[data-barra-fija]');
    cabecera = content.querySelector('[data-ej-cabecera]');
    campo = content.querySelector('[data-serie="e1-1"] input');
    Object.defineProperty(barra, 'offsetHeight', { value: 141 });
    Object.defineProperty(cabecera, 'offsetHeight', { value: 188 });
    cabecera.style.position = 'sticky';
    barra.getBoundingClientRect = () => ({ top: 0, bottom: 141 });
    cabecera.getBoundingClientRect = () => ({ top: 141, bottom: 329 });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(460);
    window.scrollBy = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });
  const enfocar = (el, rect) => {
    el.getBoundingClientRect = () => rect;
    el.focus();
    vi.advanceTimersByTime(400);
  };

  it('si el campo queda tapado por los encabezados, scrollea para que se vea', () => {
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

  it('con poco lugar libre la cabecera del ejercicio deja de ser fija mientras se escribe', () => {
    vigilarTeclado(content); // área visible 460, tapan 329: quedan 131 px
    enfocar(campo, { top: 360, bottom: 404 });
    expect('areaChica' in content.dataset).toBe(true);
  });

  it('con lugar de sobra no toca las cabeceras', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900);
    vigilarTeclado(content);
    enfocar(campo, { top: 400, bottom: 444 });
    expect('areaChica' in content.dataset).toBe(false);
  });

  it('al salir del campo las cabeceras vuelven a ser fijas', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 360, bottom: 404 });
    campo.blur();
    vi.advanceTimersByTime(400);
    expect('areaChica' in content.dataset).toBe(false);
  });

  it('pasando de un campo a otro (tecla Siguiente) no se sueltan y vuelven a poner las cabeceras', () => {
    vigilarTeclado(content);
    enfocar(campo, { top: 360, bottom: 404 });
    const siguiente = content.querySelector('[data-serie="e1-2"] input');
    siguiente.getBoundingClientRect = () => ({ top: 420, bottom: 464 });
    siguiente.focus();
    vi.advanceTimersByTime(400);
    expect('areaChica' in content.dataset).toBe(true);
    expect(window.scrollBy).toHaveBeenCalled(); // este quedaba tapado por el teclado
  });

  it('los campos que no son de una serie se dejan en paz', () => {
    vigilarTeclado(content);
    enfocar(content.querySelector('[data-otro]'), { top: 100, bottom: 140 });
    expect(window.scrollBy).not.toHaveBeenCalled();
    expect('areaChica' in content.dataset).toBe(false);
  });

  it('vigilar dos veces el mismo contenedor no duplica la corrección', () => {
    vigilarTeclado(content);
    vigilarTeclado(content);
    enfocar(campo, { top: 209, bottom: 253 });
    // una sola corrección (el mock no mueve el campo, por eso se reintenta un par de veces como máximo)
    expect(window.scrollBy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('usa el área que deja libre el teclado (visualViewport) cuando el navegador la informa', () => {
    const viewport = new EventTarget();
    Object.assign(viewport, { offsetTop: 0, height: 700 }); // sin teclado: mucho lugar
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    vigilarTeclado(content);
    enfocar(campo, { top: 400, bottom: 444 });
    expect('areaChica' in content.dataset).toBe(false);
    viewport.height = 440; // aparece el teclado
    campo.getBoundingClientRect = () => ({ top: 400, bottom: 444 });
    viewport.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(400);
    expect('areaChica' in content.dataset).toBe(true);
  });
});

afterEach(() => {
  delete window.visualViewport;
});
