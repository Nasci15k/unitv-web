// GET/POST /functions/v1/xtream — optional proxy hides IPTV credentials
// Query: path=player_api.php|...  or body { action, params }
// Prefer direct client calls when CORS allows; use this on Netlify if needed.
import { corsHeaders, json, err, getCors } from '../_shared/cors.ts';

const UPSTREAM = Deno.env.get('XTREAM_BASE') || 'http://telefunplay.xyz';
const USER = Deno.env.get('XTREAM_USER') || 'TurboBrasil@2026';
const PASS = Deno.env.get('XTREAM_PASS') || '@27101992';

function authQS() {
  return `username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}`;
}

Deno.serve(async (req) => {
  const pre = getCors(req);
  if (pre) return pre;
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || '';
    const q = url.searchParams.get('q') || '';
    let target = `${UPSTREAM}/player_api.php?${authQS()}`;
    if (action) target += `&action=${encodeURIComponent(action)}`;
    if (q) target += `&${q}`;
    if (url.searchParams.get('raw')) {
      target = `${UPSTREAM}/${url.searchParams.get('raw')}`;
    }
    const res = await fetch(target, {
      headers: { 'User-Agent': 'OpenTv/1.0', Accept: '*/*' },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (e) {
    return err(String(e?.message || e), 502);
  }
});
