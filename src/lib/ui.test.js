import { afterEach, describe, expect, it } from 'vitest';
import './ui.js'; // instala window.alert / window.confirm y registra las acciones de los modales

const overlayAux = () => document.getElementById('app-modal-overlay-aux');
const boton = (selector) => overlayAux().querySelector(selector);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('window.alert propio', () => {
  it('muestra el mensaje y se cierra con "Entendido"', () => {
    window.alert('Hola');

    expect(overlayAux().style.display).toBe('flex');
    expect(overlayAux().textContent).toContain('Hola');

    boton('[data-click="cerrarModalAux"]').click();

    expect(overlayAux().style.display).toBe('none');
  });

  it('muestra el HTML del mensaje como texto (no lo interpreta)', () => {
    window.alert('<img src=x onerror="window.__xss = true">');

    expect(overlayAux().querySelector('img')).toBeNull();
    expect(overlayAux().textContent).toContain('<img src=x');
  });
});

describe('window.confirm propio', () => {
  it('devuelve true con "Confirmar" y cierra el modal', async () => {
    const respuesta = window.confirm('¿Seguro?');

    boton('[data-click="resolverModal"][data-valor="true"]').click();

    await expect(respuesta).resolves.toBe(true);
    expect(overlayAux().style.display).toBe('none');
  });

  it('devuelve false con "Cancelar"', async () => {
    const respuesta = window.confirm('¿Seguro?');

    boton('[data-click="resolverModal"][data-valor="false"]').click();

    await expect(respuesta).resolves.toBe(false);
  });
});

describe('togglePassword', () => {
  it('alterna el input entre password y texto, y cambia el ícono', () => {
    document.body.innerHTML = `
      <input id="pw" type="password">
      <button data-click="togglePassword" data-campo="pw"></button>`;
    const btn = document.querySelector('button');

    btn.click();
    expect(document.getElementById('pw').type).toBe('text');
    expect(btn.innerHTML).toContain('fa-eye-slash');

    btn.click();
    expect(document.getElementById('pw').type).toBe('password');
    expect(btn.innerHTML).toContain('fa-eye');
  });
});
