class XtreamAPI {
    constructor() {
        this.serverUrl = 'http://telefunplay.xyz';
        this.username = 'TurboBrasil@2026';
        this.password = '@27101992';
        this.auth = '';
        this.userData = null;
        this.cache = new Map();
        this.cacheTime = 5 * 60 * 1000;
    }

    setCredentials(server, user, pass) {
        this.serverUrl = server.replace(/\/+$/, '');
        this.username = user;
        this.password = pass;
        this.auth = btoa(`${user}:${pass}`);
    }

    getApiUrl(type, params = {}) {
        const base = `${this.serverUrl}/player_api.php`;
        const authParams = `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`;
        let url = `${base}?${authParams}`;
        
        if (type === 'live') url += '&action=get_live_streams';
        else if (type === 'live_categories') url += '&action=get_live_categories';
        else if (type === 'vod') url += '&action=get_vod_streams';
        else if (type === 'vod_categories') url += '&action=get_vod_categories';
        else if (type === 'vod_info') url += `&action=get_vod_info&vod_id=${params.id}`;
        else if (type === 'series') url += '&action=get_series';
        else if (type === 'series_categories') url += '&action=get_series_categories';
        else if (type === 'series_info') url += `&action=get_series_info&series_id=${params.id}`;
        else if (type === 'epg') url += `&action=get_short_epg&stream_id=${params.id}`;
        else if (type === 'categories') url += '&action=get_live_categories';
        else if (type === 'user_info') url += '';
        
        if (params.category_id) url += `&category_id=${params.category_id}`;
        if (params.page) url += `&page=${params.page}`;
        
        return url;
    }

    getStreamUrl(type, id) {
        if (type === 'live') {
            return `${this.serverUrl}/live/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.m3u8`;
        } else if (type === 'movie') {
            return `${this.serverUrl}/movie/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.m3u8`;
        } else if (type === 'series') {
            return `${this.serverUrl}/series/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.m3u8`;
        }
        return '';
    }

    getChannelIcon(streamId) {
        return `${this.serverUrl}/player_api.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&type=get_image&stream_icon=${streamId}`;
    }

    async fetch(url) {
        const cacheKey = url;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.time < this.cacheTime) {
            return cached.data;
        }

        try {
            const response = await window.fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.cache.set(cacheKey, { data, time: Date.now() });
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async authenticate() {
        try {
            const data = await this.fetch(this.getApiUrl('user_info'));
            if (data.user_info) {
                this.userData = data.user_info;
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    async getLiveCategories() {
        return await this.fetch(this.getApiUrl('live_categories'));
    }

    async getLiveStreams(categoryId = null) {
        const params = categoryId ? { category_id: categoryId } : {};
        return await this.fetch(this.getApiUrl('live', params));
    }

    async getVodCategories() {
        return await this.fetch(this.getApiUrl('vod_categories'));
    }

    async getVodStreams(categoryId = null) {
        const params = categoryId ? { category_id: categoryId } : {};
        return await this.fetch(this.getApiUrl('vod', params));
    }

    async getVodInfo(vodId) {
        return await this.fetch(this.getApiUrl('vod_info', { id: vodId }));
    }

    async getSeriesCategories() {
        return await this.fetch(this.getApiUrl('series_categories'));
    }

    async getSeries(categoryId = null) {
        const params = categoryId ? { category_id: categoryId } : {};
        return await this.fetch(this.getApiUrl('series', params));
    }

    async getSeriesInfo(seriesId) {
        return await this.fetch(this.getApiUrl('series_info', { id: seriesId }));
    }

    async getEpg(streamId) {
        return await this.fetch(this.getApiUrl('epg', { id: streamId }));
    }

    searchContent(query) {
        const q = query.toLowerCase();
        const results = [];
        
        const searchIn = async (type, label) => {
            try {
                const data = type === 'live' ? await this.getLiveStreams() :
                            type === 'vod' ? await this.getVodStreams() :
                            await this.getSeries();
                
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const name = (item.name || item.title || '').toLowerCase();
                        if (name.includes(q)) {
                            results.push({
                                ...item,
                                contentType: label,
                                type: type
                            });
                        }
                    });
                }
            } catch (e) {}
        };

        return Promise.all([
            searchIn('live', 'TV Ao Vivo'),
            searchIn('vod', 'Filme'),
            searchIn('series', 'Serie')
        ]).then(() => results);
    }
}

const api = new XtreamAPI();
