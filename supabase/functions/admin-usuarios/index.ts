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

async function deshabilitarSignups() {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ disable_signup: true }),
  });
  return res.ok;
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
    return json({ error: "Solo un admin puede realizar esta acción" }, 403);
  }

  const body = await req.json();
  const { action } = body;

  // Crear un alumno nuevo con contraseña generada (se devuelve una única vez).
  if (action === "crear") {
    const email = (body.email || "").trim().toLowerCase();
    if (!email) return json({ error: "Falta email" }, 400);

    const existe = await adminClient.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existe.data) {
      return json({ error: "Ese correo ya está registrado." }, 409);
    }

    const password = generarPassword();
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      if (error.message && error.message.toLowerCase().includes("already registered")) {
        return json({ error: "Ese correo ya está registrado." }, 409);
      }
      return json({ error: error.message }, 500);
    }

    return json({ email, password, user_id: data.user?.id });
  }

  // Regenerar contraseña de un alumno existente (se devuelve una única vez).
  if (action === "reset") {
    const user_id = body.user_id;
    if (!user_id) return json({ error: "Falta user_id" }, 400);
    const password = generarPassword();
    const { error } = await adminClient.auth.admin.updateUserById(user_id, { password });
    if (error) return json({ error: error.message }, 500);
    return json({ password });
  }

  // Deshabilitar: bloquea el login (ban), cierra sesiones activas y marca disabled_at.
  if (action === "deshabilitar") {
    const user_id = body.user_id;
    if (!user_id) return json({ error: "Falta user_id" }, 400);
    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: "876000h",
    });
    if (error) return json({ error: error.message }, 500);
    // Cerrar todas las sesiones activas del usuario para que no pueda seguir usándola.
    await adminClient.auth.admin.signOut(user_id);
    const { error: errProf } = await adminClient
      .from("profiles")
      .update({ disabled_at: new Date().toISOString() })
      .eq("id", user_id);
    if (errProf) return json({ error: errProf.message }, 500);
    return json({ ok: true });
  }

  // Habilitar: quita el ban y limpia disabled_at.
  if (action === "habilitar") {
    const user_id = body.user_id;
    if (!user_id) return json({ error: "Falta user_id" }, 400);
    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: "none",
    });
    if (error) return json({ error: error.message }, 500);
    const { error: errProf } = await adminClient
      .from("profiles")
      .update({ disabled_at: null })
      .eq("id", user_id);
    if (errProf) return json({ error: errProf.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Acción no válida" }, 400);
});
