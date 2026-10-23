// Asistente de progresión con IA (Gemini) para el constructor de planes.
// Solo lo puede usar un admin con sesión iniciada. La clave de Gemini es el secreto GEMINI_API_KEY
// (supabase secrets set GEMINI_API_KEY=...) y nunca llega al navegador.
// Si Gemini está saturado (503, 429...) se reintenta con espera y, si sigue, con un modelo más liviano.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Primero el modelo principal (se puede cambiar con el secreto GEMINI_MODEL) y después otros de respaldo; si alguno
// no existe (404: Google retira modelos viejos), se salta al siguiente y, si ninguno anda, se informa cuáles hay
const MODELOS = [Deno.env.get("GEMINI_MODEL") ?? "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
const INTENTOS_POR_MODELO = [3, 2, 1];
const ESPERA_BASE_MS = 1_500; // 1,5 s, 3 s, 6 s...
const ESPERA_MAXIMA_MS = 8_000;
const ESTADOS_TEMPORALES = new Set([429, 500, 502, 503, 504]);
const LARGO_MAXIMO = 250_000; // caracteres del pedido (el plan y la biblioteca de ejercicios)
const TIEMPO_MAXIMO_MS = 55_000; // por intento
const PRESUPUESTO_MS = 110_000; // entre todos los intentos
const MARGEN_MINIMO_MS = 5_000; // con menos tiempo que esto no se intenta de nuevo

const MENSAJE_SATURADA = "La IA tiene mucha demanda en este momento. Probá de nuevo en un minuto.";
const MENSAJE_GENERICO = "La IA no pudo responder ahora. Probá de nuevo en un momento.";

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

async function esAdmin(jwt: string) {
  const { data: { user }, error } = await adminClient.auth.getUser(jwt);
  if (error || !user) return false;
  const { data: perfil } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
  return perfil?.role === "admin";
}

type Intento =
  | { ok: true; text: string; modelo: string }
  | { ok: false; estado: number; mensaje: string; reintentable: boolean; codigo: number | string; modeloInexistente?: boolean };

type Dependencias = {
  fetchFn: typeof fetch;
  esperar: (ms: number) => Promise<void>;
  ahora: () => number;
  modelos: string[];
};

const dependenciasReales = (): Dependencias => ({
  fetchFn: (...args) => fetch(...args),
  esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
  ahora: () => Date.now(),
  modelos: MODELOS,
});

/** Una consulta a un modelo de Gemini; clasifica el resultado para decidir si vale la pena reintentar. */
async function intentar(prompt: string, apiKey: string, modelo: string, limiteMs: number, fetchFn: typeof fetch): Promise<Intento> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), limiteMs);
  try {
    const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
      signal: control.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text === "string") return { ok: true, text, modelo };
      console.error("Gemini respondió sin texto", modelo, JSON.stringify(data?.promptFeedback ?? data?.candidates?.[0]?.finishReason));
      return { ok: false, estado: 502, mensaje: "La IA no devolvió una respuesta", reintentable: true, codigo: "sin texto" };
    }
    console.error("Gemini respondió con error", modelo, res.status, JSON.stringify(data?.error ?? data));
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        estado: 502,
        mensaje: "La IA rechazó la clave del servidor. Revisá el secreto GEMINI_API_KEY.",
        reintentable: false,
        codigo: res.status,
      };
    }
    if (res.status === 404) {
      return { ok: false, estado: 502, mensaje: MENSAJE_GENERICO, reintentable: false, modeloInexistente: true, codigo: 404 };
    }
    const saturada = res.status === 503 || res.status === 429;
    return {
      ok: false,
      estado: saturada ? 503 : 502,
      mensaje: saturada ? MENSAJE_SATURADA : MENSAJE_GENERICO,
      reintentable: ESTADOS_TEMPORALES.has(res.status),
      codigo: res.status,
    };
  } catch (error) {
    const agotado = error instanceof DOMException && error.name === "AbortError";
    console.error("Error llamando a Gemini", modelo, error);
    return {
      ok: false,
      estado: 502,
      mensaje: agotado ? "La IA tardó demasiado. Probá de nuevo." : "No se pudo consultar a la IA",
      reintentable: true,
      codigo: agotado ? "timeout" : "red",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Los modelos de texto que tiene disponibles la clave (para poder elegir uno cuando el configurado ya no existe). */
async function modelosDisponibles(apiKey: string, fetchFn: typeof fetch): Promise<string[]> {
  try {
    const res = await fetchFn("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      headers: { "x-goog-api-key": apiKey },
    });
    const data = await res.json();
    return (data?.models ?? [])
      .filter((m: { name?: string; supportedGenerationMethods?: string[] }) =>
        /gemini/.test(m.name ?? "") && m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .slice(0, 25);
  } catch (error) {
    console.error("No se pudo listar los modelos de Gemini", error);
    return [];
  }
}

/**
 * Consulta a Gemini con reintentos: si el modelo está saturado o falla de forma temporal, espera y vuelve a
 * intentar; si agota los intentos, prueba con el siguiente modelo. Un error que no se arregla reintentando
 * (clave inválida, pedido rechazado) se devuelve enseguida.
 */
export async function consultarGemini(prompt: string, apiKey: string, deps: Dependencias = dependenciasReales()) {
  const inicio = deps.ahora();
  let ultimo: Intento = { ok: false, estado: 502, mensaje: MENSAJE_GENERICO, reintentable: true, codigo: "sin tiempo" };
  const historial: string[] = []; // qué respondió cada intento, para el detalle del error
  let hubo404 = false;
  const fallo = async (resultado: Intento) => ({
    ...resultado,
    detalle: historial.join(", "),
    ...(hubo404 ? { disponibles: await modelosDisponibles(apiKey, deps.fetchFn) } : {}),
  });
  for (const [posicion, modelo] of deps.modelos.entries()) {
    const intentos = INTENTOS_POR_MODELO[posicion] ?? 1;
    for (let i = 0; i < intentos; i++) {
      if (i > 0) await deps.esperar(Math.min(ESPERA_BASE_MS * 2 ** (i - 1), ESPERA_MAXIMA_MS));
      const restante = PRESUPUESTO_MS - (deps.ahora() - inicio);
      if (restante < MARGEN_MINIMO_MS) return await fallo(ultimo);
      const resultado = await intentar(prompt, apiKey, modelo, Math.min(TIEMPO_MAXIMO_MS, restante), deps.fetchFn);
      if (resultado.ok) return resultado;
      ultimo = resultado;
      historial.push(`${modelo} ${resultado.codigo}`);
      if (resultado.modeloInexistente) {
        hubo404 = true;
        break; // este modelo no existe: se prueba el siguiente
      }
      if (!resultado.reintentable) return await fallo(resultado);
    }
  }
  return await fallo(ultimo);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "No autorizado" }, 401);
  if (!(await esAdmin(jwt))) return json({ error: "Solo un admin puede usar la IA" }, 403);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "La IA todavía no está configurada en el servidor" }, 500);

  let prompt: unknown;
  try {
    ({ prompt } = await req.json());
  } catch {
    return json({ error: "Pedido inválido" }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim()) return json({ error: "Falta el pedido para la IA" }, 400);
  if (prompt.length > LARGO_MAXIMO) return json({ error: "El plan es demasiado grande para la IA" }, 413);

  const resultado = await consultarGemini(prompt, apiKey);
  if (!resultado.ok) {
    // el detalle (qué respondió cada intento) ayuda a entender qué pasó sin abrir los registros
    const detalle = resultado.detalle ? ` (${resultado.detalle})` : "";
    const modelos = resultado.disponibles?.length
      ? ` Modelos disponibles para tu clave: ${resultado.disponibles.join(", ")}. Podés elegir uno con el secreto GEMINI_MODEL.`
      : "";
    return json({ error: resultado.mensaje + detalle + modelos }, resultado.estado);
  }
  return json({ text: resultado.text, modelo: resultado.modelo });
});
