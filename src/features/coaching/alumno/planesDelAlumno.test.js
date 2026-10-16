import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../lib/ui.js';
import { generarPdfBlob } from '../pdf/generar.js';
import { ALUMNO, planCompleto } from '../pdf/test-utils.js';
import { repo } from '../repo/index.js';
import { abrirPlanesDelAlumno } from './planesDelAlumno.js';

vi.mock('../pdf/generar.js', () => ({ generarPdfBlob: vi.fn() }));
vi.mock('../pdf/paginasPdf.js', () => ({ dibujarPaginasPdf: vi.fn() }));

const HOY = '2026-10-20';

let content;
beforeEach(() => {
  content = document.createElement('div');
  document.body.appendChild(content);
});
afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(generarPdfBlob).mockClear();
});

const $ = (selector) => content.querySelector(selector);
const $$ = (selector) => [...content.querySelectorAll(selector)];
const esperar = () => new Promise((r) => setTimeout(r, 0));
const abrir = (opciones = {}) => abrirPlanesDelAlumno(content, ALUMNO, { hoy: HOY, ...opciones });
const plan = (nombre) => ({ ...planCompleto(), macroName: nombre });
const anterior = (id) => $(`[data-ciclo-anterior="${id}"]`);
const alternar = async (id) => {
  anterior(id).querySelector('[data-click="historialAlternar"]').click();
  await esperar();
};
const contenidoDe = (id) => anterior(id).querySelector('[data-ciclo-anterior-contenido]');
const hecha = { kg: '80', reps: '8', done: true, skipped: false };

describe('planes del alumno: ciclo activo y anteriores', () => {
  it('sin ningún ciclo lo dice como la vista de siempre y no hay historial', async () => {
    expect(await abrir()).toBe(false);
    expect(content.textContent).toContain('todavía no cargó tu plan');
    expect($('[data-ciclos-anteriores]')).toBeNull();
  });

  it('con solo el ciclo activo muestra el plan y no hay sección de anteriores', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    expect(await abrir()).toBe(true);
    expect(content.textContent).toContain('Actual');
    expect($('[data-click="alumnoSemana"]')).not.toBeNull();
    expect($('[data-ciclos-anteriores]')).toBeNull();
  });

  it('los ciclos anteriores aparecen plegados, del más reciente al más viejo, mostrando solo el nombre', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    const reciente = await repo.crearCiclo(ALUMNO.id, plan('Reciente'), 'finalizado');
    await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    await abrir();

    const nombres = $$('[data-ciclo-anterior-nombre]').map((n) => n.textContent);
    expect(nombres).toEqual(['Reciente', 'Viejo']);
    for (const { id } of [viejo, reciente]) {
      expect(contenidoDe(id).hidden).toBe(true);
      expect(contenidoDe(id).textContent.trim()).toBe(''); // todavía no cargó nada
      expect(anterior(id).querySelector('[data-click="historialAlternar"]').getAttribute('aria-expanded')).toBe(
        'false',
      );
    }
    expect(anterior(viejo.id).textContent).not.toContain('19/10/2026'); // ni fechas ni contenido
  });

  it('los borradores no aparecen: el alumno solo ve el activo y los finalizados', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Borrador'), 'borrador');
    expect(await abrir()).toBe(false);
    expect(content.textContent).not.toContain('Borrador');
  });

  it('sin ciclo activo pero con anteriores avisa que viene el próximo y deja ver el historial', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    expect(await abrir()).toBe(true);
    expect(content.textContent).toContain('armando tu próximo ciclo');
    expect($$('[data-ciclo-anterior]')).toHaveLength(1);
  });

  it('el nombre de un ciclo anterior se muestra como texto, sin interpretar HTML', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('<img src=x onerror=alert(1)>'), 'finalizado');
    await abrir();
    expect($('[data-ciclo-anterior-nombre]').textContent).toBe('<img src=x onerror=alert(1)>');
    expect($('img')).toBeNull();
  });
});

describe('planes del alumno: abrir un ciclo anterior', () => {
  it('al tocar el nombre se despliega ese ciclo en solo lectura, con lo que se anotó en él', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await repo.guardarRegistroDelCiclo(viejo.id, { e1: { 1: hecha } });
    await repo.guardarSesionesDelCiclo(viejo.id, {
      d1: { fecha: '2026-10-05', terminadaEn: '2026-10-05T20:00:00.000Z', estado: 'hecha' },
    });
    await abrir();

    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));

    const panel = contenidoDe(viejo.id);
    expect(panel.hidden).toBe(false);
    expect(anterior(viejo.id).querySelector('[data-click="historialAlternar"]').getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(panel.textContent).toContain('05/10/2026'); // la fecha de la sesión terminada
    expect(
      panel.querySelector('[data-click="alumnoCheck"][data-e="e1"][data-n="1"]').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      [...panel.querySelectorAll('[data-click="alumnoCheck"], [data-change="alumnoSerie"]')].every((x) => x.disabled),
    ).toBe(true);
    expect(panel.textContent).not.toContain('Modo lectura'); // sin el aviso del coach
  });

  it('un ciclo anterior sin sesiones tampoco se puede anotar ni terminar', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await abrir();
    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));

    const panel = contenidoDe(viejo.id);
    const controles = panel.querySelectorAll(
      '[data-change="alumnoSerie"], [data-click="alumnoCheck"], [data-click="alumnoOmitir"]',
    );
    expect(controles.length).toBeGreaterThan(0);
    expect([...controles].every((x) => x.disabled)).toBe(true);
    expect(panel.querySelector('[data-click="alumnoTerminar"]')).toBeNull();
    expect(panel.querySelector('[data-click="alumnoNoEntrene"]')).toBeNull();
  });

  it('tocar de nuevo lo pliega y al volver a abrirlo no lo carga otra vez', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await abrir();
    const cargas = vi.spyOn(repo, 'cargarRegistroDelCiclo');

    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));
    await alternar(viejo.id);
    expect(contenidoDe(viejo.id).hidden).toBe(true);
    await alternar(viejo.id);

    expect(contenidoDe(viejo.id).hidden).toBe(false);
    expect(cargas).toHaveBeenCalledTimes(1);
  });

  it('cada ciclo se abre por separado', async () => {
    const a = await repo.crearCiclo(ALUMNO.id, plan('A'), 'finalizado');
    const b = await repo.crearCiclo(ALUMNO.id, plan('B'), 'finalizado');
    await abrir();

    await alternar(a.id);
    await vi.waitFor(() => expect(contenidoDe(a.id).textContent).toContain('A'));
    expect(contenidoDe(b.id).hidden).toBe(true);
    expect(contenidoDe(b.id).textContent.trim()).toBe('');
  });

  it('si no se puede cargar avisa, y al tocar de nuevo reintenta', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await abrir();
    vi.spyOn(repo, 'listarCiclos').mockRejectedValueOnce(new Error('sin conexión'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await alternar(viejo.id);
    expect(contenidoDe(viejo.id).textContent).toContain('No se pudo cargar');

    await alternar(viejo.id); // pliega
    await alternar(viejo.id); // vuelve a abrir y reintenta
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));
  });
});

describe('planes del alumno: el activo y los anteriores no se mezclan', () => {
  it('anotar en el ciclo activo no toca el ciclo anterior abierto, aunque tengan los mismos ids de ejercicio', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    const activo = await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    await abrir();
    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));

    const delActivo = $('[data-plan-activo] [data-click="alumnoCheck"][data-e="e1"][data-n="1"]');
    delActivo.click();
    await esperar();

    const delViejo = contenidoDe(viejo.id).querySelector('[data-click="alumnoCheck"][data-e="e1"][data-n="1"]');
    expect(delActivo.getAttribute('aria-pressed')).toBe('true');
    expect(delViejo.getAttribute('aria-pressed')).toBe('false');
    expect((await repo.cargarRegistroDelCiclo(activo.id)).e1[1].done).toBe(true);
    expect(await repo.cargarRegistroDelCiclo(viejo.id)).toEqual({});
  });

  it('cambiar de semana en el ciclo activo no cambia la del anterior', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    await abrir();
    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));

    $('[data-plan-activo] [data-click="alumnoSemana"][data-w="1"]').click();

    const semanaDelViejo = contenidoDe(viejo.id).querySelector('[data-click="alumnoSemana"][aria-current="true"]');
    const semanaDelActivo = $('[data-plan-activo] [data-click="alumnoSemana"][aria-current="true"]');
    expect(semanaDelActivo.dataset.w).toBe('1');
    expect(semanaDelViejo.dataset.w).not.toBe('1');
  });
});

describe('planes del alumno: cada ciclo atiende sus propios controles', () => {
  it('cambiar de semana dentro de un ciclo anterior no mueve la del activo', async () => {
    const viejo = await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    await abrir();
    await alternar(viejo.id);
    await vi.waitFor(() => expect(contenidoDe(viejo.id).textContent).toContain('Viejo'));
    const semanaDelActivo = () => $('[data-plan-activo] [data-click="alumnoSemana"][aria-current="true"]').dataset.w;
    const antes = semanaDelActivo();

    contenidoDe(viejo.id).querySelector('[data-click="alumnoSemana"][data-w="1"]').click();

    expect(contenidoDe(viejo.id).querySelector('[data-click="alumnoSemana"][aria-current="true"]').dataset.w).toBe('1');
    expect(semanaDelActivo()).toBe(antes);
  });
});

describe('planes del alumno: modo lectura del coach', () => {
  it('el coach ve el activo con su aviso y botón Volver, y el historial debajo', async () => {
    await repo.crearCiclo(ALUMNO.id, plan('Viejo'), 'finalizado');
    await repo.crearCiclo(ALUMNO.id, plan('Actual'), 'activo');
    const alVolver = vi.fn();
    await abrir({ soloLectura: true, alVolver });

    expect($('[data-plan-activo]').textContent).toContain('Modo lectura');
    $('[data-click="alumnoVolver"]').click();
    expect(alVolver).toHaveBeenCalled();
    expect($$('[data-ciclo-anterior]')).toHaveLength(1);
  });
});
