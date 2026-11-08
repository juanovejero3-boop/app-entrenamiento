import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/ui.js'; // modales propios: window.alert / window.confirm reales de la app
import { alimentosIniciales, crearAlimento } from './alimentos.js';
import { mostrarBibliotecaDeAlimentos } from './biblioteca.js';
import { asentar } from '../../test-helpers.js';
import { crearClienteFalso } from '../coaching/repo/clienteFalso.js';
import { crearRepoNutricionLocal } from './repoLocal.js';
import { crearRepoNutricion } from './repoNutricion.js';

let content;
let almacen;
let cliente;
let local;
let repo;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout'] }); // los toasts se quitan solos
  content = document.createElement('div');
  document.body.appendChild(content);
  const datos = new Map();
  almacen = { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)) };
  cliente = crearClienteFalso();
  local = crearRepoNutricionLocal(() => almacen);
  repo = crearRepoNutricion(cliente, local);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const abrir = async () => mostrarBibliotecaDeAlimentos(content, { repo });
/** Lo que quedó guardado en la biblioteca de la cuenta. */
const guardados = () => cliente.tablas.nutrition_foods;
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
const guardar = async () => {
  $('[data-click="alimentoGuardar"]').click();
  await asentar();
};
async function responderConfirmacion(acepta) {
  const modal = document.getElementById('app-modal-overlay-aux');
  modal.querySelector(`[data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await vi.advanceTimersByTimeAsync(0);
  await asentar();
}

describe('Nutrición del coach: biblioteca de alimentos', () => {
  it('muestra la base inicial agrupada por categoría, con los macros de la porción', async () => {
    await abrir();
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

  it('marca los que tienen gluten o lácteos', async () => {
    await abrir();
    expect(fila('Pasta de Trigo (Cocida)').textContent).toContain('Gluten');
    expect(fila('Queso Semiduro').textContent).toContain('Lácteo');
    expect(fila('Pechuga de Pollo').textContent).not.toMatch(/Gluten|Lácteo/);
  });

  it('si la biblioteca quedó vacía lo dice', async () => {
    local.marcarAlimentosSubidos(); // sin nada que traer del navegador
    await abrir();
    expect(content.textContent).toContain('Todavía no hay alimentos');
  });

  it('escapa el HTML de los nombres', async () => {
    local.marcarAlimentosSubidos();
    await repo.guardarAlimentos([
      crearAlimento({ categoria: 'fats', nombre: '<img src=x onerror=alert(1)>', porcion: '1' }),
    ]);
    await abrir();
    expect($('img')).toBeNull();
    expect(content.textContent).toContain('<img src=x');
  });
});

describe('categorías plegables', () => {
  const cuerpo = (id) => $(`[data-categoria="${id}"] [data-categoria-cuerpo]`);
  const encabezado = (id) => $(`[data-categoria="${id}"] [data-click="categoriaToggle"]`);
  const abiertas = () => $$('[data-categoria-cuerpo]').filter((c) => !c.hidden).length;

  it('arranca todo plegado: se ve cada categoría con su cantidad de alimentos', async () => {
    await abrir();
    expect(abiertas()).toBe(0);
    expect(encabezado('proteins').getAttribute('aria-expanded')).toBe('false');
    expect(encabezado('proteins').textContent).toContain('Proteínas');
    expect(encabezado('proteins').textContent).toContain('5'); // los alimentos de esa categoría
  });

  it('tocar la categoría la abre y volver a tocarla la pliega', async () => {
    await abrir();
    encabezado('proteins').click();
    expect(cuerpo('proteins').hidden).toBe(false);
    expect(encabezado('proteins').getAttribute('aria-expanded')).toBe('true');
    expect(cuerpo('carbs').hidden).toBe(true); // las otras siguen plegadas

    encabezado('proteins').click();
    expect(cuerpo('proteins').hidden).toBe(true);
    expect(encabezado('proteins').getAttribute('aria-expanded')).toBe('false');
  });

  it('"Abrir todo" y "Plegar todo"', async () => {
    await abrir();
    $('[data-click="categoriasTodas"][data-abrir="true"]').click();
    expect(abiertas()).toBe($$('[data-categoria]').length);
    $('[data-click="categoriasTodas"][data-abrir="false"]').click();
    expect(abiertas()).toBe(0);
  });

  it('al buscar se abren las categorías con coincidencias, y al borrar la búsqueda vuelven a como estaban', async () => {
    await abrir();
    encabezado('carbs').click(); // el coach dejó abierta esta
    escribir($('[data-nutricion-filtro]'), 'pollo');
    expect(cuerpo('proteins').hidden).toBe(false);

    escribir($('[data-nutricion-filtro]'), '');
    expect(cuerpo('proteins').hidden).toBe(true);
    expect(cuerpo('carbs').hidden).toBe(false);
  });

  it('lo que está abierto sigue abierto después de borrar un alimento', async () => {
    await abrir();
    encabezado('carbs').click();
    fila('Papa (Cocida)').querySelector('[data-click="alimentoEliminar"]').click();
    await responderConfirmacion(true);
    expect(cuerpo('carbs').hidden).toBe(false);
    expect(cuerpo('proteins').hidden).toBe(true);
  });

  it('al editar un alimento se abre su categoría para ver el formulario', async () => {
    await abrir();
    fila('Papa (Cocida)').querySelector('[data-click="alimentoEditar"]').click();
    expect(cuerpo('carbs').hidden).toBe(false);
    expect($('[data-alimento-form]')).not.toBeNull();
  });

  it('al guardar un alimento nuevo se abre su categoría, para que se vea dónde quedó', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    await guardar();
    expect(cuerpo('proteins').hidden).toBe(false);
    expect(cuerpo('carbs').hidden).toBe(true);
  });

  it('el alimento editado que pasa a otra categoría deja abierta la nueva', async () => {
    await abrir();
    fila('Whey Protein').querySelector('[data-click="alimentoEditar"]').click();
    llenarFormulario({ categoria: 'mixed_pc' });
    await guardar();
    expect(cuerpo('mixed_pc').hidden).toBe(false);
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

  it('lo guarda en la cuenta y lo muestra en su categoría', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({
      nombre: 'Atún al natural',
      porcion: '1 lata (120 g)',
      categoria: 'proteins',
      lacteo: false,
      gluten: false,
    });
    await guardar();

    expect($('[data-alimento-form]')).toBeNull(); // el formulario se cierra
    expect($('[data-categoria="proteins"]').textContent).toContain('Atún al natural');
    expect(guardados().some((a) => a.nombre === 'Atún al natural' && a.categoria === 'proteins')).toBe(true);
    expect(toasts().join()).toContain('guardado');
  });

  it('guarda las marcas de gluten y lácteo', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tostada', porcion: '2 unidades', categoria: 'carbs', gluten: true, lacteo: true });
    await guardar();
    expect(fila('Tostada').textContent).toMatch(/Gluten/);
    expect(fila('Tostada').textContent).toMatch(/Lácteo/);
  });

  it('el alimento nuevo aparece aunque haya un filtro que lo ocultaría', async () => {
    await abrir();
    escribir($('[data-nutricion-filtro]'), 'pollo');
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    await guardar();
    expect(fila('Tofu')).toBeDefined();
    expect($('[data-nutricion-filtro]').value).toBe('');
  });

  it('con datos incompletos muestra el error, deja abierto el formulario y conserva lo escrito', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Algo', porcion: '' });
    await guardar();

    expect($('[data-alimento-error]').textContent).toMatch(/porción/i);
    expect($('[data-alimento-form]').elements.nombre.value).toBe('Algo');
    expect(guardados()).toHaveLength(alimentosIniciales().length); // no se guardó nada nuevo
  });

  it('no deja repetir un alimento de la misma categoría', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'pechuga de pollo', porcion: '200 g', categoria: 'proteins' });
    await guardar();
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

  it('si no se puede guardar lo avisa, no lo muestra como guardado y deja el formulario para reintentar', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    cliente.fallarLaProxima('sin conexión');
    await guardar();

    expect(toasts().join()).toContain('sin conexión');
    expect(fila('Tofu')).toBeUndefined();
    expect($('[data-alimento-form]')).not.toBeNull();
    await guardar();
    expect(fila('Tofu')).toBeDefined();
    expect(guardados().some((a) => a.nombre === 'Tofu')).toBe(true);
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
    await guardar();

    expect(fila('Papa (Cocida)')).toBeUndefined();
    expect(fila('Papa hervida').dataset.alimento).toBe(id);
    expect(guardados().find((a) => a.id === id)).toMatchObject({ nombre: 'Papa hervida', porcion: '120 g' });
  });

  it('puede pasarlo a otra categoría', async () => {
    await abrir();
    editar('Whey Protein');
    llenarFormulario({ categoria: 'mixed_pc' });
    await guardar();
    expect($('[data-categoria="mixed_pc"]').textContent).toContain('Whey Protein');
    expect($('[data-categoria="proteins"]').textContent).not.toContain('Whey Protein');
  });

  it('dejarle el mismo nombre no cuenta como repetido', async () => {
    await abrir();
    editar('Papa (Cocida)');
    llenarFormulario({ porcion: '130 g' });
    await guardar();
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

  it('si no se puede borrar, el alimento sigue en la lista y lo avisa', async () => {
    await abrir();
    cliente.fallarLaProxima('sin conexión');
    eliminar('Papa (Cocida)');
    await responderConfirmacion(true);
    expect(fila('Papa (Cocida)')).toBeDefined();
    expect(toasts().join()).toContain('sin conexión');
    expect(guardados().some((a) => a.nombre === 'Papa (Cocida)')).toBe(true);
  });

  it('al borrar uno mientras se edita otro, el formulario sigue abierto', async () => {
    await abrir();
    fila('Pan Integral').querySelector('[data-click="alimentoEditar"]').click();
    eliminar('Papa (Cocida)');
    await responderConfirmacion(true);
    expect($('[data-alimento-form]').elements.nombre.value).toBe('Pan Integral');
  });
});

describe('biblioteca en la nube', () => {
  it('si no se pudo cargar lo dice y deja reintentar', async () => {
    cliente.fallarLaProxima('sin conexión');
    await abrir();
    expect($('[data-error]').textContent).toMatch(/no pudimos cargar/i);
    expect(toasts().join()).toContain('sin conexión');
    $('[data-click="alimentoReintentar"]').click();
    await asentar();
    expect($('[data-error]')).toBeNull();
    expect(fila('Pechuga de Pollo')).toBeDefined();
  });

  it('muestra un alimento que cargó otro coach (la biblioteca es la misma para todos)', async () => {
    local.marcarAlimentosSubidos();
    cliente.tablas.nutrition_foods.push({
      id: 'otro-coach-1',
      categoria: 'proteins',
      nombre: 'Tofu firme',
      porcion: '100 g',
      gluten: false,
      lacteo: false,
    });
    await abrir();
    expect(fila('Tofu firme')).toBeDefined();
  });

  it('un alimento nuevo queda en la cuenta y lo ve otro coach', async () => {
    await abrir();
    $('[data-click="alimentoNuevo"]').click();
    llenarFormulario({ nombre: 'Tofu', porcion: '100 g', categoria: 'proteins' });
    await guardar();
    const otro = crearRepoNutricion(
      cliente,
      crearRepoNutricionLocal(() => ({ getItem: () => '1', setItem() {} })),
    );
    expect((await otro.cargarAlimentos()).some((a) => a.nombre === 'Tofu')).toBe(true);
  });
});
