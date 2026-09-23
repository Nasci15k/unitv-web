/* UnitV I18n — pt/en/es */
window.I18n = (function () {
    const LANG_KEY = 'unitv_lang';
    const DICT = {
        pt: {
            'nav.menu': 'Menu', 'nav.destaques': 'Destaques', 'nav.movies': 'Filmes',
            'nav.series': 'Séries', 'nav.kids': 'Kids', 'nav.tv': 'TV',
            'nav.jogos': 'Jogos', 'nav.explorar': 'Explorar', 'nav.favorites': 'Favoritos',
            'nav.search': 'Buscar',
            'btn.settings': 'Configurações', 'btn.logout': 'Sair', 'btn.save': 'Salvar',
            'btn.cancel': 'Cancelar', 'btn.filter': 'Filtrar', 'btn.apply': 'Aplicar',
            'btn.watch': 'Assistir Agora', 'btn.details': 'Detalhes', 'btn.play': 'Assistir',
            'btn.retry': 'Tentar novamente', 'btn.close': 'Fechar', 'btn.continue': 'Continuar',
            'btn.restart': 'Começar do início', 'btn.enter': 'Entrar',
            'lbl.language': 'Idioma', 'lbl.subtitles': 'Legendas', 'lbl.sub_size': 'Tamanho da legenda',
            'lbl.sub_style': 'Estilo da legenda', 'lbl.sub_delay': 'Atraso da legenda',
            'lbl.audio': 'Áudio', 'lbl.quality': 'Qualidade',
            'msg.loading': 'Carregando...', 'msg.no_results': 'Nenhum resultado encontrado',
            'msg.no_subtitles': 'Nenhuma legenda disponível', 'msg.search_ph': 'Buscar filmes, séries, canais...',
            'msg.continue_watching': 'Continue Assistindo', 'msg.settings_saved': 'Configurações salvas',
            'msg.local_sub': 'Carregar legenda local',
            'size.small': 'Pequena (0.8x)', 'size.medium': 'Média (1.0x)', 'size.large': 'Grande (1.4x)',
            'style.white_black': 'Branco / Fundo preto', 'style.yellow_black': 'Amarelo / Fundo preto',
            'style.white_transp': 'Branco / Transparente'
        },
        en: {
            'nav.menu': 'Menu', 'nav.destaques': 'Featured', 'nav.movies': 'Movies',
            'nav.series': 'Series', 'nav.kids': 'Kids', 'nav.tv': 'TV',
            'nav.jogos': 'Sports', 'nav.explorar': 'Explore', 'nav.favorites': 'Favorites',
            'nav.search': 'Search',
            'btn.settings': 'Settings', 'btn.logout': 'Logout', 'btn.save': 'Save',
            'btn.cancel': 'Cancel', 'btn.filter': 'Filter', 'btn.apply': 'Apply',
            'btn.watch': 'Watch Now', 'btn.details': 'Details', 'btn.play': 'Play',
            'btn.retry': 'Try again', 'btn.close': 'Close', 'btn.continue': 'Continue',
            'btn.restart': 'Restart', 'btn.enter': 'Enter',
            'lbl.language': 'Language', 'lbl.subtitles': 'Subtitles', 'lbl.sub_size': 'Subtitle size',
            'lbl.sub_style': 'Subtitle style', 'lbl.sub_delay': 'Subtitle delay',
            'lbl.audio': 'Audio', 'lbl.quality': 'Quality',
            'msg.loading': 'Loading...', 'msg.no_results': 'No results found',
            'msg.no_subtitles': 'No subtitles available', 'msg.search_ph': 'Search movies, series, channels...',
            'msg.continue_watching': 'Continue Watching', 'msg.settings_saved': 'Settings saved',
            'msg.local_sub': 'Load local subtitle',
            'size.small': 'Small (0.8x)', 'size.medium': 'Medium (1.0x)', 'size.large': 'Large (1.4x)',
            'style.white_black': 'White / Black bg', 'style.yellow_black': 'Yellow / Black bg',
            'style.white_transp': 'White / Transparent'
        },
        es: {
            'nav.menu': 'Menú', 'nav.destaques': 'Destacados', 'nav.movies': 'Películas',
            'nav.series': 'Series', 'nav.kids': 'Niños', 'nav.tv': 'TV',
            'nav.jogos': 'Deportes', 'nav.explorar': 'Explorar', 'nav.favorites': 'Favoritos',
            'nav.search': 'Buscar',
            'btn.settings': 'Ajustes', 'btn.logout': 'Salir', 'btn.save': 'Guardar',
            'btn.cancel': 'Cancelar', 'btn.filter': 'Filtrar', 'btn.apply': 'Aplicar',
            'btn.watch': 'Ver ahora', 'btn.details': 'Detalles', 'btn.play': 'Reproducir',
            'btn.retry': 'Reintentar', 'btn.close': 'Cerrar', 'btn.continue': 'Continuar',
            'btn.restart': 'Empezar de nuevo', 'btn.enter': 'Entrar',
            'lbl.language': 'Idioma', 'lbl.subtitles': 'Subtítulos', 'lbl.sub_size': 'Tamaño del subtítulo',
            'lbl.sub_style': 'Estilo del subtítulo', 'lbl.sub_delay': 'Retraso del subtítulo',
            'lbl.audio': 'Audio', 'lbl.quality': 'Calidad',
            'msg.loading': 'Cargando...', 'msg.no_results': 'Sin resultados',
            'msg.no_subtitles': 'Sin subtítulos disponibles', 'msg.search_ph': 'Buscar películas, series, canales...',
            'msg.continue_watching': 'Continuar viendo', 'msg.settings_saved': 'Ajustes guardados',
            'msg.local_sub': 'Cargar subtítulo local',
            'size.small': 'Pequeño (0.8x)', 'size.medium': 'Mediano (1.0x)', 'size.large': 'Grande (1.4x)',
            'style.white_black': 'Blanco / Fondo negro', 'style.yellow_black': 'Amarillo / Fondo negro',
            'style.white_transp': 'Blanco / Transparente'
        }
    };
    let lang = 'pt';

    function getLang() {
        try { return localStorage.getItem(LANG_KEY) || 'pt'; } catch (e) { return 'pt'; }
    }

    function t(key) {
        const d = DICT[lang] || DICT.pt;
        return (d && d[key]) || (DICT.pt && DICT.pt[key]) || key;
    }

    function apply(root) {
        (root || document).querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        (root || document).querySelectorAll('[data-i18n-ph]').forEach(el => {
            el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
        });
        document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    }

    function setLang(next) {
        if (!DICT[next]) next = 'pt';
        lang = next;
        try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
        apply();
        return lang;
    }

    function init() {
        lang = getLang();
        apply();
        return lang;
    }

    return { t, setLang, getLang, init, apply, langs: ['pt', 'en', 'es'] };
})();
