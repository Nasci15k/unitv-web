class VideoPlayer {
    constructor() {
        this.hls = null;
        this.mpegts = null;
        this.dashPlayer = null;
        this.container = document.getElementById('player-modal');
        this.videoEl = document.getElementById('video-player');
        this.titleEl = document.getElementById('player-title');
        this.closeBtn = document.getElementById('btn-close-player');
        this.loader = document.getElementById('player-loader');
        this.errorBox = document.getElementById('player-error');
        this.retryBtn = document.getElementById('btn-retry');
        this.controls = document.getElementById('player-controls');
        this.btnPlayPause = document.getElementById('btn-play-pause');
        this.btnFullscreen = document.getElementById('btn-fullscreen');
        this.btnMute = document.getElementById('btn-mute');
        this.volumeSlider = document.getElementById('volume-slider');
        this.timeDisplay = document.getElementById('player-time');
        this.liveBadge = document.getElementById('player-live-badge');
        this.currentUrl = null;
        this.currentTitle = '';
        this.currentType = '';
        this.controlsTimeout = null;
        this.isLive = false;

        this.closeBtn?.addEventListener('click', () => this.stop());
        this.retryBtn?.addEventListener('click', () => this.retry());
        this.btnPlayPause?.addEventListener('click', () => this.togglePlay());
        this.btnFullscreen?.addEventListener('click', () => this.toggleFullscreen());
        this.btnMute?.addEventListener('click', () => this.toggleMute());
        this.volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.videoEl?.addEventListener('click', () => this.togglePlay());
        this.videoEl?.addEventListener('dblclick', () => this.toggleFullscreen());
        this.videoEl?.addEventListener('timeupdate', () => this.updateTime());
        this.videoEl?.addEventListener('waiting', () => this.showLoader());
        this.videoEl?.addEventListener('playing', () => this.hideLoader());
        this.videoEl?.addEventListener('error', () => this.showError('Erro ao carregar o video'));

        document.addEventListener('keydown', (e) => {
            if (this.container.classList.contains('hidden')) return;
            if (e.key === 'Escape') this.stop();
            if (e.key === ' ') { e.preventDefault(); this.togglePlay(); }
            if (e.key === 'ArrowRight') this.videoEl.currentTime += 10;
            if (e.key === 'ArrowLeft') this.videoEl.currentTime -= 10;
            if (e.key === 'ArrowUp') { this.videoEl.volume = Math.min(1, this.videoEl.volume + 0.1); }
            if (e.key === 'ArrowDown') { this.videoEl.volume = Math.max(0, this.videoEl.volume - 0.1); }
            if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
            if (e.key === 'm' || e.key === 'M') this.toggleMute();
        });

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                this.controls.style.opacity = '1';
                clearTimeout(this.controlsTimeout);
            }
        });
    }

    play(streamUrl, title, type = 'live') {
        this.cleanup();
        this.titleEl.textContent = title;
        this.currentUrl = streamUrl;
        this.currentTitle = title;
        this.currentType = type;
        this.isLive = type === 'live';
        this.container.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        this.hideError();
        this.showLoader();
        this.liveBadge.classList.toggle('hidden', !this.isLive);

        if (type === 'live') {
            this.videoEl.setAttribute('playsinline', '');
            this.videoEl.controls = false;
        }

        this.startStream(streamUrl);
        this.showControlsTemporarily();
    }

    startStream(url) {
        this.showLoader();

        const isTs = url.includes('.ts');
        const isM3u8 = url.includes('.m3u8');
        const isMp4 = /\.(mp4|mkv|avi|mov|webm)/i.test(url);

        if (isM3u8 || !isTs && !isMp4) {
            this.playHLS(url);
        } else if (isTs) {
            this.playMpegts(url);
        } else if (isMp4) {
            this.playNative(url);
        } else {
            this.playHLS(url);
        }
    }

    playHLS(url) {
        if (Hls.isSupported()) {
            this.hls = new Hls({
                maxBufferLength: 30,
                maxMaxBufferLength: 120,
                startFragPrefetch: true,
                enableWorker: true,
                lowLatencyMode: this.isLive,
                backBufferLength: 90,
                maxBufferSize: 60 * 1000 * 1000,
                maxBufferHole: 0.5,
                highBufferWatchdogPeriod: 3,
                nudgeMaxRetry: 5,
                nudgeOffset: 0.2,
                maxFragLookUpTolerance: 0.25,
                abrEwmaDefaultEstimate: 500000,
                testBandwidth: false,
                progressive: true
            });

            this.hls.loadSource(url);
            this.hls.attachMedia(this.videoEl);

            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.videoEl.play().catch(() => {});
                this.hideLoader();
            });

            this.hls.on(Hls.Events.ERROR, (event, data) => {
                console.warn('HLS Error:', data.type, data.details);
                if (data.fatal) {
                    this.handleError('Stream indisponivel ou formato nao suportado');
                } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    this.hls.startLoad();
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    this.hls.recoverMediaError();
                }
            });

            this.hls.on(Hls.Events.FRAG_BUFFERED_START, () => {
                this.hideLoader();
            });

            this.hls.on(Hls.Events.FRAG_LOAD_ERROR, () => {
                if (this.isLive) {
                    setTimeout(() => this.hls.startLoad(-1), 1000);
                }
            });

        } else if (this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            this.videoEl.src = url;
            this.videoEl.addEventListener('loadedmetadata', () => {
                this.videoEl.play().catch(() => {});
                this.hideLoader();
            }, { once: true });
            this.videoEl.addEventListener('error', () => {
                this.showError('Erro ao carregar stream');
            }, { once: true });
        }
    }

    playMpegts(url) {
        if (typeof mpegts === 'undefined') {
            this.showError('Codec nao suportado pelo navegador');
            return;
        }

        this.mpegts = mpegts.createPlayer({
            type: 'mpegts',
            url: url,
            isLive: this.isLive,
            bufferTotalTime: 10,
            enableStalledMute: true,
            stalledTimeout: 3000
        });

        this.mpegts.attachMedia(this.videoEl);
        this.mpegts.load();
        this.mpegts.play().catch(() => {});
        this.videoEl.addEventListener('playing', () => this.hideLoader(), { once: true });

        this.mpegts.on(mpegts.Events.ERROR, (err) => {
            this.showError('Erro no stream TS: ' + (err.message || err));
        });
    }

    playNative(url) {
        this.videoEl.src = url;
        this.videoEl.load();
        this.videoEl.addEventListener('canplay', () => {
            this.videoEl.play().catch(() => {});
            this.hideLoader();
        }, { once: true });
        this.videoEl.addEventListener('error', () => {
            this.showError('Erro ao carregar o video');
        }, { once: true });
    }

    handleError(msg) {
        this.showError(msg);
    }

    showLoader() {
        if (this.loader) this.loader.classList.remove('hidden');
    }

    hideLoader() {
        if (this.loader) this.loader.classList.add('hidden');
    }

    showError(msg) {
        this.hideLoader();
        if (this.errorBox) {
            this.errorBox.querySelector('p').textContent = msg;
            this.errorBox.classList.remove('hidden');
        }
    }

    hideError() {
        if (this.errorBox) this.errorBox.classList.add('hidden');
    }

    retry() {
        this.hideError();
        this.play(this.currentUrl, this.currentTitle, this.currentType);
    }

    togglePlay() {
        if (this.videoEl.paused) {
            this.videoEl.play().catch(() => {});
            this.btnPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            this.videoEl.pause();
            this.btnPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.container.requestFullscreen?.().catch(() => {});
            this.container.classList.add('fullscreen');
        } else {
            document.exitFullscreen?.();
            this.container.classList.remove('fullscreen');
        }
    }

    toggleMute() {
        this.videoEl.muted = !this.videoEl.muted;
        this.btnMute.innerHTML = this.videoEl.muted ?
            '<i class="fas fa-volume-mute"></i>' :
            '<i class="fas fa-volume-up"></i>';
    }

    setVolume(val) {
        this.videoEl.volume = val / 100;
        this.videoEl.muted = val == 0;
        this.btnMute.innerHTML = this.videoEl.muted ?
            '<i class="fas fa-volume-mute"></i>' :
            '<i class="fas fa-volume-up"></i>';
    }

    updateTime() {
        if (this.isLive || !this.timeDisplay) return;
        const cur = this.formatTime(this.videoEl.currentTime);
        const dur = this.formatTime(this.videoEl.duration);
        this.timeDisplay.textContent = cur + ' / ' + dur;
    }

    formatTime(sec) {
        if (isNaN(sec)) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
        return `${m}:${s.toString().padStart(2,'0')}`;
    }

    showControlsTemporarily() {
        if (!this.controls) return;
        this.controls.style.opacity = '1';
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            if (!this.videoEl.paused) {
                this.controls.style.opacity = '0';
            }
        }, 3000);
    }

    stop() {
        this.cleanup();
        this.container.classList.add('hidden');
        document.body.style.overflow = '';
    }

    cleanup() {
        this.hideLoader();
        this.hideError();
        if (this.videoEl) {
            this.videoEl.pause();
            this.videoEl.removeAttribute('src');
            this.videoEl.load();
        }
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        if (this.mpegts) {
            try { this.mpegts.pause(); this.mpegts.unload(); this.mpegts.detachMediaElement(); this.mpegts.destroy(); } catch(e) {}
            this.mpegts = null;
        }
        if (this.dashPlayer) { try { this.dashPlayer.reset(); } catch(e) {} this.dashPlayer = null; }
        if (this.btnPlayPause) this.btnPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        clearTimeout(this.controlsTimeout);
    }
}

const player = new VideoPlayer();
