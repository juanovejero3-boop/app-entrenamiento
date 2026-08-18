-- ============================================================
-- 0002: Corrige prevent_role_escalation para permitir
--       operaciones de servidor (auth.uid() null: SQL Editor,
--       postgres, service_role) y bloquear solo a usuarios
--       autenticados que no sean admin.
-- ============================================================
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     ) then
    raise exception 'No tenés permisos para cambiar el rol.';
  end if;
  return new;
end;
$$;
