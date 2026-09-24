-- OpenTv: status de canais (testado pelo servidor) + metadados enriquecidos de VOD
-- Cole no SQL Editor do Supabase e rode UMA vez. Safe: pode rodar de novo se precisar.

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

create table if not exists public.vod_meta (
  stream_id text primary key,
  kind text not null default 'movie',
  genres text not null default '',
  year text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.vod_meta enable row level security;

drop policy if exists "pub read vm" on public.vod_meta;
create policy "pub read vm" on public.vod_meta for select using (true);

drop policy if exists "pub ins vm" on public.vod_meta;
create policy "pub ins vm" on public.vod_meta for insert with check (true);

drop policy if exists "pub upd vm" on public.vod_meta;
create policy "pub upd vm" on public.vod_meta for update using (true) with check (true);
