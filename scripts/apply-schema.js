// One-shot: apply schema + create admin on Supabase Postgres
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const HOSTS = [
  process.env.SUPABASE_DB_HOST,
  'db.figvurwbnocrzoupvtgs.supabase.co',
  'aws-0-sa-east-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com',
  'aws-0-us-west-1.pooler.supabase.com',
  'aws-0-eu-west-1.pooler.supabase.com',
].filter(Boolean);

const USERS = [
  process.env.SUPABASE_DB_USER,
  'postgres',
  'postgres.figvurwbnocrzoupvtgs',
].filter(Boolean);

const PORTS = [5432, 6543];
const DB_PASS = process.env.SUPABASE_DB_PASS || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@opentv.app';

async function tryConnect(host, port, user) {
  const client = new Client({
    host, port, user, database: 'postgres', password: DB_PASS,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  const r = await client.query('select current_user, version()');
  console.log('CONNECTED', { host, port, user, as: r.rows[0].current_user });
  return client;
}

async function main() {
  if (!DB_PASS) { console.error('SET SUPABASE_DB_PASS'); process.exit(2); }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  let client = null;
  let lastErr = null;
  for (const host of HOSTS) {
    for (const port of PORTS) {
      for (const user of USERS) {
        try {
          client = await tryConnect(host, port, user);
          break;
        } catch (e) {
          lastErr = e;
          console.log('fail', host, port, user, e.message);
        }
      }
      if (client) break;
    }
    if (client) break;
  }
  if (!client) {
    console.error('NO_CONNECTION', lastErr && lastErr.message);
    process.exit(1);
  }
  await client.query(sql);
  console.log('schema applied');
  const r = await client.query(
    `update public.profiles set role='admin', status='approved' where email=$1 returning id, email, role, status`,
    [ADMIN_EMAIL]
  );
  console.log('admin update', JSON.stringify(r.rows));
  const all = await client.query(`select email, role, status from public.profiles order by created_at`);
  console.log('profiles', JSON.stringify(all.rows));
  await client.end();
}

main().catch((e) => { console.error('FAIL', e.message || e); process.exit(1); });
