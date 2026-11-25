-- ============================================================
-- Llamadas: días que abre el coach, turnos y llamadas grupales
--
-- El coach publica los días (primera llamada o seguimiento). Quien reserva
-- toma un turno. La grupal es una sola para todos los alumnos, con el enlace
-- que pega el coach: no se agenda alumno por alumno.
--
-- Un email tiene un solo turno por día. Dos turnos no pueden pisarse, ni
-- entre agendas: el bloque es la llamada más el descanso de después.
-- El anónimo y el alumno ven los huecos ocupados sin el nombre ni el teléfono.
-- El teléfono lo ve el coach, y cada alumno ve el suyo.
--
-- No toca profiles, evolution, material_*, training_* ni nutrition_*.
-- Aplicarla en Supabase antes de usar las llamadas entre dispositivos.
-- ============================================================

create table if not exists public.call_openings (
  id uuid primary key default gen_random_uuid(),
  agenda text not null check (agenda in ('primera', 'seguimiento')),
  fecha date not null,
  desde time not null,
  hasta time not null,
  duracion_min integer not null check (duracion_min in (15, 20, 30, 45, 60)),
  descanso_min integer not null check (descanso_min in (0, 10, 15, 20, 30, 45, 60)),
  created_at timestamptz not null default now(),
  unique (agenda, fecha)
);

create table if not exists public.call_bookings (
  id uuid primary key default gen_random_uuid(),
  agenda text not null check (agenda in ('primera', 'seguimiento')),
  fecha date not null,
  hora time not null,
  duracion_min integer not null check (duracion_min > 0),
  descanso_min integer not null check (descanso_min >= 0),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  email text not null check (char_length(btrim(email)) between 3 and 200),
  telefono text not null default '' check (char_length(telefono) <= 40),
  notas text not null default '' check (char_length(notas) <= 2000),
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  bloque tsrange,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_call_bookings_email_dia
  on public.call_bookings (fecha, lower(btrim(email)));

create or replace function public.call_booking_bloque()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  new.bloque := tsrange(
    new.fecha + new.hora,
    new.fecha + new.hora + make_interval(mins => new.duracion_min + new.descanso_min),
    '[)'
  );
  return new;
end;
$$;

drop trigger if exists trg_call_booking_bloque on public.call_bookings;
create trigger trg_call_booking_bloque
  before insert or update on public.call_bookings
  for each row execute function public.call_booking_bloque();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_bookings_no_overlap') then
    alter table public.call_bookings
      add constraint call_bookings_no_overlap exclude using gist (bloque with &&);
  end if;
end $$;

create table if not exists public.group_calls (
  id uuid primary key,
  fecha date not null,
  hora time not null,
  enlace text not null check (char_length(btrim(enlace)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Huecos ocupados, sin datos de la persona. La usa quien reserva para no ofrecer un horario tomado.
create or replace function public.call_occupancy()
returns table (agenda text, fecha date, hora time, duracion_min integer, descanso_min integer)
language sql
security definer
stable
as $$
  select b.agenda, b.fecha, b.hora, b.duracion_min, b.descanso_min
  from public.call_bookings b;
$$;

grant select on public.call_openings to anon, authenticated;
grant insert, update, delete on public.call_openings to authenticated;
grant select, insert, delete on public.call_bookings to anon, authenticated;
grant select, insert, update, delete on public.group_calls to authenticated;
grant execute on function public.call_occupancy() to anon, authenticated;

-- --- RLS ----------------------------------------------------
alter table public.call_openings enable row level security;
alter table public.call_bookings enable row level security;
alter table public.group_calls enable row level security;

drop policy if exists "aperturas admin" on public.call_openings;
create policy "aperturas admin" on public.call_openings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "aperturas alumno" on public.call_openings;
create policy "aperturas alumno" on public.call_openings
  for select to authenticated using (true);

drop policy if exists "aperturas anon primera" on public.call_openings;
create policy "aperturas anon primera" on public.call_openings
  for select to anon using (agenda = 'primera');

drop policy if exists "turnos admin" on public.call_bookings;
create policy "turnos admin" on public.call_bookings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "turno propio" on public.call_bookings;
create policy "turno propio" on public.call_bookings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "alumno reserva seguimiento" on public.call_bookings;
create policy "alumno reserva seguimiento" on public.call_bookings
  for insert to authenticated
  with check (agenda = 'seguimiento' and user_id = auth.uid());

drop policy if exists "alumno cancela su turno" on public.call_bookings;
create policy "alumno cancela su turno" on public.call_bookings
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "anon reserva primera" on public.call_bookings;
create policy "anon reserva primera" on public.call_bookings
  for insert to anon
  with check (agenda = 'primera' and user_id is null);

drop policy if exists "grupales admin" on public.group_calls;
create policy "grupales admin" on public.group_calls
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "grupales alumno" on public.group_calls;
create policy "grupales alumno" on public.group_calls
  for select to authenticated using (true);
