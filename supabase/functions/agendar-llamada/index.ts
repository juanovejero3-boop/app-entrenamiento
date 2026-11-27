// Agenda en Google Calendar un turno de llamada recién reservado, con el script del coach de ese turno (o el que
// comparten todos los coaches, si ese coach no cargó uno propio). También lo cancela: borra el evento y el turno.
// El script recibe los mismos datos que manda el formulario del coach (nombre, mail, WhatsApp, servicio, fecha y
// hora), más la duración y los invitados. A diferencia del navegador, acá se puede leer lo que contesta, así que el
// turno queda marcado como agendado (con su evento y su Meet), o con el error exacto que dio Google y el coach lo
// puede reintentar.
//
// Agendar lo puede pedir quien acaba de reservar (también sin cuenta, para la primera llamada), pero una sola vez y
// solo en los minutos siguientes a la reserva: así nadie la usa para mandar mails desde la cuenta del coach.
// Reintentar es cosa del coach. Cancelar lo puede pedir el coach o el alumno dueño del turno.
// Usa la service role (SUPABASE_SERVICE_ROLE_KEY) porque la dirección del script no es pública.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VENTANA_DE_QUIEN_RESERVA_MS = 15 * 60_000;
const TIEMPO_MAXIMO_MS = 25_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEET = /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i;
const SERVICIOS: Record<string, string> = {
  primera: "Evaluación Inicial & Onboarding",
  seguimiento: "Seguimiento Semanal de Progreso",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

type Turno = {
  id: string;
  agenda: string;
  fecha: string;
  hora: string;
  duracion_min: number;
  nombre: string;
  email: string;
  telefono: string;
  notas: string;
  coach_id: string | null;
  calendario_estado: string;
  calendario_intentos: number;
  calendario_evento_id?: string;
  created_at: string;
};
type Coach = { script_url: string; coach_email: string };
type Estado = "agendado" | "error" | "sin_script";
type Resultado = { estado: Estado; error: string; intentos: number; en: string; eventoId: string; meet: string };
type Respuesta = { estado: Estado; error: string; eventoId: string; meet: string };
/** Quién pide cancelar: el coach, o el alumno con el mail de su cuenta ('' si no tiene sesión). */
type Quien = { admin: boolean; email: string };

export type Dependencias = {
  leerTurno: (id: string) => Promise<Turno | null>;
  leerCoach: (coachId: string) => Promise<Coach | null>;
  /** El script compartido: el último que cargó algún coach. Lo usan los coaches que no cargaron uno propio. */
  scriptCompartido: () => Promise<Coach | null>;
  guardarResultado: (id: string, resultado: Resultado) => Promise<void>;
  borrarTurno: (id: string) => Promise<void>;
  fetchFn: typeof fetch;
  ahora: () => number;
};

/** Lo que recibe el script: lo mismo que manda el formulario del coach, más la duración y los invitados. */
function armarPedido(turno: Turno, coachEmail: string) {
  const alumno = (turno.email || "").trim();
  const coach = (coachEmail || "").trim();
  return {
    id: turno.id,
    service: SERVICIOS[turno.agenda] ?? "Llamada",
    date: turno.fecha,
    time: String(turno.hora || "").slice(0, 5), // la base guarda 09:00:00 y el script espera 09:00
    clientName: turno.nombre || "",
    clientEmail: alumno,
    clientPhone: turno.telefono || "",
    notes: turno.notas || "",
    coachEmail: coach,
    attendees: [alumno, coach].filter(Boolean),
    duracionMin: turno.duracion_min,
  };
}

/** Traduce lo que contestó el script a agendado o error, con un motivo que se entienda. */
async function leerRespuesta(res: Response): Promise<Respuesta> {
  const sinEvento = { eventoId: "", meet: "" };
  const texto = await res.text().catch(() => "");
  if (!res.ok) return { estado: "error", error: `El script respondió con un error (${res.status}).`, ...sinEvento };
  let datos: { status?: string; message?: string; eventId?: unknown; meetLink?: unknown } | null = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = null;
  }
  if (datos?.status === "success") {
    const meet = typeof datos.meetLink === "string" && MEET.test(datos.meetLink) ? datos.meetLink : "";
    const eventoId = typeof datos.eventId === "string" ? datos.eventId.slice(0, 300) : "";
    return { estado: "agendado", error: "", eventoId, meet };
  }
  if (datos?.status === "error") {
    const error = String(datos.message || "El script avisó un error sin detalle.").slice(0, 500);
    return { estado: "error", error, ...sinEvento };
  }
  if (/<html|<!doctype/i.test(texto)) {
    return {
      estado: "error",
      error:
        "El script devolvió una página en vez de una respuesta. Revisá que esté publicado como aplicación web, " +
        "que se ejecute como el coach y que el acceso sea para cualquier usuario.",
      ...sinEvento,
    };
  }
  return { estado: "error", error: "El script no contestó como se esperaba.", ...sinEvento };
}

/** El script propio del coach del turno; si no cargó uno, el que comparten todos los coaches. */
async function elegirScript(turno: Turno, deps: Dependencias) {
  let coach = turno.coach_id ? await deps.leerCoach(turno.coach_id) : null;
  if (!coach?.script_url?.trim()) coach = await deps.scriptCompartido();
  return coach?.script_url?.trim() ? coach : null;
}

/** Le manda `cuerpo` al script y traduce lo que contesta (o por qué no se pudo llegar). */
async function llamarScript(url: string, cuerpo: unknown, deps: Dependencias): Promise<Respuesta> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await deps.fetchFn(url.trim(), {
      method: "POST",
      // texto plano, como lo manda un formulario: el script lo lee igual con JSON.parse(e.postData.contents)
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(cuerpo),
      redirect: "follow", // Apps Script contesta con una redirección a la respuesta
      signal: control.signal,
    });
    return await leerRespuesta(res);
  } catch (error) {
    const agotado = error instanceof DOMException && error.name === "AbortError";
    console.error("No se pudo llamar al script del coach", error);
    return {
      estado: "error",
      error: agotado ? "El script tardó demasiado en contestar." : "No se pudo llegar al script del coach.",
      eventoId: "",
      meet: "",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Agenda el turno `id` y guarda el resultado en el turno.
 * `admin`: lo pide el coach (puede reintentar); si no, es quien acaba de reservar (una sola vez).
 */
export async function agendarTurno({ id, admin }: { id: unknown; admin: boolean }, deps: Dependencias) {
  if (typeof id !== "string" || !UUID.test(id)) return { status: 400, cuerpo: { error: "Turno inválido" } };
  const turno = await deps.leerTurno(id);
  if (!turno) return { status: 404, cuerpo: { error: "No existe ese turno" } };

  if (turno.calendario_estado === "agendado") return { status: 200, cuerpo: { estado: "agendado", error: "" } };
  if (!admin) {
    if (turno.calendario_estado !== "pendiente") {
      return { status: 409, cuerpo: { error: "Ese turno ya se intentó agendar", estado: turno.calendario_estado } };
    }
    if (deps.ahora() - new Date(turno.created_at).getTime() > VENTANA_DE_QUIEN_RESERVA_MS) {
      return { status: 403, cuerpo: { error: "Solo el coach puede volver a agendar este turno" } };
    }
  }

  const coach = await elegirScript(turno, deps);
  const intentos = (turno.calendario_intentos ?? 0) + 1;
  const en = new Date(deps.ahora()).toISOString();
  if (!coach) {
    const error = "El coach todavía no conectó su Google Calendar.";
    await deps.guardarResultado(id, { estado: "sin_script", error, intentos, en, eventoId: "", meet: "" });
    return { status: 200, cuerpo: { estado: "sin_script", error } };
  }

  const leido = await llamarScript(coach.script_url, armarPedido(turno, coach.coach_email), deps);
  await deps.guardarResultado(id, { ...leido, intentos, en });
  return {
    status: 200,
    cuerpo: { estado: leido.estado, error: leido.error, ...(leido.meet ? { meet: leido.meet } : {}) },
  };
}

/**
 * Cancela el turno `id`: si tiene un evento en Google Calendar se lo pide borrar al script (así le llega la
 * cancelación al alumno) y después libera el turno. Si el script falla, el turno igual se libera y se avisa por qué.
 * Los turnos agendados con el script viejo no guardaron su evento: ese hay que borrarlo a mano.
 */
export async function cancelarTurno({ id, quien }: { id: unknown; quien: Quien }, deps: Dependencias) {
  if (typeof id !== "string" || !UUID.test(id)) return { status: 400, cuerpo: { error: "Turno inválido" } };
  const turno = await deps.leerTurno(id);
  if (!turno) return { status: 200, cuerpo: { cancelado: true, calendario: "sin_evento", error: "" } };

  const mail = (quien.email || "").trim().toLowerCase();
  const esDueno = Boolean(mail) && mail === (turno.email || "").trim().toLowerCase();
  if (!quien.admin && !esDueno) return { status: 403, cuerpo: { error: "Solo el coach o quien reservó lo cancela" } };

  let calendario = "sin_evento";
  let error = "";
  const eventoId = (turno.calendario_evento_id || "").trim();
  if (eventoId) {
    const coach = await elegirScript(turno, deps);
    if (!coach) {
      calendario = "error";
      error = "No hay script conectado para borrar el evento.";
    } else {
      const leido = await llamarScript(coach.script_url, { action: "cancel", id: turno.id, eventId: eventoId }, deps);
      calendario = leido.estado === "agendado" ? "borrado" : "error";
      error = leido.error;
    }
  }
  await deps.borrarTurno(id);
  return { status: 200, cuerpo: { cancelado: true, calendario, error } };
}

/** El coach (admin) o el alumno con su mail; sin sesión llega la clave pública, que no es un usuario. */
async function quienPide(jwt: string): Promise<Quien> {
  if (!jwt) return { admin: false, email: "" };
  const { data: { user }, error } = await adminClient.auth.getUser(jwt);
  if (error || !user) return { admin: false, email: "" };
  const { data: perfil } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  return { admin: perfil?.role === "admin", email: user.email || "" };
}

const COLUMNAS_TURNO =
  "id, agenda, fecha, hora, duracion_min, nombre, email, telefono, notas, coach_id, calendario_estado, " +
  "calendario_intentos, calendario_evento_id, created_at";

const dependenciasReales = (): Dependencias => ({
  async leerTurno(id) {
    const { data, error } = await adminClient.from("call_bookings").select(COLUMNAS_TURNO).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Turno | null;
  },
  async leerCoach(coachId) {
    const { data, error } = await adminClient
      .from("call_coaches")
      .select("script_url, coach_email")
      .eq("coach_id", coachId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Coach | null;
  },
  async scriptCompartido() {
    const { data, error } = await adminClient
      .from("call_coaches")
      .select("script_url, coach_email")
      .neq("script_url", "")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Coach | null;
  },
  async guardarResultado(id, { estado, error, intentos, en, eventoId, meet }) {
    const { error: fallo } = await adminClient
      .from("call_bookings")
      .update({
        calendario_estado: estado,
        calendario_error: error,
        calendario_intentos: intentos,
        calendario_en: en,
        calendario_evento_id: eventoId,
        meet_link: meet,
      })
      .eq("id", id);
    if (fallo) throw new Error(fallo.message);
  },
  async borrarTurno(id) {
    const { error } = await adminClient.from("call_bookings").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
  fetchFn: (...args) => fetch(...args),
  ahora: () => Date.now(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let id: unknown;
  let accion: unknown;
  try {
    ({ id, accion } = await req.json());
  } catch {
    return json({ error: "Pedido inválido" }, 400);
  }
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const quien = await quienPide(jwt);
    const { status, cuerpo } =
      accion === "cancelar"
        ? await cancelarTurno({ id, quien }, dependenciasReales())
        : await agendarTurno({ id, admin: quien.admin }, dependenciasReales());
    return json(cuerpo, status);
  } catch (error) {
    console.error("Error con la llamada", error);
    return json({ error: "No se pudo completar el pedido" }, 500);
  }
});
