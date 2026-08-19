import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
function generarPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  let pass = "";
  for (let i = 0; i < array.length; i++) {
    pass += chars[array[i] % chars.length];
  }
  return pass;
}

async function esAdmin(jwt: string) {
  const { data: { user }, error } = await adminClient.auth.getUser(jwt);
  if (error || !user) return false;
  const { data: perfil } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return perfil?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) {
    return json({ error: "No autorizado" }, 401);
  }

  const admin = await esAdmin(jwt);
  if (!admin) {
    return json({ error: "Solo un admin puede resetear contraseñas" }, 403);
  }

  const { user_id } = await req.json();
  if (!user_id) {
    return json({ error: "Falta user_id" }, 400);
  }

  const nuevaPassword = generarPassword();
  const { error } = await adminClient.auth.admin.updateUserById(user_id, {
    password: nuevaPassword,
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ password: nuevaPassword });
});
