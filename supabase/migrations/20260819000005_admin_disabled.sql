-- ============================================================
-- 0005: Gestión de alumnos por admin — estado de deshabilitado
-- ============================================================

-- Columna que indica cuándo el admin deshabilitó al alumno
-- (null = activo, con fecha = deshabilitado desde ese momento).
alter table public.profiles
  add column if not exists disabled_at timestamptz;
