-- El script de Google Calendar del coach. Lo guarda una vez y lo usan
-- la primera llamada (sin cuenta) y el seguimiento (el alumno).
-- Aplicarla en Supabase después de 20261125000000_llamadas.sql.

create table if not exists public.call_settings (
  id text primary key default 'coach' check (id = 'coach'),
  script_url text not null default '' check (char_length(script_url) <= 500),
  coach_email text not null default '' check (char_length(coach_email) <= 200)
);

insert into public.call_settings (id) values ('coach')
on conflict (id) do nothing;

alter table public.call_settings enable row level security;

grant select on public.call_settings to anon, authenticated;
grant insert, update on public.call_settings to authenticated;

drop policy if exists "script admin" on public.call_settings;
create policy "script admin" on public.call_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "script lectura" on public.call_settings;
create policy "script lectura" on public.call_settings
  for select to anon, authenticated using (true);
