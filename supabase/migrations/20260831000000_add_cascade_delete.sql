-- Agregar ON DELETE CASCADE a las FK que referencian auth.users
-- para permitir eliminar usuarios sin dejar registros huérfanos.

-- 1) evolution -> auth.users
ALTER TABLE "public"."evolution"
  DROP CONSTRAINT IF EXISTS "evolution_user_id_fkey",
  ADD CONSTRAINT "evolution_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
    ON DELETE CASCADE;

-- 2) profiles -> auth.users
ALTER TABLE "public"."profiles"
  DROP CONSTRAINT IF EXISTS "profiles_id_fkey",
  ADD CONSTRAINT "profiles_id_fkey"
    FOREIGN KEY ("id") REFERENCES "auth"."users"("id")
    ON DELETE CASCADE;
