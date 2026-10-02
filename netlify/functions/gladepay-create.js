// OpenTv — cria um checkout Pix/cartão no Gladepay (server-side).
// A chave da API NUNCA vai para o cliente: usa a env var GLADEPAY_API_KEY
// (Site config → Environment variables no Netlify; .env só no dev local).
const BASE = 'https://app.gladepay.com.br/v1';

// Preços em centavos — espelho de js/config.js (validação server-side:
// o cliente NÃO envia valor, evita adulteração de preço).
const PLANS = {
    daily:   { cents: 499,  label: 'Diário' },
    weekly:  { cents: 1499, label: 'Semanal' },
    monthly: { cents: 2499, label: 'Mensal' }
};

const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
});

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Método não permitido' });

    const KEY = process.env.GLADEPAY_API_KEY;
    if (!KEY) {
        return json(503, { ok: false, error: 'Gateway não configurado (GLADEPAY_API_KEY ausente).' });
    }

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { ok: false, error: 'JSON inválido.' }); }

    const plan = PLANS[body.plan];
    if (!plan) return json(400, { ok: false, error: 'Plano inválido.' });

    const h = event.headers || {};
    const host = h.host || h.Host || '';
    const proto = h['x-forwarded-proto'] || h['X-Forwarded-Proto'] || '';
    let base = (proto && host) ? (proto + '://' + host) : '';
    if (!/^https:\/\//.test(base) && /^https:\/\//.test(h.origin || '')) base = h.origin;
    if (!/^https:\/\//.test(base) || /localhost|127\.0\.0\.1/i.test(base)) {
        // gateway exige URLs https públicas (rejeita localhost com "Valor inválido")
        base = process.env.SITE_URL || 'https://opentvv.netlify.app';
    }
    const reference = 'otv_' + body.plan + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    const customerName = String(body.customerName || '').trim().slice(0, 80) || 'Cliente OpenTv';
    // gateway exige e-mail preenchido (retorna "Valor inválido." se vazio)
    const customerEmail = String(body.customerEmail || '').trim().slice(0, 120) || 'cliente@opentv.app';
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
        return json(400, { ok: false, error: 'E-mail inválido.' });
    }

    try {
        const payload = {
            amountCents: plan.cents,
            reference: reference,
            description: 'OpenTv — Plano ' + plan.label,
            customerName: customerName,
            customerEmail: customerEmail,
            redirectUrl: base + '/planos.html?pg=return&ref=' + encodeURIComponent(reference),
            callbackUrl: base + '/.netlify/functions/gladepay-webhook',
            expiresInSeconds: 1800
        };
        console.log('[gladepay-create] base=' + base + ' ref=' + reference);
        const res = await fetch(BASE + '/deposito', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000)
        });
        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) {}
        if (!res.ok) {
            console.log('[gladepay-create] HTTP', res.status, text.slice(0, 300));
            return json(502, { ok: false, error: data.message || data.error || 'Falha ao criar o pagamento (HTTP ' + res.status + ').' });
        }
        const checkoutUrl = data.checkoutUrl || data.checkout_url || data.url || (data.data && (data.data.checkoutUrl || data.data.url));
        if (!checkoutUrl) {
            console.log('[gladepay-create] sem checkoutUrl:', text.slice(0, 300));
            return json(502, { ok: false, error: 'Resposta inesperada do gateway.' });
        }
        // txId é o identificador que o endpoint /deposito/status aceita
        const txId = data.txId || (data.data && data.data.txId) || '';
        return json(200, {
            ok: true,
            checkoutUrl: checkoutUrl,
            txId: txId,
            qrCodeText: data.qrCodeText || null,
            status: data.status || null,
            reference: reference,
            amountCents: plan.cents,
            plan: body.plan
        });
    } catch (e) {
        console.log('[gladepay-create] erro:', e && e.message);
        return json(502, { ok: false, error: 'Gateway indisponível no momento.' });
    }
};
