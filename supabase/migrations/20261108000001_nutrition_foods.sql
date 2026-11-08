-- ============================================================
-- Nutrición: la biblioteca de alimentos de los coaches
--
-- Una sola biblioteca compartida por todos los coaches (admins): los alimentos que usan
-- para armar los planes, agrupados por categoría de intercambio (la categoría define los
-- macros de la porción, y vive en la app). El alumno no la necesita ni la ve: cuando el
-- coach agrega un alimento a un plan, el plan guarda su propia copia.
--
-- Solo una tabla nueva: no toca profiles, evolution, material_*, training_* ni nutrition_plans.
-- ============================================================

create table if not exists public.nutrition_foods (
  -- texto y no uuid: son los ids que ya tienen los alimentos de la app (generados en el navegador)
  id text primary key default gen_random_uuid()::text,
  categoria text not null check (char_length(btrim(categoria)) between 1 and 40),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 300),
  porcion text not null check (char_length(btrim(porcion)) between 1 and 120),
  gluten boolean not null default false,
  lacteo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un alimento no se repite dentro de su categoría (sin importar mayúsculas ni espacios de los costados)
create unique index if not exists uq_nutrition_foods_nombre
  on public.nutrition_foods (categoria, lower(btrim(nombre)));

create or replace function public.touch_nutrition_food()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nutrition_foods_touch on public.nutrition_foods;
create trigger trg_nutrition_foods_touch
  before update on public.nutrition_foods
  for each row execute function public.touch_nutrition_food();

-- --- RLS ----------------------------------------------------
alter table public.nutrition_foods enable row level security;

-- Solo los coaches: leen y escriben todo. El alumno no tiene ninguna política, así que no ve ni toca nada.
drop policy if exists "alimentos admin" on public.nutrition_foods;
create policy "alimentos admin" on public.nutrition_foods
  for all using (public.is_admin()) with check (public.is_admin());
