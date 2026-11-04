import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js'; // modales propios: window.alert / window.confirm reales de la app
import { switchTab } from '../../router.js';
import { state } from '../../state.js';
import { alimentosIniciales, crearAlimento } from './alimentos.js';
import { renderTabNutricion } from './nutricion.js';
import { CLAVE_ALIMENTOS, crearRepoNutricionLocal } from './repoLocal.js';

vi.mock('../../router.js', () => ({ switchTab: vi.fn() }));

let content;
let almacen;
let repo;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] }); // los toasts se quitan solos
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  repo = crearRepoNutricionLocal(() => almacen);
  state.userProfile = { id: 'coach', role: 'admin' };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  state.userProfile = null;
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const abrir = () => renderTabNutricion(content, { repo });
const guardados = () => JSON.parse(almacen.datos.get(CLAVE_ALIMENTOS));
const nombres = () => $$('[data-alimento] [data-nombre]').map((e) => e.textContent.trim());
const fila = (nombre) =>
  $$('[data-alimento]').find((f) => f.querySelector('[data-nombre]').textContent.trim() === nombre);
const toasts = () => [...document.body.querySelectorAll('div.fixed')].map((e) => e.textContent);

/** Escribe en un campo como lo haría el coach. */
function escribir(campo, valor) {
  campo.value = valor;
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}
function llenarFormulario({ nombre, porcion, categoria, gluten, lacteo }) {
  const form = $('[data-alimento-form]');
  if (nombre !== undefined) form.elements.nombre.value = nombre;
  if (porcion !== undefined) form.elements.porcion.value = porcion;
  if (categoria !== undefined) form.elements.categoria.value = categoria;
  if (gluten !== undefined) form.elements.gluten.checked = gluten;
  if (lacteo !== undefined) form.elements.lacteo.checked = lacteo;
}
const guardar = () => $('[data-click="alimentoGuardar"]').click();
async function responderConfirmacion(acepta) {
  const modal = document.getElementById('app-modal-overlay-aux');
  modal.querySelector(`[data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await vi.advanceTimersByTimeAsync(0);
}

describe('Nutrición del coach: biblioteca de alimentos', () => {
  it('muestra la base inicial agrupada por categoría, con los macros de la porción', async () => {
    await abrir();
    expect(content.textContent).toContain('Nutrición');
    expect($$('[data-alimento]').length).toBe(alimentosIniciales().length);
    const proteinas = $('[data-categoria="proteins"]');
    expect(proteinas.textContent).toContain('Proteínas');
    expect(proteinas.textContent).toContain('120 kcal');
    expect(proteinas.textContent).toContain('P 25');
    expect(fila('Pechuga de Pollo').textContent).toContain('100g');
  });

  it('cuenta los alimentos', async () => {
    await abrir();
    expect($('[data-cantidad]').textContent).toContain(`${alimentosIniciales().length} alimentos`);
  });

  it('avisa que es un prototipo que se guarda en este navegador', async () => {
    await abrir();
    expect(content.textContent).toMatch(/este navegador/i);
  });

  it('marca los que tienen gluten o lácteos', async () => {
    await abrir();
    expect(fila('Pasta de Trigo (Cocida)').textContent).toContain('Gluten');
    expect(fila('Queso Semiduro').textContent).toContain('Lácteo');
    expect(fila('Pechuga de Pollo').textContent).not.toMatch(/Gluten|Lácteo/);
  });

  it('sin permisos de admin no deja ver nada y manda al perfil', async () => {
    state.userProfile = { id: 'alumno', role: 'alumno' };
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
    await abrir();
    expect(alerta).toHaveBeenCalled();
    expect(switchTab).toHaveBeenCalledWith('perfil');
    expect($$('[data-alimento]')).toHaveLength(0);
  });

  it('si la biblioteca quedó vacía lo dice', async () => {
    repo.guardarAlimentos([]);
    await abrir();
    expect(content.textContent).toContain('Todavía no hay alimentos');
  });

  it('escapa el HTML de los nombres', async () => {
    repo.guardarAlimentos([crearAlimento({ categoria: 'fats', nombre: '<img src=x onerror=alert(1)>', porcion: '1' })]);
    await abrir();
    expect($('img')).toBeNull();
    expect(content.textContent).toContain('<img src=x');
  });
});

describe('buscar', () => {
  it('filtra mientras se escribe, sin perder el foco del campo', async () => {
    await abrir();
    const campo = $('[data-nutricion-filtro]');
    campo.focus();
    escribir(campo, 'pollo');

    expect(nombres()).toEqual(['Pechuga de Pollo']);
    expect($('[data-nutricion-filtro]')).toBe(campo); // el mismo campo: no se redibujó
    expect(document.activeElement).toBe(campo);
    expect($('[data-cantidad]').textContent).toContain('1 alimento');
    expect($('[data-categoria="carbs"]')).toBeNull(); // sin categorías vacías
  });

  it('sin coincidencias lo dice, y al borrar el filtro vuelve todo', async () => {
    await abrir();
    escribir($('[data-nutricion-filtro]'), 'zzz');
    expect(content.textContent).toContain('Ningún alimento coincide');
    escribir($('[data-nutricion-filtro]'), '');
    expect($$('[data-alimento]').length).toBe(alimentosIniciales().length);
  });
});

describe('crear un alimento', () => {
  it('"Nuevo alimento" abre el formulario con la primera categoría elegida', async () => {
    await abrir();
    expect($('[data-alimento-form]')).toBeNull();
    $('[data-click="alimentoNuevo"]').click();
    expect($('[data-alimento-form]')).not.toBeNull();
    expect($('[data-alimento-form]').elements.categoria.value).toBe('proteins');
  });

  it('lo guarda en el navegador y lo muestra en su categoría', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({
      nombre: 'Atún al natural',
      porcion: '1 lata (120 g)',
      categoria: 'proteins',
      lacteo: false,
      gluten: false,
    });
    guardar();

    expect($('[data-alimento-form]')).toBeNull(); // el formulario se cierra
    expect($('[data-categoria="proteins"]').textContent).toContain('Atún al natural');
    expect(guardados().some((a) => a.nombre === 'Atún al natural' && a.categoria === 'proteins')).toBe(true);
    expect(toasts().join()).toContain('guardado');
  });

  it('guarda las marcas de gluten y lácteo', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tostada', porcion: '2 unidades', categoria: 'carbs', gluten: true, lacteo: true });
    guardar();
    expect(fila('Tostada').textContent).toMatch(/Gluten/);
    expect(fila('Tostada').textContent).toMatch(/Lácteo/);
  });

  it('el alimento nuevo aparece aunque haya un filtro que lo ocultaría', async () => {
    await abrir();
    escribir($('[data-nutricion-filtro]'), 'pollo');
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    guardar();
    expect(fila('Tofu')).toBeDefined();
    expect($('[data-nutricion-filtro]').value).toBe('');
  });

  it('con datos incompletos muestra el error, deja abierto el formulario y conserva lo escrito', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Algo', porcion: '' });
    guardar();

    expect($('[data-alimento-error]').textContent).toMatch(/porción/i);
    expect($('[data-alimento-form]').elements.nombre.value).toBe('Algo');
    expect(guardados()).toHaveLength(alimentosIniciales().length); // no se guardó nada nuevo
  });

  it('no deja repetir un alimento de la misma categoría', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'pechuga de pollo', porcion: '200 g', categoria: 'proteins' });
    guardar();
    expect($('[data-alimento-error]').textContent).toMatch(/ya existe/i);
  });

  it('cancelar cierra el formulario sin guardar', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g' });
    $('[data-click="alimentoCancelar"]').click();
    expect($('[data-alimento-form]')).toBeNull();
    expect(fila('Tofu')).toBeUndefined();
  });

  it('si el navegador no deja guardar lo avisa y no lo muestra como guardado', async () => {
    await abrir();
    almacen.setItem = () => {
      throw new Error('sin espacio');
    };
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    guardar();

    expect(toasts().join()).toMatch(/no se pudo guardar/i);
    expect(fila('Tofu')).toBeUndefined();
  });
});

describe('editar un alimento', () => {
  const editar = (nombre) => fila(nombre).querySelector('[data-click="alimentoEditar"]').click();

  it('el formulario viene con sus datos', async () => {
    await abrir();
    editar('Pasta de Trigo (Cocida)');
    const form = $('[data-alimento-form]').elements;
    expect(form.nombre.value).toBe('Pasta de Trigo (Cocida)');
    expect(form.porcion.value).toBe('75g');
    expect(form.categoria.value).toBe('carbs');
    expect(form.gluten.checked).toBe(true);
    expect(form.lacteo.checked).toBe(false);
  });

  it('guarda los cambios y conserva el mismo alimento (mismo id)', async () => {
    await abrir();
    const id = fila('Papa (Cocida)').dataset.alimento;
    editar('Papa (Cocida)');
    llenarFormulario({ nombre: 'Papa hervida', porcion: '120 g' });
    guardar();

    expect(fila('Papa (Cocida)')).toBeUndefined();
    expect(fila('Papa hervida').dataset.alimento).toBe(id);
    expect(guardados().find((a) => a.id === id)).toMatchObject({ nombre: 'Papa hervida', porcion: '120 g' });
  });

  it('puede pasarlo a otra categoría', async () => {
    await abrir();
    editar('Whey Protein');
    llenarFormulario({ categoria: 'mixed_pc' });
    guardar();
    expect($('[data-categoria="mixed_pc"]').textContent).toContain('Whey Protein');
    expect($('[data-categoria="proteins"]').textContent).not.toContain('Whey Protein');
  });

  it('dejarle el mismo nombre no cuenta como repetido', async () => {
    await abrir();
    editar('Papa (Cocida)');
    llenarFormulario({ porcion: '130 g' });
    guardar();
    expect($('[data-alimento-error]')).toBeNull();
    expect(fila('Papa (Cocida)').textContent).toContain('130 g');
  });

  it('cancelar deja todo como estaba', async () => {
    await abrir();
    editar('Papa (Cocida)');
    llenarFormulario({ nombre: 'Otra cosa' });
    $('[data-click="alimentoCancelar"]').click();
    expect(fila('Papa (Cocida)')).toBeDefined();
    expect($('[data-alimento-form]')).toBeNull();
  });

  it('se edita de a uno: abrir otro alimento cierra el formulario anterior', async () => {
    await abrir();
    editar('Papa (Cocida)');
    editar('Pan Integral');
    expect($$('[data-alimento-form]')).toHaveLength(1);
    expect($('[data-alimento-form]').elements.nombre.value).toBe('Pan Integral');
  });
});

describe('eliminar un alimento', () => {
  const eliminar = (nombre) => fila(nombre).querySelector('[data-click="alimentoEliminar"]').click();

  it('pide confirmación y, si se acepta, lo borra de la lista y del navegador', async () => {
    await abrir();
    eliminar('Papa (Cocida)');
    expect(document.getElementById('app-modal-overlay-aux').textContent).toContain('Papa (Cocida)');
    await responderConfirmacion(true);

    expect(fila('Papa (Cocida)')).toBeUndefined();
    expect(guardados().some((a) => a.nombre === 'Papa (Cocida)')).toBe(false);
    expect(guardados()).toHaveLength(alimentosIniciales().length - 1);
  });

  it('si se cancela no se borra nada', async () => {
    await abrir();
    eliminar('Papa (Cocida)');
    await responderConfirmacion(false);
    expect(fila('Papa (Cocida)')).toBeDefined();
  });

  it('si el navegador no deja guardar, el alimento sigue en la lista y lo avisa', async () => {
    await abrir();
    almacen.setItem = () => {
      throw new Error('sin espacio');
    };
    eliminar('Papa (Cocida)');
    await responderConfirmacion(true);
    expect(fila('Papa (Cocida)')).toBeDefined();
    expect(toasts().join()).toMatch(/no se pudo guardar/i);
  });

  it('al borrar uno mientras se edita otro, el formulario sigue abierto', async () => {
    await abrir();
    fila('Pan Integral').querySelector('[data-click="alimentoEditar"]').click();
    eliminar('Papa (Cocida)');
    await responderConfirmacion(true);
    expect($('[data-alimento-form]').elements.nombre.value).toBe('Pan Integral');
  });
});
