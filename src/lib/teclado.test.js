import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarTeclado } from './teclado.js';

let detener;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `
    <nav id="nav">menú</nav>
    <input id="texto" type="text">
    <input id="numero" type="number">
    <textarea id="area"></textarea>
    <input id="chk" type="checkbox">
    <input id="fecha" type="date">
    <select id="sel"><option>a</option></select>
    <button id="boton">ok</button>`;
  detener = iniciarTeclado({ esTactil: () => true });
});
afterEach(() => {
  detener();
  vi.useRealTimers();
  document.body.className = '';
  document.body.innerHTML = '';
});

const enfocar = (id) => document.getElementById(id).focus();
const desenfocar = (id) => {
  document.getElementById(id).blur();
  vi.advanceTimersByTime(200);
};
const tecladoAbierto = () => document.body.classList.contains('teclado-abierto');

describe('pie de página y teclado del celular', () => {
  it('al escribir en un campo de texto se esconde el menú de abajo (si no, salta por encima del teclado)', () => {
    enfocar('texto');
    expect(tecladoAbierto()).toBe(true);
  });

  it('al salir del campo vuelve a aparecer', () => {
    enfocar('texto');
    desenfocar('texto');
    expect(tecladoAbierto()).toBe(false);
  });

  it.each(['numero', 'area'])('también con %s', (id) => {
    enfocar(id);
    expect(tecladoAbierto()).toBe(true);
  });

  it('pasar de un campo a otro no hace parpadear el menú: sigue escondido', () => {
    enfocar('texto');
    document.getElementById('texto').blur();
    enfocar('numero'); // el foco pasa a otro campo antes de que venza la espera
    vi.advanceTimersByTime(200);
    expect(tecladoAbierto()).toBe(true);
  });

  it.each(['chk', 'fecha', 'sel', 'boton'])('un %s no abre el teclado, así que el menú queda', (id) => {
    enfocar(id);
    expect(tecladoAbierto()).toBe(false);
  });

  it('en una compu (sin pantalla táctil) no se esconde nada', () => {
    detener();
    detener = iniciarTeclado({ esTactil: () => false });
    enfocar('texto');
    expect(tecladoAbierto()).toBe(false);
  });

  it('la función que devuelve deja de escuchar', () => {
    detener();
    enfocar('texto');
    expect(tecladoAbierto()).toBe(false);
  });

  it('si se cierra la pantalla con un campo enfocado el menú no se queda escondido, aunque el navegador no avise', async () => {
    enfocar('texto');
    document.getElementById('texto').remove(); // al borrar un campo enfocado no se dispara ningún focusout
    await vi.advanceTimersByTimeAsync(300);
    expect(tecladoAbierto()).toBe(false);
  });

  it('si la clase quedó pegada, un toque en cualquier lado la corrige', async () => {
    document.body.classList.add('teclado-abierto'); // por ejemplo, de una sesión anterior
    document.getElementById('boton').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(300);
    expect(tecladoAbierto()).toBe(false);
  });

  it('mientras el campo sigue enfocado, los cambios de la pantalla no muestran el menú', async () => {
    enfocar('texto');
    document.body.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(300);
    expect(tecladoAbierto()).toBe(true);
  });
});
