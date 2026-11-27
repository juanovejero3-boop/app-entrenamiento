-- Llamadas: cada turno guarda el evento que creó el script en Google Calendar y su enlace de Meet.
-- Con el evento, cancelar el turno también lo borra del calendario del coach y del alumno.
-- Los escribe solo la función agendar-llamada (service role): quien reserva no los puede inventar.
-- Idempotente.

alter table public.call_bookings
  add column if not exists calendario_evento_id text not null default '',
  add column if not exists meet_link text not null default '';

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
  new.calendario_evento_id := '';
  new.meet_link := '';
  return new;
end;
$$;
