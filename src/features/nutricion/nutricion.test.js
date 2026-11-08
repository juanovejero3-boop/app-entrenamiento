import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js';
import { switchTab } from '../../router.js';
import { state } from '../../state.js';
import { loadAdminData } from '../admin/admin.js';
import { renderTabNutricion } from './nutricion.js';
import { asentar } from '../../test-helpers.js';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { crearRepoNutricionLocal } from './repoLocal.js';
import { crearRepoNutricion } from './repoNutricion.js';

vi.mock('../../router.js', () => ({ switchTab: vi.fn() }));
vi.mock('../admin/admin.js', () => ({ loadAdminData: vi.fn() }));

let content;
let repo;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  repo = crearRepoNutricion(
    crearClienteFalso(),
    crearRepoNutricionLocal(() => ({
      getItem: (k) => datos.get(k) ?? null,
      setItem: (k, v) => void datos.set(k, String(v)),
    })),
  );
  state.userProfile = { id: 'coach', role: 'admin' };
  state.adminAllUsers = [{ id: 'u1', name: 'Aldy Taranto', email: 'aldy@ejemplo.com' }];
});
afterEach(() => {
  document.body.innerHTML = '';
  state.userProfile = null;
  state.adminAllUsers = [];
  vi.mocked(loadAdminData).mockReset();
  vi.mocked(switchTab).mockClear();
});

const $ = (selector) => content.querySelector(selector);
const abrir = (subpestana = 'alumnos') => renderTabNutricion(content, { repo, subpestana });
const subtab = (id) => $(`[data-click="nutricionSubtab"][data-subtab="${id}"]`);

describe('Nutrición (solo admin)', () => {
  it('sin permisos de admin no deja ver nada y manda al perfil', async () => {
    state.userProfile = { id: 'alumno', role: 'alumno' };
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await abrir();
    expect(alerta).toHaveBeenCalled();
    expect(switchTab).toHaveBeenCalledWith('perfil');
    expect(content.innerHTML).toBe('');
  });

  it('muestra el título, sin cartel de prototipo ni avisos de guardado en el navegador', async () => {
    await abrir();
    expect(content.querySelector('h2').textContent).toContain('Nutrición');
    expect(content.textContent).not.toMatch(/prototipo|este navegador/i);
  });

  it('tiene las subpestañas Alumnos y Alimentos, y arranca en Alumnos', async () => {
    await abrir();
    expect(subtab('alumnos').getAttribute('aria-selected')).toBe('true');
    expect(subtab('alimentos').getAttribute('aria-selected')).toBe('false');
    expect($('[data-alumno-filtro]')).not.toBeNull();
    expect(content.textContent).toContain('Aldy Taranto');
  });

  it('Alimentos muestra la biblioteca y Alumnos vuelve al buscador', async () => {
    await abrir();
    subtab('alimentos').click();
    await asentar();
    expect(subtab('alimentos').getAttribute('aria-selected')).toBe('true');
    expect($('[data-categoria="proteins"]')).not.toBeNull();
    expect($('[data-alumno-filtro]')).toBeNull();

    subtab('alumnos').click();
    expect($('[data-alumno-filtro]')).not.toBeNull();
    expect($('[data-categoria]')).toBeNull();
  });

  it('al volver a la pestaña se queda en la subpestaña donde estaba', async () => {
    await abrir();
    subtab('alimentos').click();
    await asentar();
    await renderTabNutricion(content, { repo }); // como al salir y volver a entrar
    await asentar();
    expect(subtab('alimentos').getAttribute('aria-selected')).toBe('true');
    expect($('[data-categoria="proteins"]')).not.toBeNull();
  });

  it('si todavía no se cargaron los usuarios del admin, los carga', async () => {
    state.adminAllUsers = [];
    vi.mocked(loadAdminData).mockImplementation(async () => {
      state.adminAllUsers = [{ id: 'u9', name: 'Cargado Después', email: 'c@ej.com' }];
    });
    await abrir();
    expect(loadAdminData).toHaveBeenCalledTimes(1);
    expect(content.textContent).toContain('Cargado Después');
  });

  it('si ya están cargados no los vuelve a pedir', async () => {
    await abrir();
    expect(loadAdminData).not.toHaveBeenCalled();
  });
});
