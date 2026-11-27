import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../lib/acciones.js';
import '../../lib/ui.js';
import { state } from '../../state.js';
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
  state.currentUser = null;
  state.userProfile = null;
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

  it('una reserva de las 11:30 ocupa hasta las 12:30 y cancelarla lo libera', async () => {
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
    expect($('[data-tomado="11:30"]').textContent).toContain('Ana'); // el horario tomado se ve en la grilla

    $('[data-click="agendaSoltar"][data-hora="11:30"]').click();
    document.querySelector('#app-modal-overlay-aux [data-click="resolverModal"][data-valor="true"]').click();

    await vi.waitFor(() => expect(horas()).toContain('11:30'));
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

describe('agenda: turnos guardados en la cuenta', () => {
  const jornada = {
    agendaId: 'seguimiento',
    fecha: SABADO,
    desde: '09:00',
    hasta: '12:00',
    duracionMin: 30,
    descansoMin: 30,
  };
  const turnoDe = (cambios) => ({
    id: 'b1',
    agendaId: 'seguimiento',
    fecha: SABADO,
    hora: '09:00',
    nombre: 'Ana',
    email: 'ana@test.com',
    telefono: '111',
    notas: '',
    calendarioEstado: 'agendado',
    calendarioError: '',
    ...cambios,
  });
  /** Un repo de mentira que devuelve `turnos` (o lo que se le cambie después). */
  function repoCon(turnos) {
    const repo = {
      turnos,
      leer: vi.fn(async () => ({ jornadas: [jornada], turnos: repo.turnos, grupales: [] })),
      leerScript: async () => ({ url: 'https://script.google.com/macros/s/abc/exec', coachEmail: 'coach@test.com' }),
      agendar: vi.fn(async () => ({ estado: 'agendado', error: '' })),
    };
    conectarLlamadas(repo);
    state.currentUser = { id: 'coach-1', email: 'coach@test.com' };
    state.userProfile = { role: 'admin' };
    return repo;
  }
  /** Espera a que termine de traer los datos (mientras tanto «Actualizar» está deshabilitado). */
  const cargado = () => vi.waitFor(() => expect($('[data-click="agendaActualizar"]').disabled).toBe(false));
  const abrirSabado = async () => {
    montarAgenda(raiz);
    await cargado();
    cambiar($('[data-change="agendaFecha"]'), SABADO);
  };

  it('cada turno reservado dice si quedó en Google Calendar', async () => {
    repoCon([turnoDe({})]);
    await abrirSabado();
    expect($('[data-calendario="agendado"]').textContent).toMatch(/en google calendar/i);
    expect($('[data-click="agendaReintentar"]')).toBeNull();
  });

  it('si no se agendó muestra el motivo exacto y deja reintentar', async () => {
    const repo = repoCon([turnoDe({ calendarioEstado: 'error', calendarioError: 'Invalid argument: startTime' })]);
    await abrirSabado();
    expect($('[data-calendario="error"]').textContent).toContain('Invalid argument: startTime');

    repo.turnos = [turnoDe({})]; // después de reintentar, la base ya lo tiene agendado
    $('[data-click="agendaReintentar"][data-id="b1"]').click();

    await vi.waitFor(() => expect(repo.agendar).toHaveBeenCalledWith('b1'));
    await vi.waitFor(() => expect($('[data-calendario="agendado"]')).not.toBeNull());
  });

  it('un turno sin calendario conectado también se puede reintentar', async () => {
    repoCon([
      turnoDe({ calendarioEstado: 'sin_script', calendarioError: 'El coach todavía no conectó su Google Calendar.' }),
    ]);
    await abrirSabado();
    expect($('[data-calendario="sin_script"]').textContent).toContain('no conectó');
    expect($('[data-click="agendaReintentar"]')).not.toBeNull();
  });

  it('«Actualizar» trae lo nuevo sin recargar la página', async () => {
    const repo = repoCon([]);
    await abrirSabado();
    expect(raiz.textContent).not.toContain('Ana');

    repo.turnos = [turnoDe({})]; // un alumno reservó mientras tanto
    $('[data-click="agendaActualizar"]').click();
    await cargado();

    await vi.waitFor(() => expect(raiz.textContent).toContain('Ana'));
    expect(repo.leer).toHaveBeenCalledTimes(2);
  });

  it('si no se pudieron traer los turnos, lo avisa en vez de mostrar datos viejos como si fueran actuales', async () => {
    const repo = repoCon([]);
    repo.leer.mockRejectedValue(new Error('sin conexión'));
    montarAgenda(raiz);
    await vi.waitFor(() => expect($('[data-error-lectura]')).not.toBeNull());
    expect($('[data-error-lectura]').textContent).toContain('sin conexión');
  });
});

describe('agenda: script compartido', () => {
  it('un coach sin script propio puede generar llamadas con el que cargó otro, y se lo dice', async () => {
    conectarLlamadas({
      leer: vi.fn(async () => ({ jornadas: [], turnos: [], grupales: [] })),
      leerScript: async () => ({
        url: 'https://script.google.com/macros/s/head/exec',
        coachEmail: 'head@test.com',
        propio: false,
      }),
    });
    state.currentUser = { id: 'otro-coach' };
    state.userProfile = { role: 'admin' };
    montarAgenda(raiz);
    await vi.waitFor(() => expect($('[data-click="agendaActualizar"]').disabled).toBe(false));
    expect($('[data-sin-script]')).toBeNull();
    expect($('[data-click="agendaGenerar"]')).not.toBeNull();
    expect($('[data-script-compartido]').textContent).toContain('head@test.com');
    expect($('#agenda-script').value).toBe('https://script.google.com/macros/s/head/exec');
  });
});

describe('agenda: próximas llamadas', () => {
  const FUTURO = '2099-01-10';
  const OTRO_DIA = '2099-01-12';
  const jornadas = [
    { agendaId: 'seguimiento', fecha: FUTURO, desde: '09:00', hasta: '12:00', duracionMin: 30, descansoMin: 30 },
    { agendaId: 'primera', fecha: OTRO_DIA, desde: '09:00', hasta: '12:00', duracionMin: 20, descansoMin: 10 },
    { agendaId: 'seguimiento', fecha: '2020-01-01', desde: '09:00', hasta: '12:00', duracionMin: 30, descansoMin: 0 },
  ];
  const turnoDe = (cambios) => ({
    id: 'b1',
    agendaId: 'seguimiento',
    fecha: FUTURO,
    hora: '10:00',
    nombre: 'Ana',
    email: 'ana@test.com',
    telefono: '111',
    notas: '',
    calendarioEstado: 'agendado',
    calendarioError: '',
    meet: 'https://meet.google.com/abc-defg-hij',
    ...cambios,
  });
  function repoCon(turnos, cancelar = { calendario: 'borrado', error: '' }) {
    const repo = {
      turnos,
      leer: vi.fn(async () => ({ jornadas, turnos: repo.turnos, grupales: [] })),
      leerScript: async () => ({ url: 'https://script.google.com/macros/s/abc/exec', coachEmail: 'coach@test.com' }),
      cancelar: vi.fn(async (id) => {
        repo.turnos = repo.turnos.filter((t) => t.id !== id);
        return cancelar;
      }),
      soltar: vi.fn(async () => {}),
    };
    conectarLlamadas(repo);
    state.currentUser = { id: 'coach-1', email: 'coach@test.com' };
    state.userProfile = { role: 'admin' };
    return repo;
  }
  const cargado = () => vi.waitFor(() => expect($('[data-click="agendaActualizar"]').disabled).toBe(false));
  const proximas = () => [...raiz.querySelectorAll('[data-proxima]')].map((li) => li.dataset.proxima);

  it('arriba se ven todas las llamadas reservadas que vienen, por día, sin tener que elegir una fecha', async () => {
    repoCon([
      turnoDe({ id: 'b2', agendaId: 'primera', fecha: OTRO_DIA, hora: '09:00', nombre: 'Beto', meet: '' }),
      turnoDe({}),
      turnoDe({ id: 'b0', fecha: '2020-01-01', hora: '09:00', nombre: 'Vieja' }),
    ]);
    montarAgenda(raiz);
    await cargado();
    expect(proximas()).toEqual(['b1', 'b2']); // en orden y sin las que ya pasaron
    expect($('[data-proximas]').textContent).toContain('Ana');
    expect($('[data-proximas]').textContent).toContain('Beto');
    expect($('[data-proximas]').textContent).not.toContain('Vieja');
    expect($('[data-proxima="b1"] a[data-meet]').href).toBe('https://meet.google.com/abc-defg-hij');
    expect($('[data-proxima="b1"] [data-calendario="agendado"]')).not.toBeNull();
    expect($('[data-proxima="b2"] a[data-meet]')).toBeNull();
  });

  it('sin llamadas reservadas lo dice', async () => {
    repoCon([]);
    montarAgenda(raiz);
    await cargado();
    expect($('[data-proximas]').textContent).toMatch(/no hay llamadas reservadas/i);
  });

  it('cancelar pide confirmación y borra también el evento del calendario', async () => {
    const repo = repoCon([turnoDe({})]);
    montarAgenda(raiz);
    await cargado();
    $('[data-proxima="b1"] [data-click="agendaSoltar"]').click();
    document.querySelector('#app-modal-overlay-aux [data-click="resolverModal"][data-valor="true"]').click();
    await vi.waitFor(() => expect(repo.cancelar).toHaveBeenCalledWith('b1'));
    await vi.waitFor(() => expect(proximas()).toEqual([]));
    expect(repo.soltar).not.toHaveBeenCalled();
  });

  it('si no se pudo borrar el evento, avisa que hay que borrarlo a mano', async () => {
    repoCon([turnoDe({})], { calendario: 'error', error: 'Not Found' });
    montarAgenda(raiz);
    await cargado();
    $('[data-proxima="b1"] [data-click="agendaSoltar"]').click();
    document.querySelector('#app-modal-overlay-aux [data-click="resolverModal"][data-valor="true"]').click();
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/borralo a mano/i));
    expect(document.body.textContent).toContain('Not Found');
  });
});
