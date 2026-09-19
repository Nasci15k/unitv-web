class XtreamAPI {
    constructor() {
        this.serverUrl = 'http://telefunplay.xyz';
        this.username = 'TurboBrasil@2026';
        this.password = '@27101992';
        this.userData = null;
        this.serverInfo = null;
        this.cache = new Map();
        this.cacheTime = 3 * 60 * 1000;
        this.maxRetries = 2;
    }

    setCredentials(server, user, pass) {
        this.serverUrl = server.replace(/\/+$/, '');
        this.username = user;
        this.password = pass;
        this.cache.clear();
    }

    getSessionParams() {
        return `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
    }

    getApiUrl(action, params = {}) {
        const base = '/api/player_api.php';
        const auth = this.getSessionParams();
        const extra = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        let url = `${base}?${auth}${action ? '&action=' + action : ''}`;
        if (extra) url += '&' + extra;
        return url;
    }

    getStreamUrl(type, id) {
        const prefix = type === 'live' ? 'live' : type === 'movie' ? 'movie' : 'series';
        return `/stream/${prefix}/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.m3u8`;
    }

    getChannelIcon(streamId) {
        return `/api/player_api.php?${this.getSessionParams()}&type=get_image&stream_icon=${streamId}`;
    }

    async fetch(url, retries = this.maxRetries) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.time < this.cacheTime) return cached.data;

        try {
            const res = await window.fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) {
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, 1000));
                    return this.fetch(url, retries - 1);
                }
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();
            this.cache.set(url, { data, time: Date.now() });
            return data;
        } catch (err) {
            if (retries > 0) {
                await new Promise(r => setTimeout(r, 1000));
                return this.fetch(url, retries - 1);
            }
            console.error('API Error:', err);
            throw err;
        }
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
    async getSeriesCategories() { return this.fetch(this.getApiUrl('get_series_categories')); }
    async getSeries(catId) { return this.fetch(this.getApiUrl('get_series', catId ? { category_id: catId } : {})); }
    async getSeriesInfo(id) { return this.fetch(this.getApiUrl('get_series_info', { series_id: id })); }
    async getEpg(streamId) { return this.fetch(this.getApiUrl('get_short_epg', { stream_id: streamId })); }

    searchContent(query) {
        const q = query.toLowerCase().trim();
        if (!q || q.length < 2) return Promise.resolve([]);

        const results = [];
        const searchIn = async (data, contentType) => {
            if (!Array.isArray(data)) return;
            for (const item of data) {
                const name = (item.name || item.title || '').toLowerCase();
                if (name.includes(q)) {
                    results.push({ ...item, contentType, streamType: contentType === 'TV Ao Vivo' ? 'live' : contentType === 'Filme' ? 'movie' : 'series' });
                }
            }
        };

        return Promise.all([
            searchIn(this._liveCache || [], 'TV Ao Vivo'),
            searchIn(this._movieCache || [], 'Filme'),
            searchIn(this._seriesCache || [], 'Serie')
        ]).then(() => results);
    }

    setLiveCache(data) { this._liveCache = data; }
    setMovieCache(data) { this._movieCache = data; }
    setSeriesCache(data) { this._seriesCache = data; }
}

const api = new XtreamAPI();
