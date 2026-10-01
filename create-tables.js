const { Client } = require('pg');
const PASS = 'Nasci15k7__';
const REFS = ['figvurwbnocrzoupvtgs'];

const SQL = `
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
`;

const hosts = [];
for (const r of ['us-east-1','us-west-1','eu-central-1','eu-west-1','ap-southeast-1','ap-southeast-2','ap-northeast-1','sa-east-1','us-east-2','ca-central-1'])
  for (const p of ['aws-0','aws-1']) hosts.push(p + '-' + r + '.pooler.supabase.com');
hosts.push('db.figvurwbnocrzoupvtgs.supabase.co');

(async () => {
  for (const host of hosts) {
    for (const ref of REFS) {
      try {
        const c = new Client({
          host: host,
          port: 5432,
          user: host.startsWith('db.') ? 'postgres' : 'postgres.' + ref,
          password: PASS,
          database: 'postgres',
          connectionTimeoutMillis: 6000,
          ssl: { rejectUnauthorized: false }
        });
        await c.connect();
        await c.query(SQL);
        const r = await c.query('select count(*) as n from public.channel_status');
        console.log('SUCESSO:', host, '— tabelas ok, rows:', r.rows[0].n);
        await c.end();
        process.exit(0);
      } catch (e) {
        const m = String(e.message).split('\n')[0];
        if (!/not found|ENOTFOUND/.test(m)) console.log(host, '->', m);
      }
    }
  }
  console.log('NENHUM HOST CONECTOU');
  process.exit(1);
})();
