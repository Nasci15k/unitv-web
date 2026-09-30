// Configurações do OpenTv
window.OPENTV_CONFIG = {
    // Chaves GRATUITAS do OMDb: https://www.omdbapi.com/apikey.aspx
    // Rotacao automatica: se uma estourar o limite diario, usa a outra.
    OMDB_API_KEYS: ['4ce8eda3', '9d81ab58'],

    // ===== PLANOS DE ACESSO =====
    TRIAL_MINUTES: 15,
    PLANS: {
        daily:   { label: 'Diário',  price: '4,99',  days: 1,  tagline: 'Ideal pro fim de semana', best: false,
            features: ['1.578 canais de TV ao vivo', '22 mil filmes e 10 mil séries', '1 dispositivo simultâneo', 'Qualidade até HD', 'Celular, computador e TV', 'Suporte via WhatsApp'] },
        weekly:  { label: 'Semanal', price: '14,99', days: 7,  tagline: 'O melhor custo-benefício', best: true,
            features: ['1.578 canais de TV ao vivo', '22 mil filmes e 10 mil séries', '1 dispositivo simultâneo', 'Qualidade até Full HD', 'Grade de programação (EPG)', 'Celular, computador e TV', 'Suporte via WhatsApp'] },
        monthly: { label: 'Mensal',  price: '24,99', days: 30, tagline: 'Assista sem preocupação', best: false,
            features: ['1.578 canais de TV ao vivo', '22 mil filmes e 10 mil séries', '2 dispositivos simultâneos', 'Qualidade até 4K', 'Grade de programação (EPG)', 'Favoritos e continuar assistindo', 'Celular, computador e TV', 'Suporte com prioridade'] }
    },

    // Link do APK (preencha depois de gerar em pwabuilder.com — vazio = só mostra PWA)
    APK_URL: ''
};
