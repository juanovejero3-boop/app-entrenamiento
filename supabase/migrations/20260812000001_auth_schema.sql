-- ============================================================
-- 0001: Esquema inicial de auth — trigger de perfil, RLS y
--       protección contra escalada de privilegios.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Trigger que crea el perfil automáticamente al registrarse
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'alumno')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- 2) Políticas RLS en profiles
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "leer perfil propio" on public.profiles;
create policy "leer perfil propio" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "actualizar perfil propio" on public.profiles;
create policy "actualizar perfil propio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "admin lee todos los perfiles" on public.profiles;
create policy "admin lee todos los perfiles" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "admin actualiza todos los perfiles" on public.profiles;
create policy "admin actualiza todos los perfiles" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ------------------------------------------------------------
-- 3) Políticas RLS en evolution
-- ------------------------------------------------------------
alter table public.evolution enable row level security;

drop policy if exists "leer evolución propia" on public.evolution;
create policy "leer evolución propia" on public.evolution
  for select using (auth.uid() = user_id);

drop policy if exists "insertar evolución propia" on public.evolution;
create policy "insertar evolución propia" on public.evolution
  for insert with check (auth.uid() = user_id);

drop policy if exists "admin lee evolución de todos" on public.evolution;
create policy "admin lee evolución de todos" on public.evolution
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ------------------------------------------------------------
-- 4) Evitar escalada de privilegios (cambio de role)
--    Solo un admin puede modificar el campo role de un perfil.
-- ------------------------------------------------------------
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    ) then
      raise exception 'No tenés permisos para cambiar el rol.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_role_escalation on public.profiles;
create trigger prevent_role_escalation
before update on public.profiles
for each row execute procedure public.prevent_role_escalation();
