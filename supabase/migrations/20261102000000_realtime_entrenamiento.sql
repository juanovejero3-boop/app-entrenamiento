-- ============================================================
-- Realtime: que la app reciba al instante los cambios de series y sesiones
-- (el entrenador ve en vivo lo que el alumno va completando).
-- Realtime respeta RLS: cada usuario recibe solo los cambios que puede leer.
-- Es idempotente y no hace nada si el proyecto no tiene la publicación
-- supabase_realtime (por ejemplo, en una base local sin Realtime).
-- ============================================================
do $$
declare
  tabla text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach tabla in array array['training_set_logs', 'training_sessions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tabla
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tabla);
    end if;
  end loop;
end
$$;
