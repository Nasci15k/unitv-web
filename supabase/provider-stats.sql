-- OpenTv F5 — estatísticas de indexação por provedor.
-- Rodar no SQL Editor do Supabase (depois de catalog.sql).
create table if not exists public.provider_index_stats (
  provider text primary key,
  movies int not null default 0,
  series int not null default 0,
  channels int not null default 0,
  ok boolean not null default true,
  error text,
  indexed_at timestamptz not null default now()
);

alter table public.provider_index_stats enable row level security;
drop policy if exists "pis sel public" on public.provider_index_stats;
create policy "pis sel public" on public.provider_index_stats for select using (true);
drop policy if exists "pis ins any" on public.provider_index_stats;
create policy "pis ins any" on public.provider_index_stats for insert with check (true);
drop policy if exists "pis upd any" on public.provider_index_stats;
create policy "pis upd any" on public.provider_index_stats for update using (true) with check (true);
drop policy if exists "pis del any" on public.provider_index_stats;
create policy "pis del any" on public.provider_index_stats for delete using (true);
