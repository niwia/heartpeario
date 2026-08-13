// ── Google Cast (Chromecast) & Apple AirPlay Service ─────────────────────────

class CastService {
  constructor() {
    this.castContext = null;
    this.remotePlayer = null;
    this.remotePlayerController = null;
    this.isCastReady = false;
    this.isCastingState = false;
    this.airplayAvailable = false;
    this.listeners = {
      stateChange: [],
      syncEvent: [],
    };
  }

  init() {
    if (typeof window === 'undefined') return;

    // Google Cast framework callback
    window['__onGCastApiAvailable'] = (isAvailable) => {
      if (isAvailable && window.cast && window.cast.framework) {
        this._setupGoogleCast();
      }
    };

    // If Cast API already loaded
    if (window.cast && window.cast.framework) {
      this._setupGoogleCast();
    }
  }

  _setupGoogleCast() {
    try {
      this.castContext = cast.framework.CastContext.getInstance();
      this.castContext.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      this.remotePlayer = new cast.framework.RemotePlayer();
      this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);
      this.isCastReady = true;

      // Listen for Cast connect / disconnect
      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        () => {
          const connected = !!this.remotePlayer.isConnected;
          this.isCastingState = connected;
          this._emit('stateChange', { casting: connected, type: 'chromecast' });
        }
      );

      // Listen for remote Play/Pause changes (e.g. from TV remote or Google Home)
      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
        () => {
          if (!this.remotePlayer.isConnected) return;
          this._emit('syncEvent', {
            type: 'pause_change',
            paused: this.remotePlayer.isPaused,
            time: this.remotePlayer.currentTime,
          });
        }
      );

      // Listen for remote Seek changes
      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
        () => {
          if (!this.remotePlayer.isConnected) return;
          this._emit('syncEvent', {
            type: 'time_change',
            time: this.remotePlayer.currentTime,
          });
        }
      );

      this._emit('stateChange', { ready: true, type: 'chromecast' });
    } catch (err) {
      console.warn('[CastService] Google Cast init warning:', err);
    }
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
    return () => {
      this.listeners[event] = this.listeners[event].filter(f => f !== fn);
    };
  }

  _emit(event, payload) {
    (this.listeners[event] || []).forEach(fn => fn(payload));
  }

  // ── Chromecast Methods ────────────────────────────────────────────────────

  async requestChromecast(mediaUrl, mediaMeta = null, currentTime = 0, paused = false) {
    if (!this.isCastReady || !this.castContext) {
      throw new Error('Chromecast is not supported or not initialized in this browser.');
    }

    // Open Cast device selector
    await this.castContext.requestSession();

    if (mediaUrl) {
      await this.loadMediaOnChromecast(mediaUrl, mediaMeta, currentTime, paused);
    }
  }

  async loadMediaOnChromecast(mediaUrl, mediaMeta = null, currentTime = 0, paused = false) {
    const session = this.castContext?.getCurrentSession();
    if (!session) return;

    const mediaInfo = new chrome.cast.media.MediaInfo(mediaUrl, 'video/mp4');
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
    mediaInfo.metadata.title = mediaMeta?.title || 'HeartPeario Stream';
    mediaInfo.metadata.subtitle = mediaMeta?.episodeTitle || '';
    if (mediaMeta?.poster) {
      mediaInfo.metadata.images = [new chrome.cast.Image(mediaMeta.poster)];
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.currentTime = Math.max(0, currentTime);
    request.autoplay = !paused;

    await session.loadMedia(request);
  }

  sendPlayToCast() {
    if (this.isCastingState && this.remotePlayerController && this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  sendPauseToCast() {
    if (this.isCastingState && this.remotePlayerController && !this.remotePlayer?.isPaused) {
      this.remotePlayerController.playOrPause();
    }
  }

  sendSeekToCast(time) {
    if (this.isCastingState && this.remotePlayerController && this.remotePlayer) {
      this.remotePlayer.currentTime = time;
      this.remotePlayerController.seek();
    }
  }

  // ── Apple AirPlay Methods ─────────────────────────────────────────────────

  setupAirPlay(videoEl, onAvailabilityChange) {
    if (!videoEl) return;
    if (window.WebKitPlaybackTargetAvailabilityEvent) {
      videoEl.addEventListener('webkitplaybacktargetavailabilitychanged', (event) => {
        const available = event.availability === 'available';
        this.airplayAvailable = available;
        if (onAvailabilityChange) onAvailabilityChange(available);
      });
    }
  }

  showAirPlayPicker(videoEl) {
    if (videoEl && typeof videoEl.webkitShowPlaybackTargetPicker === 'function') {
      videoEl.webkitShowPlaybackTargetPicker();
    } else {
      alert('AirPlay is available on Apple Safari (iOS / macOS).');
    }
  }
}

export default new CastService();
