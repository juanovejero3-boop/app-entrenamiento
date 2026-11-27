/**
 * Prime Physique · Agenda de llamadas en Google Calendar
 *
 * Lo llama la app (la función agendar-llamada de Supabase) cada vez que alguien reserva o cancela una llamada,
 * y también lo puede seguir usando el formulario del coach. Por cada reserva:
 *   - crea el evento en el calendario de la cuenta que publicó el script,
 *   - invita al alumno (y al coach del turno, si es otro), así les llega la invitación y les queda en su calendario,
 *   - crea el Meet y lo devuelve, junto con el id del evento, para que la app lo muestre,
 *   - usa la duración del turno (si no viene, 45 minutos).
 * Al cancelar, borra el evento y les avisa a los invitados.
 *
 * Contesta siempre JSON: { status: 'success' | 'error', message, eventId?, meetLink? }.
 */

const CALENDARIO = 'primary';
const DURACION_POR_DEFECTO_MIN = 45;
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function doPost(e) {
  const candado = LockService.getScriptLock();
  try {
    candado.waitLock(20000); // dos pedidos del mismo turno a la vez no crean dos eventos
    const datos = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return responder(datos.action === 'cancel' ? cancelar(datos) : agendar(datos));
  } catch (error) {
    return responder({ status: 'error', message: mensaje(error) });
  } finally {
    try {
      candado.releaseLock();
    } catch (ignorado) {
      // no se llegó a tomar
    }
  }
}

/** Abrir la dirección /exec en el navegador sirve para ver que está publicado. */
function doGet() {
  return responder({ status: 'success', message: 'Agenda de llamadas activa', version: 2 });
}

function agendar(datos) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.date || '') || !/^\d{2}:\d{2}$/.test(datos.time || '')) {
    return { status: 'error', message: 'Fecha u hora inválida (se espera AAAA-MM-DD y HH:MM).' };
  }
  const id = String(datos.id || '');
  const duracion = Number(datos.duracionMin) > 0 ? Number(datos.duracionMin) : DURACION_POR_DEFECTO_MIN;
  const inicio = Utilities.parseDate(datos.date + ' ' + datos.time, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const fin = new Date(inicio.getTime() + duracion * 60000);
  const invitados = invitadosDe(datos);
  const titulo = (datos.service || 'Llamada') + ' · ' + (datos.clientName || 'Alumno');
  const descripcion = [
    'Alumno: ' + (datos.clientName || ''),
    datos.clientEmail ? 'Mail: ' + datos.clientEmail : '',
    datos.clientPhone ? 'WhatsApp: ' + datos.clientPhone : '',
    datos.notes ? 'Notas: ' + datos.notes : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Sin el servicio avanzado de Calendar no se puede crear el Meet, pero sí el evento con los invitados
  if (typeof Calendar === 'undefined') {
    const evento = CalendarApp.getDefaultCalendar().createEvent(titulo, inicio, fin, {
      description: descripcion,
      guests: invitados.join(','),
      sendInvites: true,
    });
    if (id) evento.setTag('turnoId', id);
    return {
      status: 'success',
      eventId: evento.getId(),
      meetLink: '',
      message: 'Agendado sin Meet: activá el servicio avanzado de Google Calendar en el script para crear el Meet.',
    };
  }

  if (id) {
    const previo = eventoDelTurno(id);
    if (previo)
      return { status: 'success', eventId: previo.id, meetLink: meetDe(previo), message: 'Ya estaba agendado' };
  }

  const creado = Calendar.Events.insert(
    {
      summary: titulo,
      description: descripcion,
      start: { dateTime: inicio.toISOString() },
      end: { dateTime: fin.toISOString() },
      attendees: invitados.map(function (email) {
        return { email: email };
      }),
      conferenceData: {
        createRequest: { requestId: id || Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      extendedProperties: { private: id ? { turnoId: id } : {} },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    },
    CALENDARIO,
    { conferenceDataVersion: 1, sendUpdates: 'all' },
  );
  return { status: 'success', eventId: creado.id, meetLink: meetDe(creado), message: 'Agendado' };
}

function cancelar(datos) {
  let eventId = String(datos.eventId || '');
  if (typeof Calendar === 'undefined') {
    const evento = eventId ? CalendarApp.getEventById(eventId) : null;
    if (evento) evento.deleteEvent();
    return { status: 'success', message: 'Cancelado' };
  }
  if (!eventId && datos.id) {
    const previo = eventoDelTurno(String(datos.id));
    eventId = previo ? previo.id : '';
  }
  if (!eventId) return { status: 'success', message: 'No había evento para borrar' };
  try {
    Calendar.Events.remove(CALENDARIO, eventId.replace(/@google\.com$/, ''), { sendUpdates: 'all' });
  } catch (error) {
    if (!/deleted|not found|404|410/i.test(mensaje(error))) throw error;
  }
  return { status: 'success', message: 'Cancelado' };
}

/** El alumno, el coach del turno y los que vengan, sin repetir y sin el dueño del calendario (es el organizador). */
function invitadosDe(datos) {
  const propio = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const todos = [].concat(datos.attendees || [], datos.clientEmail || [], datos.coachEmail || []);
  const vistos = {};
  return todos
    .map(function (email) {
      return String(email || '')
        .trim()
        .toLowerCase();
    })
    .filter(function (email) {
      if (!MAIL.test(email) || email === propio || vistos[email]) return false;
      vistos[email] = true;
      return true;
    });
}

function eventoDelTurno(id) {
  const encontrados = Calendar.Events.list(CALENDARIO, {
    privateExtendedProperty: 'turnoId=' + id,
    showDeleted: false,
    maxResults: 1,
  });
  return (encontrados && encontrados.items && encontrados.items[0]) || null;
}

function meetDe(evento) {
  if (evento.hangoutLink) return evento.hangoutLink;
  const puntos = (evento.conferenceData && evento.conferenceData.entryPoints) || [];
  const video = puntos.filter(function (p) {
    return p.entryPointType === 'video';
  })[0];
  return video ? video.uri : '';
}

function mensaje(error) {
  return String((error && error.message) || error || 'Error desconocido');
}

function responder(datos) {
  return ContentService.createTextOutput(JSON.stringify(datos)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Para probar desde el editor (▶ Ejecutar con «probarAgenda»): la primera vez pide los permisos.
 * Crea una llamada de prueba dentro de una hora, invitándote solo a vos, muestra el Meet y la borra.
 */
function probarAgenda() {
  const enUnaHora = new Date(Date.now() + 60 * 60000);
  const zona = Session.getScriptTimeZone();
  const creado = agendar({
    service: 'Prueba',
    clientName: 'Prueba de agenda',
    date: Utilities.formatDate(enUnaHora, zona, 'yyyy-MM-dd'),
    time: Utilities.formatDate(enUnaHora, zona, 'HH:00'),
    duracionMin: 15,
  });
  console.log(JSON.stringify(creado));
  if (creado.status === 'success') console.log(JSON.stringify(cancelar({ eventId: creado.eventId })));
}
