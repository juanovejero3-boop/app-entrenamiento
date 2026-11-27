// @vitest-environment node
// El script de Google Apps Script del coach (google-apps-script/llamadas/Codigo.gs). Corre en Google, así que acá
// se carga su código con un Calendar, Utilities, ContentService, etc. de mentira y se prueba lo que contesta.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const CODIGO = readFileSync(new URL('../../../google-apps-script/llamadas/Codigo.gs', import.meta.url), 'utf8');
const MANIFIESTO = JSON.parse(
  readFileSync(new URL('../../../google-apps-script/llamadas/appsscript.json', import.meta.url), 'utf8'),
);

/** Carga el script con un Google de mentira. `conCalendarAvanzado`: si el coach activó el servicio de Calendar. */
function cargar({ conCalendarAvanzado = true, existentes = [], falla = null } = {}) {
  const insertados = [];
  const borrados = [];
  const Calendar = {
    Events: {
      list: vi.fn(() => ({ items: existentes })),
      insert: vi.fn((evento, calendario, opciones) => {
        if (falla) throw new Error(falla);
        insertados.push({ evento, calendario, opciones });
        return { id: 'ev123', hangoutLink: 'https://meet.google.com/abc-defg-hij' };
      }),
      remove: vi.fn((calendario, id, opciones) => {
        if (falla) throw new Error(falla);
        borrados.push({ calendario, id, opciones });
      }),
    },
  };
  const eventoApp = { getId: () => 'app1@google.com', setTag: vi.fn(), deleteEvent: vi.fn() };
  const CalendarApp = {
    getDefaultCalendar: () => ({ createEvent: vi.fn(() => eventoApp) }),
    getEventById: vi.fn(() => eventoApp),
  };
  const globales = {
    Calendar: conCalendarAvanzado ? Calendar : undefined,
    CalendarApp,
    Session: {
      getScriptTimeZone: () => 'America/Argentina/Buenos_Aires',
      getEffectiveUser: () => ({ getEmail: () => 'coach@gmail.com' }),
    },
    Utilities: {
      // Argentina es UTC-3 todo el año
      parseDate: (texto) => new Date(`${texto.replace(' ', 'T')}:00-03:00`),
      getUuid: () => 'uuid-generado',
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (texto) => ({ texto, setMimeType: () => ({ texto }) }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  };
  const nombres = Object.keys(globales);
  const script = new Function(...nombres, `${CODIGO}\nreturn { doPost, doGet };`)(...nombres.map((n) => globales[n]));
  const pedir = (cuerpo) => JSON.parse(script.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).texto);
  return { script, pedir, insertados, borrados, Calendar, eventoApp };
}

const PEDIDO = {
  id: '00000000-0000-0000-0000-0000000000b1',
  service: 'Seguimiento Semanal de Progreso',
  date: '2026-12-20',
  time: '09:00',
  clientName: 'Ana Pérez',
  clientEmail: 'ana@test.com',
  clientPhone: '+54 9 11 5555',
  notes: 'Rodilla',
  coachEmail: 'otro.coach@test.com',
  attendees: ['ana@test.com', 'otro.coach@test.com'],
  duracionMin: 30,
};

describe('script del coach: agendar', () => {
  it('crea el evento con el alumno invitado, Meet y la duración del turno, y devuelve el evento y el Meet', () => {
    const { pedir, insertados } = cargar();
    expect(pedir(PEDIDO)).toEqual({
      status: 'success',
      eventId: 'ev123',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      message: expect.any(String),
    });
    const { evento, opciones } = insertados[0];
    expect(evento.start.dateTime).toBe('2026-12-20T12:00:00.000Z'); // 09:00 en Argentina
    expect(evento.end.dateTime).toBe('2026-12-20T12:30:00.000Z'); // respeta los 30 minutos, no 45 fijos
    expect(evento.attendees).toEqual([{ email: 'ana@test.com' }, { email: 'otro.coach@test.com' }]);
    expect(evento.conferenceData.createRequest.conferenceSolutionKey.type).toBe('hangoutsMeet');
    expect(evento.extendedProperties.private.turnoId).toBe(PEDIDO.id);
    expect(evento.summary).toContain('Ana Pérez');
    expect(evento.description).toContain('+54 9 11 5555');
    expect(opciones).toEqual({ conferenceDataVersion: 1, sendUpdates: 'all' }); // les llega la invitación
  });

  it('el formulario del coach (sin id, sin invitados ni duración) sigue andando: invita al alumno, 45 minutos', () => {
    const { pedir, insertados } = cargar();
    const formulario = { ...PEDIDO };
    for (const campo of ['id', 'attendees', 'duracionMin', 'coachEmail']) delete formulario[campo];
    expect(pedir(formulario).status).toBe('success');
    const { evento } = insertados[0];
    expect(evento.attendees).toEqual([{ email: 'ana@test.com' }]);
    expect(evento.end.dateTime).toBe('2026-12-20T12:45:00.000Z');
  });

  it('no se invita a sí mismo (el dueño del calendario ya es el organizador)', () => {
    const { pedir, insertados } = cargar();
    pedir({ ...PEDIDO, coachEmail: 'Coach@gmail.com', attendees: ['ana@test.com', 'Coach@gmail.com'] });
    expect(insertados[0].evento.attendees).toEqual([{ email: 'ana@test.com' }]);
  });

  it('si ese turno ya tiene evento (un reintento), devuelve el mismo en vez de duplicarlo', () => {
    const { pedir, insertados } = cargar({
      existentes: [{ id: 'ev-viejo', hangoutLink: 'https://meet.google.com/xxx-yyyy-zzz' }],
    });
    expect(pedir(PEDIDO)).toMatchObject({ status: 'success', eventId: 'ev-viejo' });
    expect(insertados).toEqual([]);
  });

  it('sin el servicio avanzado de Calendar igual agenda con invitados (sin Meet) y lo avisa', () => {
    const { pedir } = cargar({ conCalendarAvanzado: false });
    const respuesta = pedir(PEDIDO);
    expect(respuesta).toMatchObject({ status: 'success', eventId: 'app1@google.com', meetLink: '' });
    expect(respuesta.message).toMatch(/servicio avanzado/i);
  });

  it('si Google falla, contesta el error exacto', () => {
    const { pedir } = cargar({ falla: 'Invalid attendee email' });
    expect(pedir(PEDIDO)).toEqual({ status: 'error', message: 'Invalid attendee email' });
  });

  it('una fecha u hora mal formada se rechaza sin crear nada', () => {
    const { pedir, insertados } = cargar();
    expect(pedir({ ...PEDIDO, time: '9' }).status).toBe('error');
    expect(insertados).toEqual([]);
  });
});

describe('script del coach: cancelar', () => {
  it('borra el evento y les avisa a los invitados', () => {
    const { pedir, borrados } = cargar();
    expect(pedir({ action: 'cancel', id: PEDIDO.id, eventId: 'ev123' }).status).toBe('success');
    expect(borrados).toEqual([{ calendario: 'primary', id: 'ev123', opciones: { sendUpdates: 'all' } }]);
  });

  it('un evento que ya no existe cuenta como borrado', () => {
    const { pedir } = cargar({
      falla: 'API call to calendar.events.delete failed with error: Resource has been deleted',
    });
    expect(pedir({ action: 'cancel', eventId: 'ev123' }).status).toBe('success');
  });

  it('sin el servicio avanzado lo borra con CalendarApp', () => {
    const { pedir, eventoApp } = cargar({ conCalendarAvanzado: false });
    expect(pedir({ action: 'cancel', eventId: 'app1@google.com' }).status).toBe('success');
    expect(eventoApp.deleteEvent).toHaveBeenCalled();
  });
});

describe('script del coach: publicación', () => {
  it('el manifiesto activa Calendar (para el Meet), corre como el coach y lo puede llamar cualquiera', () => {
    expect(MANIFIESTO.timeZone).toBe('America/Argentina/Buenos_Aires');
    expect(MANIFIESTO.dependencies.enabledAdvancedServices).toContainEqual(
      expect.objectContaining({ userSymbol: 'Calendar', serviceId: 'calendar', version: 'v3' }),
    );
    expect(MANIFIESTO.webapp).toEqual({ executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' });
  });

  it('abrir la dirección en el navegador dice que está activo', () => {
    const { script } = cargar();
    expect(JSON.parse(script.doGet().texto)).toMatchObject({ status: 'success' });
  });
});
