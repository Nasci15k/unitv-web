/* UnitV SubtitleStore — loads VOD subtitles (movie/series) as <track> */
window.SubtitleStore = (function () {
    const LANG_KEY = 'unitv_sub_lang';
    let list = [];

    function getPrefLang() {
        try { return localStorage.getItem(LANG_KEY) || 'pt'; } catch (e) { return 'pt'; }
    }
    function setPrefLang(l) {
        try { localStorage.setItem(LANG_KEY, l || 'pt'); } catch (e) {}
    }

    function isVtt(text) { return /^\s*(\uFEFF)?WEBVTT/.test(String(text || '')); }

    function srtToVtt(srt) {
        const t = String(srt || '').replace(/\r/g, '').replace(/^\uFEFF/, '')
            .replace(/^\d+\s*$/gm, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        return 'WEBVTT\n\n' + t.trim() + '\n';
    }

    function clearTracks(videoEl) {
        if (!videoEl) return;
        videoEl.querySelectorAll('track[data-substore]').forEach(t => {
            if (t.src && t.src.indexOf('blob:') === 0) { try { URL.revokeObjectURL(t.src); } catch (e) {} }
            t.remove();
        });
        const tt = videoEl.textTracks;
        for (let i = 0; i < tt.length; i++) {
            if (tt[i].kind === 'subtitles' || tt[i].kind === 'captions') tt[i].mode = 'disabled';
        }
        list = [];
    }

    function applyPref(videoEl) {
        if (!videoEl) return;
        const pref = String(getPrefLang() || '').toLowerCase();
        const tt = videoEl.textTracks;
        let matched = false;
        for (let i = 0; i < tt.length; i++) {
            if (tt[i].kind !== 'subtitles' && tt[i].kind !== 'captions') continue;
            const lang = String(tt[i].language || '').toLowerCase();
            const match = !matched && pref && lang && (lang === pref || lang.indexOf(pref) === 0 || pref.indexOf(lang) === 0);
            if (match) { tt[i].mode = 'showing'; matched = true; }
            else tt[i].mode = 'hidden';
        }
    }
    function appendTrack(videoEl, url, lang, label) {
        if (!videoEl || !url) return null;
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.srclang = lang || 'und';
        track.label = label || (lang || 'Legenda');
        track.src = url;
        track.setAttribute('data-substore', '1');
        videoEl.appendChild(track);
        return track;
    }

    async function loadForVod(vodId, videoEl) {
        if (!videoEl || vodId == null) return [];
        clearTracks(videoEl);
        list = [];
        try {
            if (window.api && typeof api.getVodSubtitles === 'function') {
                list = await api.getVodSubtitles(vodId) || [];
            }
        } catch (e) { list = []; }
        for (const s of list) {
            if (!s || !s.url) continue;
            try {
                let url = s.url;
                if (!/\.vtt($|\?)/i.test(url)) {
                    const res = await window.fetch(url);
                    if (res.ok) {
                        let text = await res.text();
                        if (!isVtt(text)) text = srtToVtt(text);
                        url = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
                    }
                }
                appendTrack(videoEl, url, s.lang, s.label);
            } catch (e) {
                try { appendTrack(videoEl, s.url, s.lang, s.label); } catch (e2) {}
            }
        }
        applyPref(videoEl);
        return list;
    }

    function loadLocalFile(file, videoEl) {
        if (!file || !videoEl) return Promise.resolve(null);
        const reader = new FileReader();
        return new Promise((resolve) => {
            reader.onload = () => {
                try {
                    let text = String(reader.result || '');
                    if (!isVtt(text)) text = srtToVtt(text);
                    const name = (file.name || 'Local').replace(/\.[^.]+$/, '');
                    const t = appendTrack(videoEl, URL.createObjectURL(new Blob([text], { type: 'text/vtt' })), getPrefLang(), name);
                    if (t) { const tt = videoEl.textTracks; for (let i = 0; i < tt.length; i++) tt[i].mode = (tt[i].kind === 'subtitles' || tt[i].kind === 'captions') ? (tt[i] === t.textTrack ? 'showing' : 'hidden') : tt[i].mode; }
                    resolve(t);
                } catch (e) { resolve(null); }
            };
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        });
    }

    function createLocalInput(videoEl) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.vtt,.srt,text/vtt';
        input.style.display = 'none';
        input.addEventListener('change', () => { if (input.files && input.files[0]) loadLocalFile(input.files[0], videoEl); document.body.removeChild(input); });
        document.body.appendChild(input);
        input.click();
    }

    return { loadForVod, clearTracks, loadLocalFile, createLocalInput, getPrefLang, setPrefLang, getList: () => list, srtToVtt };
})();
