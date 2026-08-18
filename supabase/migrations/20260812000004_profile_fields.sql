-- ============================================================
-- 0004: Columnas de perfil del alumno (nombre, objetivo,
--       altura y peso) para la ficha basica editable.
-- ============================================================
alter table public.profiles
  add column if not exists name text,
  add column if not exists goal text,
  add column if not exists height_cm numeric,
  add column if not exists weight_kg numeric;