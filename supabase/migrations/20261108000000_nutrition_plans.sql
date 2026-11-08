-- ============================================================
-- Nutrición: el plan de alimentación de cada alumno
--
-- Un alumno tiene UN plan (objetivos, comidas con sus opciones y alimentos, y las
-- aclaraciones del coach). Se guarda como jsonb porque el coach lo edita entero,
-- igual que el plan de entrenamiento. El coach lo prepara sin que el alumno lo vea
-- y lo muestra con `published`; el alumno solo lee el suyo y solo si está publicado.
--
-- Solo una tabla nueva: no toca profiles, evolution, material_* ni training_*.
-- ============================================================

create table if not exists public.nutrition_plans (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  parametros jsonb not null default '{}'::jsonb check (jsonb_typeof(parametros) = 'object'),
  comidas jsonb not null default '[]'::jsonb check (jsonb_typeof(comidas) = 'array'),
  notas text not null default '' check (char_length(notas) <= 2000),
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_nutrition_plan()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_nutrition_plans_touch on public.nutrition_plans;
create trigger trg_nutrition_plans_touch
  before update on public.nutrition_plans
  for each row execute function public.touch_nutrition_plan();

-- --- RLS ----------------------------------------------------
alter table public.nutrition_plans enable row level security;

-- El admin gestiona todos los planes (publicados o no)
drop policy if exists "planes nutricion admin" on public.nutrition_plans;
create policy "planes nutricion admin" on public.nutrition_plans
  for all using (public.is_admin()) with check (public.is_admin());

-- El alumno solo lee el suyo, y solo cuando el coach lo publicó. No tiene permiso de escritura.
drop policy if exists "plan nutricion propio publicado" on public.nutrition_plans;
create policy "plan nutricion propio publicado" on public.nutrition_plans
  for select using (auth.uid() = student_id and published);
