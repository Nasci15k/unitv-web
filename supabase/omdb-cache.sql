-- Cache compartilhado de ratings OMDb (IMDb) do OpenTv.
-- Rode este arquivo no Supabase > SQL Editor > New query > Run.
-- Todos os clientes leem e gravam a mesma cópia: cada título consome
-- a cota OMDb uma única vez no mundo, não uma vez por navegador.

create table if not exists public.omdb_cache (
  key text primary key,          -- ex: "t|Interestelar|2014|" ou "s|tt0816692|1"
  data jsonb,                    -- resposta completa do OMDb (null quando não achou)
  not_found boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.omdb_cache enable row level security;

drop policy if exists "omdb_cache_read" on public.omdb_cache;
create policy "omdb_cache_read" on public.omdb_cache
  for select using (true);

drop policy if exists "omdb_cache_insert" on public.omdb_cache;
create policy "omdb_cache_insert" on public.omdb_cache
  for insert with check (true);

drop policy if exists "omdb_cache_update" on public.omdb_cache;
create policy "omdb_cache_update" on public.omdb_cache
  for update using (true) with check (true);
