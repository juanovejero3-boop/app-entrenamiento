// Agenda en Google Calendar un turno de llamada recién reservado, con el script del coach de ese turno.
// El script es el mismo que el coach usa desde su formulario: le llegan los mismos datos (nombre, mail, WhatsApp,
// servicio, fecha y hora). A diferencia del navegador, acá se puede leer lo que contesta, así que el turno queda
// marcado como agendado, o con el error exacto que dio Google y el coach lo puede reintentar.
//
// La puede llamar quien acaba de reservar (también sin cuenta, para la primera llamada), pero una sola vez y solo en
// los minutos siguientes a la reserva: así nadie la usa para mandar mails desde la cuenta del coach. Reintentar es
// cosa del coach. Usa la service role (SUPABASE_SERVICE_ROLE_KEY) porque la dirección del script no es pública.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const VENTANA_DE_QUIEN_RESERVA_MS = 15 * 60_000;
const TIEMPO_MAXIMO_MS = 25_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  created_at: string;
};
type Coach = { script_url: string; coach_email: string };
type Estado = "agendado" | "error" | "sin_script";
type Resultado = { estado: Estado; error: string; intentos: number; en: string };

export type Dependencias = {
  leerTurno: (id: string) => Promise<Turno | null>;
  leerCoach: (coachId: string) => Promise<Coach | null>;
  /** El script del único coach que lo tiene cargado (para turnos de antes de que cada uno tuviera su coach). */
  coachUnico: () => Promise<Coach | null>;
  guardarResultado: (id: string, resultado: Resultado) => Promise<void>;
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
async function leerRespuesta(res: Response): Promise<{ estado: Estado; error: string }> {
  const texto = await res.text().catch(() => "");
  if (!res.ok) return { estado: "error", error: `El script respondió con un error (${res.status}).` };
  let datos: { status?: string; message?: string } | null = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = null;
  }
  if (datos?.status === "success") return { estado: "agendado", error: "" };
  if (datos?.status === "error") {
    return { estado: "error", error: String(datos.message || "El script avisó un error sin detalle.").slice(0, 500) };
  }
  if (/<html|<!doctype/i.test(texto)) {
    return {
      estado: "error",
      error:
        "El script devolvió una página en vez de una respuesta. Revisá que esté publicado como aplicación web, " +
        "que se ejecute como el coach y que el acceso sea para cualquier usuario.",
    };
  }
  return { estado: "error", error: "El script no contestó como se esperaba." };
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

  const coach = turno.coach_id ? await deps.leerCoach(turno.coach_id) : await deps.coachUnico();
  const intentos = (turno.calendario_intentos ?? 0) + 1;
  const en = new Date(deps.ahora()).toISOString();
  if (!coach?.script_url?.trim()) {
    const error = "El coach todavía no conectó su Google Calendar.";
    await deps.guardarResultado(id, { estado: "sin_script", error, intentos, en });
    return { status: 200, cuerpo: { estado: "sin_script", error } };
  }

  let leido: { estado: Estado; error: string };
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await deps.fetchFn(coach.script_url.trim(), {
      method: "POST",
      // texto plano, como lo manda un formulario: el script lo lee igual con JSON.parse(e.postData.contents)
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(armarPedido(turno, coach.coach_email)),
      redirect: "follow", // Apps Script contesta con una redirección a la respuesta
      signal: control.signal,
    });
    leido = await leerRespuesta(res);
  } catch (error) {
    const agotado = error instanceof DOMException && error.name === "AbortError";
    console.error("No se pudo llamar al script del coach", error);
    leido = {
      estado: "error",
      error: agotado ? "El script tardó demasiado en contestar." : "No se pudo llegar al script del coach.",
    };
  } finally {
    clearTimeout(timer);
  }

  await deps.guardarResultado(id, { ...leido, intentos, en });
  return { status: 200, cuerpo: { estado: leido.estado, error: leido.error } };
}

async function esAdmin(jwt: string) {
  if (!jwt) return false;
  const { data: { user }, error } = await adminClient.auth.getUser(jwt);
  if (error || !user) return false; // sin sesión llega la clave pública, que no es un usuario
  const { data: perfil } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  return perfil?.role === "admin";
}

const COLUMNAS_TURNO =
  "id, agenda, fecha, hora, duracion_min, nombre, email, telefono, notas, coach_id, calendario_estado, calendario_intentos, created_at";

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
  async coachUnico() {
    const { data, error } = await adminClient.from("call_coaches").select("script_url, coach_email").neq("script_url", "");
    if (error) throw new Error(error.message);
    return data?.length === 1 ? (data[0] as Coach) : null;
  },
  async guardarResultado(id, { estado, error, intentos, en }) {
    const { error: fallo } = await adminClient
      .from("call_bookings")
      .update({ calendario_estado: estado, calendario_error: error, calendario_intentos: intentos, calendario_en: en })
      .eq("id", id);
    if (fallo) throw new Error(fallo.message);
  },
  fetchFn: (...args) => fetch(...args),
  ahora: () => Date.now(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return json({ error: "Pedido inválido" }, 400);
  }
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { status, cuerpo } = await agendarTurno({ id, admin: await esAdmin(jwt) }, dependenciasReales());
    return json(cuerpo, status);
  } catch (error) {
    console.error("Error agendando la llamada", error);
    return json({ error: "No se pudo agendar la llamada" }, 500);
  }
});
