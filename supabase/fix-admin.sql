-- ============================================================
-- FIX ÚNICO — rode UMA vez no SQL Editor do Supabase
-- 1) Corrige o trigger que BLOQUEAVA qualquer UPDATE de status
-- 2) Aprova e promove a admin a conta adm@opentv.app
-- ============================================================

-- 1) Trigger: permite SQL Editor alterar role/status
create or replace function public.protect_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then
    return new;
  end if;
  if new.role is distinct from old.role
     and coalesce(public.is_admin(), false) = false then
    raise exception 'Apenas administradores podem alterar o papel.';
  end if;
  if new.status is distinct from old.status
     and coalesce(public.is_admin(), false) = false then
    raise exception 'Apenas administradores podem alterar o status.';
  end if;
  return new;
end;
$$;

-- 2) Garante perfil da conta admin (cria se não existir)
insert into public.profiles (id, email, full_name, role, status)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', ''), 'admin', 'approved'
from auth.users
where lower(email) = lower('adm@opentv.app')
on conflict (id) do update set role = 'admin', status = 'approved';

-- 3) Confirmação final (deve retornar role=admin, status=approved)
select email, role, status from public.profiles order by created_at;
