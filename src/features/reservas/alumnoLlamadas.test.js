import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/acciones.js';
import '../../lib/ui.js';
import '../coaching/alumno/planAlumno.js';
import { state } from '../../state.js';
import { renderTabLlamadas } from './alumnoLlamadas.js';
import { conectarLlamadas } from './llamadasSync.js';
import { guardarAgenda, guardarGrupales } from './reservaLocal.js';

const DIA = '2026-12-20';

let raiz;
beforeEach(() => {
  localStorage.clear();
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
  state.currentUser = { email: 'ana@test.com' };
  state.userProfile = { role: 'alumno', name: 'Ana' };
});
afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  state.currentUser = null;
  state.userProfile = null;
  conectarLlamadas(null);
  vi.unstubAllGlobals();
});

describe('llamadas del alumno', () => {
  it('ve la llamada grupal y puede reservar un seguimiento', () => {
    guardarAgenda(
      [
        {
          agendaId: 'seguimiento',
          fecha: DIA,
          desde: '09:00',
          hasta: '10:00',
          duracionMin: 30,
          descansoMin: 0,
        },
      ],
      [],
    );
    guardarGrupales([{ id: 'g1', fecha: DIA, hora: '18:00', enlace: 'https://meet.google.com/abc-defg-hij' }]);

    renderTabLlamadas(raiz);

    const link = raiz.querySelector('[data-grupal-enlace]');
    expect(link.getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(raiz.textContent).toContain('09:00');

    raiz.querySelector('[data-click="alumnoElegirTurno"][data-hora="09:00"]').click();
    raiz.querySelector('[data-click="alumnoConfirmar"]').click();

    expect(raiz.querySelector('[data-turno-propio]').textContent).toContain('09:00');
    expect(raiz.querySelector('[data-turno-propio] a')).toBeNull();
    expect(raiz.querySelector('[data-click="alumnoElegirTurno"]')).toBeNull();
  });

  it('con un turno reservado no muestra horarios y se cancela desde el diálogo', async () => {
    guardarAgenda(
      [
        {
          agendaId: 'seguimiento',
          fecha: DIA,
          desde: '09:00',
          hasta: '10:00',
          duracionMin: 30,
          descansoMin: 0,
        },
      ],
      [{ agendaId: 'seguimiento', fecha: DIA, hora: '09:00', nombre: 'Ana', email: 'ana@test.com' }],
    );

    renderTabLlamadas(raiz);

    expect(raiz.querySelector('[data-click="alumnoElegirTurno"]')).toBeNull();
    expect(raiz.querySelector('[data-turno-propio]').textContent).toContain('09:00');

    raiz.querySelector('[data-click="llamadaCancelar"]').click();
    const modal = document.getElementById('app-modal-overlay-aux');
    expect(modal.textContent).toContain('09:00');
    modal.querySelector('[data-click="resolverModal"][data-valor="true"]').click();

    await vi.waitFor(() => expect(raiz.querySelector('[data-click="alumnoElegirTurno"]')).not.toBeNull());
    expect(raiz.querySelector('[data-turno-propio]')).toBeNull();
  });

  it('la grupal se ve en una tarjeta y el alumno no puede cancelarla', () => {
    guardarGrupales([{ id: 'g1', fecha: DIA, hora: '18:00', enlace: 'https://meet.google.com/abc-defg-hij' }]);

    renderTabLlamadas(raiz);

    const tarjeta = raiz.querySelector('[data-grupal]');
    expect(tarjeta.textContent).toContain('18:00');
    expect(tarjeta.querySelector('[data-grupal-enlace]').getAttribute('href')).toBe(
      'https://meet.google.com/abc-defg-hij',
    );
    expect(tarjeta.querySelector('[data-click="grupalCancelarAlumno"]')).toBeNull();
    expect(tarjeta.textContent).not.toContain('Cancelar');
  });
});

describe('llamadas del alumno: con la cuenta', () => {
  const jornada = {
    agendaId: 'seguimiento',
    fecha: DIA,
    desde: '09:00',
    hasta: '10:00',
    duracionMin: 30,
    descansoMin: 0,
  };
  function repoCon({ agendar = { estado: 'agendado', error: '' } } = {}) {
    const repo = {
      grupales: [],
      leer: vi.fn(async () => ({ jornadas: [jornada], turnos: [], grupales: repo.grupales })),
      anotar: vi.fn(async () => {}),
      agendar: vi.fn(async () => agendar),
    };
    conectarLlamadas(repo);
    return repo;
  }
  /** Espera a que termine de traer los datos (mientras tanto «Actualizar» está deshabilitado). */
  const cargado = () =>
    vi.waitFor(() => expect(raiz.querySelector('[data-click="llamadasActualizar"]').disabled).toBe(false));
  const reservarLas9 = () => {
    raiz.querySelector('[data-click="alumnoElegirTurno"][data-hora="09:00"]').click();
    raiz.querySelector('[data-click="alumnoConfirmar"]').click();
  };

  it('al reservar guarda el turno y pide que se agende ese mismo turno en el calendario', async () => {
    const repo = repoCon();
    renderTabLlamadas(raiz);
    await vi.waitFor(() => expect(raiz.querySelector('[data-click="alumnoElegirTurno"]')).not.toBeNull());
    reservarLas9();
    await vi.waitFor(() => expect(repo.agendar).toHaveBeenCalled());
    const anotado = repo.anotar.mock.calls[0][0];
    expect(anotado.id).toEqual(expect.any(String));
    expect(repo.agendar).toHaveBeenCalledWith(anotado.id);
  });

  it('si no se pudo agendar en el calendario, el turno queda reservado y se le avisa', async () => {
    repoCon({ agendar: { estado: 'error', error: 'Invalid argument' } });
    renderTabLlamadas(raiz);
    await vi.waitFor(() => expect(raiz.querySelector('[data-click="alumnoElegirTurno"]')).not.toBeNull());
    reservarLas9();
    await vi.waitFor(() => expect(raiz.querySelector('[data-aviso-calendario]')).not.toBeNull());
    expect(raiz.querySelector('[data-turno-propio]').textContent).toContain('09:00');
    expect(raiz.querySelector('[data-aviso-calendario]').textContent).toMatch(/coach/i);
  });

  it('«Actualizar» trae una grupal que el coach publicó después', async () => {
    const repo = repoCon();
    renderTabLlamadas(raiz);
    await cargado();
    expect(raiz.querySelector('[data-grupal]')).toBeNull();

    repo.grupales = [{ id: 'g1', fecha: DIA, hora: '18:00', enlace: 'https://meet.google.com/abc-defg-hij' }];
    raiz.querySelector('[data-click="llamadasActualizar"]').click();

    await vi.waitFor(() => expect(raiz.querySelector('[data-grupal]')).not.toBeNull());
  });

  it('si no se pudieron traer las llamadas, lo dice (en vez de «no hay llamadas»)', async () => {
    const repo = repoCon();
    repo.leer.mockRejectedValue(new Error('sin conexión'));
    renderTabLlamadas(raiz);
    await vi.waitFor(() => expect(raiz.querySelector('[data-error-lectura]')).not.toBeNull());
    expect(raiz.querySelector('[data-error-lectura]').textContent).toContain('sin conexión');
    expect(raiz.querySelector('[data-click="llamadasActualizar"]')).not.toBeNull();
  });
});
