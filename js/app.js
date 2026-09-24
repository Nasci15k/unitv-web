document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const appEl = $('app');
    const authGate = $('auth-gate');
    const loadingOverlay = $('loading-overlay');
    const loadingText = $('loading-text');
    const sidebar = $('sidebar');
    const btnMenu = $('btn-menu');
    const btnLogout = $('btn-logout');
    const searchInput = $('search-input');
    const btnSearchGo = $('btn-search-go');
    const userDisplay = $('user-display');
    const currentTimeEl = $('current-time');

    const PER_PAGE = 48;
    const PLACEHOLDER_IMG = 'assets/images/placeholder.svg';
    const DEAD_IMG_HOSTS = { 'logos.imperioapps.xyz': 1, 'loopstatic.net': 1, '32q0d.xyz': 1, 'fenix7.com': 1, 'imagizer.imageshack.com': 1 };
    function safeImg(url) {
        if (!url || !url.trim()) return PLACEHOLDER_IMG;
        try {
            let u = new URL(url, location.href);
            if (DEAD_IMG_HOSTS[u.hostname]) return PLACEHOLDER_IMG;
            if (u.protocol === 'http:') { u.protocol = 'https:'; return u.href; }
            return u.href;
        } catch (e) { return PLACEHOLDER_IMG; }
    }
    const state = { section: 'live', allLive: [], allMovies: [], allSeries: [], liveCats: [], vodCats: [], seriesCats: [], moviesPage: 1, seriesPage: 1, movieSection: 'general', seriesSection: 'general', liveSection: 'general', movieFilterMode: 'todos', seriesFilterMode: 'todos', movieGenre: '', movieYear: '', seriesGenre: '', seriesYear: '', movieCat: '', seriesCat: '', favTab: 'favorites', searchType: '', historyDeleteMode: false, adultUnlocked: false, currentEpg: null, jogosLoaded: false, jogosDateIdx: 0, jogosGames: [], jogosComps: {}, jogosCountries: {}, filterSel: { tipo: 'Filmes', genero: 'Todos', ano: 'Todos' } };
    const watched = {};

    const ContentFilter = {
        ADULT_TERMS: ['adulto', 'xxx', '+18', 'porno', 'porn', 'sexy', 'playboy', 'gay', 'lésbica', 'lesbica', 'lesbian', 'transsexual', 'sexual', 'sex', 'brasileirinhas', 'mofos', 'hustler', 'brazzers', 'sex prive', 'venus', 'sexy hot', 'sextreme', 'sexprive', 'anal', 'buceta', 'erotic'],
        KIDS_TERMS: ['desenho', 'anime', 'animé', 'anime', 'animacao', 'animação', 'criança', 'crianca', 'infantil', 'infantis', 'kids', 'infantil', 'cartoon', 'disney', 'baby', 'turma da monica'],
        cleanCategoryName(name) {
            if (!name) return '';
            return String(name).replace(/\[lang=[^\]]*\]/gi, '').trim();
        },
        isAdult(text) {
            if (!text) return false;
            const t = String(text).toLowerCase().trim();
            return this.ADULT_TERMS.some(term => t.includes(term));
        },
        isKids(text) {
            if (!text) return false;
            if (this.isAdult(text)) return false;
            const t = String(text).toLowerCase().trim();
            return this.KIDS_TERMS.some(term => t.includes(term));
        },
        sectionOf(name) {
            if (this.isAdult(name)) return 'adult';
            if (this.isKids(name)) return 'kids';
            return 'general';
        },
        filterCats(cats) {
            return (cats || []).map(c => ({ ...c, category_name: this.cleanCategoryName(c.category_name || ''), section: this.sectionOf(c.category_name || '') }));
        },
        filterItems(items, section) {
            if (!section || section === 'all') return items || [];
            return (items || []).filter(i => this.sectionOf(i.name || i.category_name || '') === section);
        }
    };

    const WatchStore = {
        KEY: 'unitv_watch_progress',
        HKEY: 'unitv_watch_history',
        MAX: 5000,
        _progress: null,
        _history: null,
        loadProgress() {
            if (this._progress) return this._progress;
            try { this._progress = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { this._progress = {}; }
            return this._progress;
        },
        loadHistory() {
            if (this._history) return this._history;
            try { this._history = JSON.parse(localStorage.getItem(this.HKEY) || '[]'); } catch (e) { this._history = []; }
            return this._history;
        },
        id(type, streamId) { return type + ':' + streamId; },
        saveProgress(type, streamId, position, duration, title) {
            if (type === 'live' || !streamId) return;
            if (position <= 0 || duration <= 0) return;
            const p = this.loadProgress();
            const isCompleted = duration > 0 && (duration - position) <= 120;
            const key = this.id(type, streamId);
            const prev = p[key];
            if (prev && prev.isCompleted && isCompleted && position < prev.lastWatchedPosition) return;
            p[key] = { streamId, type, title: title || '', lastWatchedPosition: Math.floor(position), totalDuration: Math.floor(duration || 0), lastWatchedTime: Date.now(), isCompleted };
            const keys = Object.keys(p);
            if (keys.length > this.MAX) {
                keys.sort((a, b) => (p[a].lastWatchedTime || 0) - (p[b].lastWatchedTime || 0));
                keys.slice(0, keys.length - this.MAX).forEach(k => delete p[k]);
            }
            try { localStorage.setItem(this.KEY, JSON.stringify(p)); } catch (e) {}
        },
        getProgress(type, streamId) {
            const direct = this.loadProgress()[this.id(type, streamId)];
            if (direct) return direct;
            const alias = type === 'movie' ? 'vod' : type === 'vod' ? 'movie' : null;
            if (alias) return this.loadProgress()[this.id(alias, streamId)] || null;
            return null;
        },
        record(type, streamId, title) {
            const t = type === 'movie' ? 'vod' : type;
            const h = this.loadHistory();
            const key = t + ':' + streamId;
            const i = h.findIndex(x => x.key === key);
            if (i >= 0) h.splice(i, 1);
            h.unshift({ key, type: t, streamId, title: title || '', time: Date.now() });
            if (h.length > this.MAX) h.length = this.MAX;
            try { localStorage.setItem(this.HKEY, JSON.stringify(h)); } catch (e) {}
        },
        getRecent(limit) {
            return this.loadHistory().slice(0, limit || 20);
        },
        isIncompleteProgress(type, streamId) {
            const p = this.getProgress(type, streamId);
            return p && !p.isCompleted && p.lastWatchedPosition > 5;
        },
        removeHistoryItem(key) {
            const h = this.loadHistory();
            const i = h.findIndex(x => x.key === key);
            if (i >= 0) h.splice(i, 1);
            this._history = h;
            try { localStorage.setItem(this.HKEY, JSON.stringify(h)); } catch (e) {}
        },
        clearHistoryByType(type) {
            const t = type === 'movie' ? 'vod' : type;
            this._history = this.loadHistory().filter(x => x.type !== t);
            try { localStorage.setItem(this.HKEY, JSON.stringify(this._history)); } catch (e) {}
        },
        clearHistory() {
            this._history = [];
            try { localStorage.setItem(this.HKEY, '[]'); } catch (e) {}
        }
    };
    const FavoriteStore = {
        KEY: 'unitv_favorites',
        _data: null,
        load() {
            if (this._data) return this._data;
            try { this._data = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { this._data = {}; }
            return this._data;
        },
        save() { try { localStorage.setItem(this.KEY, JSON.stringify(this._data)); } catch (e) {} },
        key(type, id) { return 'favorite_' + (type === 'movie' ? 'vod' : type) + '_' + id; },
        toggle(type, id) {
            const d = this.load();
            const k = this.key(type, id);
            d[k] = !d[k];
            if (!d[k]) delete d[k];
            this.save();
            return !!d[k];
        },
        is(type, id) { return !!this.load()[this.key(type, id)]; },
        getIds(type) {
            const d = this.load();
            const prefix = 'favorite_' + (type === 'movie' ? 'vod' : type) + '_';
            return Object.keys(d).filter(k => k.startsWith(prefix) && d[k]).map(k => parseInt(k.slice(prefix.length), 10)).filter(n => !isNaN(n));
        },
        remove(type, id) {
            const d = this.load();
            delete d[this.key(type, id)];
            this.save();
        },
        clearType(type) {
            const d = this.load();
            const prefix = 'favorite_' + (type === 'movie' ? 'vod' : type) + '_';
            Object.keys(d).forEach(k => { if (k.startsWith(prefix)) delete d[k]; });
            this.save();
        },
        clearAll() {
            this._data = {};
            this.save();
        }
    };
    window.FavoriteStore = FavoriteStore;

    window.WatchStore = WatchStore;
    window.ContentFilter = ContentFilter;

    const ParentalControlStore = {
        PREF: 'parental_control',
        KEY: 'parental_pin',
        _cache: null,
        _data() {
            if (this._cache) return this._cache;
            try { this._cache = JSON.parse(localStorage.getItem(this.PREF) || '{}'); } catch (e) { this._cache = {}; }
            return this._cache;
        },
        _save() { try { localStorage.setItem(this.PREF, JSON.stringify(this._data())); } catch (e) {} },
        hasPin() { const p = this._data()[this.KEY]; return !!(p && String(p).length === 4); },
        savePin(pin) {
            if (!pin || String(pin).length !== 4) return false;
            this._data()[this.KEY] = String(pin);
            this._save();
            return true;
        },
        validate(pin) {
            if (!pin || String(pin).length !== 4) return false;
            return String(this._data()[this.KEY] || '') === String(pin);
        },
        remove() { delete this._data()[this.KEY]; this._save(); return true; }
    };
    window.ParentalControlStore = ParentalControlStore;

    const ReservationStore = {
        KEY: 'unitv_reservations',
        _data: null,
        load() {
            if (this._data) return this._data;
            try { this._data = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { this._data = {}; }
            return this._data;
        },
        save() { try { localStorage.setItem(this.KEY, JSON.stringify(this._data)); } catch (e) {} },
        key(channelId, start) { return channelId + '|' + start; },
        toggle(channelId, start, title, channelName) {
            const d = this.load();
            const k = this.key(channelId, start);
            if (d[k]) delete d[k];
            else d[k] = { channelId, start, title: title || '', channelName: channelName || '', createdAt: Date.now() };
            this.save();
            return !!d[k];
        },
        isReserved(channelId, start) { return !!this.load()[this.key(channelId, start)]; },
        list() { return Object.values(this.load()); }
    };
    window.ReservationStore = ReservationStore;

    function parseEpgDate(s) {
        if (!s) return null;
        const str = String(s).trim();
        if (/^\d{10}(\.\d+)?$/.test(str)) return new Date(parseFloat(str) * 1000);
        if (/^\d{13}$/.test(str)) return new Date(parseInt(str, 10));
        const m = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
        if (m) {
            const base = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
            if (m[7]) {
                const sign = m[7][0] === '-' ? -1 : 1;
                const offH = parseInt(m[7].slice(1, 3), 10);
                const offM = parseInt(m[7].slice(3, 5), 10);
                base.setTime(base.getTime() - sign * (offH * 60 + offM) * 60000);
            }
            return base;
        }
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(str)) {
            const d = new Date(str.replace(' ', 'T') + 'Z');
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d;
    }

    function showLoading(t) { loadingText.textContent = t || 'Carregando...'; loadingOverlay.classList.remove('hidden'); }
    function hideLoading() { loadingOverlay.classList.add('hidden'); }

    function showToast(msg, type) {
        let t = $('app-toast');
        if (!t) { t = document.createElement('div'); t.id = 'app-toast'; t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:12px;background:rgba(20,20,35,0.95);color:#fff;font-size:14px;z-index:5000;border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(12px);display:flex;align-items:center;gap:10px;transform:translateY(80px);opacity:0;transition:all 0.3s ease;font-family:Inter,sans-serif;'; document.body.appendChild(t); }
        const icon = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
        const color = type === 'error' ? '#ef4444' : '#10b981';
        t.innerHTML = '<i class="' + icon + '" style="color:' + color + '"></i>' + msg;
        t.style.transform = 'translateY(0)'; t.style.opacity = '1';
        setTimeout(() => { t.style.transform = 'translateY(80px)'; t.style.opacity = '0'; }, 3500);
    }

    function updateClock() { currentTimeEl.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    setInterval(updateClock, 1000); updateClock();

    function esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : ''; }
    function safe(fn) { return fn().catch(() => null); }

    let entered = false;
    async function enterApp() {
        if (entered) return;
        entered = true;
        if (authGate) authGate.classList.add('hidden');
        appEl.style.display = 'flex';
        showLoading('Conectando ao servidor...');
        try {
            if (await api.authenticate() && api.userData) {
                userDisplay.textContent = api.userData.username || 'Usuario';
                showLoading('Carregando conteudo...');
                await loadAllData();
                showToast('Bem-vindo ao OpenTv!', 'success');
            } else {
                showToast('Falha na autenticacao', 'error');
                entered = false;
                appEl.style.display = 'none';
                if (authGate) {
                    authGate.classList.remove('hidden');
                    const msg = $('auth-gate-msg');
                    if (msg) msg.textContent = 'Falha ao conectar ao servidor Xtream.';
                }
            }
        } catch (err) {
            console.error(err);
            showToast('Erro: ' + err.message, 'error');
            entered = false;
            appEl.style.display = 'none';
            if (authGate) authGate.classList.remove('hidden');
        }
        hideLoading();
    }

    function showGate(message, showLogin, loginLabel) {
        if (authGate) authGate.classList.remove('hidden');
        const msg = $('auth-gate-msg');
        if (msg && message) msg.textContent = message;
        const link = $('auth-gate-login');
        if (link) {
            if (showLogin === false) link.classList.add('hidden');
            else {
                link.classList.remove('hidden');
                if (loginLabel) link.innerHTML = loginLabel;
            }
        }
        appEl.style.display = 'none';
    }

    async function bootApp() {
        if (!window.AuthStore) {
            if (authGate) authGate.classList.add('hidden');
            await enterApp();
            return;
        }
        try {
            await AuthStore.init();
        } catch (e) { /* segue mesmo assim */ }
        if (!AuthStore.isAuthenticated()) {
            showGate('Faça login para abrir o player.', true, '<i class="fas fa-sign-in-alt"></i> Entrar');
            return;
        }
        const status = AuthStore.getStatus();
        if (status === 'rejected') {
            showGate('Conta recusada pelo administrador.', true, '<i class="fas fa-user-slash"></i> Trocar conta');
            return;
        }
        if (!AuthStore.isApproved() && !AuthStore.isAdmin()) {
            showGate('Conta aguardando aprovação do administrador.', true, '<i class="fas fa-hourglass-half"></i> Ver status');
            return;
        }
        await enterApp();
    }

    $('auth-gate-retry')?.addEventListener('click', () => bootApp());

    btnLogout.addEventListener('click', () => {
        if (window.AuthStore && AuthStore.isAuthenticated()) {
            AuthStore.signOut().then(() => { location.href = 'login.html'; });
            return;
        }
        appEl.style.display = 'none';
        api.cache.clear();
        showGate('Sessão encerrada.', true, '<i class="fas fa-sign-in-alt"></i> Entrar');
    });

    function navigateTo(section) {
        state.section = section;
        document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === section));
        document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 'section-' + section));
        sidebar.classList.remove('open');
        if (section === 'kids') renderKids();
        if (section === 'jogos') renderJogos();
        if (section === 'explorar') renderExplorar();
        if (section === 'favorites') renderFavoritesSection();
        if (section === 'destaques') renderContinueWatching();
    }
    btnMenu?.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => { if (window.innerWidth <= 768 && sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== btnMenu) sidebar.classList.remove('open'); });
    document.querySelectorAll('.nav-item').forEach(i => i.addEventListener('click', () => navigateTo(i.dataset.section)));

    let searchTimer;
    btnSearchGo?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    searchInput?.addEventListener('input', (e) => { clearTimeout(searchTimer); const v = e.target.value.trim(); if (v.length < 3) { $('search-results').innerHTML = ''; return; } searchTimer = setTimeout(() => doSearch(), 500); });

    document.querySelectorAll('#search-type-pills .filter-pill').forEach(p => p.addEventListener('click', () => {
        document.querySelectorAll('#search-type-pills .filter-pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        state.searchType = p.dataset.type || '';
        if (searchInput.value.trim().length >= 3) doSearch();
    }));

    async function doSearch() {
        const q = searchInput.value.trim();
        if (!q || q.length < 3) return;
        showLoading('Buscando...');
        navigateTo('search');
        const results = await api.searchContent(q);
        const filtered = state.searchType ? results.filter(r => r.streamType === state.searchType) : results;
        const c = $('search-results');
        c.innerHTML = filtered.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-search"></i><p>Nenhum resultado para "' + esc(q) + '"</p></div>';
        filtered.forEach(r => c.appendChild(createCard(r, r.series_id ? 'series' : 'movie')));
        hideLoading();
    }

    async function loadAllData() {
        const [lc, vc, sc, live, movies, series] = await Promise.all([
            safe(() => api.getLiveCategories()), safe(() => api.getVodCategories()), safe(() => api.getSeriesCategories()),
            safe(() => api.getLiveStreams()), safe(() => api.getVodStreams()), safe(() => api.getSeries())
        ]);
        state.allLive = Array.isArray(live) ? live : [];
        state.allMovies = Array.isArray(movies) ? movies : [];
        state.allSeries = Array.isArray(series) ? series : [];
        state.liveCats = ContentFilter.filterCats(Array.isArray(lc) ? lc : []);
        state.vodCats = ContentFilter.filterCats(Array.isArray(vc) ? vc : []);
        state.seriesCats = ContentFilter.filterCats(Array.isArray(sc) ? sc : []);
        api.setLiveCache(state.allLive); api.setMovieCache(state.allMovies); api.setSeriesCache(state.allSeries);
        renderHome();
        renderLiveSidebar();
        renderFilterModes('movie-filter-modes', 'movies');
        renderFilterModes('series-filter-modes', 'series');
        filterLive('');
        renderMovies(1);
        renderSeries(1);
        renderContinueWatching();
        decorateRowScrolls();
        navigateTo('live');
    }

    function renderFilterModes(containerId, kind) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.querySelectorAll('.filter-mode').forEach(btn => {
            btn.addEventListener('click', () => {
                c.querySelectorAll('.filter-mode').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.mode;
                if (kind === 'movies') {
                    state.movieFilterMode = mode;
                    state.movieGenre = ''; state.movieYear = ''; state.movieCat = '';
                    renderMovieFilterPills();
                    renderMovies(1);
                } else {
                    state.seriesFilterMode = mode;
                    state.seriesGenre = ''; state.seriesYear = ''; state.seriesCat = '';
                    renderSeriesFilterPills();
                    renderSeries(1);
                }
            });
        });
        if (kind === 'movies') renderMovieFilterPills();
        else renderSeriesFilterPills();
    }

    function renderMovieFilterPills() {
        const genreEl = document.getElementById('movie-genre-pills');
        const yearEl = document.getElementById('movie-year-pills');
        const catEl = document.getElementById('movie-cat-pills');
        if (!genreEl || !yearEl || !catEl) return;
        const mode = state.movieFilterMode;
        genreEl.style.display = mode === 'genero' ? 'flex' : 'none';
        yearEl.style.display = mode === 'ano' ? 'flex' : 'none';
        catEl.style.display = mode === 'todos' || mode === 'cinema' ? 'flex' : 'none';

        if (mode === 'genero') {
            const genres = [...new Set(state.vodCats.map(c => c.category_name).filter(Boolean))];
            genreEl.innerHTML = '<button class="filter-pill' + (!state.movieGenre ? ' active' : '') + '" data-genre="">Todos</button>' +
                genres.map(g => '<button class="filter-pill' + (state.movieGenre === g ? ' active' : '') + '" data-genre="' + esc(g) + '">' + esc(g) + '</button>').join('');
            genreEl.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
                state.movieGenre = p.dataset.genre || '';
                renderMovieFilterPills();
                renderMovies(1);
            }));
        }
        if (mode === 'ano') {
            const years = [...new Set(state.allMovies.map(m => String(m.year || '')).filter(y => y && y !== '0'))].sort().reverse();
            yearEl.innerHTML = '<button class="filter-pill' + (!state.movieYear ? ' active' : '') + '" data-year="">Todos</button>' +
                years.map(y => '<button class="filter-pill' + (state.movieYear === y ? ' active' : '') + '" data-year="' + esc(y) + '">' + esc(y) + '</button>').join('');
            yearEl.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
                state.movieYear = p.dataset.year || '';
                renderMovieFilterPills();
                renderMovies(1);
            }));
        }
        if (mode === 'todos' || mode === 'cinema') {
            let cats = state.vodCats;
            if (mode === 'cinema') cats = cats.filter(c => /cinema|estreia|lancamento|lançamento|novos/i.test(c.category_name || ''));
            renderPills('movie-cat-pills', cats, (catId) => { state.movieCat = catId || ''; renderMovies(1); });
        }
    }

    function renderSeriesFilterPills() {
        const genreEl = document.getElementById('series-genre-pills');
        const yearEl = document.getElementById('series-year-pills');
        const catEl = document.getElementById('series-cat-pills');
        if (!genreEl || !yearEl || !catEl) return;
        const mode = state.seriesFilterMode;
        genreEl.style.display = mode === 'genero' ? 'flex' : 'none';
        yearEl.style.display = mode === 'ano' ? 'flex' : 'none';
        catEl.style.display = mode === 'todos' ? 'flex' : 'none';

        if (mode === 'genero') {
            const genres = [...new Set(state.seriesCats.map(c => c.category_name).filter(Boolean))];
            genreEl.innerHTML = '<button class="filter-pill' + (!state.seriesGenre ? ' active' : '') + '" data-genre="">Todos</button>' +
                genres.map(g => '<button class="filter-pill' + (state.seriesGenre === g ? ' active' : '') + '" data-genre="' + esc(g) + '">' + esc(g) + '</button>').join('');
            genreEl.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
                state.seriesGenre = p.dataset.genre || '';
                renderSeriesFilterPills();
                renderSeries(1);
            }));
        }
        if (mode === 'ano') {
            const years = [...new Set(state.allSeries.map(s => String(s.year || '')).filter(y => y && y !== '0'))].sort().reverse();
            yearEl.innerHTML = '<button class="filter-pill' + (!state.seriesYear ? ' active' : '') + '" data-year="">Todos</button>' +
                years.map(y => '<button class="filter-pill' + (state.seriesYear === y ? ' active' : '') + '" data-year="' + esc(y) + '">' + esc(y) + '</button>').join('');
            yearEl.querySelectorAll('.filter-pill').forEach(p => p.addEventListener('click', () => {
                state.seriesYear = p.dataset.year || '';
                renderSeriesFilterPills();
                renderSeries(1);
            }));
        }
        if (mode === 'todos') {
            renderPills('series-cat-pills', state.seriesCats, (catId) => { state.seriesCat = catId || ''; renderSeries(1); });
        }
    }

    function getFilteredMovies() {
        let filtered = ContentFilter.filterItems(state.allMovies, state.movieSection);
        filtered = filtered.filter(m => !ContentFilter.isAdult(m.name || ''));
        if (state.movieFilterMode === 'genero' && state.movieGenre) {
            const catIds = new Set(state.vodCats.filter(c => c.category_name === state.movieGenre).map(c => String(c.category_id)));
            filtered = filtered.filter(m => catIds.has(String(m.category_id)) || (m.category_name || '').includes(state.movieGenre));
        }
        if (state.movieFilterMode === 'ano' && state.movieYear) {
            filtered = filtered.filter(m => String(m.year) === state.movieYear);
        }
        if ((state.movieFilterMode === 'todos' || state.movieFilterMode === 'cinema') && state.movieCat) {
            filtered = filtered.filter(s => String(s.category_id) === String(state.movieCat));
        }
        return filtered;
    }

    function getFilteredSeries() {
        let filtered = ContentFilter.filterItems(state.allSeries, state.seriesSection);
        filtered = filtered.filter(s => !ContentFilter.isAdult(s.name || ''));
        if (state.seriesFilterMode === 'genero' && state.seriesGenre) {
            const catIds = new Set(state.seriesCats.filter(c => c.category_name === state.seriesGenre).map(c => String(c.category_id)));
            filtered = filtered.filter(s => catIds.has(String(s.category_id)) || (s.category_name || '').includes(state.seriesGenre));
        }
        if (state.seriesFilterMode === 'ano' && state.seriesYear) {
            filtered = filtered.filter(s => String(s.year) === state.seriesYear);
        }
        if (state.seriesFilterMode === 'todos' && state.seriesCat) {
            filtered = filtered.filter(s => String(s.category_id) === String(state.seriesCat));
        }
        return filtered;
    }

    // Period check for row scroll arrows
    function decorateRowScrolls() {
        document.querySelectorAll('.row-scroll').forEach(row => {
            if (row.parentElement && row.parentElement.classList.contains('row-scroll-wrap')) return;
            const wrap = document.createElement('div');
            wrap.className = 'row-scroll-wrap';
            row.parentNode.insertBefore(wrap, row);
            wrap.appendChild(row);
            const prev = document.createElement('button');
            prev.className = 'row-scroll-btn prev';
            prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
            prev.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' }));
            const next = document.createElement('button');
            next.className = 'row-scroll-btn next';
            next.innerHTML = '<i class="fas fa-chevron-right"></i>';
            next.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' }));
            wrap.appendChild(prev);
            wrap.appendChild(next);
            const upd = () => {
                const max = row.scrollWidth - row.clientWidth - 2;
                prev.classList.toggle('hidden', row.scrollLeft <= 4);
                next.classList.toggle('hidden', row.scrollLeft >= max);
            };
            row.addEventListener('scroll', upd, { passive: true });
            new MutationObserver(upd).observe(row, { childList: true });
            setTimeout(upd, 400);
        });
    }

    function renderHome() {
        const pc = $('popular-channels');
        if (pc) {
            pc.innerHTML = '';
            state.allLive.filter(s => !ContentFilter.isAdult(s.name || s.category_name || '')).slice(0, 12).forEach((s, i) => pc.appendChild(createChannelCard(s, i)));
        }
        const mc = $('home-movies');
        if (mc) {
            mc.innerHTML = '';
            ContentFilter.filterItems(state.allMovies, 'general').slice(0, 15).forEach(m => mc.appendChild(createCard(m, 'movie')));
        }
        const featured = state.allMovies.find(m => !ContentFilter.isAdult(m.name || '')) || state.allMovies[0];
        if (featured && $('hero-banner')) {
            let meta = '';
            if (featured.year) meta += '<span class="meta-badge"><i class="fas fa-calendar"></i> ' + esc(featured.year) + '</span>';
            if (featured.rating) meta += '<span class="meta-badge"><i class="fas fa-star" style="color:var(--warning)"></i> ' + esc(String(featured.rating)) + '</span>';
            $('hero-banner').innerHTML = '<div class="hero-banner-inner"><div class="hero-bg" style="background-image:url(\'' + (featured.stream_icon || '') + '\')"></div><div class="hero-content"><div class="hero-badge">FILME</div><h2>' + esc(featured.name) + '</h2>' + (meta ? '<div class="hero-meta">' + meta + '</div>' : '') + '<div class="hero-actions"><button class="btn-hero primary" id="hero-play"><i class="fas fa-play"></i> Assistir</button><button class="btn-hero secondary" id="hero-info"><i class="fas fa-info-circle"></i> Detalhes</button></div></div></div>';
            $('hero-play')?.addEventListener('click', () => playItem('movie', featured.stream_id, featured.name));
            $('hero-info')?.addEventListener('click', () => showMovieDetail(featured));
        }
    }

    function renderKids() {
        const c = $('kids-grid');
        if (!c) return;
        const kidsItems = [
            ...state.allMovies.filter(m => ContentFilter.isKids(m.name || m.category_name || '')),
            ...state.allSeries.filter(s => ContentFilter.isKids(s.name || s.category_name || ''))
        ].slice(0, 60);
        const kidCatIds = new Set(state.vodCats.filter(x => (x.section || '') === 'kids').map(x => String(x.category_id)));
        const more = state.allMovies.filter(m => kidCatIds.has(String(m.category_id)));
        const all = kidsItems.length ? kidsItems : more.slice(0, 60);
        c.innerHTML = all.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-child"></i><p>Nenhum conteudo infantil</p></div>';
        all.forEach(item => {
            const type = item.series_id || item.episode_count ? 'series' : 'movie';
            c.appendChild(createCard(item, type));
        });
    }

    function renderExplorar() {
        const c = $('explorar-grid');
        if (!c) return;
        const pool = [
            ...ContentFilter.filterItems(state.allMovies, 'general').slice(0, 24),
            ...ContentFilter.filterItems(state.allSeries, 'general').slice(0, 24)
        ].filter(x => !ContentFilter.isAdult(x.name || ''));
        c.innerHTML = pool.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-compass"></i><p>Nada para explorar</p></div>';
        pool.forEach(item => {
            const type = item.series_id || item.episode_count ? 'series' : 'movie';
            c.appendChild(createCard(item, type));
        });
    }

    function renderFavoritesSection() {
        const favGrid = $('favorites-grid');
        const histList = $('history-list');
        if (!favGrid || !histList) return;
        const showFav = state.favTab === 'favorites';
        favGrid.style.display = showFav ? 'grid' : 'none';
        histList.style.display = showFav ? 'none' : 'grid';
        $('fav-actions')?.classList.toggle('hidden', !showFav);
        $('hist-actions')?.classList.toggle('hidden', showFav);
        document.querySelectorAll('.fav-tab').forEach(t => t.classList.toggle('active', t.dataset.fav === state.favTab));

        if (showFav) {
            const favMovies = state.allMovies.filter(m => FavoriteStore.is('movie', m.stream_id));
            const favSeries = state.allSeries.filter(s => FavoriteStore.is('series', s.series_id || s.stream_id));
            const favLive = state.allLive.filter(l => FavoriteStore.is('live', l.stream_id));
            favGrid.innerHTML = (favMovies.length + favSeries.length + favLive.length) ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-heart"></i><p>Nenhum favorito ainda</p></div>';
            favLive.forEach(l => favGrid.appendChild(createChannelCard(l)));
            favMovies.forEach(m => favGrid.appendChild(createCard(m, 'movie')));
            favSeries.forEach(s => favGrid.appendChild(createCard(s, 'series')));
        } else {
            const recents = WatchStore.getRecent(50);
            histList.classList.toggle('delete-mode', state.historyDeleteMode);
            histList.innerHTML = recents.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-history"></i><p>Historico vazio</p></div>';
            recents.forEach(r => {
                const t = r.type === 'vod' ? 'movie' : r.type;
                const source = t === 'movie' ? state.allMovies : t === 'series' ? state.allSeries : state.allLive;
                const meta = source.find(x => String(x.stream_id || x.series_id) === String(r.streamId));
                if (!meta) return;
                let card;
                if (t === 'live') card = createChannelCard(meta);
                else card = createCard(meta, t);
                if (state.historyDeleteMode) {
                    const wrap = document.createElement('div');
                    wrap.className = 'hist-item';
                    const del = document.createElement('button');
                    del.className = 'hist-del';
                    del.title = 'Excluir do historico';
                    del.innerHTML = '<i class="fas fa-trash"></i>';
                    del.addEventListener('click', (e) => {
                        e.stopPropagation();
                        WatchStore.removeHistoryItem(r.key);
                        renderFavoritesSection();
                        showToast('Removido do historico', 'success');
                    });
                    wrap.appendChild(card);
                    wrap.appendChild(del);
                    histList.appendChild(wrap);
                } else {
                    histList.appendChild(card);
                }
            });
        }
    }

    document.querySelectorAll('.fav-tab').forEach(t => t.addEventListener('click', () => {
        state.favTab = t.dataset.fav;
        renderFavoritesSection();
    }));

    function loadEpgForChannel(streamId) {
        const epgBar = $('live-epg-bar');
        const epgTitle = $('epg-now-title');
        const epgProgress = $('epg-progress-bar');
        const epgTimeLeft = $('epg-time-left');
        const epgClock = $('epg-clock');
        const reserveBtn = $('epg-reserve-btn');
        const timeshiftBtn = $('epg-timeshift-btn');
        if (!epgBar) return;
        state.currentEpg = null;
        api.getEpg(streamId).then(data => {
            if (!data || !data.epg_listings || !data.epg_listings.length) { epgBar.classList.add('hidden'); return; }
            const now = Date.now();
            const listing = data.epg_listings.find(l => {
                const s = parseEpgDate(l.start), e = parseEpgDate(l.end);
                return s && e && now >= s.getTime() && now <= e.getTime();
            }) || data.epg_listings[0];
            if (!listing) { epgBar.classList.add('hidden'); return; }
            const start = parseEpgDate(listing.start);
            const end = parseEpgDate(listing.end);
            if (!start || !end) { epgBar.classList.add('hidden'); return; }
            const progress = calculateCurrentEventProgress(start, end);
            const remaining = Math.max(0, Math.ceil((end.getTime() - now) / 60000));
            const title = getCurrentProgramTitle(listing);
            state.currentEpg = { streamId, start, end, title, rawStart: listing.start };
            if (epgTitle) epgTitle.textContent = title;
            if (epgProgress) epgProgress.style.width = progress + '%';
            if (epgTimeLeft) epgTimeLeft.textContent = remaining + 'min restante';
            if (epgClock) epgClock.textContent = formatTimeForDisplay(start) + ' - ' + formatTimeForDisplay(end);
            if (reserveBtn) reserveBtn.classList.toggle('active', ReservationStore.isReserved(streamId, listing.start));
            if (timeshiftBtn) {
                const stream = state.allLive.find(s => String(s.stream_id) === String(streamId));
                const archive = stream ? parseInt(stream.tv_archive_duration, 10) || 0 : 0;
                timeshiftBtn.classList.toggle('hidden', !(archive > 0 && hasPlaybackAvailable(start, end, archive)));
            }
            epgBar.classList.remove('hidden');
        }).catch(() => { if (epgBar) epgBar.classList.add('hidden'); });
    }

    const epgMiniCache = new Map();
    const epgQueue = [];
    let epgActive = 0;
    const EPG_MAX = 2;

    function drainEpgQueue() {
        if (epgActive >= EPG_MAX || !epgQueue.length) return;
        const job = epgQueue.shift();
        epgActive++;
        getEpgOnAir(job.streamId).then(listing => {
            if (job.card && job.card.isConnected) {
                const el = job.card.querySelector('.ch-epg-mini');
                if (el && listing && listing.title) el.textContent = ' • ' + listing.title;
            }
        }).finally(() => {
            epgActive--;
            drainEpgQueue();
        });
    }

    async function getEpgOnAir(streamId) {
        if (epgMiniCache.has(streamId)) return epgMiniCache.get(streamId);
        try {
            const data = await api.getEpg(streamId);
            if (!data || !data.epg_listings || !data.epg_listings.length) { epgMiniCache.set(streamId, null); return null; }
            const now = Date.now();
            const listing = data.epg_listings.find(l => {
                const s = parseEpgDate(l.start), e = parseEpgDate(l.end);
                return s && e && now >= s.getTime() && now <= e.getTime();
            });
            epgMiniCache.set(streamId, listing || null);
            return listing;
        } catch (e) { epgMiniCache.set(streamId, null); return null; }
    }

    const CAT_ICONS = [
        [/filme|cinema|movie/i, 'fa-film'], [/s[eé]rie|novela|dorama/i, 'fa-clapperboard'],
        [/esporte|sport|futebol/i, 'fa-futbol'], [/not[ií]cia|jornal|news/i, 'fa-newspaper'],
        [/kids|infantil|desenho|anima/i, 'fa-child'], [/m[uú]sica|music|radio|web r[aá]dio/i, 'fa-music'],
        [/document[áa]rio|doc\b/i, 'fa-book-open'], [/variedade|programa|show|entreter/i, 'fa-masks-theater'],
        [/reality/i, 'fa-camera'], [/religios|gospel|f[eé]/i, 'fa-church'],
        [/24h|24 ?hs|maratona/i, 'fa-clock-rotate-left'], [/nacional|aberta|sinal/i, 'fa-tower-broadcast'],
        [/esportivo|premiere|combate|mma|ufc/i, 'fa-person-boxing'], [/cozinha|gastro/i, 'fa-utensils'],
        [/cultura|arte|educ/i, 'fa-palette'], [/moda|fashion/i, 'fa-shirt'],
        [/tecnologia|tech|game/i, 'fa-microchip'], [/cobertura|internacional|mundo/i, 'fa-globe'],
        [/anime/i, 'fa-dragon'], [/sertanejo|sertanej/i, 'fa-guitar'], [/multicanais/i, 'fa-list']
    ];
    function catIcon(name, fallback) {
        for (const [re, icon] of CAT_ICONS) { if (re.test(name || '')) return icon; }
        return fallback || 'fa-tag';
    }

    function renderLiveSidebar() {
        const c = $('live-categories');
        const counts = new Map();
        state.allLive.forEach(s => { const k = String(s.category_id); counts.set(k, (counts.get(k) || 0) + 1); });
        c.innerHTML = '<button class="live-category-btn active" data-cat=""><i class="fas fa-border-all"></i> <span class="live-cat-name">Todos os Canais</span><span class="live-cat-count">' + state.allLive.length + '</span></button>' +
            state.liveCats.map(cat => '<button class="live-category-btn" data-cat="' + cat.category_id + '"><i class="fas ' + catIcon(cat.category_name) + '"></i> <span class="live-cat-name">' + esc(cat.category_name) + '</span><span class="live-cat-count">' + (counts.get(String(cat.category_id)) || 0) + '</span></button>').join('');
        c.querySelectorAll('.live-category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                c.querySelectorAll('.live-category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterLive(btn.dataset.cat);
            });
        });
        // Categoria atual no header da grade
        c.addEventListener('click', () => {
            const act = c.querySelector('.live-category-btn.active .live-cat-name');
            const t = $('live-cat-current');
            if (t && act) t.textContent = act.textContent;
        });
    }

    function filterLive(catId) {
        let filtered = state.allLive;
        if (catId) filtered = filtered.filter(s => String(s.category_id) === String(catId));
        filtered = ContentFilter.filterItems(filtered, state.liveSection);
        filtered = filtered.filter(s => !ContentFilter.isAdult(s.name || s.category_name || ''));
        renderChannels(filtered);
    }

    function renderChannels(channels) {
        const c = $('channel-list');
        if (!channels.length) { c.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-tv"></i><p>Nenhum canal encontrado</p></div>'; return; }
        c.innerHTML = '';
        channels.forEach((s, i) => c.appendChild(createChannelCard(s, i)));
        if (channels.length && channels[0].stream_id) loadEpgForChannel(channels[0].stream_id);
        if ('IntersectionObserver' in window) {
            observeChannelStatus(c);
        } else {
            c.querySelectorAll('.channel-card[data-stream-id]').forEach(card => {
                probeChannelStatus(card);
                loadMiniEpg(card);
            });
        }
    }

    const statusProbeCache = new Map();
    const statusQueue = [];
    let statusProbing = false;

    function observeChannelStatus(container) {
        if (!('IntersectionObserver' in window)) return;
        const io = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    probeChannelStatus(entry.target);
                    loadMiniEpg(entry.target);
                    io.unobserve(entry.target);
                }
            });
        }, { root: container.closest('.content-area') || null, rootMargin: '200px' });
        container.querySelectorAll('.channel-card[data-stream-id]').forEach(card => io.observe(card));
    }

    function loadMiniEpg(card) {
        const sid = card.getAttribute('data-stream-id');
        if (!sid) return;
        if (epgMiniCache.has(sid)) {
            const listing = epgMiniCache.get(sid);
            const el = card.querySelector('.ch-epg-mini');
            if (el && listing && listing.title) el.textContent = ' • ' + listing.title;
            return;
        }
        if (epgQueue.some(j => j.streamId === sid)) return;
        epgQueue.push({ streamId: sid, card });
        drainEpgQueue();
    }

    function probeChannelStatus(card) {
        const sid = card.getAttribute('data-stream-id');
        if (!sid) return;
        const dot = card.querySelector('.ch-status-dot');
        if (statusProbeCache.has(sid)) {
            if (dot) dot.className = 'ch-status-dot ' + statusProbeCache.get(sid);
            return;
        }
        statusQueue.push({ sid, dot });
        drainStatusQueue();
    }

    async function drainStatusQueue() {
        if (statusProbing) return;
        statusProbing = true;
        while (statusQueue.length) {
            const job = statusQueue.shift();
            const status = await probeStream(job.sid);
            statusProbeCache.set(job.sid, status);
            if (job.dot) job.dot.className = 'ch-status-dot ' + status;
        }
        statusProbing = false;
    }

    async function probeStream(streamId) {
        try {
            const url = api.getStreamUrl('live', streamId);
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch(url, {
                method: 'GET',
                headers: { Range: 'bytes=0-1' },
                signal: ctrl.signal
            });
            clearTimeout(timer);
            if (res.status === 404) return 'offline';
            if (!res.ok && res.status !== 206) return 'warning';
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('mpegurl') || ct.includes('text') || ct.includes('application/vnd.apple')) {
                const reader = res.body ? res.body.getReader() : null;
                if (reader) {
                    const { value } = await reader.read();
                    try { reader.cancel(); } catch (e) {}
                    const text = value ? new TextDecoder().decode(value) : '';
                    if (text.includes('EXT-X-ERROR')) return 'offline';
                    if (text.includes('#EXTM3U')) return 'online';
                    return 'online';
                }
            }
            if (res.body) {
                try { await res.body.cancel(); } catch (e) {}
            }
            return 'online';
        } catch (e) {
            return 'warning';
        }
    }

    function createChannelCard(stream, index) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.setAttribute('data-stream-id', stream.stream_id);
        const num = index != null ? (index + 1) : '';
        const hasIcon = stream.stream_icon && stream.stream_icon.trim();
        const cat = ContentFilter.cleanCategoryName(stream.category_name || '');
        const logoSrc = hasIcon ? safeImg(stream.stream_icon) : PLACEHOLDER_IMG;
        card.innerHTML = '<span class="ch-number">#' + num + '</span><img class="ch-logo" src="' + logoSrc + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" onerror="this.onerror=null;this.src=\'assets/images/placeholder.svg\'"><div class="ch-info"><div class="ch-name">' + esc(stream.name) + '</div><div class="ch-category">' + esc(cat) + '<span class="ch-epg-mini" data-epg-for="' + stream.stream_id + '"></span></div></div><div class="ch-status-dot ' + (hasIcon ? 'warning' : 'offline') + '" title="Status do canal"></div>';
        card.addEventListener('click', () => {
            const play = () => {
                WatchStore.record('live', stream.stream_id, stream.name);
                player.play(api.getStreamUrl('live', stream.stream_id), stream.name, 'live', { streamId: stream.stream_id });
                loadEpgForChannel(stream.stream_id);
            };
            if (ContentFilter.isAdult(stream.name || stream.category_name || '') && !state.adultUnlocked) {
                requirePin(() => { state.adultUnlocked = true; play(); });
                return;
            }
            play();
        });
        return card;
    }

    function renderMovies(page, catId) {
        state.moviesPage = page;
        if (catId !== undefined && catId !== null) state.movieCat = catId || '';
        let filtered = getFilteredMovies();
        const start = (page - 1) * PER_PAGE;
        const slice = filtered.slice(start, start + PER_PAGE);
        const c = $('movies-grid');
        if (!c) return;
        c.innerHTML = slice.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-film"></i><p>Nenhum filme encontrado</p></div>';
        slice.forEach(m => c.appendChild(createCard(m, 'movie')));
        renderPagination('movies-pagination', filtered.length, page, (p) => renderMovies(p));
        document.getElementById('section-movies')?.scrollTo(0, 0);
    }

    function renderSeries(page, catId) {
        state.seriesPage = page;
        if (catId !== undefined && catId !== null) state.seriesCat = catId || '';
        let filtered = getFilteredSeries();
        const start = (page - 1) * PER_PAGE;
        const slice = filtered.slice(start, start + PER_PAGE);
        const c = $('series-grid');
        if (!c) return;
        c.innerHTML = slice.length ? '' : '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-play-circle"></i><p>Nenhuma serie encontrada</p></div>';
        slice.forEach(s => c.appendChild(createCard(s, 'series')));
        renderPagination('series-pagination', filtered.length, page, (p) => renderSeries(p));
        document.getElementById('section-series')?.scrollTo(0, 0);
    }

    function createCard(item, type) {
        const card = document.createElement('div');
        card.className = 'content-card';
        const img = item.stream_icon || item.cover || '';
        const title = item.name || item.title || '';
        const id = type === 'series' ? (item.series_id || item.stream_id) : item.stream_id;
        const badge = type === 'movie' ? '<div class="badge movie">FILME</div>' : type === 'series' ? '<div class="badge series">SERIE</div>' : '';
        const isFav = FavoriteStore.is(type, id);
        const favBtn = '<button class="card-fav' + (isFav ? ' active' : '') + '" data-fav-type="' + type + '" data-fav-id="' + id + '" title="Favoritar"><i class="fas fa-heart"></i></button>';
        const prog = type === 'movie' ? (WatchStore.getProgress('movie', item.stream_id) || WatchStore.getProgress('vod', item.stream_id)) : (item.series_id ? WatchStore.getProgress('series', item.series_id) : null);
        let progBar = '';
        if (prog && !prog.isCompleted && prog.lastWatchedPosition > 5 && prog.totalDuration > 0) {
            const pct = Math.min(100, (prog.lastWatchedPosition / prog.totalDuration) * 100);
            progBar = '<div class="card-progress"><div class="card-progress-fill" style="width:' + pct + '%"></div></div>';
        }
        const posterSrc = safeImg(img);
        card.innerHTML = badge + favBtn + '<img class="poster-img" src="' + posterSrc + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" onerror="this.onerror=null;this.src=\'assets/images/placeholder.svg\'">' + progBar + '<div class="card-body"><div class="card-title">' + esc(title) + '</div>' + (item.rating ? '<div class="card-meta"><span class="rating"><i class="fas fa-star"></i> ' + esc(String(item.rating)) + '</span>' + (item.year ? '<span class="year">' + esc(item.year) + '</span>' : '') + '</div>' : '') + '</div>';
        card.querySelector('.card-fav')?.addEventListener('click', (e) => {
            e.stopPropagation();
            FavoriteStore.toggle(type, id);
            const on = FavoriteStore.is(type, id);
            e.currentTarget.classList.toggle('active', on);
            showToast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos', 'success');
        });
        card.addEventListener('click', () => {
            const open = () => type === 'series' ? showSeriesDetail(item) : showMovieDetail(item);
            if (ContentFilter.isAdult(title) && !state.adultUnlocked) {
                requirePin(() => { state.adultUnlocked = true; open(); });
                return;
            }
            open();
        });
        return card;
    }

    function renderContinueWatching() {
        const c = $('continue-watching');
        const section = $('continue-section');
        if (!c || !section) return;
        const recents = WatchStore.getRecent(30);
        const items = [];
        for (const r of recents) {
            if (r.type === 'live') continue;
            const t = r.type === 'vod' ? 'movie' : r.type;
            const prog = WatchStore.getProgress(t, r.streamId) || WatchStore.getProgress(r.type, r.streamId);
            if (!prog || prog.isCompleted || prog.lastWatchedPosition <= 5) continue;
            const source = t === 'movie' ? state.allMovies : state.allSeries;
            const meta = source.find(x => String(x.stream_id || x.series_id) === String(r.streamId));
            items.push({ ...r, type: t, title: r.title || (meta && meta.name) || 'Conteudo', icon: (meta && (meta.stream_icon || meta.cover)) || '', progress: prog });
            if (items.length >= 12) break;
        }
        if (!items.length) { if (section) section.classList.add('hidden'); return; }
        if (section) section.classList.remove('hidden');
        c.innerHTML = items.map(it => {
            const pct = it.progress.totalDuration > 0 ? Math.min(100, (it.progress.lastWatchedPosition / it.progress.totalDuration) * 100) : 0;
            return '<div class="continue-card" data-type="' + it.type + '" data-id="' + it.streamId + '"><div class="continue-thumb"><img src="' + esc(it.icon) + '" alt="" onerror="this.style.display=\'none\'"><div class="continue-play"><i class="fas fa-play"></i></div><div class="continue-progress"><div style="width:' + pct + '%"></div></div></div><div class="continue-title">' + esc(it.title) + '</div></div>';
        }).join('');
        c.querySelectorAll('.continue-card').forEach(el => {
            el.addEventListener('click', () => {
                const type = el.dataset.type, id = el.dataset.id;
                if (type === 'series') {
                    const meta = state.allSeries.find(x => String(x.series_id) === String(id));
                    if (meta) showSeriesDetail(meta);
                } else {
                    const meta = state.allMovies.find(x => String(x.stream_id) === String(id));
                    if (meta) showMovieDetail(meta);
                }
            });
        });
    }

    async function showMovieDetail(movie) {
        if (ContentFilter.isAdult(movie.name || movie.category_name || '') && !state.adultUnlocked) {
            requirePin(() => { state.adultUnlocked = true; showMovieDetail(movie); });
            return;
        }
        const modal = $('detail-modal');
        const content = $('detail-content');
        showLoading('Carregando...');
        let info = null;
        try { info = await api.getVodInfo(movie.stream_id); } catch (e) {}
        hideLoading();
        const title = movie.name || '';
        const plot = info?.info?.plot || '';
        const cast = info?.info?.cast || '';
        const genre = info?.info?.genre || movie.category_name || '';
        const rating = info?.info?.rating || movie.rating || '';
        const year = info?.info?.year || movie.year || '';
        const duration = info?.info?.duration || '';
        const img = movie.stream_icon || '';

        let meta = '';
        if (year) meta += '<span class="meta-badge"><i class="fas fa-calendar"></i> ' + esc(year) + '</span>';
        if (rating) meta += '<span class="meta-badge"><i class="fas fa-star" style="color:var(--warning)"></i> ' + esc(String(rating)) + '</span>';
        if (duration) meta += '<span class="meta-badge"><i class="fas fa-clock"></i> ' + esc(duration) + '</span>';
        if (genre) meta += '<span class="meta-badge"><i class="fas fa-tag"></i> ' + esc(genre) + '</span>';

        const prog = WatchStore.getProgress('movie', movie.stream_id) || WatchStore.getProgress('vod', movie.stream_id);
        const hasResume = prog && !prog.isCompleted && prog.lastWatchedPosition > 5;
        const resumeBtn = hasResume ? '<button class="btn-watch secondary" id="btn-resume-movie"><i class="fas fa-redo"></i> Continue Assistindo (' + player.fmt(prog.lastWatchedPosition) + ')</button>' : '';
        const trailerBtn = '<button class="btn-watch secondary" id="btn-trailer-movie" disabled><i class="fas fa-film"></i> Trailer</button>';

        const imgTag = '<img class="detail-poster" src="' + safeImg(img) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'assets/images/placeholder.svg\'" alt="">';
        content.innerHTML = '<div class="detail-header">' + imgTag + '<div class="detail-info"><h2>' + esc(title) + '</h2><div class="detail-meta">' + meta + '</div>' + (plot ? '<p class="detail-desc">' + esc(plot) + '</p>' : '<p class="detail-desc">Sem descricao disponivel.</p>') + (cast ? '<p class="detail-desc" style="margin-top:-8px"><strong>Elenco:</strong> ' + esc(cast) + '</p>' : '') + '<div class="detail-actions">' + resumeBtn + '<button class="btn-watch" id="btn-play-movie"><i class="fas fa-play"></i> Assistir Agora</button>' + trailerBtn + '</div></div></div>';
        $('btn-play-movie')?.addEventListener('click', () => {
            WatchStore.record('movie', movie.stream_id, title);
            modal.classList.add('hidden');
            const ext = info?.movie_data?.container_extension || movie.container_extension || 'mp4';
            player.play(api.getVideoUrl('movie', movie.stream_id, ext), title, 'movie', { streamId: movie.stream_id, resumeAt: 0 });
        });
        $('btn-resume-movie')?.addEventListener('click', () => {
            WatchStore.record('movie', movie.stream_id, title);
            modal.classList.add('hidden');
            const ext = info?.movie_data?.container_extension || movie.container_extension || 'mp4';
            player.play(api.getVideoUrl('movie', movie.stream_id, ext), title, 'movie', { streamId: movie.stream_id, resumeAt: prog ? prog.lastWatchedPosition : 0 });
        });
        modal.classList.remove('hidden');
    }

    async function showSeriesDetail(series) {
        if (ContentFilter.isAdult(series.name || series.category_name || '') && !state.adultUnlocked) {
            requirePin(() => { state.adultUnlocked = true; showSeriesDetail(series); });
            return;
        }
        const modal = $('detail-modal');
        const content = $('detail-content');
        showLoading('Carregando...');
        const sid = series.series_id || series.stream_id;
        let info = null;
        try { info = await api.getSeriesInfo(sid); } catch (e) {}
        hideLoading();

        const img = series.cover || series.stream_icon || '';
        const title = series.name || '';
        const plot = info?.info?.plot || '';
        const genre = info?.info?.genre || series.category_name || '';
        const rating = info?.info?.rating || '';
        const episodes = info?.episodes || {};
        const seasonKeys = Object.keys(episodes).sort((a, b) => Number(a) - Number(b));
        const seasons = seasonKeys.length ? seasonKeys.map(k => ({ season_number: k })) : (info?.seasons || []);

        let meta = '';
        if (rating) meta += '<span class="meta-badge"><i class="fas fa-star" style="color:var(--warning)"></i> ' + esc(String(rating)) + '</span>';
        if (genre) meta += '<span class="meta-badge"><i class="fas fa-tag"></i> ' + esc(genre) + '</span>';
        if (seasons.length) meta += '<span class="meta-badge"><i class="fas fa-layer-group"></i> ' + seasons.length + ' Temp.</span>';

        let seasonsHtml = '';
        if (seasons.length) {
            seasonsHtml = '<div class="seasons-pills" id="seasons-pills">' +
                seasons.map((s, i) => '<button class="season-pill' + (i === 0 ? ' active' : '') + '" data-season="' + s.season_number + '">T' + s.season_number + '</button>').join('') +
                '</div><div class="episodes-grid" id="episodes-grid"></div>';
        }

        const serImgTag = '<img class="detail-poster" src="' + safeImg(img) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'assets/images/placeholder.svg\'" alt="">';
        content.innerHTML = '<div class="detail-header">' + serImgTag + '<div class="detail-info"><h2>' + esc(title) + '</h2><div class="detail-meta">' + meta + '</div>' + (plot ? '<p class="detail-desc">' + esc(plot) + '</p>' : '<p class="detail-desc">Sem descricao disponivel.</p>') + '</div></div>' + seasonsHtml;

        if (seasons.length) {
            renderEpisodes(sid, seasons[0].season_number, episodes);
            document.querySelectorAll('.season-pill').forEach(pill => {
                pill.addEventListener('click', async () => {
                    document.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    const sn = String(pill.dataset.season);
                    renderEpisodes(sid, sn, episodes);
                });
            });
        }

        modal.classList.remove('hidden');
    }

    function renderEpisodes(sid, seasonNum, allEpisodes) {
        const eps = allEpisodes[seasonNum] || [];
        const c = $('episodes-grid');
        if (!eps.length) { c.innerHTML = '<div class="empty-state"><p>Nenhum episodio encontrado</p></div>'; return; }
        c.innerHTML = eps.map(ep => '<div class="episode-card" data-id="' + ep.id + '" data-title="' + esc(ep.title || 'Ep ' + ep.episode_number) + '" data-ext="' + esc(ep.container_extension || 'mp4') + '"><div class="episode-num">' + ep.episode_number + '</div><div class="ep-info"><div class="ep-name">' + esc(ep.title || 'Episodio ' + ep.episode_number) + '</div>' + (ep.container_extension ? '<div class="ep-meta">.' + esc(ep.container_extension) + '</div>' : '') + '</div><button class="ep-play"><i class="fas fa-play"></i></button></div>').join('');
        c.querySelectorAll('.episode-card').forEach(card => {
            card.addEventListener('click', () => {
                const epId = card.dataset.id;
                const epTitle = card.dataset.title;
                const epExt = card.dataset.ext || 'mp4';
                $('detail-modal').classList.add('hidden');
                WatchStore.record('series', epId, epTitle);
                const prog = WatchStore.getProgress('series', epId);
                const resumeAt = prog && !prog.isCompleted && prog.lastWatchedPosition > 5 ? prog.lastWatchedPosition : 0;
                player.play(api.getVideoUrl('series', epId, epExt), epTitle, 'series', { streamId: epId, resumeAt });
            });
        });
    }

    window.playItem = (type, id, title) => {
        if (ContentFilter.isAdult(title || '') && !state.adultUnlocked) {
            requirePin(() => { state.adultUnlocked = true; window.playItem(type, id, title); });
            return;
        }
        $('detail-modal').classList.add('hidden');
        WatchStore.record(type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'live', id, title);
        const progType = type === 'movie' ? 'movie' : type;
        const prog = WatchStore.getProgress(progType, id);
        const resumeAt = prog && !prog.isCompleted && prog.lastWatchedPosition > 5 ? prog.lastWatchedPosition : 0;
        if (type === 'live') {
            player.play(api.getStreamUrl('live', id), title, 'live', { streamId: id });
        } else {
            const ext = 'mp4';
            player.play(api.getVideoUrl(type, id, ext), title, type, { streamId: id, resumeAt });
        }
    };

    function renderPills(containerId, cats, onSelect) {
        const c = document.getElementById(containerId);
        if (!c) return;
        const all = containerId.indexOf('movie') === 0 ? state.allMovies : containerId.indexOf('series') === 0 ? state.allSeries : null;
        const counts = all ? new Map() : null;
        if (all) all.forEach(m => { const k = String(m.category_id); counts.set(k, (counts.get(k) || 0) + 1); });
        const total = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
        c.innerHTML = '<button class="filter-pill active" data-cat=""><i class="fas fa-border-all"></i> Todos' + (counts ? '<span class="pill-count">' + total + '</span>' : '') + '</button>' +
            cats.slice(0, 40).map(cat => '<button class="filter-pill" data-cat="' + cat.category_id + '">' + esc(cat.category_name) + (counts ? '<span class="pill-count">' + (counts.get(String(cat.category_id)) || '') + '</span>' : '') + '</button>').join('');
        c.querySelectorAll('.filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                c.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                onSelect(pill.dataset.cat || null);
            });
        });
    }

    function renderPagination(id, total, current, onPaginate) {
        const c = document.getElementById(id);
        if (!c) return;
        const pages = Math.ceil(total / PER_PAGE);
        if (pages <= 1) { c.innerHTML = ''; return; }
        let html = '';
        if (current > 1) html += '<button class="page-btn" data-page="' + (current - 1) + '"><i class="fas fa-chevron-left"></i></button>';
        const s = Math.max(1, current - 2), e = Math.min(pages, current + 2);
        if (s > 1) html += '<button class="page-btn" data-page="1">1</button>';
        if (s > 2) html += '<span style="color:var(--text-3);padding:0 4px">...</span>';
        for (let i = s; i <= e; i++) html += '<button class="page-btn' + (i === current ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
        if (e < pages - 1) html += '<span style="color:var(--text-3);padding:0 4px">...</span>';
        if (e < pages) html += '<button class="page-btn" data-page="' + pages + '">' + pages + '</button>';
        if (current < pages) html += '<button class="page-btn" data-page="' + (current + 1) + '"><i class="fas fa-chevron-right"></i></button>';
        c.innerHTML = html;
        c.querySelectorAll('.page-btn').forEach(btn => btn.addEventListener('click', () => onPaginate(parseInt(btn.dataset.page))));
    }

    function formatTimeForDisplay(date) {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mm;
    }

    function calculateCurrentEventProgress(start, end) {
        if (!start || !end) return 0;
        const s = start.getTime(), e = end.getTime(), now = Date.now();
        if (e <= s) return 0;
        return Math.max(0, Math.min(100, ((now - s) / (e - s)) * 100));
    }

    function getCurrentProgramTitle(listing) {
        if (!listing) return 'Sem titulo';
        let t = listing.title || listing.title_2 || '';
        if (/^[A-Za-z0-9+/=]+$/.test(t) && t.length > 4) {
            try { t = decodeURIComponent(escape(atob(t))); } catch (e) {}
        }
        return t || 'Sem titulo';
    }

    function hasPlaybackAvailable(start, end, archiveDays) {
        if (!archiveDays || archiveDays <= 0 || !start) return false;
        const now = new Date();
        if (start > now) return false;
        const cutoff = new Date(now.getTime());
        cutoff.setDate(cutoff.getDate() - archiveDays);
        return start >= cutoff;
    }

    function generatePlaybackUrl(streamId, startDate) {
        if (!api.username || !api.password) return null;
        const fmt = new Date(startDate.getTime() - startDate.getTimezoneOffset() * 60000);
        const yyyy = fmt.getFullYear();
        const MM = String(fmt.getMonth() + 1).padStart(2, '0');
        const dd = String(fmt.getDate()).padStart(2, '0');
        const HH = String(fmt.getHours()).padStart(2, '0');
        const mm = String(fmt.getMinutes()).padStart(2, '0');
        const start = yyyy + '-' + MM + '-' + dd + ':' + HH + '-' + mm;
        return api.getTimeshiftUrl(streamId, start);
    }

    $('epg-reserve-btn')?.addEventListener('click', () => {
        const cur = state.currentEpg;
        if (!cur) return;
        const nowReserved = ReservationStore.toggle(cur.streamId, cur.rawStart, cur.title, '');
        $('epg-reserve-btn').classList.toggle('active', nowReserved);
        showToast(nowReserved ? 'Programa reservado' : 'Reserva removida', 'success');
    });

    $('epg-timeshift-btn')?.addEventListener('click', () => {
        const cur = state.currentEpg;
        if (!cur) return;
        const stream = state.allLive.find(s => String(s.stream_id) === String(cur.streamId));
        const archive = stream ? parseInt(stream.tv_archive_duration, 10) || 0 : 0;
        if (archive <= 0 || !hasPlaybackAvailable(cur.start, cur.end, archive)) {
            showToast('Timeshift indisponivel para este canal', 'error');
            return;
        }
        const url = generatePlaybackUrl(cur.streamId, cur.start);
        if (!url) { showToast('Falha ao montar URL de timeshift', 'error'); return; }
        player.play(url, cur.title + ' (Timeshift)', 'live', { streamId: cur.streamId });
    });

    function shouldIncludeByYear(title, year) {
        if (!year || year === 'Todos') return true;
        if (!title) return false;
        return String(title).includes(year);
    }

    function buildFilterAnoOptions() {
        const opts = ['Todos'];
        const current = new Date().getFullYear();
        for (let y = current; y >= 1900; y--) opts.push(String(y));
        return opts;
    }

    function getFilterGeneros(tipo) {
        if (tipo === 'Kids') return ['Todos'];
        const cats = tipo === 'Séries' ? state.seriesCats : state.vodCats;
        const out = ['Todos'];
        const seen = new Set();
        cats.forEach(c => {
            const n = ContentFilter.cleanCategoryName(c.category_name || '');
            if (!n || ContentFilter.isAdult(n) || seen.has(n)) return;
            seen.add(n);
            out.push(n);
        });
        return out;
    }

    function renderFilterPills() {
        const tipoEl = $('filter-tipo-pills');
        const generoEl = $('filter-genero-pills');
        const anoEl = $('filter-ano-pills');
        if (!tipoEl || !generoEl || !anoEl) return;
        tipoEl.querySelectorAll('.filter-pill').forEach(b => b.classList.toggle('active', b.dataset.tipo === state.filterSel.tipo));
        const generos = getFilterGeneros(state.filterSel.tipo);
        if (!generos.includes(state.filterSel.genero)) state.filterSel.genero = 'Todos';
        generoEl.innerHTML = generos.map(g => '<button class="filter-pill' + (state.filterSel.genero === g ? ' active' : '') + '" data-genero="' + esc(g) + '">' + esc(g) + '</button>').join('');
        generoEl.querySelectorAll('.filter-pill').forEach(b => b.addEventListener('click', () => {
            state.filterSel.genero = b.dataset.genero || 'Todos';
            renderFilterPills();
            renderFilterResults();
        }));
        const anos = buildFilterAnoOptions();
        anoEl.innerHTML = anos.map(a => '<button class="filter-pill' + (state.filterSel.ano === a ? ' active' : '') + '" data-ano="' + a + '">' + a + '</button>').join('');
        anoEl.querySelectorAll('.filter-pill').forEach(b => b.addEventListener('click', () => {
            state.filterSel.ano = b.dataset.ano || 'Todos';
            renderFilterPills();
            renderFilterResults();
        }));
    }

    function getFilterResults() {
        const { tipo, genero, ano } = state.filterSel;
        if (tipo === 'Kids') {
            return [
                ...state.allMovies.filter(m => ContentFilter.isKids(m.name || m.category_name || '')),
                ...state.allSeries.filter(s => ContentFilter.isKids(s.name || s.category_name || ''))
            ].filter(i => shouldIncludeByYear(i.name, ano)).slice(0, 200);
        }
        const isSeries = tipo === 'Séries';
        let pool = (isSeries ? state.allSeries : state.allMovies).filter(i => !ContentFilter.isAdult(i.name || ''));
        if (genero && genero !== 'Todos') {
            const cats = isSeries ? state.seriesCats : state.vodCats;
            const catIds = new Set(cats.filter(c => ContentFilter.cleanCategoryName(c.category_name || '') === genero).map(c => String(c.category_id)));
            pool = pool.filter(i => catIds.has(String(i.category_id)) || (i.category_name || '').includes(genero));
        }
        return pool.filter(i => shouldIncludeByYear(i.name, ano)).slice(0, 200);
    }

    function renderFilterResults() {
        const grid = $('filter-results');
        const empty = $('filter-no-results');
        if (!grid) return;
        const results = getFilterResults();
        grid.innerHTML = '';
        results.forEach(item => {
            const type = item.series_id || item.episode_count ? 'series' : 'movie';
            grid.appendChild(createCard(item, type));
        });
        empty?.classList.toggle('hidden', results.length > 0);
    }

    function openFilterModal(tipo) {
        if (tipo) state.filterSel.tipo = tipo;
        renderFilterPills();
        renderFilterResults();
        $('filter-modal')?.classList.remove('hidden');
    }

    $('btn-open-filter')?.addEventListener('click', () => openFilterModal('Filmes'));
    $('btn-open-filter-series')?.addEventListener('click', () => openFilterModal('Séries'));
    $('btn-close-filter')?.addEventListener('click', () => $('filter-modal')?.classList.add('hidden'));
    $('btn-filter-apply')?.addEventListener('click', () => { renderFilterResults(); showToast('Filtro aplicado', 'success'); });
    document.querySelectorAll('#filter-tipo-pills .filter-pill').forEach(b => b.addEventListener('click', () => {
        state.filterSel.tipo = b.dataset.tipo || 'Filmes';
        state.filterSel.genero = 'Todos';
        renderFilterPills();
        renderFilterResults();
    }));

    let parentalAction = null;
    let parentalFirstPin = '';
    let parentalConfirming = false;

    function getPinFromDigits() {
        return ['pin-1', 'pin-2', 'pin-3', 'pin-4'].map(id => ($(id)?.value || '')).join('');
    }

    function clearPinDigits() {
        ['pin-1', 'pin-2', 'pin-3', 'pin-4'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    }

    function setParentalMsg(text, isError) {
        const msg = $('parental-msg');
        const err = $('parental-error');
        if (msg) msg.textContent = text;
        if (err) { err.classList.add('hidden'); err.textContent = ''; }
        if (isError && err) { err.textContent = text; err.classList.remove('hidden'); }
    }

    function focusFirstPin() { $('pin-1')?.focus(); }

    function showParentalModal(onSuccess) {
        parentalAction = onSuccess || null;
        parentalFirstPin = '';
        parentalConfirming = false;
        clearPinDigits();
        const has = ParentalControlStore.hasPin();
        setParentalMsg(has ? 'Senha:' : 'Cadastre um PIN de acesso adulto:', false);
        $('btn-pin-remove')?.classList.toggle('hidden', !has);
        $('parental-modal')?.classList.remove('hidden');
        setTimeout(focusFirstPin, 50);
    }

    function hideParentalModal() {
        $('parental-modal')?.classList.add('hidden');
        parentalAction = null;
        parentalFirstPin = '';
        parentalConfirming = false;
        clearPinDigits();
    }

    function handlePinConfirmation() {
        const pin = getPinFromDigits();
        if (pin.length !== 4) { setParentalMsg('Digite os 4 digitos', true); clearPinDigits(); focusFirstPin(); return; }
        if (ParentalControlStore.hasPin()) {
            if (ParentalControlStore.validate(pin)) {
                const cb = parentalAction;
                hideParentalModal();
                if (cb) cb();
            } else {
                setParentalMsg('Senha incorreta:', true);
                clearPinDigits();
                focusFirstPin();
            }
            return;
        }
        if (!parentalConfirming) {
            parentalFirstPin = pin;
            parentalConfirming = true;
            setParentalMsg('Repita o PIN:', false);
            clearPinDigits();
            focusFirstPin();
            return;
        }
        if (parentalFirstPin === pin) {
            ParentalControlStore.savePin(pin);
            const cb = parentalAction;
            hideParentalModal();
            showToast('PIN configurado com sucesso', 'success');
            if (cb) cb();
        } else {
            parentalFirstPin = '';
            parentalConfirming = false;
            setParentalMsg('PINs nao coincidem. Cadastre um PIN de acesso adulto:', true);
            clearPinDigits();
            focusFirstPin();
        }
    }

    function requirePin(onSuccess) {
        if (!ParentalControlStore.hasPin()) {
            showParentalModal(onSuccess);
            return true;
        }
        showParentalModal(onSuccess);
        return true;
    }

    ['pin-1', 'pin-2', 'pin-3', 'pin-4'].forEach((id, i, arr) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('input', () => {
            el.value = el.value.replace(/\D/g, '').slice(0, 1);
            if (el.value && i < 3) $(arr[i + 1])?.focus();
            if (getPinFromDigits().length === 4) handlePinConfirmation();
        });
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !el.value && i > 0) { $(arr[i - 1])?.focus(); }
            if (e.key === 'Enter') handlePinConfirmation();
        });
    });
    $('btn-pin-confirm')?.addEventListener('click', handlePinConfirmation);
    $('btn-pin-cancel')?.addEventListener('click', hideParentalModal);
    $('btn-pin-remove')?.addEventListener('click', () => {
        const pin = getPinFromDigits();
        if (pin.length !== 4 || !ParentalControlStore.validate(pin)) {
            setParentalMsg('Digite o PIN atual para remover:', true);
            clearPinDigits();
            focusFirstPin();
            return;
        }
        ParentalControlStore.remove();
        hideParentalModal();
        showToast('PIN removido', 'success');
    });

    const FOOTBALL_BASE = 'https://webws.365scores.com/web/';
    let footballDates = [];

    function footballTeamLogo(id) {
        return 'https://imagecache.365scores.com/image/upload/f_png,w_68,h_68,c_limit,q_auto:eco,dpr_2,d_Competitors:default1.png/v1/Competitors/' + id;
    }

    function footballCompLogo(id) {
        return 'https://imagecache.365scores.com/image/upload/f_png,w_68,h_68,c_limit,q_auto:eco,dpr_2,d_Countries:Round:21.png/v6/Competitions/' + id;
    }

    function footballDateKey(d) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + d.getFullYear();
    }

    function footballIsoKey(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function buildFootballDates() {
        const arr = [];
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        for (let i = 0; i < 3; i++) {
            const d = new Date(start.getTime());
            d.setDate(start.getDate() + i);
            arr.push(d);
        }
        return arr;
    }

    async function fetchFootballData() {
        const params = 'appTypeId=5&langId=31&timezoneName=' + encodeURIComponent('America/Sao_Paulo') + '&userCountryId=21&sports=1';
        const dates = buildFootballDates();
        const range = params + '&startDate=' + encodeURIComponent(footballDateKey(dates[0])) + '&endDate=' + encodeURIComponent(footballDateKey(dates[2])) + '&showOdds=false&onlyMajorGames=false&withTop=false';
        const allRes = await fetch(FOOTBALL_BASE + 'games/allscores/?' + range);
        if (!allRes.ok) throw new Error('allscores HTTP ' + allRes.status);
        const allData = await allRes.json();
        const comps = allData.competitions || [];
        const countries = {};
        (allData.countries || []).forEach(c => { countries[c.id] = c.name; });
        const compMap = {};
        comps.forEach(c => { compMap[c.id] = { id: c.id, name: c.name || '', country: countries[c.countryId] || '' }; });
        state.jogosComps = compMap;
        let games = [];
        const ids = comps.map(c => c.id);
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10).join(',');
            try {
                const gRes = await fetch(FOOTBALL_BASE + 'games/current/?' + params + '&competitions=' + encodeURIComponent(chunk));
                if (!gRes.ok) continue;
                const gData = await gRes.json();
                if (Array.isArray(gData.games)) games = games.concat(gData.games);
            } catch (e) {}
        }
        return games.map(g => {
            const home = g.homeCompetitor || {};
            const away = g.awayCompetitor || {};
            return {
                id: g.id,
                competitionId: g.competitionId,
                startTime: g.startTime || '',
                status: g.statusText || g.gameTime || '',
                home: { id: home.id || 0, name: home.name || 'Time A', score: g.homeScore != null ? g.homeScore : (home.score != null ? home.score : null) },
                away: { id: away.id || 0, name: away.name || 'Time B', score: g.awayScore != null ? g.awayScore : (away.score != null ? away.score : null) }
            };
        });
    }

    function renderJogosDates() {
        const el = $('jogos-dates');
        if (!el) return;
        const labels = ['Hoje', 'Amanha'];
        el.innerHTML = footballDates.map((d, i) => {
            const active = i === state.jogosDateIdx ? ' active' : '';
            const label = labels[i] || footballDateKey(d).slice(0, 5);
            return '<button class="jogo-date-chip' + active + '" data-idx="' + i + '">' + label + '</button>';
        }).join('');
        el.querySelectorAll('.jogo-date-chip').forEach(b => b.addEventListener('click', () => {
            state.jogosDateIdx = parseInt(b.dataset.idx, 10) || 0;
            renderJogosDates();
            renderJogosGames();
        }));
    }

    function renderJogosGames() {
        const grid = $('jogos-grid');
        if (!grid) return;
        const sel = footballDates[state.jogosDateIdx] || footballDates[0];
        const selKey = sel ? footballIsoKey(sel) : '';
        const dayGames = state.jogosGames.filter(g => {
            if (!g.startTime) return false;
            const d = new Date(g.startTime);
            return !isNaN(d.getTime()) && footballIsoKey(d) === selKey;
        }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
        if (!dayGames.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-futbol"></i><p>Nenhum jogo encontrado para esta data</p></div>';
            return;
        }
        grid.innerHTML = dayGames.map(g => {
            const comp = state.jogosComps[g.competitionId] || {};
            const compImg = g.competitionId ? footballCompLogo(g.competitionId) : '';
            const homeImg = g.home.id ? footballTeamLogo(g.home.id) : '';
            const awayImg = g.away.id ? footballTeamLogo(g.away.id) : '';
            const hs = g.home.score != null ? g.home.score : '-';
            const as = g.away.score != null ? g.away.score : '-';
            const time = g.startTime ? formatTimeForDisplay(new Date(g.startTime)) : '';
            return '<div class="game-card">' +
                (comp.name ? '<div class="game-comp"><img src="' + compImg + '" alt="" onerror="this.style.display=\'none\'"><span>' + esc(comp.name) + '</span></div>' : '') +
                '<div class="game-row"><img class="team-logo" src="' + homeImg + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="team-name">' + esc(g.home.name) + '</span><span class="team-score">' + hs + '</span></div>' +
                '<div class="game-row"><img class="team-logo" src="' + awayImg + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="team-name">' + esc(g.away.name) + '</span><span class="team-score">' + as + '</span></div>' +
                '<div class="game-foot"><span class="game-time">' + time + '</span>' + (g.status ? '<span class="game-status">' + esc(g.status) + '</span>' : '') + '</div>' +
                '</div>';
        }).join('');
    }

    let jogosLoading = false;
    async function renderJogos() {
        renderJogosDates();
        if (state.jogosLoaded || jogosLoading) {
            renderJogosGames();
            return;
        }
        jogosLoading = true;
        footballDates = buildFootballDates();
        const grid = $('jogos-grid');
        if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-circle-notch fa-spin"></i><p>Carregando jogos...</p></div>';
        try {
            state.jogosGames = await fetchFootballData();
            state.jogosLoaded = true;
        } catch (e) {
            state.jogosGames = [];
            state.jogosLoaded = true;
            if (grid) grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><i class="fas fa-futbol"></i><p>Nao foi possivel carregar os jogos (rede/CORS)</p></div>';
            jogosLoading = false;
            renderJogosDates();
            return;
        }
        jogosLoading = false;
        renderJogosDates();
        renderJogosGames();
    }

    $('btn-history-delete-mode')?.addEventListener('click', () => {
        state.historyDeleteMode = !state.historyDeleteMode;
        $('btn-history-delete-mode').classList.toggle('active', state.historyDeleteMode);
        renderFavoritesSection();
    });
    $('btn-history-clear')?.addEventListener('click', () => {
        WatchStore.clearHistory();
        state.historyDeleteMode = false;
        $('btn-history-delete-mode')?.classList.remove('active');
        renderFavoritesSection();
        showToast('Historico limpo', 'success');
    });
    $('btn-history-clear-live')?.addEventListener('click', () => {
        WatchStore.clearHistoryByType('live');
        renderFavoritesSection();
        showToast('Historico de TV limpo', 'success');
    });
    $('btn-history-clear-movie')?.addEventListener('click', () => {
        WatchStore.clearHistoryByType('movie');
        renderFavoritesSection();
        showToast('Historico de filmes limpo', 'success');
    });
    $('btn-history-clear-series')?.addEventListener('click', () => {
        WatchStore.clearHistoryByType('series');
        renderFavoritesSection();
        showToast('Historico de series limpo', 'success');
    });

    function gatedFavClear(fn) {
        const run = () => { fn(); renderFavoritesSection(); };
        if (ParentalControlStore.hasPin()) requirePin(run);
        else run();
    }
    $('btn-fav-clear-live')?.addEventListener('click', () => gatedFavClear(() => { FavoriteStore.clearType('live'); showToast('Favoritos de TV removidos', 'success'); }));
    $('btn-fav-clear-movie')?.addEventListener('click', () => gatedFavClear(() => { FavoriteStore.clearType('movie'); showToast('Favoritos de filmes removidos', 'success'); }));
    $('btn-fav-clear-series')?.addEventListener('click', () => gatedFavClear(() => { FavoriteStore.clearType('series'); showToast('Favoritos de series removidos', 'success'); }));
    $('btn-fav-clear-all')?.addEventListener('click', () => gatedFavClear(() => { FavoriteStore.clearAll(); showToast('Todos os favoritos removidos', 'success'); }));

    $('btn-close-detail')?.addEventListener('click', () => $('detail-modal').classList.add('hidden'));
    document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', (e) => {
        if (e.target !== m) return;
        if (m.id === 'resume-modal') return;
        m.classList.add('hidden');
        if (m.id === 'player-modal') player.stop();
    }));

    bootApp();
});
