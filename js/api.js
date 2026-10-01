window._perr = window._perr || function () { if (window.OPENTV_DEBUG) console.error.apply(console, arguments); };

class XtreamAPI {
    constructor() {
        this.serverUrl = 'https://telefunplay.xyz';
        this.username = 'TurboBrasil@2026';
        this.password = '@27101992';
        this.userData = null;
        this.serverInfo = null;
        this.cache = new Map();
        this.cacheTime = 3 * 60 * 1000;
        this.maxRetries = 2;
        this.MIN_SEARCH_LENGTH = 3;
        this.SEARCH_DELAY = 500;
        this._searchTimer = null;
        this._liveCache = [];
        this._movieCache = [];
        this._seriesCache = [];
        this._pending = new Map();
        this.timeoutMs = 0;
    }

    setCredentials(server, user, pass) {
        this.serverUrl = (server || this.serverUrl).replace(/\/+$/, '');
        this.username = user;
        this.password = pass;
        this.cache.clear();
        this._pending.clear();
    }

    // ---- Multi-fornecedor -------------------------------------------------
    // Ids de provedores NOVOS chegam como 'pid:streamId' (ex.: 'prov-a:399336').
    // Sem prefixo = provedor padrao: comportamento 100% identico ao legado.
    _splitId(id) {
        if (typeof id === 'string') {
            const i = id.indexOf(':');
            if (i > 0 && i < 40 && /^[A-Za-z0-9_-]+$/.test(id.slice(0, i))) {
                return { pid: id.slice(0, i), raw: id.slice(i + 1) };
            }
        }
        return { pid: null, raw: id };
    }

    _apiBaseFor(pid) {
        if (!pid) return this._apiOrigin();
        if (typeof window === 'undefined') return '/xapi/' + encodeURIComponent(pid);
        return window.location.origin + '/xapi/' + encodeURIComponent(pid);
    }

    _streamBaseFor(pid) {
        if (!pid) return this._streamOrigin();
        if (typeof window === 'undefined') return '/xstr/' + encodeURIComponent(pid);
        return window.location.origin + '/xstr/' + encodeURIComponent(pid);
    }

    _isDefaultServer() {
        const s = String(this.serverUrl || '').replace(/\/+$/, '').replace(/^http:\/\//i, 'https://');
        return s === 'https://telefunplay.xyz';
    }

    _useProxy() {
        if (typeof window === 'undefined') return false;
        return this._isDefaultServer();
    }

    _apiOrigin() {
        if (this._useProxy()) return window.location.origin + '/xtream-api';
        return this.serverUrl;
    }

    _streamOrigin() {
        if (this._useProxy()) return window.location.origin + '/xtream-stream';
        return this.serverUrl;
    }

    getSessionParams() {
        return `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
    }

    getApiUrl(action, params = {}, pid = null) {
        const base = `${this._apiBaseFor(pid)}/player_api.php`;
        const parts = [];
        // provedor novo: credenciais sao injetadas pelo edge (nunca no cliente)
        if (!pid) parts.push(this.getSessionParams());
        if (action) parts.push('action=' + action);
        for (const [k, v] of Object.entries(params)) {
            parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
        }
        return `${base}?${parts.join('&')}`;
    }

    getStreamUrl(type, id, ext) {
        const { pid, raw } = this._splitId(id);
        const origin = this._streamBaseFor(pid);
        if (pid) {
            // rota nova /xstr/{pid}/... — edge injeta credenciais no path
            if (type === 'live') {
                const extension = ext === 'm3u8' ? 'm3u8' : 'ts';
                return `${origin}/live/${raw}.${extension}`;
            }
            const prefix = type === 'series' ? 'series' : 'movie';
            return `${origin}/${prefix}/${raw}.${ext || 'mp4'}`;
        }
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        if (type === 'live') {
            const extension = ext === 'm3u8' ? 'm3u8' : 'ts';
            return `${origin}/live/${user}/${pass}/${raw}.${extension}`;
        }
        const prefix = type === 'series' ? 'series' : 'movie';
        const extension = ext || 'mp4';
        return `${origin}/${prefix}/${user}/${pass}/${raw}.${extension}`;
    }

    getVideoUrl(type, id, ext) {
        if (type === 'live') return this.getStreamUrl(type, id, ext);
        const { pid, raw } = this._splitId(id);
        const prefix = type === 'series' ? 'series' : 'movie';
        const extension = ext || 'mp4';
        const origin = this._streamBaseFor(pid);
        if (pid) return `${origin}/${prefix}/${raw}.${extension}`;
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        return `${origin}/${prefix}/${user}/${pass}/${raw}.${extension}`;
    }

    getTimeshiftUrl(streamId, startStr, duration = 9999) {
        const { pid, raw } = this._splitId(streamId);
        const origin = this._streamBaseFor(pid);
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        if (pid) {
            return `${origin}/streaming/timeshift.php?stream=${encodeURIComponent(raw)}&start=${encodeURIComponent(startStr)}&duration=${duration}&extension=m3u8`;
        }
        return `${origin}/streaming/timeshift.php?stream=${encodeURIComponent(raw)}&start=${encodeURIComponent(startStr)}&duration=${duration}&username=${user}&password=${pass}&extension=m3u8`;
    }

    getChannelIcon(streamId) {
        const { pid, raw } = this._splitId(streamId);
        const base = `${this._apiBaseFor(pid)}/player_api.php`;
        const sess = pid ? '' : this.getSessionParams() + '&';
        return `${base}?${sess}type=get_image&stream_icon=${encodeURIComponent(raw)}`;
    }

    async fetch(url, retries = this.maxRetries, timeoutMs = this.timeoutMs) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.time < this.cacheTime) return cached.data;
        if (this._pending.has(url)) return this._pending.get(url);

        const run = (async () => {
            try {
                const res = await window.fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined
                });

                if (!res.ok) {
                    const retryable = res.status === 429 || res.status >= 500;
                    if (retryable && retries > 0) {
                        await new Promise(r => setTimeout(r, 1200 + (this.maxRetries - retries) * 800));
                        return this.fetch(url, retries - 1, timeoutMs);
                    }
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();
                this.cache.set(url, { data, time: Date.now() });
                return data;
            } catch (err) {
                // timeout de provedor: nao repetir (falha rapida e isolada por provedor)
                if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw err;
                const msg = String(err && err.message || '');
                const corsLike = err instanceof TypeError || /Failed to fetch|NetworkError|CORS/i.test(msg);
                if (!corsLike && retries > 0) {
                    await new Promise(r => setTimeout(r, 800));
                    return this.fetch(url, retries - 1, timeoutMs);
                }
                if (!corsLike) _perr('API Error:', err);
                throw err;
            } finally {
                this._pending.delete(url);
            }
        })();

        this._pending.set(url, run);
        return run;
    }

    async authenticate() {
        try {
            const data = await this.fetch(this.getApiUrl());
            if (data?.user_info) {
                this.userData = data.user_info;
                this.serverInfo = data.server_info;
                return true;
            }
            return false;
        } catch { return false; }
    }

    async getLiveCategories(pid) { return this.fetch(this.getApiUrl('get_live_categories', {}, pid), undefined, pid ? 30000 : undefined); }
    async getLiveStreams(catId, pid) { return this.fetch(this.getApiUrl('get_live_streams', catId ? { category_id: catId } : {}, pid), undefined, pid ? 30000 : undefined); }
    async getVodCategories(pid) { return this.fetch(this.getApiUrl('get_vod_categories', {}, pid), undefined, pid ? 30000 : undefined); }
    async getVodStreams(catId, pid) { return this.fetch(this.getApiUrl('get_vod_streams', catId ? { category_id: catId } : {}, pid), undefined, pid ? 30000 : undefined); }
    async getVodInfo(id) {
        const { pid, raw } = this._splitId(id);
        return this.fetch(this.getApiUrl('get_vod_info', { vod_id: raw }, pid), undefined, pid ? 20000 : undefined);
    }
    async getVodSubtitles(vodId) {
        try {
            const data = await this.getVodInfo(vodId);
            const raw = (data && data.info && data.info.subtitles) || (data && data.movie_data && data.movie_data.subtitles) || (data && data.subtitles) || [];
            const list = Array.isArray(raw) ? raw : (typeof raw === 'object' && raw ? Object.values(raw) : []);
            return list.map(s => {
                if (typeof s === 'string') return { url: s, lang: guessSubLang(s), label: guessSubLang(s).toUpperCase() };
                return { url: s.url || s.src || s.file || '', lang: s.lang || s.language || guessSubLang(s.url || ''), label: s.label || s.name || (s.language || guessSubLang(s.url || '')).toUpperCase() };
            }).filter(s => s.url);
        } catch (e) { return []; }
    }
    async getSeriesCategories(pid) { return this.fetch(this.getApiUrl('get_series_categories', {}, pid), undefined, pid ? 30000 : undefined); }
    async getSeries(catId, pid) { return this.fetch(this.getApiUrl('get_series', catId ? { category_id: catId } : {}, pid), undefined, pid ? 30000 : undefined); }
    async getSeriesInfo(id) {
        const { pid, raw } = this._splitId(id);
        const data = await this.fetch(this.getApiUrl('get_series_info', { series_id: raw }, pid), undefined, pid ? 20000 : undefined);
        // namespacing dos episodios: ids de provedor novo viram 'pid:epId'
        if (pid && data && data.info && data.info.episodes && typeof data.info.episodes === 'object') {
            for (const key of Object.keys(data.info.episodes)) {
                const eps = data.info.episodes[key];
                if (Array.isArray(eps)) {
                    for (const ep of eps) {
                        if (ep && ep.id != null) ep.id = pid + ':' + ep.id;
                    }
                }
            }
        }
        return data;
    }
    async getEpg(streamId) {
        const { pid, raw } = this._splitId(streamId);
        return this.fetch(this.getApiUrl('get_short_epg', { stream_id: raw }, pid), undefined, pid ? 15000 : undefined);
    }

    async getSimpleEpg(streamId, limit) {
        const { pid, raw } = this._splitId(streamId);
        const params = { stream_id: raw };
        if (limit) params.limit = limit;
        return this.fetch(this.getApiUrl('get_simple_data_table', params, pid), undefined, pid ? 15000 : undefined);
    }

    async getXmlTv() {
        const url = `${this._apiOrigin()}/xmltv.php?${this.getSessionParams()}`;
        try {
            const res = await window.fetch(url, { headers: { 'Accept': 'application/xml,text/xml,*/*' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            _perr('XMLTV Error:', err);
            throw err;
        }
    }
    searchContent(query, type = 'all') {
        const q = (query || '').toLowerCase().trim();
        if (!q || q.length < this.MIN_SEARCH_LENGTH) return Promise.resolve([]);

        const results = [];
        const want = (t) => type === 'all' || type === t;
        const searchIn = (data, contentType, streamType) => {
            if (!Array.isArray(data)) return;
            for (const item of data) {
                const name = (item.name || item.title || '').toLowerCase();
                if (name.includes(q)) {
                    results.push({ ...item, contentType, streamType });
                }
            }
        };

        if (want('live')) searchIn(this._liveCache, 'TV Ao Vivo', 'live');
        if (want('movie')) searchIn(this._movieCache, 'Filme', 'movie');
        if (want('series')) searchIn(this._seriesCache, 'Serie', 'series');
        return Promise.resolve(results);
    }

    searchContentDebounced(query, type, callback) {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
            this.searchContent(query, type)
                .then((results) => { if (typeof callback === 'function') callback(results); })
                .catch(() => { if (typeof callback === 'function') callback([]); });
        }, this.SEARCH_DELAY);
    }

    setLiveCache(data) { this._liveCache = data; }
    setMovieCache(data) { this._movieCache = data; }
    setSeriesCache(data) { this._seriesCache = data; }
}

function guessSubLang(url) {
    if (!url) return 'en';
    const m = String(url).toLowerCase().match(/[._-](pt|en|es|pt-br|eng|por|spa)([._-]|$)/);
    if (!m) return 'en';
    const l = m[1];
    if (l === 'pt-br' || l === 'por') return 'pt';
    if (l === 'eng') return 'en';
    if (l === 'spa') return 'es';
    return l;
}

const api = new XtreamAPI();
