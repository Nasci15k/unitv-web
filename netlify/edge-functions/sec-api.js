// API de segurança e planos do OpenTv
// /session-register (POST): registra sessão, aplica 1-conta-por-IP / 1-IP-por-conta, valida plano
// /trial-activate (POST): teste grátis de 15min — 1 por IP
// /stats (GET): contagens do catálogo (público, pra landing)

const SUPA = 'https://figvurwbnocrzoupvtgs.supabase.co';
const ANON = 'sb_publishable_MRl6mB27qtXrDMyF9obwUg_vYtSNh7f';
const HDRS = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const SESSION_WINDOW_MS = 10 * 60 * 1000; // sessão expira após 10min sem atividade
const TRIAL_MINUTES = 15;

const json = (obj, status = 200, cache = 'no-store') =>
    new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': cache }
    });

function clientIp(request) {
    const h = request.headers;
    return h.get('x-nf-client-connection-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

function decodeJwtSub(token) {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const json2 = atob(payload);
        const obj = JSON.parse(json2);
        return { sub: obj.sub || '', email: obj.email || '' };
    } catch (e) { return null; }
}

async function supaRest(path, method, token, body) {
    const res = await fetch(`${SUPA}/rest/v1/${path}`, {
        method,
        headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(method === 'POST' && body ? { Prefer: 'resolution=merge-duplicates' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
}

export default async (request, context) => {
    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') return json({ ok: true });

    // ---------- STATS (público) ----------
    if (pathname === '/stats' && request.method === 'GET') {
        const r = await fetch(`${SUPA}/rest/v1/catalog_stats?select=value&key=eq.catalog`, { headers: HDRS, signal: AbortSignal.timeout(10000) });
        const rows = await r.json().catch(() => null);
        const v = (Array.isArray(rows) && rows[0] && rows[0].value) || { channels: 0, movies: 0, series: 0 };
        return json(v, 200, 'public, max-age=600');
    }

    // Daqui pra baixo precisa de token do usuário
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const ident = token ? decodeJwtSub(token) : null;
    if (!ident || !ident.sub) return json({ ok: false, error: 'Não autenticado.' }, 401);
    const uid = ident.sub;
    const email = ident.email || '';
    const ip = clientIp(request);
    const ua = request.headers.get('user-agent') || '';
    const device = /TV|SmartTV|Android\sTV/i.test(ua) ? 'tv' : (/Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'web');
    const nowIso = new Date().toISOString();

    // ---------- SESSION REGISTER ----------
    if (pathname === '/session-register' && request.method === 'POST') {
        // perfil do usuário
        const prof = await supaRest(`profiles?select=role,status,plan,plan_expires&id=eq.${uid}`, 'GET', token);
        const p = (prof.data && prof.data[0]) || null;
        if (!p) return json({ ok: false, error: 'Perfil não encontrado.' }, 403);
        if (p.role !== 'admin' && p.status !== 'approved') {
            return json({ ok: false, error: 'Conta não aprovada.', status: p.status });
        }

        if (p.role !== 'admin') {
            // 1) conta já em uso em outro IP?
            const sess = await supaRest(`active_sessions?select=user_id,ip,last_seen&user_id=eq.${uid}`, 'GET', token);
            const cur = (sess.data && sess.data[0]) || null;
            if (cur && cur.ip && cur.ip !== ip) {
                const age = Date.now() - Date.parse(cur.last_seen);
                if (age < SESSION_WINDOW_MS) {
                    return json({ ok: false, error: 'Esta conta já está em uso em outro dispositivo. Encerre lá para entrar aqui.' });
                }
            }
            // 2) IP já em uso por outra conta?
            const byIp = await supaRest(`active_sessions?select=user_id,ip,last_seen&ip=eq.${ip}&user_id=neq.${uid}`, 'GET', token);
            if (Array.isArray(byIp.data)) {
                const fresh = byIp.data.find(s => (Date.now() - Date.parse(s.last_seen)) < SESSION_WINDOW_MS);
                if (fresh) {
                    return json({ ok: false, error: 'Este IP já possui outra conta conectada. Uma conta por IP.' });
                }
            }
        }

        // registra acesso + sessão
        await supaRest('access_logs', 'POST', token, [{ user_id: uid, email, ip, user_agent: ua.substring(0, 200), device, created_at: nowIso }]);
        await supaRest(`active_sessions?on_conflict=user_id`, 'POST', token, [{ user_id: uid, email, ip, user_agent: ua.substring(0, 200), device, last_seen: nowIso }]);

        // plano expirado?
        let expired = false;
        if (p.role !== 'admin') {
            if (p.plan === 'trial' || p.plan === 'daily' || p.plan === 'weekly' || p.plan === 'monthly') {
                if (p.plan_expires && Date.parse(p.plan_expires) < Date.now()) expired = true;
            }
        }

        return json({ ok: true, plan: p.plan || 'none', expires: p.plan_expires, role: p.role, expired, ip, device });
    }

    // ---------- TRIAL (15 min, 1 por IP) ----------
    if (pathname === '/trial-activate' && request.method === 'POST') {
        const prof = await supaRest(`profiles?select=role,plan&id=eq.${uid}`, 'GET', token);
        const p = (prof.data && prof.data[0]) || null;
        if (!p) return json({ ok: false, error: 'Perfil não encontrado.' }, 403);
        if (p.role === 'admin') return json({ ok: false, error: 'Admin não precisa de trial.' });

        const used = await supaRest(`trials_used?select=ip&ip=eq.${encodeURIComponent(ip)}`, 'GET', token);
        if (Array.isArray(used.data) && used.data.length) {
            return json({ ok: false, error: 'O teste grátis já foi usado neste IP. Crie um plano para continuar.' });
        }
        const expires = new Date(Date.now() + TRIAL_MINUTES * 60000).toISOString();
        const upd = await supaRest(`profiles?id=eq.${uid}`, 'PATCH', token, { plan: 'trial', plan_expires: expires, status: 'approved' });
        if (!upd.ok) return json({ ok: false, error: 'Falha ao ativar o teste.' }, 500);
        await supaRest('trials_used', 'POST', token, [{ ip, user_id: uid, used_at: nowIso }]);
        return json({ ok: true, plan: 'trial', expires });
    }

    // ---------- HEARTBEAT (mantém sessão viva) ----------
    if (pathname === '/session-heartbeat' && request.method === 'POST') {
        await supaRest(`active_sessions?on_conflict=user_id`, 'POST', token, [{ user_id: uid, email, ip, device, last_seen: nowIso }]);
        return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
};
