-- OpenTv: planos, trials, segurança de sessão, notificações, pagamentos e estatísticas
-- Cole no SQL Editor do Supabase e rode UMA vez. Seguro rodar de novo.

-- ===== PLANOS nos perfis =====
alter table public.profiles add column if not exists plan text not null default 'none';
alter table public.profiles add column if not exists plan_expires timestamptz;

-- ===== Logs de acesso (admin vê, usuário escreve a si mesmo) =====
create table if not exists public.access_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  ip text,
  user_agent text,
  device text,
  created_at timestamptz not null default now()
);
alter table public.access_logs enable row level security;
drop policy if exists "al ins own" on public.access_logs;
create policy "al ins own" on public.access_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "al sel admin" on public.access_logs;
create policy "al sel admin" on public.access_logs for select to authenticated using (public.is_admin());

-- ===== Sessões ativas (1 conta = 1 IP; 1 IP = 1 conta) =====
create table if not exists public.active_sessions (
  user_id uuid primary key,
  email text,
  ip text,
  user_agent text,
  device text,
  last_seen timestamptz not null default now()
);
alter table public.active_sessions enable row level security;
drop policy if exists "as ins own" on public.active_sessions;
create policy "as ins own" on public.active_sessions for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "as upd own" on public.active_sessions;
create policy "as upd own" on public.active_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "as sel auth" on public.active_sessions;
create policy "as sel auth" on public.active_sessions for select to authenticated using (true);
drop policy if exists "as del own" on public.active_sessions;
create policy "as del own" on public.active_sessions for delete to authenticated using (auth.uid() = user_id);

-- ===== Trials (1 por IP) =====
create table if not exists public.trials_used (
  ip text primary key,
  user_id uuid,
  used_at timestamptz not null default now()
);
alter table public.trials_used enable row level security;
drop policy if exists "tu sel auth" on public.trials_used;
create policy "tu sel auth" on public.trials_used for select to authenticated using (true);
drop policy if exists "tu ins own" on public.trials_used;
create policy "tu ins own" on public.trials_used for insert to authenticated with check (auth.uid() = user_id);

-- ===== Notificações pop-up (admin emite, usuários leem) =====
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  type text not null default 'info',
  active boolean not null default true,
  show_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
drop policy if exists "nt sel auth" on public.notifications;
create policy "nt sel auth" on public.notifications for select to authenticated using (active = true);
drop policy if exists "nt write admin" on public.notifications;
create policy "nt ins admin" on public.notifications for insert to authenticated with check (public.is_admin());
drop policy if exists "nt upd admin" on public.notifications;
create policy "nt upd admin" on public.notifications for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "nt del admin" on public.notifications;
create policy "nt del admin" on public.notifications for delete to authenticated using (public.is_admin());

create table if not exists public.notification_reads (
  user_id uuid,
  notification_id bigint,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
alter table public.notification_reads enable row level security;
drop policy if exists "nr ins own" on public.notification_reads;
create policy "nr ins own" on public.notification_reads for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "nr sel own" on public.notification_reads;
create policy "nr sel own" on public.notification_reads for select to authenticated using (auth.uid() = user_id);

-- ===== Pagamentos (gateway chega segunda-feira) =====
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  plan text not null,
  amount numeric not null default 0,
  status text not null default 'pending',
  gateway text,
  gateway_ref text,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
drop policy if exists "pm ins own" on public.payments;
create policy "pm ins own" on public.payments for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "pm sel own admin" on public.payments;
create policy "pm sel own admin" on public.payments for select to authenticated using (auth.uid() = user_id or public.is_admin());

-- ===== Estatísticas do catálogo (público, pra landing page) =====
create table if not exists public.catalog_stats (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.catalog_stats enable row level security;
drop policy if exists "cs sel public" on public.catalog_stats;
create policy "cs sel public" on public.catalog_stats for select using (true);
drop policy if exists "cs ins any" on public.catalog_stats;
create policy "cs ins any" on public.catalog_stats for insert with check (true);
drop policy if exists "cs upd any" on public.catalog_stats;
create policy "cs upd any" on public.catalog_stats for update using (true) with check (true);

-- ===== Contagem de séries p/ estatística (worker preenche) =====
insert into public.catalog_stats (key, value) values ('catalog', '{"channels":0,"movies":0,"series":0}')
on conflict (key) do nothing;
