// Configurações do OpenTv
window.OPENTV_CONFIG = {
    // Chaves GRATUITAS do OMDb: https://www.omdbapi.com/apikey.aspx
    // Rotacao automatica: se uma estourar o limite diario, usa a outra.
    OMDB_API_KEYS: ['4ce8eda3', '9d81ab58'],

    // ===== PLANOS DE ACESSO =====
    TRIAL_MINUTES: 15,
    PLANS: {
        daily:   { label: 'Diário',  price: '4,99',  days: 1,  tagline: 'Ideal pro fim de semana' },
        weekly:  { label: 'Semanal', price: '14,99', days: 7,  tagline: 'O melhor custo-benefício' },
        monthly: { label: 'Mensal',  price: '24,99', days: 30, tagline: 'Assista sem preocupação' }
    },

    // Link do APK (preencha depois de gerar em pwabuilder.com — vazio = só mostra PWA)
    APK_URL: ''
};
