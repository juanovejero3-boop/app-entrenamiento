-- ============================================================
-- Llamadas: cada coach con su script de Google Calendar, y el
-- resultado del calendario guardado en cada turno.
--
-- - call_coaches: el script de cada coach. Solo lo leen los coaches;
--   quien reserva ya no ve la dirección (antes era pública y cualquiera
--   podía usarla para mandar mails desde la cuenta del coach). El
--   script lo llama el servidor (función agendar-llamada).
-- - Cada día abierto y cada turno saben de qué coach son. El turno
--   toma siempre el coach de su día: quien reserva no lo puede elegir.
-- - calendario_estado: pendiente (recién reservado), agendado, error
--   (con el motivo que dio Google) o sin_script.
--
-- Por ahora hay un solo coach con script; la base ya admite varios.
-- Lo que falta para varios a la vez: que dos coaches puedan abrir el
-- mismo día y que sus turnos no se bloqueen entre sí.
--
-- Aplicarla en Supabase después de 20261125010000_llamadas_script.sql,
-- y antes de publicar la app que la usa.
-- ============================================================

-- --- El script de cada coach -----------------------------------
create table if not exists public.call_coaches (
  coach_id uuid primary key references public.profiles(id) on delete cascade,
  script_url text not null default '' check (char_length(script_url) <= 500),
  coach_email text not null default '' check (char_length(coach_email) <= 200),
  updated_at timestamptz not null default now()
);

alter table public.call_coaches enable row level security;
revoke all on public.call_coaches from anon;
grant select, insert, update, delete on public.call_coaches to authenticated;

drop policy if exists "coaches de llamadas admin" on public.call_coaches;
create policy "coaches de llamadas admin" on public.call_coaches
  for all using (public.is_admin()) with check (public.is_admin());

-- El script que ya estaba cargado pasa al coach que lo cargó (se lo reconoce por su mail)
insert into public.call_coaches (coach_id, script_url, coach_email)
select p.id, btrim(s.script_url), btrim(s.coach_email)
from public.call_settings s
join public.profiles p on lower(btrim(p.email)) = lower(btrim(s.coach_email)) and p.role = 'admin'
where s.id = 'coach' and btrim(s.script_url) <> ''
on conflict (coach_id) do nothing;

-- La tabla vieja queda solo para los coaches: la dirección deja de ser pública
drop policy if exists "script lectura" on public.call_settings;
revoke select on public.call_settings from anon;

-- --- De qué coach es cada día y cada turno -----------------------
alter table public.call_openings
  add column if not exists coach_id uuid references public.profiles(id) on delete cascade;
alter table public.call_bookings
  add column if not exists coach_id uuid references public.profiles(id) on delete set null;

-- Lo que ya existía queda a nombre del único coach con script (si hay uno solo)
do $$
declare
  unico uuid;
begin
  if (select count(*) from public.call_coaches) = 1 then
    select coach_id into unico from public.call_coaches;
    update public.call_openings set coach_id = unico where coach_id is null;
    update public.call_bookings set coach_id = unico where coach_id is null;
  end if;
end $$;

-- --- Resultado del calendario en cada turno ----------------------
alter table public.call_bookings
  add column if not exists calendario_estado text not null default 'pendiente',
  add column if not exists calendario_error text not null default '',
  add column if not exists calendario_intentos integer not null default 0,
  add column if not exists calendario_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'call_bookings_calendario_estado') then
    alter table public.call_bookings
      add constraint call_bookings_calendario_estado
      check (calendario_estado in ('pendiente', 'agendado', 'error', 'sin_script'));
  end if;
end $$;

-- Al reservar: el coach sale del día reservado y el calendario arranca pendiente, mande lo que mande quien reserva
create or replace function public.call_booking_al_reservar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select o.coach_id into new.coach_id
  from public.call_openings o
  where o.agenda = new.agenda and o.fecha = new.fecha;
  new.calendario_estado := 'pendiente';
  new.calendario_error := '';
  new.calendario_intentos := 0;
  new.calendario_en := null;
  return new;
end;
$$;

drop trigger if exists trg_call_booking_al_reservar on public.call_bookings;
create trigger trg_call_booking_al_reservar
  before insert on public.call_bookings
  for each row execute function public.call_booking_al_reservar();
