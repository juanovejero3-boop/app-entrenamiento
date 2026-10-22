// Asistente de progresión con IA (Gemini) para el constructor de planes.
// Solo lo puede usar un admin con sesión iniciada. La clave de Gemini es el secreto GEMINI_API_KEY
// (supabase secrets set GEMINI_API_KEY=...) y nunca llega al navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MODELO = "gemini-2.5-flash";
const LARGO_MAXIMO = 100_000; // caracteres del pedido
const TIEMPO_MAXIMO_MS = 55_000;

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

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
      signal: control.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("Gemini respondió con error", res.status, JSON.stringify(data?.error ?? data));
      return json({ error: "La IA no pudo responder ahora. Probá de nuevo en un momento." }, 502);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") return json({ error: "La IA no devolvió una respuesta" }, 502);
    return json({ text });
  } catch (error) {
    const agotado = error instanceof DOMException && error.name === "AbortError";
    console.error("Error llamando a Gemini", error);
    return json({ error: agotado ? "La IA tardó demasiado. Probá de nuevo." : "No se pudo consultar a la IA" }, 502);
  } finally {
    clearTimeout(timer);
  }
});
