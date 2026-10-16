-- ============================================================
-- Entrenamiento: ciclos (macrociclos), sesiones y series del alumno
--
-- Un alumno puede tener N ciclos; cada ciclo guarda el plan completo
-- (semanas > días > bloques > ejercicios) como jsonb, porque el entrenador
-- lo edita entero. Lo que anota el alumno va en filas separadas para poder
-- armar reportes (adherencia, carga por ejercicio) y, a futuro, seguirlo en
-- vivo. Los ids de día y de ejercicio son los del jsonb del plan (únicos por plan).
--
-- Solo tablas nuevas: no toca profiles, evolution ni material_*.
-- ============================================================

-- --- Ciclos -------------------------------------------------
create table if not exists public.training_cycles (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'activo' check (status in ('borrador', 'activo', 'finalizado')),
  plan jsonb not null check (jsonb_typeof(plan) = 'object'),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- permite que sesiones y series referencien (ciclo, alumno) y así nunca
  -- queden con un alumno distinto al del ciclo
  unique (id, student_id)
);

create index if not exists idx_training_cycles_student on public.training_cycles(student_id, created_at);

-- Un solo ciclo activo por alumno
create unique index if not exists uq_training_cycles_un_activo
  on public.training_cycles(student_id) where status = 'activo';

create or replace function public.touch_training_cycle()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_training_cycles_touch on public.training_cycles;
create trigger trg_training_cycles_touch
  before update on public.training_cycles
  for each row execute function public.touch_training_cycle();

-- --- Sesiones (un día terminado o no entrenado) ---------------
create table if not exists public.training_sessions (
  cycle_id uuid not null,
  student_id uuid not null,
  day_id text not null,
  fecha date not null,
  estado text not null default 'hecha' check (estado in ('hecha', 'omitida')),
  terminada_en timestamptz not null default now(),
  primary key (cycle_id, day_id),
  foreign key (cycle_id, student_id) references public.training_cycles(id, student_id) on delete cascade
);

create index if not exists idx_training_sessions_student on public.training_sessions(student_id, fecha);

-- --- Series anotadas por el alumno ----------------------------
-- kg y reps son texto libre, igual que en la app ("80", "8-10", "al fallo").
create table if not exists public.training_set_logs (
  cycle_id uuid not null,
  student_id uuid not null,
  exercise_id text not null,
  set_n int not null check (set_n >= 1),
  kg text not null default '',
  reps text not null default '',
  done boolean not null default false,
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (cycle_id, exercise_id, set_n),
  check (not (done and skipped)),
  foreign key (cycle_id, student_id) references public.training_cycles(id, student_id) on delete cascade
);

create index if not exists idx_training_set_logs_student on public.training_set_logs(student_id);

-- --- RLS ----------------------------------------------------
alter table public.training_cycles enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_set_logs enable row level security;

-- Ciclos: el admin gestiona todo; el alumno solo lee los suyos que ya le mostraron
drop policy if exists "ciclos admin" on public.training_cycles;
create policy "ciclos admin" on public.training_cycles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ciclos propios visibles" on public.training_cycles;
create policy "ciclos propios visibles" on public.training_cycles
  for select using (auth.uid() = student_id and status in ('activo', 'finalizado'));

-- Sesiones: el admin todo; el alumno lee las suyas y las escribe solo mientras el ciclo está activo
drop policy if exists "sesiones admin" on public.training_sessions;
create policy "sesiones admin" on public.training_sessions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sesiones propias leer" on public.training_sessions;
create policy "sesiones propias leer" on public.training_sessions
  for select using (auth.uid() = student_id);

drop policy if exists "sesiones propias escribir" on public.training_sessions;
create policy "sesiones propias escribir" on public.training_sessions
  for all
  using (
    auth.uid() = student_id
    and exists (select 1 from public.training_cycles c where c.id = cycle_id and c.status = 'activo')
  )
  with check (
    auth.uid() = student_id
    and exists (select 1 from public.training_cycles c where c.id = cycle_id and c.status = 'activo')
  );

-- Series: igual que las sesiones
drop policy if exists "series admin" on public.training_set_logs;
create policy "series admin" on public.training_set_logs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "series propias leer" on public.training_set_logs;
create policy "series propias leer" on public.training_set_logs
  for select using (auth.uid() = student_id);

drop policy if exists "series propias escribir" on public.training_set_logs;
create policy "series propias escribir" on public.training_set_logs
  for all
  using (
    auth.uid() = student_id
    and exists (select 1 from public.training_cycles c where c.id = cycle_id and c.status = 'activo')
  )
  with check (
    auth.uid() = student_id
    and exists (select 1 from public.training_cycles c where c.id = cycle_id and c.status = 'activo')
  );
