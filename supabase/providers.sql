-- ============================================================
-- PROVEDORES IPTV (multi-fornecedor)
-- Cole no SQL Editor do Supabase. Seguro rodar de novo (idempotente).
--
-- Design de segurança (F1):
--   * SELECT liberado para anon: o proxy de catálogo (edge) e o
--     client precisam ler host/credenciais para rotear. Mesmo
--     nível de exposição de hoje (credenciais já são públicas no
--     bundle JS do site). Upgrade futuro: mover credenciais para
--     env var do Netlify.
--   * INSERT/UPDATE/DELETE: somente usuário autenticado com
--     role = admin (public.is_admin()).
--   * O provedor padrão (telefunplay) é seed e nunca é obrigatório
--     desabilitar: se a tabela falhar, o client cai no hardcoded.
-- ============================================================

create table if not exists public.providers (
  id          text primary key,                 -- slug estável, ex.: 'telefunplay', 'prov-a'
  name        text not null,                    -- nome exibido no painel adm
  host        text not null,                    -- ex.: 'https://telefunplay.xyz' ou 'http://138.199.50.161:80'
  username    text not null,
  password    text not null,
  enabled     boolean not null default true,    -- habilitar/desabilitar sem apagar
  priority    integer not null default 100,     -- menor = maior prioridade (dedup escolhe prioridade baixa)
  expires_at  timestamptz,                      -- expiração da conta no painel do provedor (exibido no adm)
  note        text default '',                  -- anotação livre (admin)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.providers add column if not exists expires_at timestamptz;
alter table public.providers add column if not exists note text default '';
alter table public.providers add column if not exists priority integer not null default 100;

-- ===== RLS =====
alter table public.providers enable row level security;

drop policy if exists "prov sel anon" on public.providers;
create policy "prov sel anon"
  on public.providers for select
  to anon, authenticated
  using (true);

drop policy if exists "nt ins admin" on public.providers;
create policy "nt ins admin"
  on public.providers for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "tu upd admin" on public.providers;
create policy "tu upd admin"
  on public.providers for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "td del admin" on public.providers;
create policy "td del admin"
  on public.providers for delete
  to authenticated
  using (public.is_admin());

-- ===== Seed: provedor padrão (o atual, que funciona) =====
insert into public.providers (id, name, host, username, password, enabled, priority, note)
values (
  'telefunplay', 'Telefunplay (padrão)', 'https://telefunplay.xyz',
  'TurboBrasil@2026', '@27101992', true, 10,
  'Provedor original. Nunca remover: é o fallback de segurança.'
)
on conflict (id) do nothing;
