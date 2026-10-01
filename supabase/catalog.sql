-- OpenTv F5 — índice de catálogo multi-provedor no Supabase.
-- Rodar no SQL Editor do Supabase (junto com providers.sql, já executado).
-- Espelha o catálogo COMPLETO de todos os provedores habilitados, com o
-- provider explícito em cada linha e as categorias mapeadas para as
-- categorias existentes do provedor base (nas mesmas da UI).
-- Índice é espelho: o worker catalog-index reescreve por provedor a cada
-- rodada; a view catalog_active_items esconde provedores desabilitados.

create table if not exists public.catalog_items (
  provider text not null,
  kind text not null,               -- 'movie' | 'series' | 'live'
  external_id text not null,        -- id cru do provedor (stream_id/series_id)
  name text,
  title text,
  year int,
  poster text,
  rating real,
  category_id text,                 -- id da categoria (do base quando remapeada)
  category_name text,
  added bigint,
  payload jsonb,                    -- item cru completo (permite rebuild sem rebaixar)
  indexed_at timestamptz not null default now(),
  primary key (provider, kind, external_id)
);

create table if not exists public.catalog_categories (
  provider text not null,
  kind text not null,               -- 'vod' | 'series' | 'live'
  category_id text not null,
  category_name text not null,
  primary key (provider, kind, category_id)
);

create index if not exists ci_kind_cat_idx on public.catalog_items (kind, category_id);
create index if not exists ci_provider_kind_idx on public.catalog_items (provider, kind);
create index if not exists ci_name_idx on public.catalog_items (lower(name));

-- Mesmo padrão RLS das tabelas existentes do projeto (leitura pública,
-- escrita com a publishable key — o worker usa o ANON igual ao demais).
alter table public.catalog_items enable row level security;
drop policy if exists "ci sel public" on public.catalog_items;
create policy "ci sel public" on public.catalog_items for select using (true);
drop policy if exists "ci ins any" on public.catalog_items;
create policy "ci ins any" on public.catalog_items for insert with check (true);
drop policy if exists "ci upd any" on public.catalog_items;
create policy "ci upd any" on public.catalog_items for update using (true) with check (true);
drop policy if exists "ci del any" on public.catalog_items;
create policy "ci del any" on public.catalog_items for delete using (true);

alter table public.catalog_categories enable row level security;
drop policy if exists "cc sel public" on public.catalog_categories;
create policy "cc sel public" on public.catalog_categories for select using (true);
drop policy if exists "cc ins any" on public.catalog_categories;
create policy "cc ins any" on public.catalog_categories for insert with check (true);
drop policy if exists "cc upd any" on public.catalog_categories;
create policy "cc upd any" on public.catalog_categories for update using (true) with check (true);
drop policy if exists "cc del any" on public.catalog_categories;
create policy "cc del any" on public.catalog_categories for delete using (true);

-- Visão "ativa": conteudo só de provedores habilitados no painel adm.
-- Desabilitar provedor → linhas somem daqui; habilitar → voltam.
create or replace view public.catalog_active_items as
select i.*
from public.catalog_items i
join public.providers p on p.id = i.provider
where p.enabled = true;

create or replace view public.catalog_active_categories as
select c.*
from public.catalog_categories c
join public.providers p on p.id = c.provider
where p.enabled = true;
