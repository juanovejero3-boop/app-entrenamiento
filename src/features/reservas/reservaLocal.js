// Reservas de este navegador. Las jornadas las genera el coach; los turnos los toma
// quien reserva. Una persona (mismo email) solo puede tener un turno por día.
import { huecosDeJornada } from './agendas.js';

export const CLAVE_JORNADAS = 'pp_jornadas_borrador';
export const CLAVE_TURNOS = 'pp_turnos_borrador';
const CLAVE_GRUPALES = 'pp_grupales_borrador';

const leer = (clave, vacio) => {
  try {
    const dato = JSON.parse(localStorage.getItem(clave) || '');
    return dato ?? vacio;
  } catch {
    return vacio;
  }
};

export function leerAgenda() {
  return {
    jornadas: leer(CLAVE_JORNADAS, []),
    turnos: leer(CLAVE_TURNOS, []),
  };
}

export function guardarAgenda(jornadas, turnos) {
  localStorage.setItem(CLAVE_JORNADAS, JSON.stringify(jornadas));
  localStorage.setItem(CLAVE_TURNOS, JSON.stringify(turnos));
}

export function leerGrupales() {
  const lista = leer(CLAVE_GRUPALES, []);
  return Array.isArray(lista) ? lista : [];
}

export function guardarGrupales(grupales) {
  localStorage.setItem(CLAVE_GRUPALES, JSON.stringify(grupales));
}

/** Publica una llamada grupal. El enlace lo escribe el coach. */
export function publicarGrupal(grupales, { fecha, hora, enlace }) {
  const link = (enlace || '').trim();
  if (!fecha || !hora || !link) return { ok: false, motivo: 'datos' };
  return {
    ok: true,
    grupales: [...grupales, { id: crypto.randomUUID(), fecha, hora, enlace: link }],
  };
}

export function cancelarGrupal(grupales, id) {
  return grupales.filter((g) => g.id !== id);
}

/** Sigue visible hasta una hora después de la hora publicada. */
export function grupalesVisibles(grupales, ahora = new Date()) {
  return [...grupales]
    .filter((g) => {
      const [y, m, d] = g.fecha.split('-').map(Number);
      const [hh, mm] = (g.hora || '00:00').split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm + 60) > ahora;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
}

export function hrefDe(enlace) {
  const link = (enlace || '').trim();
  if (/^https?:\/\//i.test(link)) return link;
  return `https://${link}`;
}

const emailDe = (email) => (email || '').trim().toLowerCase();

/** Horarios libres de una agenda en una fecha, o un aviso si el día no está generado o ya no queda lugar. */
export function estadoDelDia(agendaId, fecha, jornadas, turnos) {
  const jornada = jornadas.find((j) => j.agendaId === agendaId && j.fecha === fecha);
  if (!jornada) return { horas: [], aviso: 'Este día no tiene horarios cargados.', codigo: 'sin-generar' };
  const horas = huecosDeJornada(jornada, turnos, jornadas);
  if (!horas.length) return { horas, aviso: 'No quedan horarios en este día.', codigo: 'completo' };
  return { horas, aviso: '', codigo: 'libre' };
}

/**
 * Anota un turno si el horario sigue libre y esa persona no tiene otro el mismo día.
 * @returns {{ ok: true, turnos: object[] } | { ok: false, motivo: string }}
 */
export function reservar(jornadas, turnos, pedido) {
  const email = emailDe(pedido.email);
  const nombre = (pedido.nombre || '').trim();
  if (!nombre || !email) return { ok: false, motivo: 'datos' };
  if (turnos.some((t) => t.fecha === pedido.fecha && emailDe(t.email) === email)) {
    return { ok: false, motivo: 'ya-tiene-turno' };
  }
  const { horas, codigo } = estadoDelDia(pedido.agendaId, pedido.fecha, jornadas, turnos);
  if (codigo === 'sin-generar') return { ok: false, motivo: 'sin-horario' };
  if (!horas.includes(pedido.hora)) return { ok: false, motivo: 'ocupado' };
  return {
    ok: true,
    turnos: [
      ...turnos,
      {
        id: crypto.randomUUID(), // lo genera la app: con él se pide agendarlo sin poder leer la tabla
        agendaId: pedido.agendaId,
        fecha: pedido.fecha,
        hora: pedido.hora,
        nombre,
        email,
        telefono: (pedido.telefono || '').trim(),
        notas: (pedido.notas || '').trim(),
      },
    ],
  };
}

export function cancelarTurno(turnos, { agendaId, fecha, hora }) {
  return turnos.filter((t) => !(t.agendaId === agendaId && t.fecha === fecha && t.hora === hora));
}

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Días inclusive desde `desde` hasta `hasta` (AAAA-MM-DD). Si el fin es anterior, ninguno. */
export function fechasDelRango(desde, hasta) {
  if (!desde || !hasta || hasta < desde) return [];
  const [y, m, d] = desde.split('-').map(Number);
  const cursor = new Date(y, m - 1, d, 12);
  const [yh, mh, dh] = hasta.split('-').map(Number);
  const fin = new Date(yh, mh - 1, dh, 12);
  const fechas = [];
  while (cursor <= fin && fechas.length < 120) {
    fechas.push(iso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return fechas;
}

const instante = (fecha, hora) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
};

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "sábado 21/11", en hora local para que el día no se corra. */
export function textoFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  return `${NOMBRES_DIA[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/**
 * Días con horarios libres cuyo inicio no es anterior a `ahora`.
 * @returns {{ fecha: string, horas: string[] }[]}
 */
export function ofertaDisponible(agendaId, jornadas, turnos, ahora = new Date()) {
  const fechas = [...new Set(jornadas.filter((j) => j.agendaId === agendaId).map((j) => j.fecha))].sort();
  const dias = [];
  for (const fecha of fechas) {
    const { horas } = estadoDelDia(agendaId, fecha, jornadas, turnos);
    const futuras = horas.filter((hora) => instante(fecha, hora) >= ahora);
    if (futuras.length) dias.push({ fecha, horas: futuras });
  }
  return dias;
}

/** Abre el día del botón y cierra los otros de la misma lista. */
export function alternarDia(boton) {
  const lista = boton.closest('[data-lista-dias]');
  const tarjeta = boton.parentElement;
  if (!lista || !tarjeta) return;
  const abrir = boton.getAttribute('aria-expanded') !== 'true';
  for (const otro of lista.children) {
    const btn = otro.querySelector('[aria-expanded]');
    const cuerpo = otro.querySelector('[data-cuerpo-dia]');
    const queda = abrir && otro === tarjeta;
    if (!btn || !cuerpo) continue;
    btn.setAttribute('aria-expanded', String(queda));
    cuerpo.hidden = !queda;
    btn.querySelector('[data-flecha]')?.classList.toggle('rotate-180', queda);
  }
}

export const AVISO_RESERVA = {
  datos: 'Faltan el nombre o el email.',
  'ya-tiene-turno': 'Ese día ya tenés un turno reservado.',
  'sin-horario': 'Ese día no tiene horarios.',
  ocupado: 'Ese horario ya no está libre.',
};
