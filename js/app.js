document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
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

    // Loading animation
    let loadingFrame = 0;
    let loadingInterval = null;

    function showLoading(text = 'Carregando...') {
        loadingText.textContent = text;
        loadingOverlay.classList.remove('hidden');
        loadingFrame = 0;
        loadingInterval = setInterval(() => {
            loadingFrame = (loadingFrame + 1) % 8;
            loadingImg.src = `assets/images/loading_${loadingFrame}.png`;
        }, 150);
    }

    function hideLoading() {
        loadingOverlay.classList.add('hidden');
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    function showError(msg) {
        loginError.textContent = msg;
        loginError.classList.remove('hidden');
        setTimeout(() => loginError.classList.add('hidden'), 5000);
    }

    // Update clock
    function updateClock() {
        const now = new Date();
        currentTimeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const server = document.getElementById('server-url').value.trim();
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        
        if (!server || !user || !pass) {
            showError('Preencha todos os campos');
            return;
        }

        btnLogin.disabled = true;
        btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
        showLoading('Conectando ao servidor...');

        api.setCredentials(server, user, pass);

        try {
            const success = await api.authenticate();
            
            if (success && api.userData) {
                loginScreen.classList.remove('active');
                mainApp.classList.add('active');
                userDisplay.textContent = api.userData.username || user;
                
                showLoading('Carregando conteúdo...');
                await loadInitialData();
                hideLoading();
            } else {
                hideLoading();
                showError('Credenciais inválidas ou servidor inacessível');
            }
        } catch (err) {
            hideLoading();
            showError('Erro ao conectar: ' + err.message);
        }

        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
    });

    // Logout
    btnLogout.addEventListener('click', () => {
        mainApp.classList.remove('active');
        loginScreen.classList.add('active');
        api.cache.clear();
        allLiveStreams = [];
        allVodStreams = [];
        allSeries = [];
    });

    // Mobile menu
    btnMenu.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && e.target !== btnMenu) {
                sidebar.classList.remove('open');
            }
        }
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            navigateTo(section);
            sidebar.classList.remove('open');
        });
    });

    function navigateTo(section) {
        currentSection = section;
        currentCategoryId = null;
        
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
        
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${section}`)?.classList.add('active');
    }

    // Search
    btnSearchGo.addEventListener('click', () => performSearch());
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });

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
                container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Nenhum resultado encontrado</p>';
            } else {
                results.forEach(item => {
                    container.appendChild(createContentCard(item));
                });
            }
        } catch (e) {
            console.error('Search error:', e);
        }
        
        hideLoading();
    }

    // Load initial data
    async function loadInitialData() {
        try {
            const [liveCats, vodCats, seriesCats, liveStreams, vodStreams, seriesData] = await Promise.all([
                api.getLiveCategories(),
                api.getVodCategories(),
                api.getSeriesCategories(),
                api.getLiveStreams(),
                api.getVodStreams(),
                api.getSeries()
            ]);

            allLiveStreams = Array.isArray(liveStreams) ? liveStreams : [];
            allVodStreams = Array.isArray(vodStreams) ? vodStreams : [];
            allSeries = Array.isArray(seriesData) ? seriesData : [];

            loadHome(liveCats, vodCats, seriesCats, allLiveStreams, allVodStreams);
            loadLiveCategories(Array.isArray(liveCats) ? liveCats : []);
            loadChannels(allLiveStreams);
            loadMoviesCategories(Array.isArray(vodCats) ? vodCats : []);
            loadMovies(allVodStreams);
            loadSeries(allSeries);
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    function loadHome(liveCats, vodCats, seriesCats, liveStreams, vodStreams) {
        // Categories
        const categoriesContainer = document.getElementById('home-categories');
        categoriesContainer.innerHTML = '';
        
        const icons = {
            'filmes': 'assets/icons/genero_movies.png',
            'series': 'assets/icons/genero_series.png',
            'live': 'assets/icons/live_channel_default_icon.png',
            'default': 'assets/icons/todos_movies.png'
        };
        
        const allCategories = [
            ...(Array.isArray(liveCats) ? liveCats.slice(0, 4) : []).map(c => ({ ...c, type: 'live', icon: icons.live })),
            ...(Array.isArray(vodCats) ? vodCats.slice(0, 4) : []).map(c => ({ ...c, type: 'vod', icon: icons.filmes })),
            ...(Array.isArray(seriesCats) ? seriesCats.slice(0, 4) : []).map(c => ({ ...c, type: 'series', icon: icons.series }))
        ];
        
        allCategories.forEach(cat => {
            const div = document.createElement('div');
            div.className = 'category-card';
            div.innerHTML = `
                <img src="${cat.icon || icons.default}" alt="${cat.category_name}">
                <span>${cat.category_name}</span>
            `;
            div.addEventListener('click', () => {
                if (cat.type === 'live') {
                    navigateTo('live');
                    filterByCategory(cat.category_id, 'live');
                } else if (cat.type === 'vod') {
                    navigateTo('movies');
                    filterByCategory(cat.category_id, 'vod');
                } else {
                    navigateTo('series');
                    filterByCategory(cat.category_id, 'series');
                }
            });
            categoriesContainer.appendChild(div);
        });

        // Popular channels
        const popularContainer = document.getElementById('popular-channels');
        popularContainer.innerHTML = '';
        (Array.isArray(liveStreams) ? liveStreams.slice(0, 20) : []).forEach(stream => {
            popularContainer.appendChild(createChannelCard(stream));
        });

        // Highlights slider
        const slider = document.getElementById('highlights-slider');
        slider.innerHTML = '';
        (Array.isArray(vodStreams) ? vodStreams.slice(0, 8) : []).forEach(stream => {
            const card = document.createElement('div');
            card.className = 'highlight-card';
            const img = stream.stream_icon || stream.cover || 'assets/icons/live_channel_default_icon.png';
            card.innerHTML = `
                <img src="${img}" alt="${stream.name}" onerror="this.src='assets/icons/live_channel_default_icon.png'">
                <div class="highlight-overlay">
                    <h3>${stream.name}</h3>
                    <p>${stream.rating || stream.year || 'Filme'}</p>
                </div>
            `;
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
        allBtn.addEventListener('click', () => {
            document.querySelectorAll('#live-categories .category-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            currentCategoryId = null;
            loadChannels(allLiveStreams);
        });
        container.appendChild(allBtn);
        
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.textContent = cat.category_name;
            btn.addEventListener('click', () => {
                document.querySelectorAll('#live-categories .category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategoryId = cat.category_id;
                const filtered = allLiveStreams.filter(s => s.category_id === cat.category_id);
                loadChannels(filtered);
            });
            container.appendChild(btn);
        });
    }

    function loadChannels(channels) {
        const container = document.getElementById('channel-list');
        container.innerHTML = '';
        
        if (!channels || channels.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Nenhum canal encontrado</p>';
            return;
        }
        
        channels.forEach(stream => {
            container.appendChild(createChannelCard(stream));
        });
    }

    function createChannelCard(stream) {
        const card = document.createElement('div');
        card.className = 'channel-card';
        const icon = stream.stream_icon || 'assets/icons/live_channel_default_icon.png';
        card.innerHTML = `
            <img src="${icon}" alt="${stream.name}" onerror="this.src='assets/icons/live_channel_default_icon.png'">
            <div class="channel-info">
                <div class="channel-name">${stream.name}</div>
                <div class="channel-epg">${stream.category_name || ''}</div>
            </div>
        `;
        card.addEventListener('click', () => playLiveChannel(stream));
        return card;
    }

    function loadMoviesCategories(categories) {
        const container = document.getElementById('movie-categories-filter');
        container.innerHTML = '';
        
        const allBtn = document.createElement('button');
        allBtn.className = 'filter-btn active';
        allBtn.textContent = 'Todos';
        allBtn.dataset.filter = 'all';
        allBtn.addEventListener('click', () => {
            document.querySelectorAll('#section-movies .filter-btn').forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            loadMovies(allVodStreams);
        });
        container.appendChild(allBtn);
        
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.textContent = cat.category_name;
            btn.dataset.filter = cat.category_id;
            btn.addEventListener('click', () => {
                document.querySelectorAll('#section-movies .filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filtered = allVodStreams.filter(s => s.category_id === cat.category_id);
                loadMovies(filtered);
            });
            container.appendChild(btn);
        });
    }

    function loadMovies(movies) {
        const container = document.getElementById('movies-grid');
        container.innerHTML = '';
        
        if (!movies || movies.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Nenhum filme encontrado</p>';
            return;
        }
        
        movies.forEach(stream => {
            container.appendChild(createContentCard(stream, 'movie'));
        });
    }

    function loadSeries(series) {
        const container = document.getElementById('series-grid');
        container.innerHTML = '';
        
        if (!series || series.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px;">Nenhuma série encontrada</p>';
            return;
        }
        
        series.forEach(s => {
            container.appendChild(createContentCard(s, 'series'));
        });
    }

    function createContentCard(item, type = '') {
        const card = document.createElement('div');
        card.className = 'content-card';
        
        const img = item.stream_icon || item.cover || item.image || 'assets/icons/live_channel_default_icon.png';
        const title = item.name || item.title || 'Sem título';
        const rating = item.rating || '';
        
        let badge = '';
        if (type === 'movie') badge = '<div class="card-badge">FILME</div>';
        else if (type === 'series') badge = '<div class="card-badge">SÉRIE</div>';
        else if (item.contentType) badge = `<div class="card-badge">${item.contentType}</div>`;
        
        card.innerHTML = `
            ${badge}
            <img class="poster" src="${img}" alt="${title}" onerror="this.src='assets/icons/live_channel_default_icon.png'">
            <div class="card-info">
                <div class="card-title">${title}</div>
                ${rating ? `<div class="card-rating"><i class="fas fa-star"></i> ${rating}</div>` : ''}
            </div>
        `;
        
        if (type === 'movie' || item.type === 'vod') {
            card.addEventListener('click', () => showMovieDetail(item));
        } else if (type === 'series' || item.type === 'series') {
            card.addEventListener('click', () => showSeriesDetail(item));
        } else {
            card.addEventListener('click', () => playLiveChannel(item));
        }
        
        return card;
    }

    function playLiveChannel(stream) {
        const url = api.getStreamUrl('live', stream.stream_id);
        player.play(url, stream.name, 'live');
    }

    function filterByCategory(categoryId, type) {
        currentCategoryId = categoryId;
        if (type === 'live') {
            const filtered = allLiveStreams.filter(s => s.category_id === categoryId);
            loadChannels(filtered);
        } else if (type === 'vod') {
            const filtered = allVodStreams.filter(s => s.category_id === categoryId);
            loadMovies(filtered);
        } else if (type === 'series') {
            const filtered = allSeries.filter(s => s.category_id === categoryId);
            loadSeries(filtered);
        }
    }

    async function showMovieDetail(movie) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        
        showLoading('Carregando detalhes...');
        
        try {
            let vodInfo = null;
            try {
                vodInfo = await api.getVodInfo(movie.stream_id);
            } catch (e) {}
            
            const plot = vodInfo?.info?.plot || movie.plot || '';
            const cast = vodInfo?.info?.cast || movie.cast || '';
            const genre = vodInfo?.info?.genre || movie.category_name || '';
            const rating = vodInfo?.info?.rating || movie.rating || '';
            const year = vodInfo?.info?.year || movie.year || '';
            const duration = vodInfo?.info?.duration || '';
            const img = movie.stream_icon || movie.cover || movie.image || 'assets/icons/live_channel_default_icon.png';
            const containerImages = vodInfo?.info?.container_image || [];
            
            content.innerHTML = `
                <div class="detail-header">
                    <img class="detail-poster" src="${img}" alt="${movie.name}" onerror="this.src='assets/icons/live_channel_default_icon.png'">
                    <div class="detail-info">
                        <h2>${movie.name}</h2>
                        <div class="detail-meta">
                            ${year ? `<span><i class="fas fa-calendar"></i> ${year}</span>` : ''}
                            ${rating ? `<span><i class="fas fa-star" style="color:var(--warning)"></i> ${rating}</span>` : ''}
                            ${duration ? `<span><i class="fas fa-clock"></i> ${duration}</span>` : ''}
                            ${genre ? `<span><i class="fas fa-tag"></i> ${genre}</span>` : ''}
                        </div>
                        <p class="detail-description">${plot || 'Sem descrição disponível.'}</p>
                        ${cast ? `<p class="detail-description"><strong>Elenco:</strong> ${cast}</p>` : ''}
                        <button class="btn-play-detail" onclick="playVod(${movie.stream_id}, '${movie.name.replace(/'/g, "\\'")}')">
                            <i class="fas fa-play"></i> Assistir
                        </button>
                    </div>
                </div>
            `;
            
            modal.classList.remove('hidden');
        } catch (e) {
            console.error('Error loading movie detail:', e);
        }
        
        hideLoading();
    }

    async function showSeriesDetail(series) {
        const modal = document.getElementById('detail-modal');
        const content = document.getElementById('detail-content');
        
        showLoading('Carregando séries...');
        
        try {
            let seriesInfo = null;
            try {
                seriesInfo = await api.getSeriesInfo(series.series_id || series.stream_id);
            } catch (e) {}
            
            const img = series.cover || series.stream_icon || series.image || 'assets/icons/live_channel_default_icon.png';
            const plot = seriesInfo?.info?.plot || series.plot || '';
            const cast = seriesInfo?.info?.cast || '';
            const genre = seriesInfo?.info?.genre || series.category_name || '';
            const rating = seriesInfo?.info?.rating || '';
            const seasons = seriesInfo?.seasons || [];
            const episodes = seriesInfo?.episodes || {};
            
            let seasonsHTML = '';
            if (seasons.length > 0) {
                const firstSeason = seasons[0];
                const seasonEpisodes = episodes[firstSeason.season_number] || [];
                
                seasonsHTML = `
                    <div class="seasons-list">
                        ${seasons.map((s, i) => `
                            <button class="season-btn ${i === 0 ? 'active' : ''}" 
                                    onclick="loadSeasonEpisodes('${series.series_id || series.stream_id}', ${s.season_number}, this)">
                                Temporada ${s.season_number}
                            </button>
                        `).join('')}
                    </div>
                    <div class="episodes-list" id="episodes-list">
                        ${seasonEpisodes.map(ep => `
                            <div class="episode-item" onclick="playSeries('${ep.id}', '${ep.title?.replace(/'/g, "\\'") || 'Episódio ' + ep.episode_number}')">
                                <span class="episode-number">E${ep.episode_number}</span>
                                <div class="episode-info">
                                    <h4>${ep.title || 'Episódio ' + ep.episode_number}</h4>
                                    ${ep.container_extension ? `<p>.${ep.container_extension}</p>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            content.innerHTML = `
                <div class="detail-header">
                    <img class="detail-poster" src="${img}" alt="${series.name}" onerror="this.src='assets/icons/live_channel_default_icon.png'">
                    <div class="detail-info">
                        <h2>${series.name}</h2>
                        <div class="detail-meta">
                            ${rating ? `<span><i class="fas fa-star" style="color:var(--warning)"></i> ${rating}</span>` : ''}
                            ${genre ? `<span><i class="fas fa-tag"></i> ${genre}</span>` : ''}
                            ${seasons.length > 0 ? `<span><i class="fas fa-layer-group"></i> ${seasons.length} Temporadas</span>` : ''}
                        </div>
                        <p class="detail-description">${plot || 'Sem descrição disponível.'}</p>
                    </div>
                </div>
                ${seasonsHTML}
            `;
            
            modal.classList.remove('hidden');
        } catch (e) {
            console.error('Error loading series detail:', e);
        }
        
        hideLoading();
    }

    // Global functions for onclick handlers
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
            const episodes = info?.episodes?.[seasonNumber] || [];
            const container = document.getElementById('episodes-list');
            container.innerHTML = episodes.map(ep => `
                <div class="episode-item" onclick="playSeries('${ep.id}', '${ep.title?.replace(/'/g, "\\'") || 'Episódio ' + ep.episode_number}')">
                    <span class="episode-number">E${ep.episode_number}</span>
                    <div class="episode-info">
                        <h4>${ep.title || 'Episódio ' + ep.episode_number}</h4>
                        ${ep.container_extension ? `<p>.${ep.container_extension}</p>` : ''}
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Error loading episodes:', e);
        }
    };

    // Close detail modal
    document.getElementById('btn-close-detail')?.addEventListener('click', () => {
        document.getElementById('detail-modal').classList.add('hidden');
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                if (modal.id === 'player-modal') player.stop();
            }
        });
    });

    // Check saved credentials
    const savedServer = localStorage.getItem('unitv_server');
    const savedUser = localStorage.getItem('unitv_user');
    const savedPass = localStorage.getItem('unitv_pass');
    
    if (savedServer && savedUser && savedPass) {
        document.getElementById('server-url').value = savedServer;
        document.getElementById('username').value = savedUser;
        document.getElementById('password').value = savedPass;
    }
});
