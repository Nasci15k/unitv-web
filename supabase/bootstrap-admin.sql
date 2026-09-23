-- ============================================================
-- OpenTv — Bootstrap do ADMIN (cole no SQL Editor e execute)
-- Substitua SEU-EMAIL-AQUI pelo e-mail da SUA conta.
-- Funciona mesmo se o perfil ainda não existir.
-- ============================================================
insert into public.profiles (id, email, full_name, role, status)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', ''), 'admin', 'approved'
from auth.users
where email = 'SEU-EMAIL-AQUI'
on conflict (id) do update
  set role = 'admin', status = 'approved';

-- Conferir (deve retornar sua linha com role=admin, status=approved):
-- select id, email, role, status from public.profiles;
