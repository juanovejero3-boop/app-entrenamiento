import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { switchTab } from './router.js';
import { renderApp } from './shell.js';
import { state } from './state.js';

vi.mock('./router.js', () => ({ switchTab: vi.fn() }));
vi.mock('./features/reservas/reservas.js', () => ({ setPublicBooking: vi.fn() }));

beforeEach(() => {
  document.body.innerHTML = `<nav style="display:none"><div class="max-w-lg"></div></nav>`;
  state.currentTab = 'perfil'; // ya hay una pestaña abierta: no se navega sola
});
afterEach(() => {
  document.body.innerHTML = '';
  state.userProfile = null;
  state.currentTab = null;
  vi.mocked(switchTab).mockClear();
});

const botones = () => [...document.querySelectorAll('nav [data-click="switchTab"]')].map((b) => b.dataset.tab);

describe('barra inferior según el rol', () => {
  it('el admin ve Nutrición y Admin, en ese orden', () => {
    state.userProfile = { role: 'admin' };
    renderApp();
    expect(botones()).toEqual(['nutricion', 'admin']);
    expect(document.getElementById('btn-nutricion').textContent).toContain('Nutrición');
    expect(document.getElementById('btn-admin').textContent).toContain('Admin');
  });

  it('un alumno no ve ninguno de los dos', () => {
    state.userProfile = { role: 'alumno' };
    renderApp();
    expect(botones()).toEqual([]);
  });

  it('volver a dibujar la app no duplica los botones', () => {
    state.userProfile = { role: 'admin' };
    renderApp();
    renderApp();
    expect(botones()).toEqual(['nutricion', 'admin']);
  });

  it('si el usuario deja de ser admin los botones se quitan', () => {
    state.userProfile = { role: 'admin' };
    renderApp();
    state.userProfile = { role: 'alumno' };
    renderApp();
    expect(botones()).toEqual([]);
  });

  it('muestra la barra', () => {
    state.userProfile = { role: 'alumno' };
    renderApp();
    expect(document.querySelector('nav').style.display).toBe('block');
  });
});
