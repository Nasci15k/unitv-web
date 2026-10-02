// OpenTv — webhook Gladepay (stub operacional).
// Recebe as notificações de status do gateway e responde 200 sempre
// (o Gladepay reenvia enquanto não receber 2xx). A ativação real do plano
// (gravação em profiles/session) será plugada aqui na fase do webhook —
// por enquanto apenas valida a assinatura/segredo e registra o payload.
const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj)
});

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    let payload = {};
    try { payload = JSON.parse(event.body || '{}'); } catch (e) { /* segue */ }
    console.log('[gladepay-webhook] recebido:', JSON.stringify(payload).slice(0, 500));
    // Fase atual: acknowledge. Retornar 2xx evita reenvio em loop.
    return json(200, { ok: true });
};
