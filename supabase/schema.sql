-- ============================================================
-- OpenTv — Schema Supabase (SQL Editor)
-- Aprovação de contas + admin
-- ============================================================
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Perfis de usuário (status: pending | approved | rejected)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists status text not null default 'pending';
do $$ begin
  alter table public.profiles add constraint profiles_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'user',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  ) or public.is_admin();
$$;

create or replace function public.protect_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / conexão direta (sem JWT) pode alterar livremente
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

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role_change();

-- ------------------------------------------------------------
-- Ajustes do app
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('site_name', '"OpenTv"'),
  ('default_language', '"pt"'),
  ('subtitle_default_size', '"1"')
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists profiles_select_own_admin on public.profiles;
create policy profiles_select_own_admin
  on public.profiles for select
  to authenticated
  using ((id = auth.uid()) or public.is_admin());

drop policy if exists profiles_update_own_admin on public.profiles;
create policy profiles_update_own_admin
  on public.profiles for update
  to authenticated
  using ((id = auth.uid()) or public.is_admin())
  with check ((id = auth.uid()) or public.is_admin());

drop policy if exists app_settings_select_auth on public.app_settings;
create policy app_settings_select_auth
  on public.app_settings for select
  to authenticated
  using (true);

drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin
  on public.app_settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
  on public.app_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ------------------------------------------------------------
-- ADMIN — bootstrap
-- ------------------------------------------------------------
-- 1) Crie a conta em login.html (admin@opentv.app / Admin123!)
-- 2) Execute:
-- UPDATE public.profiles
--   SET role = 'admin', status = 'approved'
--   WHERE email = 'admin@opentv.app';
--
-- Aprovar usuário no painel (admin.html):
-- UPDATE public.profiles SET status='approved' WHERE email='...';
