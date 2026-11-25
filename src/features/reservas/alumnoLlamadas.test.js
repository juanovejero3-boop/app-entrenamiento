import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/acciones.js';
import '../../lib/ui.js';
import '../coaching/alumno/planAlumno.js';
import { state } from '../../state.js';
import { renderTabLlamadas } from './alumnoLlamadas.js';
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
    expect(tarjeta.querySelector('[data-grupal-enlace]').getAttribute('href')).toBe('https://meet.google.com/abc-defg-hij');
    expect(tarjeta.querySelector('[data-click="grupalCancelarAlumno"]')).toBeNull();
    expect(tarjeta.textContent).not.toContain('Cancelar');
  });
});
