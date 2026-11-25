import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/acciones.js';
import '../../lib/ui.js';
import { montarAgenda } from './agendaVista.js';
import { conectarLlamadas, guardarScriptRemoto } from './llamadasSync.js';
import { guardarAgenda, leerAgenda, reservar } from './reservaLocal.js';

const SABADO = '2026-11-21';
const VIERNES = '2026-11-20';

let raiz;
beforeEach(() => {
  localStorage.clear();
  raiz = document.createElement('div');
  document.body.appendChild(raiz);
});
afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  conectarLlamadas(null);
});

const $ = (selector) => raiz.querySelector(selector);
const horas = () => [...raiz.querySelectorAll('[data-libre]')].map((b) => b.dataset.libre);
function cambiar(el, valor) {
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function anotar(hora) {
  const { jornadas, turnos } = leerAgenda();
  const resultado = reservar(jornadas, turnos, {
    agendaId: 'seguimiento',
    fecha: SABADO,
    hora,
    nombre: 'Ana',
    email: 'ana@test.com',
  });
  guardarAgenda(jornadas, resultado.turnos);
}

describe('agenda de prueba', () => {
  it('sin script guardado no deja generar llamadas', async () => {
    await guardarScriptRemoto('', '');
    conectarLlamadas({
      async leer() {
        throw new Error('sin datos');
      },
    });

    montarAgenda(raiz);

    expect(raiz.querySelector('[data-sin-script]').textContent).toContain('Cargá tu script');
    expect(raiz.querySelector('[data-click="agendaGenerar"]')).toBeNull();
    expect(raiz.querySelector('#agenda-script')).not.toBeNull();
  });

  it('la fecha abre el calendario y el rango, la duración y el descanso son listas', () => {
    montarAgenda(raiz);
    const fecha = $('[data-change="agendaFecha"]');
    const abrir = vi.fn();
    fecha.showPicker = abrir;
    fecha.click();

    expect(abrir).toHaveBeenCalled();
    for (const campo of ['desde', 'hasta', 'duracionMin', 'descansoMin']) {
      expect($(`[data-campo="${campo}"]`).tagName).toBe('SELECT');
    }
    expect([...$('[data-campo="desde"]').options].map((o) => o.value)).toEqual(
      expect.arrayContaining(['06:00', '08:30', '19:30', '22:00']),
    );
    expect([...$('[data-campo="duracionMin"]').options].map((o) => o.value)).toEqual(['15', '20', '30', '45', '60']);
    expect([...$('[data-campo="descansoMin"]').options].map((o) => o.value)).toEqual([
      '0',
      '10',
      '15',
      '20',
      '30',
      '45',
      '60',
    ]);
  });

  it('no muestra horarios hasta que el coach genera ese día', () => {
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);

    expect(horas()).toEqual([]);
    expect($('[data-click="agendaGenerar"]')).not.toBeNull();
    expect($('[data-campo="descansoAntesMin"]')).toBeNull();
    expect($('[data-click="agendaDia"]')).toBeNull();

    $('[data-click="agendaGenerar"]').click();

    expect(horas()).toContain('08:30');
    expect(horas()).toContain('11:30');
    expect(horas()).toContain('19:00');
    expect(horas()).not.toContain('19:30');
  });

  it('una reserva de las 11:30 ocupa hasta las 12:30 y cancelarla lo libera', () => {
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);
    $('[data-click="agendaGenerar"]').click();
    anotar('11:30');
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);

    expect(horas()).not.toContain('11:30');
    expect(horas()).not.toContain('12:00');
    expect(horas()).toContain('10:30');
    expect(horas()).toContain('12:30');
    expect(raiz.textContent).toContain('Ana');
    expect(raiz.textContent).toContain('hasta 12:30');

    $('[data-click="agendaSoltar"][data-hora="11:30"]').click();

    expect(horas()).toContain('11:30');
    expect(raiz.textContent).not.toContain('Ana');
  });

  it('cambiar el descanso no rearma el día hasta volver a generar', () => {
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);
    $('[data-click="agendaGenerar"]').click();
    anotar('11:30');
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);
    cambiar($('[data-campo="descansoMin"]'), '0');

    expect(horas()).not.toContain('12:00');

    $('[data-click="agendaGenerar"]').click();

    expect(horas()).not.toContain('11:30');
    expect(horas()).toContain('12:00');
    expect(raiz.textContent).toContain('hasta 12:00');
  });

  it('generar un día no abre otro', () => {
    montarAgenda(raiz);
    cambiar($('[data-change="agendaFecha"]'), SABADO);
    $('[data-click="agendaGenerar"]').click();
    cambiar($('[data-change="agendaFecha"]'), VIERNES);

    expect(horas()).toEqual([]);
  });

  it('la primera llamada genera de a 20 minutos en cada día del rango', () => {
    montarAgenda(raiz);
    $('[data-click="agendaElegir"][data-id="primera"]').click();
    cambiar($('[data-change="agendaRango"][data-campo="desde"]'), SABADO);
    cambiar($('[data-change="agendaRango"][data-campo="hasta"]'), '2026-11-22');
    $('[data-click="agendaGenerar"]').click();

    expect(raiz.querySelector('[data-dia-generado="2026-11-21"]')).not.toBeNull();
    expect(raiz.querySelector('[data-dia-generado="2026-11-22"]')).not.toBeNull();
    expect(horas()).toContain('14:00');
    expect(horas()).toContain('14:20');
    expect(horas()).not.toContain('14:10');
    expect(horas()).not.toContain('08:30');
    expect(raiz.querySelector('[data-dia-generado="2026-11-21"] [data-cuerpo-dia]').hidden).toBe(false);
    expect(raiz.querySelector('[data-dia-generado="2026-11-22"] [data-cuerpo-dia]').hidden).toBe(true);

    raiz.querySelector('[data-dia-generado="2026-11-22"] [data-click="agendaDesplegar"]').click();

    expect(raiz.querySelector('[data-dia-generado="2026-11-22"] [data-cuerpo-dia]').hidden).toBe(false);
    expect(raiz.querySelector('[data-dia-generado="2026-11-21"] [data-cuerpo-dia]').hidden).toBe(true);
  });

  it('el coach publica una llamada grupal y puede cancelarla', async () => {
    montarAgenda(raiz);
    cambiar($('[data-change="grupalFecha"]'), '2026-12-01');
    cambiar($('[data-change="grupalHora"]'), '19:00');
    raiz.querySelector('#grupal-enlace').value = 'https://meet.google.com/abc-defg-hij';
    $('[data-click="grupalPublicar"]').click();

    expect(raiz.textContent).toContain('meet.google.com/abc-defg-hij');

    $('[data-click="grupalCancelar"]').click();
    document.querySelector('#app-modal-overlay-aux [data-click="resolverModal"][data-valor="true"]').click();

    await vi.waitFor(() => expect(raiz.textContent).not.toContain('meet.google.com/abc-defg-hij'));
  });
});
