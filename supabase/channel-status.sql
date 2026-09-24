-- OpenTv: tabelas de status de canais (testados pelo servidor) e generos de filmes (enriquecimento)
-- COLE ESTE SQL NO SQL Editor do Supabase e rode UMA vez.

create table if not exists public.channel_status (
  stream_id text primary key,
  status text not null,
  checked_at timestamptz not null default now()
);
alter table public.channel_status enable row level security;
drop policy if exists "pub read ch" on public.channel_status;
create policy "pub read ch" on public.channel_status for select using (true);
drop policy if exists "pub ins ch" on public.channel_status;
create policy "pub ins ch" on public.channel_status for insert with check (true);
drop policy if exists "pub upd ch" on public.channel_status;
create policy "pub upd ch" on public.channel_status for update using (true) with check (true);

create table if not exists public.movie_genres (
  stream_id text primary key,
  genres text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.movie_genres enable row level security;
drop policy if exists "pub read mg" on public.movie_genres;
create policy "pub read mg" on public.movie_genres for select using (true);
drop policy if exists "pub ins mg" on public.movie_genres for insert with check (true);
drop policy if exists "pub upd mg" on public.movie_genres for update using (true) with check (true);
