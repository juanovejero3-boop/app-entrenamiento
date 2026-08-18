-- ============================================================
-- 0003: Corrige recursión infinita en políticas admin de RLS.
-- Reset completo e idempotente: dropea TODAS las políticas de
-- profiles/evolution y las recrea. El chequeo de admin vive en
-- public.is_admin() (security definer, corre como el owner y
-- saltea RLS), evitando la auto-consulta recursiva.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- --- profiles ---
drop policy if exists "leer perfil propio" on public.profiles;
drop policy if exists "actualizar perfil propio" on public.profiles;
drop policy if exists "admin lee todos los perfiles" on public.profiles;
drop policy if exists "admin actualiza todos los perfiles" on public.profiles;

create policy "leer perfil propio" on public.profiles
  for select using (auth.uid() = id);

create policy "actualizar perfil propio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "admin lee todos los perfiles" on public.profiles
  for select using (public.is_admin());

create policy "admin actualiza todos los perfiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- --- evolution ---
drop policy if exists "leer evolución propia" on public.evolution;
drop policy if exists "insertar evolución propia" on public.evolution;
drop policy if exists "admin lee evolución de todos" on public.evolution;

create policy "leer evolución propia" on public.evolution
  for select using (auth.uid() = user_id);

create policy "insertar evolución propia" on public.evolution
  for insert with check (auth.uid() = user_id);

create policy "admin lee evolución de todos" on public.evolution
  for select using (public.is_admin());
