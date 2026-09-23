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
    }

    setCredentials(server, user, pass) {
        this.serverUrl = (server || this.serverUrl).replace(/\/+$/, '');
        this.username = user;
        this.password = pass;
        this.cache.clear();
        this._pending.clear();
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

    getApiUrl(action, params = {}) {
        const base = `${this._apiOrigin()}/player_api.php`;
        const auth = this.getSessionParams();
        const extra = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        let url = `${base}?${auth}${action ? '&action=' + action : ''}`;
        if (extra) url += '&' + extra;
        return url;
    }

    getStreamUrl(type, id, ext) {
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        const origin = this._streamOrigin();
        if (type === 'live') {
            const extension = ext === 'm3u8' ? 'm3u8' : 'ts';
            return `${origin}/live/${user}/${pass}/${id}.${extension}`;
        }
        const prefix = type === 'series' ? 'series' : 'movie';
        const extension = ext || 'mp4';
        return `${origin}/${prefix}/${user}/${pass}/${id}.${extension}`;
    }

    getVideoUrl(type, id, ext) {
        if (type === 'live') return this.getStreamUrl(type, id, ext);
        const prefix = type === 'series' ? 'series' : 'movie';
        const extension = ext || 'mp4';
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        return `${this._streamOrigin()}/${prefix}/${user}/${pass}/${id}.${extension}`;
    }

    getTimeshiftUrl(streamId, startStr, duration = 9999) {
        const user = encodeURIComponent(this.username);
        const pass = encodeURIComponent(this.password);
        return `${this._streamOrigin()}/streaming/timeshift.php?stream=${encodeURIComponent(streamId)}&start=${encodeURIComponent(startStr)}&duration=${duration}&username=${user}&password=${pass}&extension=m3u8`;
    }

    getChannelIcon(streamId) {
        return `${this._apiOrigin()}/player_api.php?${this.getSessionParams()}&type=get_image&stream_icon=${encodeURIComponent(streamId)}`;
    }

    async fetch(url, retries = this.maxRetries) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.time < this.cacheTime) return cached.data;
        if (this._pending.has(url)) return this._pending.get(url);

        const run = (async () => {
            try {
                const res = await window.fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });

                if (!res.ok) {
                    const retryable = res.status === 429 || res.status >= 500;
                    if (retryable && retries > 0) {
                        await new Promise(r => setTimeout(r, 1200 + (this.maxRetries - retries) * 800));
                        return this.fetch(url, retries - 1);
                    }
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();
                this.cache.set(url, { data, time: Date.now() });
                return data;
            } catch (err) {
                const msg = String(err && err.message || '');
                const corsLike = err instanceof TypeError || /Failed to fetch|NetworkError|CORS/i.test(msg);
                if (!corsLike && retries > 0) {
                    await new Promise(r => setTimeout(r, 800));
                    return this.fetch(url, retries - 1);
                }
                if (!corsLike) console.error('API Error:', err);
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

    async getLiveCategories() { return this.fetch(this.getApiUrl('get_live_categories')); }
    async getLiveStreams(catId) { return this.fetch(this.getApiUrl('get_live_streams', catId ? { category_id: catId } : {})); }
    async getVodCategories() { return this.fetch(this.getApiUrl('get_vod_categories')); }
    async getVodStreams(catId) { return this.fetch(this.getApiUrl('get_vod_streams', catId ? { category_id: catId } : {})); }
    async getVodInfo(id) { return this.fetch(this.getApiUrl('get_vod_info', { vod_id: id })); }
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
    async getSeriesCategories() { return this.fetch(this.getApiUrl('get_series_categories')); }
    async getSeries(catId) { return this.fetch(this.getApiUrl('get_series', catId ? { category_id: catId } : {})); }
    async getSeriesInfo(id) { return this.fetch(this.getApiUrl('get_series_info', { series_id: id })); }
    async getEpg(streamId) { return this.fetch(this.getApiUrl('get_short_epg', { stream_id: streamId })); }

    async getSimpleEpg(streamId, limit) {
        const params = { stream_id: streamId };
        if (limit) params.limit = limit;
        return this.fetch(this.getApiUrl('get_simple_data_table', params));
    }

    async getXmlTv() {
        const url = `${this._apiOrigin()}/xmltv.php?${this.getSessionParams()}`;
        try {
            const res = await window.fetch(url, { headers: { 'Accept': 'application/xml,text/xml,*/*' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            console.error('XMLTV Error:', err);
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
