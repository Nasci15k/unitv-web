class VideoPlayer {
    constructor() {
        this.player = null;
        this.hls = null;
        this.container = document.getElementById('player-modal');
        this.videoEl = document.getElementById('video-player');
        this.titleEl = document.getElementById('player-title');
        this.closeBtn = document.getElementById('btn-close-player');
        this.epgBar = document.getElementById('epg-bar');
        this.epgInfo = this.epgBar?.querySelector('.epg-info');
        
        this.closeBtn?.addEventListener('click', () => this.stop());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.container.classList.contains('hidden')) {
                this.stop();
            }
        });
    }

    play(streamUrl, title, type = 'live') {
        this.stop();
        this.titleEl.textContent = title;
        this.container.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        const mimeTypes = {
            mp4: 'video/mp4',
            mpd: 'application/dash+xml',
            m3u8: 'application/x-mpegURL',
            ts: 'video/mp2t'
        };

        const ext = streamUrl.split('?')[0].split('.').pop().toLowerCase();
        
        if (ext === 'm3u8' || streamUrl.includes('.m3u8')) {
            this.playHLS(streamUrl);
        } else if (ext === 'mpd') {
            this.playDASH(streamUrl);
        } else {
            this.playNative(streamUrl, mimeTypes[ext] || 'video/mp4');
        }
    }

    playHLS(url) {
        if (Hls.isSupported()) {
            this.hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                startFragPrefetch: true,
                enableWorker: true,
                lowLatencyMode: false
            });
            
            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoEl);
            
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.videoEl.play().catch(() => {});
            });
            
            this.hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            this.hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            this.hls.recoverMediaError();
                            break;
                        default:
                            console.error('HLS fatal error:', data);
                            break;
                    }
                }
            });
        } else if (this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            this.videoEl.src = url;
            this.videoEl.addEventListener('loadedmetadata', () => {
                this.videoEl.play().catch(() => {});
            });
        }
    }

    playDASH(url) {
        if (typeof dashjs !== 'undefined') {
            this.dashPlayer = dashjs.MediaPlayer().create();
            this.dashPlayer.initialize(this.videoEl, url, true);
        }
    }

    playNative(url, mimeType) {
        this.videoEl.src = url;
        this.videoEl.type = mimeType;
        this.videoEl.play().catch(() => {});
    }

    stop() {
        this.container.classList.add('hidden');
        document.body.style.overflow = '';
        
        if (this.videoEl) {
            this.videoEl.pause();
            this.videoEl.removeAttribute('src');
            this.videoEl.load();
        }
        
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        
        if (this.dashPlayer) {
            this.dashPlayer.reset();
            this.dashPlayer = null;
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.container.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }
}

const player = new VideoPlayer();
