// OpenTv — consulta o status de um depósito Gladepay (proxy server-side
// para a chave não expor no navegador). Usado na volta do checkout.
const BASE = 'https://app.gladepay.com.br/v1';

const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
});

exports.handler = async (event) => {
    const KEY = process.env.GLADEPAY_API_KEY;
    if (!KEY) return json(503, { ok: false, error: 'Gateway não configurado.' });

    const txId = (event.queryStringParameters && (event.queryStringParameters.txId || event.queryStringParameters.ref)) || '';
    if (!txId || !/^[\w.-]{1,80}$/.test(txId)) return json(400, { ok: false, error: 'txId inválido.' });

    try {
        const res = await fetch(BASE + '/deposito/status?txId=' + encodeURIComponent(txId), {
            headers: { Authorization: 'Bearer ' + KEY },
            signal: AbortSignal.timeout(15000)
        });
        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch (e) {}
        if (!res.ok) return json(502, { ok: false, error: data.message || data.error || 'Falha ao consultar (HTTP ' + res.status + ').' });
        return json(200, { ok: true, status: data.status || data.state || data.paymentStatus || null, raw: data });
    } catch (e) {
        return json(502, { ok: false, error: 'Gateway indisponível.' });
    }
};
