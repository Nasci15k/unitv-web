document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const splashScreen = document.getElementById('splash-screen');
    const appEl = document.getElementById('app');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const btnEnter = document.getElementById('btn-enter');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const sidebar = document.getElementById('sidebar');
    const btnMenu = document.getElementById('btn-menu');
    const btnLogout = document.getElementById('btn-logout');
    const searchInput = document.getElementById('search-input');
    const btnSearchGo = document.getElementById('btn-search-go');
    const userDisplay = document.getElementById('user-display');
    const userPlan = document.getElementById('user-plan');
    const currentTimeEl = document.getElementById('current-time');

    const ITEMS_PER_PAGE = 24;

    // --- State ---
    const state = {
        currentSection: 'home',
        currentCategoryId: null,
        moviesPage: 1,
        seriesPage: 1,
        allLive: [],
        allMovies: [],
        allSeries: [],
        currentHeroIndex: 0,
        heroItems: [],
        searchQuery: '',
        searchDebounce: null,
        autoplay: false
    };

    // --- Clock ---
    function updateClock() {
        const now = new Date();
        currentTimeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- Loading ---
    function showLoading(text) {
        loadingText.textContent = text || 'Carregando...';
        loadingOverlay.classList.remove('hidden');
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
    }

    // --- Navigation ---
    function navigateTo(section) {
        state.currentSection = section;
        state.currentCategoryId = null;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const target = document.querySelector(`.nav-item[data-section="${section}"]`);
        if (target) target.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const sectionEl = document.getElementById('section-' + section);
        if (sectionEl) sectionEl.classList.add('active');
        sidebar.classList.remove('open');
    }

    // --- Toast ---
    function showToast(msg, type = 'info') {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:10px;background:var(--bg-2);color:var(--text-1);font-size:14px;font-weight:500;z-index:3000;border:1px solid var(--border);box-shadow:var(--shadow);display:flex;align-items:center;gap:10px;transform:translateY(100px);opacity:0;transition:all 0.3s ease;';
            document.body.appendChild(toast);
        }
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : type === 'success' ? 'fas fa-check-circle' : 'fas fa-info-circle';
        const color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
        toast.innerHTML = `<i class="${icon}" style="color:${color}"></i> ${msg}`;
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
        }, 3500);
    }

    // --- Enter App ---
    async function enterApp() {
        splashScreen.classList.add('fade-out');
        appEl.style.display = 'flex';

        showLoading('Conectando ao servidor...');
        try {
            const success = await api.authenticate();
            if (success && api.userData) {
                userDisplay.textContent = api.userData.username || 'Usuario';
                userPlan.textContent = 'Premium ativo';
                showLoading('Carregando conteudo...');
                await loadAllData();
                showToast('Bem-vindo ao UniTV!', 'success');
            } else {
                showToast('Falha na autenticacao', 'error');
            }
        } catch (err) {
            console.error('Auth error:', err);
            showToast('Erro de conexao: ' + err.message, 'error');
        }
        hideLoading();
    }

    btnEnter.addEventListener('click', enterApp);
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const server = document.getElementById('server-url').value.trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        if (!server || !user || !pass) {
            loginError.textContent = 'Preencha todos os campos';
            loginError.classList.remove('hidden');
            return;
        }
        api.setCredentials(server, user, pass);
        enterApp();
    });

    btnLogout.addEventListener('click', () => {
        appEl.style.display = 'none';
        splashScreen.classList.remove('fade-out');
        api.cache.clear();
        Object.assign(state, { allLive: [], allMovies: [], allSeries: [], heroItems: [] });
    });

    btnMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
            !sidebar.contains(e.target) && e.target !== btnMenu) {
            sidebar.classList.remove('open');
        }
    });

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // --- Search ---
    btnSearchGo.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(); });
    searchInput.addEventListener('input', (e) => {
        clearTimeout(state.searchDebounce);
        state.searchDebounce = setTimeout(() => {
            if (e.target.value.trim().length >= 2) performSearch();
        }, 500);
    });

    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query || query.length < 2) return;
        showLoading('Buscando...');
        navigateTo('search');
        state.searchQuery = query;

        try {
            const results = await api.searchContent(query);
            const container = document.getElementById('search-results');
            container.innerHTML = '';
            if (!results.length) {
                container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><p>Nenhum resultado para "' + escHtml(query) + '"</p></div>';
            } else {
                results.forEach(item => {
                    container.appendChild(createCard(item, item.streamType === 'live' ? null : item.streamType));
                });
            }
        } catch (e) {
            console.error('Search error:', e);
        }
        hideLoading();
    }

    // --- Data Loading ---
    async function loadAllData() {
        try {
            const [liveCats, vodCats, seriesCats, live, movies, series] = await Promise.all([
                safeCall(() => api.getLiveCategories()),
                safeCall(() => api.getVodCategories()),
                safeCall(() => api.getSeriesCategories()),
                safeCall(() => api.getLiveStreams()),
                safeCall(() => api.getVodStreams()),
                safeCall(() => api.getSeries())
            ]);

            state.allLive = Array.isArray(live) ? live : [];
            state.allMovies = Array.isArray(movies) ? movies : [];
            state.allSeries = Array.isArray(series) ? series : [];

            api.setLiveCache(state.allLive);
            api.setMovieCache(state.allMovies);
            api.setSeriesCache(state.allSeries);

            loadHeroBanner(state.allMovies.concat(state.allSeries).slice(0, 10));
            loadCategoriesGrid(liveCats || [], vodCats || [], seriesCats || []);
            loadPopularChannels(state.allLive);
            loadHomeMovies(state.allMovies);
            loadLiveSidebar(liveCats || []);
            loadChannels(state.allLive);
            loadMoviesPage(1, state.allMovies, vodCats || []);
            loadSeriesPage(1, state.allSeries, seriesCats || []);
        } catch (err) {
            console.error('Load error:', err);
            showToast('Erro ao carregar conteudo. Tente novamente.', 'error');
        }
    }

    function safeCall(fn) {
        return fn().catch(() => null);
    }

    // --- Hero Banner ---
    function loadHeroBanner(items) {
        const container = document.getElementById('hero-banner');
        if (!items.length) { container.innerHTML = ''; return; }

        const featured = items[Math.floor(Math.random() * items.length)];
        const title = featured.name || featured.title || '';
        const icon = featured.stream_icon || featured.cover || '';
        const rating = featured.rating || '';
        const year = featured.year || '';
        const isLive = featured.stream_type === 'live';

        container.innerHTML = `
            <div class="hero-banner">
                <div class="hero-bg" style="background-image:url('${icon}')"></div>
                <div class="hero-content">
                    <div class="hero-badge">${isLive ? 'AO VIVO' : (featured.series_id ? 'SERIE' : 'FILME')}</div>
                    <h2>${escHtml(title)}</h2>
                    ${rating || year ? '<div style="display:flex;gap:12px;margin-bottom:8px">' :
                    `${year ? '<span style="color:rgba(255,255,255,0.6);font-size:13px"><i class="fas fa-calendar"></i> ${year}</span>' : ''}
                    ${rating ? '<span style="color:var(--warning);font-size:13px"><i class="fas fa-star"></i> ${rating}</span>' : ''}` : ''}
                </div>
                <div class="hero-actions">
                    <button class="btn-hero primary"><i class="fas fa-play"></i> Assistir</button>
                </div>
            </div>
        `;
        container.querySelector('.btn-hero').addEventListener('click', () => {
            const type = isLive ? 'live' : (featured.series_id ? 'series' : 'movie');
            if (type === 'live') player.play(api.getStreamUrl('live', featured.stream_id), title, 'live');
            else playItem(type, featured.stream_id || featured.series_id, title);
        });
        container.querySelector('.hero-banner').addEventListener('click', (e) => {
            if (e.target.closest('.btn-hero')) return;
            if (isLive) player.play(api.getStreamUrl('live', featured.stream_id), title, 'live');
            else if (featured.series_id) showSeriesDetail(featured);
            else showMovieDetail(featured);
        });
    }

    // --- Categories Grid ---
    function loadCategoriesGrid(liveCats, vodCats, seriesCats) {
        const container = document.getElementById('home-categories');
        const icons = {
            live: 'assets/icons/live_channel_default_icon.png',
            movies: 'assets/icons/genero_movies.png',
            series: 'assets/icons/genero_series.png',
            all: 'assets/icons/todos_movies.png'
        };

        const mixed = [
            ...liveCats.slice(0, 3).map(c => ({ ...c, type: 'live', icon: icons.live })),
            ...vodCats.slice(0, 3).map(c => ({ ...c, type: 'movies', icon: icons.movies })),
            ...seriesCats.slice(0, 3).map(c => ({ ...c, type: 'series', icon: icons.series }))
        ];

        container.innerHTML = mixed.map(c => `
            <div class="category-card" onclick="navCategory('${c.type}', ${c.category_id})">
                <img src="${c.icon}" alt="" onerror="this.style.display='none'">
                <span>${escHtml(c.category_name)}</span>
            </div>
        `).join('');
    }

    // --- Popular Channels ---
    function loadPopularChannels(live) {
        const container = document.getElementById('popular-channels');
        container.innerHTML = '';
        live.slice(0, 12).forEach(s => container.appendChild(createChannelCard(s)));
    }

    // --- Home Movies Row ---
    function loadHomeMovies(movies) {
        const container = document.getElementById('home-movies');
        container.innerHTML = '';
        movies.slice(0, 15).forEach(m => container.appendChild(createCard(m, 'movie')));
    }

    // --- Live ---
    function loadLiveSidebar(cats) {
        const container = document.getElementById('live-categories');
        let html = `<button class="live-category-btn active" onclick="filterLiveCat(null, this)">
            <i class="fas fa-th"></i> Todos os canais
        </button>`;
        cats.forEach(c => {
            html += `<button class="live-category-btn" onclick="filterLiveCat(${c.category_id}, this)">
                <i class="fas fa-tag"></i> ${escHtml(c.category_name)}
            </button>`;
        });
        container.innerHTML = html;
    }

    window.filterLiveCat = (id, btn) => {
        document.querySelectorAll('.live-category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentCategoryId = id;
        loadChannels(id ? state.allLive.filter(s => s.category_id == id) : state.allLive);
    };

    function loadChannels(channels) {
        const container = document.getElementById('channel-list');
        if (!channels || !channels.length) {
            container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-tv"></i><p>Nenhum canal encontrado</p></div>';
            return;
        }
        container.innerHTML = '';
        channels.forEach(s => container.appendChild(createChannelCard(s)));
    }

    function createChannelCard(stream) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        const icon = stream.stream_icon || '';
        card.innerHTML = `
            <img src="${icon}" class="ch-logo" onerror="this.src='assets/icons/live_channel_default_icon.png'">
            <div class="ch-info">
                <div class="ch-name">${escHtml(stream.name || '')}</div>
                <div class="ch-category">${escHtml(stream.category_name || '')}</div>
            </div>
            <div class="ch-live-dot"></div>
        `;
        card.addEventListener('click', () => {
            const url = api.getStreamUrl('live', stream.stream_id);
            player.play(url, stream.name, 'live');
        });
        return card;
    }

    // --- Movies ---
    function loadMoviesPage(page, movies, cats) {
        const arr = movies || state.allMovies;
        state.moviesPage = page;
        loadMoviesPageContent(getPageItems(arr, page));
        renderPagination('movies-pagination', arr.length, page, function(p) { loadMoviesPage(p, state.allMovies, cats); });
        if (cats && cats.length) renderPills('movie-cat-pills', cats, 'movies');
    }

    function loadMoviesPageContent(items) {
        const container = document.getElementById('movies-grid');
        if (!items.length) {
            container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-film"></i><p>Nenhum filme encontrado</p></div>';
            return;
        }
        container.innerHTML = '';
        items.forEach(m => container.appendChild(createCard(m, 'movie')));
        document.getElementById('section-movies').scrollTop = 0;
    }

    // --- Series ---
    function loadSeriesPage(page, series, cats) {
        const arr = series || state.allSeries;
        state.seriesPage = page;
        loadSeriesContent(getPageItems(arr, page));
        renderPagination('series-pagination', arr.length, page, function(p) { loadSeriesPage(p, state.allSeries, cats); });
        if (cats && cats.length) renderPills('series-cat-pills', cats, 'series');
    }

    function loadSeriesContent(items) {
        const container = document.getElementById('series-grid');
        if (!items.length) {
            container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-play-circle"></i><p>Nenhuma serie encontrada</p></div>';
            return;
        }
        container.innerHTML = '';
        items.forEach(s => container.appendChild(createCard(s, 'series')));
        document.getElementById('section-series').scrollTop = 0;
    }

    // --- Helpers ---
    function getPageItems(arr, page) {
        const start = (page - 1) * ITEMS_PER_PAGE;
        return arr.slice(start, start + ITEMS_PER_PAGE);
    }

    function renderPagination(containerId, totalItems, currentPage, onPage) {
        const container = document.getElementById(containerId);
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (totalPages <= 1) { container.innerHTML = ''; return; }

        let html = '';
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, currentPage + 2);

        if (currentPage > 1) html += `<button class="page-btn" onclick="(${onPage})(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        if (start > 1) { html += `<button class="page-btn" onclick="(${onPage})(1)">1</button>`; if (start > 2) html += `<span style="color:var(--text-3);align-self:center">...</span>`; }
        for (let i = start; i <= end; i++) html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="(${onPage})(${i})">${i}</button>`;
        if (end < totalPages) { if (end < totalPages - 1) html += `<span style="color:var(--text-3);align-self:center">...</span>`; html += `<button class="page-btn" onclick="(${onPage})(${totalPages})">${totalPages}</button>`; }
        if (currentPage < totalPages) html += `<button class="page-btn" onclick="(${onPage})(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        container.innerHTML = html;
    }

    function renderPills(containerId, cats, type) {
        const container = document.getElementById(containerId);
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-pill active';
        allBtn.textContent = 'Todos';
        allBtn.addEventListener('click', () => {
            document.querySelectorAll(`#${containerId} .filter-pill`).forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            if (type === 'movies') loadMoviesPage(1, state.allMovies, null);
            else loadSeriesPage(1, state.allSeries, null);
        });
        container.innerHTML = '';
        container.appendChild(allBtn);
        cats.slice(0, 20).forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'filter-pill';
            btn.textContent = c.category_name;
            btn.addEventListener('click', () => {
                document.querySelectorAll(`#${containerId} .filter-pill`).forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = type === 'movies' ? state.allMovies : state.allSeries;
                const filtered = filter.filter(s => s.category_id == c.category_id);
                if (type === 'movies') { loadMoviesPageContent(filtered); document.getElementById('movies-pagination').innerHTML = ''; }
                else { loadSeriesContent(filtered); document.getElementById('series-pagination').innerHTML = ''; }
            });
            container.appendChild(btn);
        });
    }

    function createCard(item, type) {
        const card = document.createElement('div');
        card.className = 'content-card';
        const img = item.stream_icon || item.cover || item.image || '';
        const title = item.name || item.title || '';
        const rating = item.rating || '';
        const year = item.year || '';
        let badge = '';
        if (type === 'movie') badge = '<div class="badge movie">Filme</div>';
        else if (type === 'series') badge = '<div class="badge series">Serie</div>';

        card.innerHTML = `
            ${badge}
            <img class="poster-img" src="${img}" alt="${escHtml(title)}" onerror="this.onerror=null;this.src='assets/icons/live_channel_default_icon.png'">
            <div class="card-body">
                <div class="card-title">${escHtml(title)}</div>
                <div class="card-meta">
                    ${rating ? '<span class="rating"><i class="fas fa-star"></i>' + rating + '</span>' : ''}
                    ${year ? '<span class="year">' + year + '</span>' : ''}
                </div>
            </div>
        `;
        card.addEventListener('click', () => {
            if (type === 'series') showSeriesDetail(item);
            else showMovieDetail(item);
        });
        return card;
    }

    // --- Detail Modals ---
    async function showMovieDetail(item) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        showLoading('Carregando detalhes...');
        try {
            let info = null;
            try { info = await api.getVodInfo(item.stream_id); } catch (e) {}

            const title = item.name || item.title || '';
            const plot = (info?.info?.plot) || item.plot || '';
            const cast = (info?.info?.cast) || '';
            const genre = (info?.info?.genre) || item.category_name || '';
            const rating = (info?.info?.rating) || item.rating || '';
            const year = (info?.info?.year) || item.year || '';
            const duration = (info?.info?.duration) || '';
            const img = item.stream_icon || item.cover || item.image || '';

            content.innerHTML = `
                <div class="detail-header">
                    <img class="detail-poster" src="${img}" onerror="this.src='assets/icons/live_channel_default_icon.png'" alt="${escHtml(title)}">
                    <div class="detail-info">
                        <h2>${escHtml(title)}</h2>
                        <div class="detail-meta">
                            ${year ? `<span class="meta-badge"><i class="fas fa-calendar"></i> ${year}</span>` : ''}
                            ${rating ? `<span class="meta-badge"><i class="fas fa-star" style="color:var(--warning)"></i> ${rating}</span>` : ''}
                            ${duration ? `<span class="meta-badge"><i class="fas fa-clock"></i> ${duration}</span>` : ''}
                            ${genre ? `<span class="meta-badge"><i class="fas fa-tag"></i> ${escHtml(genre)}</span>` : ''}
                        </div>
                        <p class="detail-desc">${escHtml(plot) || 'Sem descricao disponivel.'}</p>
                        ${cast ? `<p class="detail-desc"><strong>Elenco:</strong> ${escHtml(cast)}</p>` : ''}
                        <button class="btn-watch" onclick="playItem('movie', ${item.stream_id}, '${escHtml(title)}')">
                            <i class="fas fa-play"></i> Assistir
                        </button>
                    </div>
                </div>
            `;
            modal.classList.remove('hidden');
        } catch (e) {
            console.error(e);
            showToast('Erro ao carregar detalhes', 'error');
        }
        hideLoading();
    }

    async function showSeriesDetail(series) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        showLoading('Carregando...');
        try {
            let info = null;
            const sid = series.series_id || series.stream_id;
            try { info = await api.getSeriesInfo(sid); } catch (e) {}

            const img = series.cover || series.stream_icon || series.image || '';
            const title = series.name || '';
            const plot = (info?.info?.plot) || series.plot || '';
            const genre = (info?.info?.genre) || series.category_name || '';
            const rating = (info?.info?.rating) || '';
            const seasons = info?.seasons || [];
            const episodes = info?.episodes || {};

            let seasonsHTML = '';
            if (seasons.length) {
                const firstSeason = seasons[0];
                const firstEps = episodes[firstSeason.season_number] || [];
                seasonsHTML = `
                    <div style="padding:0 28px 28px;">
                        <div class="seasons-pills">${seasons.map((s, i) => `
                            <button class="season-pill ${i === 0 ? 'active' : ''}" data-season="${s.season_number}" onclick="loadSeason('${sid}', ${s.season_number}, this)">Temporada ${s.season_number}</button>`).join('')}
                        </div>
                        <div class="episodes-grid" id="episodes-grid">
                            ${firstEps.map(ep => `
                                <div class="episode-card" onclick="playItem('series', '${ep.id}', '${escHtml(ep.title || 'Episodio ' + ep.episode_number)} ${escHtml(title)}')">
                                    <div class="episode-num">${ep.episode_number}</div>
                                    <div class="ep-info">
                                        <div class="ep-name">${escHtml(ep.title || 'Episodio ' + ep.episode_number)}</div>
                                        <div class="ep-meta">${ep.container_extension ? '.' + ep.container_extension : ''}</div>
                                    </div>
                                    <button class="ep-play"><i class="fas fa-play"></i></button>
                                </div>`).join('')}
                        </div>
                    </div>`;
            }

            content.innerHTML = `
                <div class="detail-header">
                    <img class="detail-poster" src="${img}" onerror="this.src='assets/icons/live_channel_default_icon.png'" alt="${escHtml(title)}">
                    <div class="detail-info">
                        <h2>${escHtml(title)}</h2>
                        <div class="detail-meta">
                            ${rating ? `<span class="meta-badge"><i class="fas fa-star" style="color:var(--warning)"></i> ${rating}</span>` : ''}
                            ${genre ? `<span class="meta-badge"><i class="fas fa-tag"></i> ${escHtml(genre)}</span>` : ''}
                            ${seasons.length ? `<span class="meta-badge"><i class="fas fa-layer-group"></i> ${seasons.length} Temporada${seasons.length > 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <p class="detail-desc">${escHtml(plot) || 'Sem descricao disponivel.'}</p>
                    </div>
                </div>
                ${seasonsHTML}
            `;
            modal.classList.remove('hidden');
        } catch (e) {
            console.error(e);
            showToast('Erro ao carregar detalhes', 'error');
        }
        hideLoading();
    }

    // --- Window Functions (called from HTML) ---
    window.playItem = (type, id, title) => {
        document.getElementById('detail-modal').classList.add('hidden');
        const url = api.getStreamUrl(type, id);
        player.play(url, title, type === 'live' ? 'live' : type);
    };

    window.loadSeason = async (sid, seasonNum, btn) => {
        document.querySelectorAll('.season-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        try {
            const info = await api.getSeriesInfo(sid);
            const eps = info?.episodes?.[seasonNum] || [];
            const container = document.getElementById('episodes-grid');
            container.innerHTML = eps.map(ep => `
                <div class="episode-card" onclick="playItem('series', '${ep.id}', '${escHtml(ep.title || 'Episodio ' + ep.episode_number)}')">
                    <div class="episode-num">${ep.episode_number}</div>
                    <div class="ep-info">
                        <div class="ep-name">${escHtml(ep.title || 'Episodio ' + ep.episode_number)}</div>
                    </div>
                    <button class="ep-play"><i class="fas fa-play"></i></button>
                </div>`).join('');
        } catch (e) { console.error(e); }
    };

    window.navCategory = (type, catId) => {
        navigateTo(type);
        if (type === 'live') filterLiveCat(catId, document.querySelectorAll('.live-category-btn')[1]);
        else if (type === 'movies') {
            const btn = [...document.querySelectorAll('#movie-cat-pills .filter-pill')].find(b => b.textContent === '');
            if (btn) btn.click();
        }
    };

    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // --- Modal close ---
    document.getElementById('btn-close-detail').addEventListener('click', () => {
        document.getElementById('detail-modal').classList.add('hidden');
    });

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', (e) => {
            if (e.target === m) {
                m.classList.add('hidden');
                if (m.id === 'player-modal') player.stop();
            }
        });
    });

    // --- Auto enter ---
    enterApp();
});
