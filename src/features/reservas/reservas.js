// Reservas de llamadas: agenda pública (landing), pestaña interna de turnos y sub-pestaña
// Llamadas del admin. Movido tal cual desde app.js, sin cambios de lógica.
import { switchTab } from '../../router.js';
import { state } from '../../state.js';

window.APP_SCHEDULE = {
  onboarding: {
    // PRIMERA VEZ (60 min)
    start: '14:00', // Hora en la que empiezas
    end: '20:00', // Hora de tu último turno
    days: {
      1: true, // Lunes
      2: true, // Martes
      3: true, // Miércoles
      4: true, // Jueves
      5: false, // Viernes
      6: false, // Sábado
      0: false, // Domingo
    },
  },
  followup: {
    // SEGUIMIENTO ALUMNOS (45 min)
    start: '08:30',
    end: '19:30',
    days: {
      1: false, // Lunes
      2: false, // Martes
      3: false, // Miércoles
      4: false, // Jueves
      5: true, // Viernes
      6: true, // Sábado
      0: false, // Domingo
    },
  },
};

// VARIABLES DEL SISTEMA DE TURNOS
let bookingStep = 1; // Empezamos en 2 porque ya no hay que elegir servicio
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let localBookings = JSON.parse(localStorage.getItem('pp_bookings_v4') || '[]');
let webhookUrl = localStorage.getItem('pp_webhook_url') || '';
let isPublicBooking = false;

function startPublicBooking() {
  selectedService = { name: 'Evaluación Inicial & Onboarding', duration: 45 };
  bookingStep = 1; // ESTO FUERZA A QUE ARRANQUE EN EL PASO 1 SÍ O SÍ
  window.renderPublicBooking();
}

window.renderPublicBooking = function () {
  const content = document.getElementById('app-content');

  let html = `
    <div class="max-w-md mx-auto mt-4 space-y-6 pb-12">
        <div class="flex justify-between items-center border-b border-gray-800 pb-4">
            <h2 class="text-xl font-black text-white uppercase"><i class="fa-solid fa-bolt text-neonRed mr-2"></i> Asesoría Estratégica</h2>
            <button onclick="renderLanding()" class="text-xs text-gray-500 hover:text-white border border-gray-800 px-3 py-1.5 rounded">Volver</button>
        </div>
    `;

  if (bookingStep === 1) {
    html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <div class="border-l-4 border-neonRed pl-3">
                <h3 class="text-white font-black text-sm uppercase tracking-wide">Hablemos de tu caso real</h3>
                <p class="text-[11px] text-gray-400 mt-1">Queremos entender dónde estás parado hoy para saber exactamente cómo ayudarte.</p>
            </div>
            
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿Cómo te llamas?</label>
                <input type="text" id="booking-name" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Tu nombre y apellido">
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿A qué te dedicas?</label>
                <input type="text" id="booking-job" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Ej: Empleado, empresario, estudiante, atleta...">
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">¿Qué es lo que más te molesta de tu cuerpo o salud hoy?</label>
                <textarea id="booking-challenge" rows="3" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="Cuéntame con confianza qué te frustra hoy..."></textarea>
            </div>

            <button onclick="validateBookingStep1()" class="w-full py-4 mt-2 neon-glow-button text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-lg">
                Continuar a selección de horario <i class="fa-solid fa-arrow-right ml-2"></i>
            </button>
        </div>
        `;
  } else if (bookingStep === 2) {
    html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-2"><i class="fa-solid fa-calendar-check mr-1"></i> Paso 2: Elige cuándo nos contactamos</p>
            
            <div class="bg-cyberDark/60 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-300 space-y-2 mb-4">
                <p><i class="fa-solid fa-clock text-neonRed mr-2"></i> <span class="font-bold text-white">Duración:</span> 15 a 20 minutos.</p>
                <p><i class="fa-solid fa-phone text-neonRed mr-2"></i> <span class="font-bold text-white">Formato:</span> Llamada telefónica.</p>
                <p><i class="fa-solid fa-bullseye text-neonRed mr-2"></i> <span class="font-bold text-white">Garantía:</span> Transformación desde el día 1.</p>
            </div>

            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Selecciona la Fecha</label>
                <input type="date" id="bookingDate" min="${new Date().toISOString().split('T')[0]}" onchange="generateTimeSlots()" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed">
            </div>
            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Horarios Disponibles (ART)</label>
                <div id="timeSlotsContainer" class="grid grid-cols-3 gap-2">
                    <p class="col-span-3 text-[10px] text-gray-500 text-center py-4">Selecciona una fecha arriba para ver los turnos</p>
                </div>
            </div>
            <button onclick="irAPasoReservaPublica(1)" class="text-xs text-gray-400 hover:text-white mt-4 flex items-center"><i class="fa-solid fa-arrow-left mr-1"></i> Volver a mis datos</button>
        </div>
        `;
  } else if (bookingStep === 3) {
    const temp = window.tempBookingData || { name: '', job: '', challenge: '' };

    html += `
        <div class="bg-cyberCard p-6 rounded-2xl border border-gray-800 space-y-4 shadow-2xl">
            <p class="text-xs text-neonRed font-bold uppercase tracking-wider mb-2"><i class="fa-solid fa-check-circle mr-1"></i> Paso 3: Confirma tu llamada</p>
            
            <div class="bg-cyberDark/60 p-3 rounded-lg border border-gray-800/80 text-xs text-gray-300 mb-4 flex justify-between items-center">
                <div>
                    <p><span class="font-bold text-white">Fecha:</span> ${selectedDate}</p>
                    <p><span class="font-bold text-white">Hora:</span> ${selectedTime}</p>
                </div>
                <button onclick="irAPasoReservaPublica(2)" class="text-[10px] text-neonRed hover:text-white underline">Cambiar</button>
            </div>

            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Nombre Completo</label>
                <input type="text" id="b-name" value="${temp.name}" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed">
            </div>
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Email</label>
                <input type="email" id="b-email" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="tu@email.com">
            </div>
            <div>
                <label class="block text-[10px] text-gray-400 uppercase mb-1 font-bold">Teléfono (WhatsApp)</label>
                <input type="tel" id="b-phone" class="w-full bg-cyberDark border border-gray-700 text-white p-3 rounded-xl text-xs outline-none focus:border-neonRed" placeholder="+54 9 ...">
            </div>
            
            <div class="hidden">
                <textarea id="b-notes">Ocupación: ${temp.job} | Reto: ${temp.challenge}</textarea>
            </div>

            <button id="b-submit" onclick="confirmAppBooking(event)" class="w-full py-4 mt-2 neon-glow-button text-white font-black text-xs rounded-xl uppercase tracking-wider shadow-lg">
                Agendar Llamada <i class="fa-solid fa-paper-plane ml-2"></i>
            </button>
        </div>
        `;
  } else if (bookingStep === 4) {
    // --- ¡AQUÍ ESTÁ LA NUEVA PANTALLA DE FELICITACIÓN! ---
    html += `
        <div class="bg-cyberCard p-8 rounded-2xl border border-neonRed space-y-4 shadow-2xl text-center">
            <i class="fa-solid fa-fire text-5xl text-neonRed mb-2 drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]"></i>
            <h3 class="text-white font-black text-2xl uppercase tracking-wide">¡Llamada Agendada!</h3>
            
            <p class="text-sm text-gray-300 font-bold mt-2">
                ¡Te felicito por tomar acción y dar el primer paso para transformar tu vida y tu físico!
            </p>
            <p class="text-[11px] text-gray-400">
                Nos pondremos en contacto contigo en el horario seleccionado. Prepárate para el cambio.
            </p>

            <div class="bg-cyberDark/80 p-4 rounded-xl border border-gray-700 text-left mt-4 shadow-inner">
                <p class="text-xs text-gray-400 uppercase tracking-widest mb-2 font-bold border-b border-gray-800 pb-2">Resumen de tu Turno</p>
                <p class="text-sm text-white mb-1"><i class="fa-regular fa-calendar-check text-neonRed w-5"></i> <b>${selectedDate}</b></p>
                <p class="text-sm text-white"><i class="fa-regular fa-clock text-neonRed w-5"></i> <b>${selectedTime}</b> (Hora Argentina)</p>
            </div>

            <button onclick="window.location.reload()" class="w-full py-4 mt-6 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl uppercase tracking-wider shadow-lg transition duration-300">
                Volver al Inicio
            </button>
        </div>
        `;
  }

  html += `</div>`;
  content.innerHTML = html;
};

export function renderTabTurnos(content) {
  selectedService = { name: 'Seguimiento Semanal de Progreso', duration: 30 };
  if (bookingStep === 1 || isPublicBooking) bookingStep = 2;

  content.innerHTML = `
      <div class="space-y-6 pb-8">
        <h2 class="text-xl font-black text-white uppercase tracking-wide border-l-4 border-neonRed pl-3"><i class="fa-solid fa-headset text-neonRed mr-2"></i> Seguimiento</h2>
        <p class="text-xs text-gray-400 -mt-4">Agenda tu check-in de 30 minutos.</p>

        ${
          bookingStep === 2
            ? `
        <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Selecciona la Fecha</label>
            <input type="date" id="bookingDate" min="${new Date().toISOString().split('T')[0]}" onchange="generateAppTimeSlots('internal')" class="w-full bg-cyberDark border border-gray-700 text-white p-2.5 rounded-lg outline-none focus:border-neonRed">
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase mb-2">Turnos (ART)</label>
            <div id="timeSlotsContainer" class="grid grid-cols-3 gap-2">
               <p class="col-span-3 text-[10px] text-gray-500 text-center py-4">Selecciona fecha primero</p>
            </div>
          </div>
          <div class="pt-2">
            <button id="btnToStep3" disabled onclick="irAPasoTurnos(3)" class="w-full py-3 bg-neonRed disabled:opacity-40 text-white text-xs font-bold rounded-lg uppercase tracking-wider">Siguiente Paso</button>
          </div>
        </div>
        `
            : ''
        }

        ${
          bookingStep === 3
            ? `
        <form onsubmit="confirmAppBooking(event)" class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-4">
            <p class="text-xs text-neonRed font-bold bg-red-950/40 p-3 rounded border border-red-900 mb-4 text-center"><i class="fa-solid fa-calendar-check mr-2"></i> ${selectedDate} a las ${selectedTime} ART</p>
            
            <div><label class="block text-[10px] text-gray-400 mb-1">Nombre *</label><input type="text" id="b-name" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></div>
            <div><label class="block text-[10px] text-gray-400 mb-1">WhatsApp *</label><input type="tel" id="b-phone" required class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></div>
            <div><label class="block text-[10px] text-gray-400 mb-1">Temas a revisar</label><textarea id="b-notes" rows="2" class="w-full bg-cyberDark border border-gray-700 rounded p-2 text-white"></textarea></div>
            
            <div class="flex gap-2 pt-2">
              <button type="button" onclick="irAPasoTurnos(2)" class="w-1/3 py-2 bg-cyberDark text-gray-400 text-xs font-bold rounded-lg border border-gray-700">Atrás</button>
              <button type="submit" id="b-submit" class="w-2/3 py-2 neon-glow-button text-white text-xs font-bold rounded-lg flex items-center justify-center uppercase"><i class="fa-solid fa-bolt mr-2"></i> AGENDAR</button>
            </div>
        </form>
        `
            : ''
        }

        ${
          bookingStep === 4
            ? `
        <div class="bg-cyberCard p-6 rounded-xl border border-emerald-900 text-center space-y-4 shadow-xl mt-10">
           <i class="fa-solid fa-circle-check text-5xl text-emerald-500"></i>
           <h2 class="text-lg font-black text-emerald-400 uppercase">¡Llamada Agendada!</h2>
           <button onclick="irAPasoTurnos(2)" class="mt-4 px-4 py-2 bg-cyberDark border border-gray-700 text-white text-xs font-bold rounded-lg">Programar otra</button>
        </div>
        `
            : ''
        }
      </div>
    `;

  if (bookingStep === 2 && selectedDate) {
    // generateAppTimeSlots no existe en ningún lado (error previo de la agenda interna, pendiente de revisar)
    // eslint-disable-next-line no-undef
    setTimeout(() => generateAppTimeSlots('internal'), 50);
  }
}

export function renderAdminLlamadas() {
  return `
    <div class="space-y-4">
      <div class="bg-cyberDark border-l-4 border-neonRed pl-3 py-2">
        <h2 class="text-xl font-black text-white uppercase tracking-wide">Agenda de Llamadas</h2>
        <p class="text-xs text-gray-400">Evaluaciones y Seguimientos</p>
      </div>
      <div class="bg-cyberCard p-5 rounded-xl border border-gray-800 space-y-3">
        <label class="block text-[11px] font-bold text-gray-400 uppercase">URL Webhook (Google Calendar):</label>
        <input type="text" id="appsScriptUrl" value="${webhookUrl}" onchange="saveAppWebhookUrl()" placeholder="https://script.google.com/macros/..." class="w-full bg-cyberDark border border-gray-700 p-2.5 rounded text-xs text-neonRed outline-none focus:border-neonRed mb-4">

        <div class="grid grid-cols-2 gap-4 mb-4">
           <div class="bg-cyberDark p-3 rounded-lg border border-gray-800 text-center"><p class="text-[10px] text-gray-500 uppercase">Turnos Activos</p><p class="text-xl font-bold text-neonRed">${localBookings.length}</p></div>
           <button onclick="clearAppBookings()" class="bg-red-950/40 text-red-500 border border-red-900/50 rounded-lg text-xs font-bold hover:bg-red-900/60 transition"><i class="fa-solid fa-trash mb-1 block"></i> Limpiar Registro</button>
        </div>

        <div class="overflow-x-auto mt-4">
          <table class="w-full text-left text-xs text-gray-300">
            <thead class="bg-cyberCarbon text-neonRed border-b border-gray-800">
              <tr><th class="p-2">Fecha/Hora</th><th class="p-2">Atleta</th><th class="p-2">Servicio</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-800">
              ${
                localBookings.length === 0
                  ? `<tr><td colspan="3" class="p-4 text-center text-gray-500">Sin citas pendientes</td></tr>`
                  : localBookings
                      .slice()
                      .reverse()
                      .map(
                        (b) => `
                <tr>
                  <td class="p-2 whitespace-nowrap"><span class="font-bold text-white">${b.date}</span><br>${b.time} ART</td>
                  <td class="p-2 font-semibold">${b.clientName}<br><span class="text-[10px] text-gray-500">${b.clientEmail}</span></td>
                  <td class="p-2 text-[10px]"><span class="text-neonRed font-bold border border-red-900 px-1 rounded bg-red-950/30">${b.service}</span><br><span class="text-gray-500 truncate max-w-[80px] block mt-1">${b.notes}</span></td>
                </tr>`,
                      )
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

window.generateTimeSlots = function () {
  const dateInput = document.getElementById('bookingDate');
  const container = document.getElementById('timeSlotsContainer');

  if (!dateInput || !dateInput.value) return;

  // --- SOLUCIÓN DEFINITIVA ---
  let type = 'onboarding'; // Por defecto, CUALQUIERA que entre asume horarios de Primera Vez.

  try {
    // Solo si la variable currentUser existe y tiene datos (o sea, estás logueado en tu admin), usa Seguimiento.
    if (typeof state.currentUser !== 'undefined' && state.currentUser !== null) {
      type = 'followup';
    }
  } catch {
    // Si hay cualquier error al leer el usuario, seguimos forzando Primera Vez.
    type = 'onboarding';
  }
  // ---------------------------

  const config = window.APP_SCHEDULE[type];

  const [year, month, day] = dateInput.value.split('-');
  const selectedDateLocal = new Date(year, month - 1, day, 12, 0, 0);
  const dayOfWeek = selectedDateLocal.getDay(); // 0=Dom, 1=Lun, etc.

  // Comprobamos si le pusiste 'true' o 'false' a ese día en tu panel
  if (!config.days[dayOfWeek]) {
    container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No atendemos este día de la semana. Por favor, selecciona otro.</p>`;
    return;
  }

  const intervalMinutes = type === 'onboarding' ? 60 : 45;
  const slots = [];

  let current = new Date(`2000-01-01T${config.start}:00`);
  const end = new Date(`2000-01-01T${config.end}:00`);

  while (current < end) {
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');
    const nextSlot = new Date(current.getTime() + intervalMinutes * 60000);

    if (nextSlot <= end) {
      slots.push(`${hours}:${minutes}`);
    }
    current = new Date(current.getTime() + intervalMinutes * 60000);
  }

  if (slots.length === 0) {
    container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No quedan horarios disponibles en este día.</p>`;
    return;
  }

  // Dibujamos los botones
  container.innerHTML = slots
    .map(
      (time) => `
        <button type="button" onclick="selectTime('${time}')" class="p-2 border border-gray-700 rounded-lg text-xs text-white hover:border-neonRed hover:text-neonRed transition">
            ${time}
        </button>
    `,
    )
    .join('');
};

window.selectAppTimeSlot = function (btnEl, slot) {
  document
    .querySelectorAll('.slot-btn')
    .forEach(
      (b) =>
        (b.className =
          'slot-btn p-2 rounded border border-gray-700 bg-cyberDark hover:border-neonRed text-white text-xs font-bold transition'),
    );
  btnEl.className = 'slot-btn p-2 rounded border border-neonRed bg-red-950 text-neonRed font-black text-xs transition';
  selectedTime = slot;
  document.getElementById('btnToStep3').disabled = false;
};

window.confirmAppBooking = function (e) {
  e.preventDefault();
  const btn = document.getElementById('b-submit');
  btn.disabled = true;
  btn.innerHTML = 'PROCESANDO...';

  const emailToSave = isPublicBooking ? document.getElementById('b-email').value.trim() : state.currentUser.email;

  const newBooking = {
    id: Date.now(),
    service: selectedService.name,
    date: selectedDate,
    time: selectedTime,
    clientName: document.getElementById('b-name').value.trim(),
    clientEmail: emailToSave,
    clientPhone: document.getElementById('b-phone').value.trim(),
    notes: document.getElementById('b-notes').value.trim(),
  };

  localBookings.push(newBooking);
  localStorage.setItem('pp_bookings_v4', JSON.stringify(localBookings));

  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking),
    }).catch((err) => console.log('Sincronización de fondo fallida', err));
  }

  setTimeout(() => {
    bookingStep = 4;
    if (isPublicBooking) {
      window.renderPublicBooking();
    } else {
      switchTab('turnos');
    }
  }, 1000);
};

window.saveAppWebhookUrl = function () {
  webhookUrl = document.getElementById('appsScriptUrl').value.trim();
  localStorage.setItem('pp_webhook_url', webhookUrl);
  alert('URL del Webhook guardada.');
};

window.clearAppBookings = async function () {
  const ok = await window.confirm('¿Borrar historial de turnos?');
  if (ok) {
    localBookings = [];
    localStorage.removeItem('pp_bookings_v4');
    switchTab('admin');
  }
};

// Función para validar el Paso 1 y pasar al calendario
window.validateBookingStep1 = function () {
  const nameInput = document.getElementById('booking-name');
  const jobInput = document.getElementById('booking-job');
  const challengeInput = document.getElementById('booking-challenge');

  // Verificamos que los campos existan en la pantalla
  if (!nameInput || !jobInput || !challengeInput) {
    console.error('Error: No se encontraron los campos del formulario.');
    return;
  }

  const name = nameInput.value.trim();
  const job = jobInput.value.trim();
  const challenge = challengeInput.value.trim();

  // Validamos que el usuario haya escrito algo
  if (!name || !job || !challenge) {
    alert('Por favor, completa todos los campos para que podamos prepararnos para tu caso.');
    return;
  }

  // Guardamos los datos para usarlos cuando confirme el turno final
  window.tempBookingData = { name, job, challenge };

  // Cambiamos al paso 2 y actualizamos la vista
  bookingStep = 2;
  window.renderPublicBooking();
};

window.saveScheduleConfig = function (type) {
  const startInput = document.getElementById(`config-start-${type}`);
  const endInput = document.getElementById(`config-end-${type}`);
  // Busca todos los checkboxes que estén marcados
  const dayCheckboxes = document.querySelectorAll(`#days-${type} input[type="checkbox"]:checked`);

  if (!startInput || !endInput) return;

  // Convertimos los valores de los días a números
  const selectedDays = Array.from(dayCheckboxes).map((cb) => parseInt(cb.value));

  if (selectedDays.length === 0) {
    alert('Por favor, selecciona al menos un día de la semana.');
    return;
  }

  const config = {
    start: startInput.value,
    end: endInput.value,
    days: selectedDays,
  };

  localStorage.setItem(`pp_schedule_${type}`, JSON.stringify(config));

  const typeName = type === 'onboarding' ? 'Primera Vez' : 'Seguimiento';
  alert(
    `¡Configuración de ${typeName} guardada!\nHorario: ${config.start} a ${config.end}\nDías seleccionados: ${selectedDays.length}`,
  );
};

window.generateTimeSlots = function () {
  const dateInput = document.getElementById('bookingDate');
  const container = document.getElementById('timeSlotsContainer');

  if (!dateInput || !dateInput.value) return;

  // FORZAMOS a que busque siempre la configuración de "onboarding" (Primera vez)
  // cuando alguien entra desde el link público.
  const type = typeof isPublicBooking !== 'undefined' && isPublicBooking ? 'onboarding' : 'followup';

  // Leemos los datos guardados en el localStorage de tu navegador
  const configString = localStorage.getItem(`pp_schedule_${type}`);

  if (!configString) {
    container.innerHTML = `<p class="col-span-3 text-[10px] text-red-500 text-center py-4">Error: El administrador aún no guardó los horarios de disponibilidad.</p>`;
    return;
  }

  const config = JSON.parse(configString);

  // ARREGLO DE ZONA HORARIA: Evitamos que el día cambie por culpa del GMT
  // Leemos la fecha exacta que seleccionó el usuario (ej: 2026-08-15)
  const [year, month, day] = dateInput.value.split('-');
  // Creamos una fecha local a las 12 del mediodía para que nunca cambie de día por el timezone
  const selectedDateLocal = new Date(year, month - 1, day, 12, 0, 0);
  const dayOfWeek = selectedDateLocal.getDay(); // 0=Dom, 1=Lun, etc.

  if (!config.days || !config.days.includes(dayOfWeek)) {
    container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No atendemos este día de la semana. Por favor, selecciona otro.</p>`;
    return;
  }

  // Calcular el intervalo: 60 min para primera vez, 45 min para seguimiento
  const intervalMinutes = type === 'onboarding' ? 60 : 45;

  const slots = [];
  // Creamos fechas ficticias solo para poder sumar los minutos fácilmente
  let current = new Date(`2000-01-01T${config.start}:00`);
  const end = new Date(`2000-01-01T${config.end}:00`);

  while (current < end) {
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');

    const nextSlot = new Date(current.getTime() + intervalMinutes * 60000);

    // Solo mostramos el turno si el bloque entero entra antes de la hora de fin
    if (nextSlot <= end) {
      slots.push(`${hours}:${minutes}`);
    }

    current = new Date(current.getTime() + intervalMinutes * 60000);
  }

  if (slots.length === 0) {
    container.innerHTML = `<p class="col-span-3 text-[10px] text-gray-500 text-center py-4">No quedan horarios disponibles en este día.</p>`;
    return;
  }

  // Mostramos los botones en pantalla
  container.innerHTML = slots
    .map(
      (time) => `
        <button onclick="selectTime('${time}')" class="p-2 border border-gray-700 rounded-lg text-xs text-white hover:border-neonRed hover:text-neonRed transition">
            ${time}
        </button>
    `,
    )
    .join('');
};

window.selectTime = function (time) {
  selectedTime = time; // Guarda la hora que elegiste
  selectedDate = document.getElementById('bookingDate').value; // Guarda la fecha
  bookingStep = 3; // Nos manda al Paso 3 de confirmación
  window.renderPublicBooking(); // Actualiza la pantalla
};

function irAPasoReservaPublica(paso) {
  bookingStep = paso;
  window.renderPublicBooking();
}
function irAPasoTurnos(paso) {
  bookingStep = paso;
  switchTab('turnos');
}

// isPublicBooking lo modifican la landing y renderApp desde otros módulos.
export function setPublicBooking(valor) {
  isPublicBooking = valor;
}

// Usadas desde handlers inline (onclick/onsubmit) del HTML
Object.assign(window, {
  startPublicBooking,
  irAPasoReservaPublica,
  irAPasoTurnos,
});
