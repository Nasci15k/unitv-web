document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const btnEnter = document.getElementById('btn-enter');
    const btnLogin = document.getElementById('btn-login');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const loadingImg = document.getElementById('loading-img');
    const sidebar = document.getElementById('sidebar');
    const btnMenu = document.getElementById('btn-menu');
    const btnLogout = document.getElementById('btn-logout');
    const searchInput = document.getElementById('search-input');
    const btnSearchGo = document.getElementById('btn-search-go');
    const userDisplay = document.getElementById('user-display');
    const currentTimeEl = document.getElementById('current-time');

    let currentSection = 'home';
    let currentCategoryId = null;
    let moviesCurrentPage = 1;
    let allLiveStreams = [];
    let allVodStreams = [];
    let allSeries = [];

    let loadingFrame = 0;
    let loadingInterval = null;

    function showLoading(text) {
        loadingText.textContent = text || 'Carregando...';
        loadingOverlay.classList.remove('hidden');
        loadingFrame = 0;
        loadingInterval = setInterval(() => {
            loadingFrame = (loadingFrame + 1) % 8;
            loadingImg.src = 'assets/images/loading_' + loadingFrame + '.png';
        }, 150);
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
        if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
    }

    function showError(msg) {
        loginError.textContent = msg;
        loginError.classList.remove('hidden');
        setTimeout(() => loginError.classList.add('hidden'), 5000);
    }

    function updateClock() {
        const now = new Date();
        currentTimeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    async function enterApp() {
        loginScreen.classList.remove('active');
        mainApp.classList.add('active');
        showLoading('Conectando ao servidor...');
        try {
            const success = await api.authenticate();
            if (success && api.userData) {
                userDisplay.textContent = api.userData.username || 'TurboBrasil';
                showLoading('Carregando conteudo...');
                await loadInitialData();
            } else {
                showError('Falha na autenticacao');
            }
        } catch (err) {
            showError('Erro: ' + err.message);
        }
        hideLoading();
    }

    btnEnter.addEventListener('click', () => enterApp());

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const server = document.getElementById('server-url').value.trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        if (!server || !user || !pass) { showError('Preencha todos os campos'); return; }
        api.setCredentials(server, user, pass);
        enterApp();
    });

    btnLogout.addEventListener('click', () => {
        mainApp.classList.remove('active');
        loginScreen.classList.add('active');
        api.cache.clear();
        allLiveStreams = [];
        allVodStreams = [];
        allSeries = [];
    });

    btnMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && e.target !== btnMenu) sidebar.classList.remove('open');
        }
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            navigateTo(item.dataset.section);
            sidebar.classList.remove('open');
        });
    });

    function navigateTo(section) {
        currentSection = section;
        currentCategoryId = null;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-section="' + section + '"]').classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById('section-' + section).classList.add('active');
    }

    btnSearchGo.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });

    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) return;
        showLoading('Buscando...');
        navigateTo('search');
        try {
            const results = await api.searchContent(query);
            const container = document.getElementById('search-results');
            container.innerHTML = '';
            if (results.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">Nenhum resultado encontrado</p>';
            } else {
                results.forEach(item => container.appendChild(createContentCard(item)));
            }
        } catch (e) { console.error('Search error:', e); }
        hideLoading();
    }

    async function loadInitialData() {
        try {
            const [liveCats, vodCats, seriesCats, liveStreams, vodStreams, seriesData] = await Promise.all([
                api.getLiveCategories(), api.getVodCategories(), api.getSeriesCategories(),
                api.getLiveStreams(), api.getVodStreams(), api.getSeries()
            ]);
            allLiveStreams = Array.isArray(liveStreams) ? liveStreams : [];
            allVodStreams = Array.isArray(vodStreams) ? vodStreams : [];
            allSeries = Array.isArray(seriesData) ? seriesData : [];
            loadHome(Array.isArray(liveCats) ? liveCats : [], Array.isArray(vodCats) ? vodCats : [], Array.isArray(seriesCats) ? seriesCats : [], allLiveStreams, allVodStreams);
            loadLiveCategories(Array.isArray(liveCats) ? liveCats : []);
            loadChannels(allLiveStreams);
            loadMoviesCategories(Array.isArray(vodCats) ? vodCats : []);
            loadMovies(allVodStreams);
            loadSeries(allSeries);
        } catch (e) { console.error('Error loading data:', e); }
    }

    function loadHome(liveCats, vodCats, seriesCats, liveStreams, vodStreams) {
        const categoriesContainer = document.getElementById('home-categories');
        categoriesContainer.innerHTML = '';
        const icons = { 'filmes': 'assets/icons/genero_movies.png', 'series': 'assets/icons/genero_series.png', 'live': 'assets/icons/live_channel_default_icon.png', 'default': 'assets/icons/todos_movies.png' };
        const allCategories = [
            ...liveCats.slice(0, 4).map(c => ({ ...c, type: 'live', icon: icons.live })),
            ...vodCats.slice(0, 4).map(c => ({ ...c, type: 'vod', icon: icons.filmes })),
            ...seriesCats.slice(0, 4).map(c => ({ ...c, type: 'series', icon: icons.series }))
        ];
        allCategories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-card';
            div.innerHTML = '<img src="' + (cat.icon || icons.default) + '" alt="' + cat.category_name + '"><span>' + cat.category_name + '</span>';
            div.addEventListener('click', () => {
                if (cat.type === 'live') { navigateTo('live'); filterByCategory(cat.category_id, 'live'); }
                else if (cat.type === 'vod') { navigateTo('movies'); filterByCategory(cat.category_id, 'vod'); }
                else { navigateTo('series'); filterByCategory(cat.category_id, 'series'); }
            });
            categoriesContainer.appendChild(div);
        });

        const popularContainer = document.getElementById('popular-channels');
        popularContainer.innerHTML = '';
        liveStreams.slice(0, 20).forEach(stream => popularContainer.appendChild(createChannelCard(stream)));

        const slider = document.getElementById('highlights-slider');
        slider.innerHTML = '';
        vodStreams.slice(0, 8).forEach(stream => {
            const card = document.createElement('div');
            card.className = 'highlight-card';
            const img = stream.stream_icon || stream.cover || 'assets/icons/live_channel_default_icon.png';
            card.innerHTML = '<img src="' + img + '" alt="' + stream.name + '" onerror="this.src=\'assets/icons/live_channel_default_icon.png\'"><div class="highlight-overlay"><h3>' + stream.name + '</h3><p>' + (stream.rating || stream.year || 'Filme') + '</p></div>';
            card.addEventListener('click', () => showMovieDetail(stream));
            slider.appendChild(card);
        });
    }

    function loadLiveCategories(categories) {
        const container = document.getElementById('live-categories');
        container.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'category-btn active';
        allBtn.textContent = 'Todos';
        allBtn.addEventListener('click', () => { document.querySelectorAll('#live-categories .category-btn').forEach(b => b.classList.remove('active')); allBtn.classList.add('active'); currentCategoryId = null; loadChannels(allLiveStreams); });
        container.appendChild(allBtn);
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = cat.category_name;
            btn.addEventListener('click', () => { document.querySelectorAll('#live-categories .category-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentCategoryId = cat.category_id; loadChannels(allLiveStreams.filter(s => s.category_id === cat.category_id)); });
            container.appendChild(btn);
        });
    }

    function loadChannels(channels) {
        const container = document.getElementById('channel-list');
        container.innerHTML = '';
        if (!channels || channels.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">Nenhum canal encontrado</p>'; return; }
        channels.forEach(stream => container.appendChild(createChannelCard(stream)));
    }

    function createChannelCard(stream) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.innerHTML = '<img src="' + (stream.stream_icon || 'assets/icons/live_channel_default_icon.png') + '" alt="' + stream.name + '" onerror="this.src=\'assets/icons/live_channel_default_icon.png\'"><div class="channel-info"><div class="channel-name">' + stream.name + '</div><div class="channel-epg">' + (stream.category_name || '') + '</div></div>';
        card.addEventListener('click', () => playLiveChannel(stream));
        return card;
    }

    function loadMoviesCategories(categories) {
        const container = document.getElementById('movie-categories-filter');
        container.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn active';
        allBtn.textContent = 'Todos';
        allBtn.addEventListener('click', () => { document.querySelectorAll('#section-movies .filter-btn').forEach(b => b.classList.remove('active')); allBtn.classList.add('active'); loadMovies(allVodStreams); });
        container.appendChild(allBtn);
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.textContent = cat.category_name;
            btn.addEventListener('click', () => { document.querySelectorAll('#section-movies .filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); loadMovies(allVodStreams.filter(s => s.category_id === cat.category_id)); });
            container.appendChild(btn);
        });
    }

    function loadMovies(movies) {
        const container = document.getElementById('movies-grid');
        container.innerHTML = '';
        if (!movies || movies.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">Nenhum filme encontrado</p>'; return; }
        movies.forEach(stream => container.appendChild(createContentCard(stream, 'movie')));
    }

    function loadSeries(series) {
        const container = document.getElementById('series-grid');
        container.innerHTML = '';
        if (!series || series.length === 0) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px">Nenhuma serie encontrada</p>'; return; }
        series.forEach(s => container.appendChild(createContentCard(s, 'series')));
    }

    function createContentCard(item, type) {
        const card = document.createElement('div');
        card.className = 'content-card';
        const img = item.stream_icon || item.cover || item.image || 'assets/icons/live_channel_default_icon.png';
        const title = item.name || item.title || 'Sem titulo';
        const rating = item.rating || '';
        let badge = '';
        if (type === 'movie') badge = '<div class="card-badge">FILME</div>';
        else if (type === 'series') badge = '<div class="card-badge">SERIE</div>';
        else if (item.contentType) badge = '<div class="card-badge">' + item.contentType + '</div>';
        card.innerHTML = badge + '<img class="poster" src="' + img + '" alt="' + title + '" onerror="this.src=\'assets/icons/live_channel_default_icon.png\'"><div class="card-info"><div class="card-title">' + title + '</div>' + (rating ? '<div class="card-rating"><i class="fas fa-star"></i> ' + rating + '</div>' : '') + '</div>';
        if (type === 'movie') card.addEventListener('click', () => showMovieDetail(item));
        else if (type === 'series') card.addEventListener('click', () => showSeriesDetail(item));
        else card.addEventListener('click', () => playLiveChannel(item));
        return card;
    }

    function playLiveChannel(stream) {
        const url = api.getStreamUrl('live', stream.stream_id);
        player.play(url, stream.name, 'live');
    }

    function filterByCategory(categoryId, type) {
        currentCategoryId = categoryId;
        if (type === 'live') loadChannels(allLiveStreams.filter(s => s.category_id === categoryId));
        else if (type === 'vod') loadMovies(allVodStreams.filter(s => s.category_id === categoryId));
        else if (type === 'series') loadSeries(allSeries.filter(s => s.category_id === categoryId));
    }

    async function showMovieDetail(movie) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        showLoading('Carregando detalhes...');
        try {
            let vodInfo = null;
            try { vodInfo = await api.getVodInfo(movie.stream_id); } catch (e) {}
            const plot = (vodInfo && vodInfo.info && vodInfo.info.plot) || movie.plot || '';
            const cast = (vodInfo && vodInfo.info && vodInfo.info.cast) || '';
            const genre = (vodInfo && vodInfo.info && vodInfo.info.genre) || movie.category_name || '';
            const rating = (vodInfo && vodInfo.info && vodInfo.info.rating) || movie.rating || '';
            const year = (vodInfo && vodInfo.info && vodInfo.info.year) || movie.year || '';
            const duration = (vodInfo && vodInfo.info && vodInfo.info.duration) || '';
            const img = movie.stream_icon || movie.cover || movie.image || 'assets/icons/live_channel_default_icon.png';
            content.innerHTML = '<div class="detail-header"><img class="detail-poster" src="' + img + '" alt="' + movie.name + '" onerror="this.src=\'assets/icons/live_channel_default_icon.png\'"><div class="detail-info"><h2>' + movie.name + '</h2><div class="detail-meta">' + (year ? '<span><i class="fas fa-calendar"></i> ' + year + '</span>' : '') + (rating ? '<span><i class="fas fa-star" style="color:var(--warning)"></i> ' + rating + '</span>' : '') + (duration ? '<span><i class="fas fa-clock"></i> ' + duration + '</span>' : '') + (genre ? '<span><i class="fas fa-tag"></i> ' + genre + '</span>' : '') + '</div><p class="detail-description">' + (plot || 'Sem descricao disponivel.') + '</p>' + (cast ? '<p class="detail-description"><strong>Elenco:</strong> ' + cast + '</p>' : '') + '<button class="btn-play-detail" onclick="playVod(' + movie.stream_id + ', \'' + movie.name.replace(/'/g, "\\'") + '\')"><i class="fas fa-play"></i> Assistir</button></div></div>';
            modal.classList.remove('hidden');
        } catch (e) { console.error('Error loading movie detail:', e); }
        hideLoading();
    }

    async function showSeriesDetail(series) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        showLoading('Carregando series...');
        try {
            let seriesInfo = null;
            try { seriesInfo = await api.getSeriesInfo(series.series_id || series.stream_id); } catch (e) {}
            const img = series.cover || series.stream_icon || series.image || 'assets/icons/live_channel_default_icon.png';
            const plot = (seriesInfo && seriesInfo.info && seriesInfo.info.plot) || series.plot || '';
            const genre = (seriesInfo && seriesInfo.info && seriesInfo.info.genre) || series.category_name || '';
            const rating = (seriesInfo && seriesInfo.info && seriesInfo.info.rating) || '';
            const seasons = (seriesInfo && seriesInfo.seasons) || [];
            const episodes = (seriesInfo && seriesInfo.episodes) || {};
            let seasonsHTML = '';
            if (seasons.length > 0) {
                const firstSeason = seasons[0];
                const seasonEpisodes = episodes[firstSeason.season_number] || [];
                seasonsHTML = '<div class="seasons-list">' + seasons.map(function(s, i) { return '<button class="season-btn ' + (i === 0 ? 'active' : '') + '" onclick="loadSeasonEpisodes(\'' + (series.series_id || series.stream_id) + '\', ' + s.season_number + ', this)">Temporada ' + s.season_number + '</button>'; }).join('') + '</div><div class="episodes-list" id="episodes-list">' + seasonEpisodes.map(function(ep) { return '<div class="episode-item" onclick="playSeries(\'' + ep.id + '\', \'' + (ep.title || 'Episodio ' + ep.episode_number).replace(/'/g, "\\'") + '\')"><span class="episode-number">E' + ep.episode_number + '</span><div class="episode-info"><h4>' + (ep.title || 'Episodio ' + ep.episode_number) + '</h4>' + (ep.container_extension ? '<p>.' + ep.container_extension + '</p>' : '') + '</div></div>'; }).join('') + '</div>';
            }
            content.innerHTML = '<div class="detail-header"><img class="detail-poster" src="' + img + '" alt="' + series.name + '" onerror="this.src=\'assets/icons/live_channel_default_icon.png\'"><div class="detail-info"><h2>' + series.name + '</h2><div class="detail-meta">' + (rating ? '<span><i class="fas fa-star" style="color:var(--warning)"></i> ' + rating + '</span>' : '') + (genre ? '<span><i class="fas fa-tag"></i> ' + genre + '</span>' : '') + (seasons.length > 0 ? '<span><i class="fas fa-layer-group"></i> ' + seasons.length + ' Temporadas</span>' : '') + '</div><p class="detail-description">' + (plot || 'Sem descricao disponivel.') + '</p></div></div>' + seasonsHTML;
            modal.classList.remove('hidden');
        } catch (e) { console.error('Error loading series detail:', e); }
        hideLoading();
    }

    window.playVod = function(vodId, name) {
        const url = api.getStreamUrl('movie', vodId);
        document.getElementById('detail-modal').classList.add('hidden');
        player.play(url, name, 'movie');
    };

    window.playSeries = function(episodeId, name) {
        const url = api.getStreamUrl('series', episodeId);
        document.getElementById('detail-modal').classList.add('hidden');
        player.play(url, name, 'series');
    };

    window.loadSeasonEpisodes = async function(seriesId, seasonNumber, btn) {
        document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        try {
            const info = await api.getSeriesInfo(seriesId);
            const episodes = (info && info.episodes && info.episodes[seasonNumber]) || [];
            const container = document.getElementById('episodes-list');
            container.innerHTML = episodes.map(function(ep) {
                return '<div class="episode-item" onclick="playSeries(\'' + ep.id + '\', \'' + (ep.title || 'Episodio ' + ep.episode_number).replace(/'/g, "\\'") + '\')"><span class="episode-number">E' + ep.episode_number + '</span><div class="episode-info"><h4>' + (ep.title || 'Episodio ' + ep.episode_number) + '</h4>' + (ep.container_extension ? '<p>.' + ep.container_extension + '</p>' : '') + '</div></div>';
            }).join('');
        } catch (e) { console.error('Error loading episodes:', e); }
    };

    document.getElementById('btn-close-detail').addEventListener('click', () => {
        document.getElementById('detail-modal').classList.add('hidden');
    });

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                if (modal.id === 'player-modal') player.stop();
            }
        });
    });

    // Auto-enter com credenciais do APK
    enterApp();
});
