import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js'; // modales propios: window.alert / window.confirm reales de la app
import { generarEstructura, crearPlan } from '../entrenamiento/plan.js';
import { generarPdfBlob } from '../pdf/generar.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { repo } from '../repo/index.js';
import { abrirCiclosDelAlumno } from './ciclosDelAlumno.js';

// Se reemplaza solo el motor de PDF (el constructor y la vista del alumno lo importan)
vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const HOY = '2026-10-16';

let content;
let alVolver;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
  alVolver = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(generarPdfBlob).mockClear();
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const esperar = () => new Promise((r) => setTimeout(r, 0));
const abrir = () => abrirCiclosDelAlumno(content, ALUMNO, { alVolver, hoy: HOY });
const plan = (nombre, inicio = '2026-10-19', semanas = 2) =>
  generarEstructura({ ...crearPlan({ fechaInicio: inicio }), macroName: nombre }, semanas, 2);
const tarjeta = (id) => $(`[data-ciclo="${id}"]`);
const boton = (accion, id) => $(`[data-click="${accion}"][data-id="${id}"]`);
const estados = async () => (await repo.listarCiclos(ALUMNO.id)).map((c) => [c.plan.macroName, c.estado]);

async function click(el) {
  el.click();
  await esperar();
}
async function responderConfirmacion(acepta) {
  const modal = document.getElementById('app-modal-overlay-aux');
  const texto = modal.textContent;
  modal.querySelector(`[data-click="resolverModal"][data-valor="${acepta}"]`).click();
  await esperar();
  return texto;
}
const textoDelAviso = () => document.getElementById('app-modal-overlay-aux')?.textContent ?? '';

describe('ciclos del alumno: lista', () => {
  it('sin ciclos lo dice y ofrece crear el primero', async () => {
    await abrir();
    expect(content.textContent).toContain('Franco Soria');
    expect(content.textContent).toContain('todavía no tiene ciclos');
    expect($('[data-click="cicloNuevo"]')).not.toBeNull();
  });

  it('lista los ciclos del más nuevo al más viejo, con nombre, fechas y estado', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Primero', '2026-08-03', 4), 'finalizado');
    await repo.crearCiclo(ALUMNO.id, plan('Segundo', '2026-10-19', 2), 'activo');
    await abrir();

    const nombres = $$('[data-ciclo-nombre]').map((n) => n.textContent);
    expect(nombres).toEqual(['Segundo', 'Primero']);
    expect(content.textContent).toContain('19/10/2026 – 01/11/2026');
    expect(content.textContent).toContain('4 semanas');
    const etiquetas = $$('[data-ciclo-estado]').map((e) => e.textContent.trim());
    expect(etiquetas).toEqual(['Activo', 'Finalizado']);
  });

  it('un ciclo sin fecha de inicio ni semanas no inventa fechas', async () => {
    await repo.crearCiclo(ALUMNO.id, crearPlan({ fechaInicio: '' }));
    await abrir();
    expect(content.textContent).toContain('Sin fechas');
  });

  it('cada estado ofrece sus acciones', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, plan('B'), 'borrador');
    const f = await repo.crearCiclo(ALUMNO.id, plan('F'), 'finalizado');
    const a = await repo.crearCiclo(ALUMNO.id, plan('A'), 'activo');
    await abrir();

    const acciones = (id) => $$(`[data-ciclo="${id}"] [data-click]`).map((x) => x.dataset.click);
    expect(acciones(b.id)).toEqual(['cicloEditar', 'cicloVer', 'cicloMostrar', 'cicloEliminar']);
    expect(acciones(a.id)).toEqual(['cicloEditar', 'cicloVer', 'cicloOcultar', 'cicloFinalizar']);
    expect(acciones(f.id)).toEqual(['cicloEditar', 'cicloVer']);
  });

  it('el nombre del ciclo se muestra como texto, sin interpretar HTML', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('<img src=x onerror=alert(1)>'));
    await abrir();
    expect($('[data-ciclo-nombre]').textContent).toBe('<img src=x onerror=alert(1)>');
    expect($('img')).toBeNull();
  });

  it('"Volver" regresa a donde se vino', async () => {
    await abrir();
    await click($('[data-click="ciclosVolver"]'));
    expect(alVolver).toHaveBeenCalled();
  });

  it('si no se pueden cargar los ciclos lo avisa', async () => {
    vi.spyOn(repo, 'listarCiclos').mockRejectedValueOnce(new Error('sin conexión'));
    await abrir();
    expect(content.textContent).toContain('No se pudieron cargar los ciclos');
    expect(content.textContent).toContain('sin conexión');
  });
});

describe('ciclos del alumno: nuevo ciclo', () => {
  it('el primero arranca hoy por defecto y se puede crear vacío: queda en borrador y se abre para armarlo', async () => {
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    expect($('[data-nuevo-inicio]').value).toBe(HOY);

    await click($('[data-click="cicloCrear"]'));

    const [ciclo] = await repo.listarCiclos(ALUMNO.id);
    expect(ciclo).toMatchObject({ estado: 'borrador' });
    expect(ciclo.plan.startDate).toBe(HOY);
    expect(ciclo.plan.weeks).toEqual([]);
    expect($('[data-aviso-estado]').textContent).toContain('Borrador'); // abrió el constructor
  });

  it('la fecha de inicio sugerida es el día siguiente al fin del ciclo anterior, y se puede cambiar', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Anterior', '2026-10-05', 2), 'activo'); // termina el 18/10
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    expect($('[data-nuevo-inicio]').value).toBe('2026-10-19');

    $('[data-nuevo-inicio]').value = '2026-11-02';
    await click($('[data-click="cicloCrear"]'));

    expect((await repo.listarCiclos(ALUMNO.id))[1].plan.startDate).toBe('2026-11-02');
  });

  it('copiar un ciclo trae su contenido con la nueva fecha y "(copia)" en el nombre', async () => {
    const original = await repo.crearCiclo(ALUMNO.id, plan('Fuerza', '2026-09-07', 3), 'finalizado');
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    $('[data-nuevo-origen]').value = original.id;
    $('[data-nuevo-origen]').dispatchEvent(new Event('change', { bubbles: true }));
    await click($('[data-click="cicloCrear"]'));

    const copia = (await repo.listarCiclos(ALUMNO.id))[1];
    expect(copia.estado).toBe('borrador');
    expect(copia.plan.macroName).toBe('Fuerza (copia)');
    expect(copia.plan.startDate).toBe('2026-09-28'); // el original termina el 27/09
    expect(copia.plan.weeks).toEqual(original.plan.weeks);
  });

  it('sin ciclos no se ofrece copiar', async () => {
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    expect($('[data-nuevo-origen]')).toBeNull();
  });

  it('sin fecha de inicio no crea nada y avisa', async () => {
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    $('[data-nuevo-inicio]').value = '';
    await click($('[data-click="cicloCrear"]'));

    expect(textoDelAviso()).toContain('fecha de inicio');
    expect(await repo.listarCiclos(ALUMNO.id)).toEqual([]);
  });

  it('cancelar cierra el formulario sin crear nada', async () => {
    await abrir();
    await click($('[data-click="cicloNuevo"]'));
    await click($('[data-click="cicloNuevoCancelar"]'));
    expect($('[data-nuevo-inicio]')).toBeNull();
    expect(await repo.listarCiclos(ALUMNO.id)).toEqual([]);
  });
});

describe('ciclos del alumno: mostrar, ocultar y finalizar', () => {
  it('mostrar un borrador cuando no hay otro activo lo pasa a activo, sin confirmar', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, plan('B'));
    await abrir();
    await click(boton('cicloMostrar', b.id));

    expect(document.getElementById('app-modal-overlay-aux')).toBeNull();
    expect(await estados()).toEqual([['B', 'activo']]);
    expect(tarjeta(b.id).textContent).toContain('Activo'); // la lista se actualiza
  });

  it('si ya hay un ciclo activo pide confirmación; cancelar no cambia nada', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'activo');
    const nuevo = await repo.crearCiclo(ALUMNO.id, plan('Nuevo'));
    await abrir();
    await click(boton('cicloMostrar', nuevo.id));

    const pregunta = await responderConfirmacion(false);
    expect(pregunta).toContain('Viejo');
    expect(pregunta).toContain('finalizado');
    expect(await estados()).toEqual([
      ['Viejo', 'activo'],
      ['Nuevo', 'borrador'],
    ]);
  });

  it('si se confirma, el activo pasa a finalizado y el nuevo queda activo', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'activo');
    const nuevo = await repo.crearCiclo(ALUMNO.id, plan('Nuevo'));
    await abrir();
    await click(boton('cicloMostrar', nuevo.id));
    await responderConfirmacion(true);

    expect(await estados()).toEqual([
      ['Viejo', 'finalizado'],
      ['Nuevo', 'activo'],
    ]);
    expect((await repo.listarCiclos(ALUMNO.id))[0].finalizadoEn).toBeTruthy();
  });

  it('si falla al mostrar el nuevo, el viejo vuelve a quedar activo y se avisa', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'activo');
    const nuevo = await repo.crearCiclo(ALUMNO.id, plan('Nuevo'));
    await abrir();
    const original = repo.cambiarEstadoDelCiclo;
    const espia = vi.spyOn(repo, 'cambiarEstadoDelCiclo').mockImplementation(async (id, estado) => {
      if (id === nuevo.id) throw new Error('sin conexión');
      return original(id, estado);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await click(boton('cicloMostrar', nuevo.id));
    await responderConfirmacion(true);

    espia.mockRestore();
    expect(await estados()).toEqual([
      ['Viejo', 'activo'],
      ['Nuevo', 'borrador'],
    ]);
    expect(document.body.textContent).toContain('No se pudo');
  });

  it('ocultar un ciclo activo lo vuelve borrador (con confirmación)', async () => {
    const a = await repo.crearCiclo(ALUMNO.id, plan('A'), 'activo');
    await abrir();
    await click(boton('cicloOcultar', a.id));
    expect(await responderConfirmacion(false)).toContain('deja de verlo');
    expect(await estados()).toEqual([['A', 'activo']]);

    await click(boton('cicloOcultar', a.id));
    await responderConfirmacion(true);
    expect(await estados()).toEqual([['A', 'borrador']]);
  });

  it('finalizar pide confirmación y deja el ciclo finalizado con su fecha', async () => {
    const a = await repo.crearCiclo(ALUMNO.id, plan('A'), 'activo');
    await abrir();
    await click(boton('cicloFinalizar', a.id));
    expect(await responderConfirmacion(false)).toContain('ya no podrá anotar');
    expect(await estados()).toEqual([['A', 'activo']]);

    await click(boton('cicloFinalizar', a.id));
    await responderConfirmacion(true);

    const [ciclo] = await repo.listarCiclos(ALUMNO.id);
    expect(ciclo.estado).toBe('finalizado');
    expect(ciclo.finalizadoEn).toBeTruthy();
    expect(tarjeta(a.id).textContent).toContain('Finalizado');
  });

  it('eliminar un borrador pide confirmación', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, plan('B'));
    await abrir();
    await click(boton('cicloEliminar', b.id));
    await responderConfirmacion(false);
    expect(await estados()).toEqual([['B', 'borrador']]);

    await click(boton('cicloEliminar', b.id));
    await responderConfirmacion(true);
    expect(await estados()).toEqual([]);
    expect(tarjeta(b.id)).toBeNull();
  });

  it('si Supabase falla en una acción, avisa y deja la lista como estaba', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, plan('B'));
    await abrir();
    vi.spyOn(repo, 'cambiarEstadoDelCiclo').mockRejectedValueOnce(new Error('sin conexión'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await click(boton('cicloMostrar', b.id));

    expect(document.body.textContent).toContain('No se pudo');
    expect(await estados()).toEqual([['B', 'borrador']]);
  });
});

describe('ciclos del alumno: editar y ver', () => {
  it('editar abre el constructor con ese ciclo y "Volver" regresa a la lista', async () => {
    const f = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await abrir();
    await click(boton('cicloEditar', f.id));

    expect($('[data-campo="macroName"]').value).toBe('Viejo');
    expect($('[data-aviso-estado]').textContent).toContain('Finalizado');

    await click($('[data-click="constructorDePlanesVolver"]'));
    expect($('[data-ciclo-nombre]').textContent).toBe('Viejo');
  });

  it('un ciclo editado se refleja en la lista al volver', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, plan('Antes'));
    await abrir();
    await click(boton('cicloEditar', b.id));
    const campo = $('[data-campo="macroName"]');
    campo.value = 'Después';
    campo.dispatchEvent(new Event('change', { bubbles: true }));
    await esperar();
    await click($('[data-click="constructorDePlanesVolver"]'));

    expect($('[data-ciclo-nombre]').textContent).toBe('Después');
  });

  it('ver abre ese ciclo como lo ve el alumno, en solo lectura, y "Volver" regresa a la lista', async () => {
    const b = await repo.crearCiclo(ALUMNO.id, planCompleto()); // en borrador: el alumno no lo ve, el coach sí
    await abrir();
    await click(boton('cicloVer', b.id));
    // la vista del alumno carga primero la base de videos (import dinámico)
    await vi.waitFor(() => expect(content.textContent).toContain('Modo lectura'));
    expect(content.textContent).toContain('Hipertrofia base');
    expect($('[data-click="alumnoCheck"]')).not.toBeNull();
    expect($$('[data-click="alumnoCheck"]').every((x) => x.disabled)).toBe(true);

    await click($('[data-click="alumnoVolver"]'));
    expect($('[data-ciclo-nombre]').textContent).toBe('Hipertrofia base');
  });
});
