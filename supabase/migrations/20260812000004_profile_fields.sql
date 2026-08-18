-- ============================================================
-- 0004: Columnas de perfil del alumno (nombre, objetivo,
--       altura y peso) para la ficha basica editable.
-- ============================================================
alter table public.profiles
  add column if not exists name varchar(255),
  add column if not exists goal varchar(255),
  add column if not exists height_cm numeric(5,2),
  add column if not exists weight_kg numeric(5,2);