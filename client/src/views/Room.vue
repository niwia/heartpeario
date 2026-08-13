<template>
  <div class="room" :class="{ 'chat-open': chatOpen }">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <header class="header">
      <div class="header-left">
        <span class="logo-sm" aria-hidden="true">♥</span>
        <button
          id="hp-room-code"
          class="room-code"
          title="Copy invite link"
          @click="copyLink"
        >
          {{ room.roomId }}
          <span class="copy-icon">{{ copied ? '✓' : '⧉' }}</span>
        </button>

        <!-- Current Media Title Badge -->
        <div v-if="room.mediaMeta" class="media-title-chip" :title="room.mediaMeta.title">
          <span class="media-chip-icon">🎬</span>
          <span class="media-chip-text">{{ room.mediaMeta.title }}</span>
          <span v-if="room.mediaMeta.episodeTitle" class="media-chip-ep">
            {{ room.mediaMeta.episodeTitle }}
          </span>
        </div>
      </div>

      <!-- Quick Action Buttons: Search & Addons -->
      <div class="header-actions">
        <button
          id="hp-search-btn"
          class="action-btn search-action"
          title="Search Movies & Series"
          @click="showSearchModal = true"
        >
          <span>🔍</span>
          <span class="btn-label">Search</span>
        </button>
        <button
          id="hp-addons-btn"
          class="action-btn"
          title="Manage Stremio Addons"
          @click="showAddonsModal = true"
        >
          <span>🧩</span>
          <span class="btn-label">Addons</span>
        </button>
      </div>

      <!-- Users List -->
      <div class="users-row" role="list" aria-label="People in room">
        <div
          v-for="u in room.users"
          :key="u.id"
          class="user-chip"
          role="listitem"
          :title="u.name"
        >
          <span
            class="user-avatar"
            :style="{ background: u.color }"
            aria-hidden="true"
          >{{ u.name[0]?.toUpperCase() }}</span>
          <span class="user-name">{{ u.name }}</span>
          <span
            v-if="buffering && u.id === room.you?.id"
            class="buf-dot"
            title="Buffering"
          ></span>
        </div>
      </div>

      <div class="header-right">
        <button
          id="hp-chat-toggle"
          class="icon-btn"
          :class="{ active: chatOpen }"
          :title="chatOpen ? 'Close chat' : 'Open chat'"
          @click="chatOpen = !chatOpen"
          :aria-pressed="chatOpen"
        >
          💬
          <span v-if="unread > 0 && !chatOpen" class="badge">{{ unread }}</span>
        </button>
      </div>
    </header>

    <!-- ── Main ───────────────────────────────────────────────────── -->
    <div class="main">

      <!-- ── Player ─────────────────────────────────────────────── -->
      <div
        class="player-wrap"
        @mousemove="showControls"
        @mouseleave="scheduleHideControls"
        @click.self="togglePlay"
        :class="{ 'controls-hidden': controlsHidden && !paused && !!room.url }"
      >

        <!-- Placeholder when no URL -->
        <div v-if="!room.url" class="placeholder">
          <div class="placeholder-inner">
            <span class="ph-icon">🎬</span>
            <p class="ph-title">No stream playing</p>
            <p class="ph-sub">Search for a movie or show with Stremio addons, or paste a direct video link.</p>
            <div class="placeholder-actions">
              <button class="btn-ph-search" @click="showSearchModal = true">
                🔍 Search Movies / Series
              </button>
              <button class="btn-ph-url" @click="openUrlBar">
                🔗 Paste Video URL
              </button>
            </div>
          </div>
        </div>

        <!-- Buffering overlay -->
        <div v-if="room.url && buffering && !paused" class="buffering-overlay" aria-label="Buffering">
          <div class="buf-spinner"></div>
        </div>

        <!-- Video element with Subtitles Track -->
        <video
          v-show="room.url"
          ref="videoEl"
          :src="room.url || undefined"
          preload="metadata"
          playsinline
          crossorigin="anonymous"
          @play="onPlay"
          @pause="onPause"
          @seeked="onSeeked"
          @timeupdate="onTimeUpdate"
          @durationchange="onDurationChange"
          @waiting="() => (buffering = true)"
          @canplay="onCanPlay"
          @error="onVideoError"
          @dblclick.stop="toggleFullscreen"
        >
          <track
            v-if="activeSubTrackBlobUrl"
            kind="subtitles"
            :src="activeSubTrackBlobUrl"
            :srclang="room.currentSubtitle?.lang || 'en'"
            :label="room.currentSubtitle?.lang || 'Subtitles'"
            default
          />
        </video>

        <!-- URL bar (visible only when manually requested) -->
        <div class="url-bar" v-show="showUrlBar">
          <input
            id="hp-url-input"
            ref="urlInputEl"
            v-model="urlInput"
            type="url"
            placeholder="Paste a direct video URL (MP4, WebM, TorBox link…)"
            @keyup.enter="loadUrl"
            @keyup.escape="showUrlBar = false"
            spellcheck="false"
          />
          <button class="btn-url-load" @click="loadUrl" :disabled="!urlInput.trim()">
            Load ↵
          </button>
          <button v-if="room.url" class="btn-url-cancel" @click="showUrlBar = false">✕</button>
        </div>

        <!-- Floating Quick Switch Buttons (Search / Direct Link) -->
        <div v-if="room.url && !showUrlBar" class="floating-top-actions">
          <button class="float-btn" @click="showSearchModal = true" title="Search another title">
            🔍 Search
          </button>
          <button class="float-btn" @click="openUrlBar" title="Paste a direct URL">
            ⟳ Direct Link
          </button>
        </div>

        <!-- Controls overlay -->
        <div class="controls" v-if="room.url">
          <div class="controls-inner">
            <!-- Play / Pause -->
            <button
              id="hp-play-pause"
              class="ctrl-btn play-btn"
              :title="paused ? 'Play (Space)' : 'Pause (Space)'"
              @click="togglePlay"
            >
              <span v-if="paused">▶</span>
              <span v-else>⏸</span>
            </button>

            <!-- Time -->
            <span class="time-display">{{ fmtTime(currentTime) }}</span>

            <!-- Seek bar -->
            <input
              id="hp-seekbar"
              class="seek-bar"
              type="range"
              min="0"
              :max="duration || 100"
              step="0.25"
              :value="currentTime"
              @mousedown="seeking = true"
              @mouseup="onSeekEnd"
              @change="onSeekEnd"
            />

            <!-- Duration -->
            <span class="time-display muted">{{ fmtTime(duration) }}</span>

            <!-- Subtitles & Language button -->
            <button
              id="hp-subs-btn"
              class="ctrl-btn sm sub-ctrl-btn"
              :class="{ 'sub-active': !!room.currentSubtitle }"
              :title="room.currentSubtitle ? `Subtitles: ${room.currentSubtitle.lang} (C)` : 'Subtitles / CC (C)'"
              @click="showSubtitlesModal = true"
            >
              <span class="cc-badge">CC</span>
            </button>

            <!-- Volume & Mute -->
            <div class="volume-wrap">
              <button
                id="hp-mute-btn"
                class="ctrl-btn sm"
                :title="isMuted || volume === 0 ? 'Unmute (M)' : 'Mute (M)'"
                @click="toggleMute"
              >
                <span v-if="isMuted || volume === 0">🔇</span>
                <span v-else-if="volume < 0.5">🔉</span>
                <span v-else>🔊</span>
              </button>
              <input
                id="hp-volume"
                class="volume-bar"
                type="range"
                min="0"
                max="1"
                step="0.05"
                v-model.number="volume"
                title="Volume"
              />
            </div>

            <!-- AirPlay button (Apple Safari / iOS) -->
            <button
              v-if="airplayAvailable"
              id="hp-airplay-btn"
              class="ctrl-btn sm sub-ctrl-btn"
              title="Stream to TV via Apple AirPlay"
              @click="triggerAirPlay"
            >
              <span class="cast-icon">⎋</span>
            </button>

            <!-- Google Cast / Chromecast button -->
            <button
              id="hp-cast-btn"
              class="ctrl-btn sm sub-ctrl-btn"
              :class="{ 'sub-active': isCasting }"
              :title="isCasting ? 'Connected to TV (Chromecast)' : 'Cast to TV Screen (Chromecast)'"
              @click="triggerChromecast"
            >
              <span class="cast-icon">⎚</span>
            </button>

            <!-- Fullscreen -->
            <button
              id="hp-fullscreen"
              class="ctrl-btn"
              title="Fullscreen (F)"
              @click="toggleFullscreen"
            >⛶</button>
          </div>
        </div>
      </div>

      <!-- ── Chat sidebar ────────────────────────────────────────── -->
      <transition name="fade">
        <aside class="sidebar" v-if="chatOpen">

          <div class="sidebar-header">
            <span>Chat</span>
            <button class="icon-btn sm" @click="chatOpen = false" title="Close">✕</button>
          </div>

          <div class="messages" ref="messagesEl">
            <div v-if="!room.messages.length" class="no-messages">
              No messages yet. Say hi!
            </div>
            <div
              v-for="(msg, i) in room.messages"
              :key="i"
              class="msg"
              :class="{ 'msg-own': msg.userId === room.you?.id }"
            >
              <span class="msg-author" :style="{ color: msg.color }">{{ msg.name }}</span>
              <span class="msg-content">{{ msg.content }}</span>
            </div>
          </div>

          <form class="chat-form" @submit.prevent="sendMessage">
            <input
              id="hp-chat-input"
              v-model="chatInput"
              class="chat-input"
              type="text"
              placeholder="Say something…"
              maxlength="300"
              autocomplete="off"
              @keyup.stop
            />
            <button id="hp-chat-send" class="chat-send" type="submit" :disabled="!chatInput.trim()">
              ↑
            </button>
          </form>
        </aside>
      </transition>
    </div>

    <!-- ── Modals ────────────────────────────────────────────────── -->
    <SearchMediaModal
      v-if="showSearchModal"
      @close="showSearchModal = false"
      @selectStream="onStreamSelected"
    />

    <AddonManagerModal
      v-if="showAddonsModal"
      @close="showAddonsModal = false"
    />

    <SubtitlesModal
      v-if="showSubtitlesModal"
      :availableSubs="room.subtitles"
      :currentSubtitle="room.currentSubtitle"
      :offsetMs="room.subtitleOffsetMs"
      @close="showSubtitlesModal = false"
      @selectSubtitle="onSelectSubtitle"
      @setOffset="onSetSubtitleOffset"
      @loadCustomSubtitle="onLoadCustomSubtitle"
    />

    <!-- Error toast -->
    <Transition name="toast">
      <div v-if="toast" class="toast" role="alert">{{ toast }}</div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import socket from '@/services/socket';
import { createVttUrlFromRemote, srtToVtt } from '@/services/subtitle.service';
import castService from '@/services/cast.service';

import SearchMediaModal from '@/components/SearchMediaModal.vue';
import AddonManagerModal from '@/components/AddonManagerModal.vue';
import SubtitlesModal from '@/components/SubtitlesModal.vue';

const route = useRoute();
const router = useRouter();
const room = useRoomStore();

// ── Modals & Casting ──────────────────────────────────────────────────────
const showSearchModal = ref(false);
const showAddonsModal = ref(false);
const showSubtitlesModal = ref(false);
const activeSubTrackBlobUrl = ref(null);
const isCasting = ref(false);
const airplayAvailable = ref(false);

// ── Refs ──────────────────────────────────────────────────────────────────
const videoEl    = ref(null);
const urlInputEl = ref(null);
const messagesEl = ref(null);

const paused      = ref(true);
const currentTime = ref(0);
const duration    = ref(0);
const volume      = ref(1);
const isMuted     = ref(false);
const prevVolume  = ref(1);
const buffering   = ref(false);
const seeking     = ref(false);

const chatOpen   = ref(true);
const unread     = ref(0);
const chatInput  = ref('');
const urlInput   = ref('');
const showUrlBar = ref(false);

const copied     = ref(false);
const toast      = ref('');
const controlsHidden = ref(false);

// ── Sync guard ────────────────────────────────────────────────────────────
let suppressSync = false;
let pendingSync  = null;
let hideTimer    = null;
let toastTimer   = null;

// ── Volume & Mute ─────────────────────────────────────────────────────────
watch(volume, v => {
  if (videoEl.value) {
    videoEl.value.volume = v;
    if (v > 0) {
      videoEl.value.muted = false;
      isMuted.value = false;
    } else {
      isMuted.value = true;
      videoEl.value.muted = true;
    }
  }
});

function toggleMute() {
  if (!videoEl.value) return;
  if (isMuted.value || volume.value === 0) {
    isMuted.value = false;
    volume.value = prevVolume.value > 0 ? prevVolume.value : 0.8;
    videoEl.value.muted = false;
    videoEl.value.volume = volume.value;
  } else {
    prevVolume.value = volume.value;
    isMuted.value = true;
    volume.value = 0;
    videoEl.value.muted = true;
    videoEl.value.volume = 0;
  }
}

// ── Chat unread badge ─────────────────────────────────────────────────────
watch(() => room.messages.length, () => {
  if (!chatOpen.value) unread.value++;
  scrollMessages();
});
watch(chatOpen, open => { if (open) unread.value = 0; });

// ── Subtitle Loading Logic ────────────────────────────────────────────────
async function loadCurrentSubtitle() {
  // Revoke old blob url
  if (activeSubTrackBlobUrl.value) {
    URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = null;
  }

  if (!room.currentSubtitle) return;

  const url = room.currentSubtitle.url;
  if (!url) return;

  try {
    const vttBlobUrl = await createVttUrlFromRemote(url, room.subtitleOffsetMs);
    if (vttBlobUrl) {
      activeSubTrackBlobUrl.value = vttBlobUrl;
      nextTick(() => {
        if (videoEl.value?.textTracks?.[0]) {
          videoEl.value.textTracks[0].mode = 'showing';
        }
      });
    }
  } catch (err) {
    console.error('Failed to load subtitle track:', err);
  }
}

function onSelectSubtitle(sub) {
  room.currentSubtitle = sub;
  loadCurrentSubtitle();
  doToast(sub ? `Subtitles: ${sub.lang?.toUpperCase()}` : 'Subtitles disabled');
}

function onSetSubtitleOffset(offsetMs) {
  room.subtitleOffsetMs = offsetMs;
  loadCurrentSubtitle();
  doToast(`Subtitle offset: ${offsetMs >= 0 ? '+' : ''}${(offsetMs / 1000).toFixed(1)}s`);
}

function onLoadCustomSubtitle({ name, content }) {
  if (activeSubTrackBlobUrl.value) {
    URL.revokeObjectURL(activeSubTrackBlobUrl.value);
  }
  const vtt = srtToVtt(content, room.subtitleOffsetMs);
  const blob = new Blob([vtt], { type: 'text/vtt;charset=utf-8' });
  activeSubTrackBlobUrl.value = URL.createObjectURL(blob);
  room.currentSubtitle = { id: 'custom', lang: 'Custom', url: null };
  nextTick(() => {
    if (videoEl.value?.textTracks?.[0]) {
      videoEl.value.textTracks[0].mode = 'showing';
    }
  });
  showSubtitlesModal.value = false;
  doToast(`Loaded custom subtitle: ${name}`);
}

// ── Stream Selected from Search / Addons ──────────────────────────────────
function onStreamSelected({ url, mediaMeta, subtitles }) {
  room.mediaMeta = mediaMeta;
  room.subtitles = subtitles || [];

  // Broadcast to room
  socket.send('player.url', {
    url,
    mediaMeta,
    subtitles,
  });

  // Pick first english subtitle or first available
  const defaultSub = (subtitles || []).find(s => ['eng', 'en'].includes(s.lang?.toLowerCase())) || (subtitles || [])[0] || null;
  room.currentSubtitle = defaultSub;
  loadCurrentSubtitle();

  showUrlBar.value = false;
  doToast(`Playing ${mediaMeta.title} for everyone! 🍿`);
}

// ── Controls visibility ───────────────────────────────────────────────────
function showControls() {
  controlsHidden.value = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (!paused.value) controlsHidden.value = true; }, 3000);
}
function scheduleHideControls() {
  if (!paused.value) hideTimer = setTimeout(() => { controlsHidden.value = true; }, 1000);
}

// ── Video helpers ─────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function doToast(msg, ms = 2500) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), ms);
}

async function copyLink() {
  await navigator.clipboard.writeText(window.location.href);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
  doToast('Room link copied!');
}

function openUrlBar() {
  showUrlBar.value = true;
  nextTick(() => urlInputEl.value?.focus());
}

function loadUrl() {
  const url = urlInput.value.trim();
  if (!url) return;
  room.mediaMeta = null;
  room.subtitles = [];
  room.currentSubtitle = null;
  if (activeSubTrackBlobUrl.value) {
    URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = null;
  }
  socket.send('player.url', { url, mediaMeta: null, subtitles: [] });
  urlInput.value = '';
  showUrlBar.value = false;
}

function scrollMessages() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

function sendMessage() {
  const content = chatInput.value.trim();
  if (!content) return;
  socket.send('room.message', { content });
  chatInput.value = '';
}

// ── Player controls ───────────────────────────────────────────────────────
function togglePlay() {
  if (!videoEl.value || !room.url) return;
  if (videoEl.value.paused) videoEl.value.play().catch(() => {});
  else videoEl.value.pause();
}

function toggleFullscreen() {
  const el = videoEl.value;
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen?.() || el.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.();
  }
}

function onSeekEnd(e) {
  seeking.value = false;
  if (videoEl.value) {
    videoEl.value.currentTime = parseFloat(e.target.value);
  }
}

// ── Video event handlers ──────────────────────────────────────────────────
function onPlay() {
  paused.value = false;
  if (!suppressSync && videoEl.value) {
    socket.send('player.sync', { paused: false, time: videoEl.value.currentTime });
  }
}

function onPause() {
  paused.value = true;
  controlsHidden.value = false;
  clearTimeout(hideTimer);
  if (!suppressSync && videoEl.value) {
    socket.send('player.sync', { paused: true, time: videoEl.value.currentTime });
  }
}

function onSeeked() {
  if (!suppressSync && videoEl.value) {
    socket.send('player.sync', { paused: videoEl.value.paused, time: videoEl.value.currentTime });
  }
}

function onTimeUpdate() {
  if (!seeking.value && videoEl.value) {
    currentTime.value = videoEl.value.currentTime;
  }
}

function onDurationChange() {
  if (videoEl.value) duration.value = videoEl.value.duration;
}

function onCanPlay() {
  buffering.value = false;
  if (videoEl.value) {
    videoEl.value.volume = isMuted.value ? 0 : volume.value;
    videoEl.value.muted = isMuted.value;
  }
  if (pendingSync) {
    const { paused: p, time, serverTime } = pendingSync;
    pendingSync = null;
    const elapsed = (Date.now() - serverTime) / 1000;
    const target = p ? time : time + elapsed;
    suppressSync = true;
    videoEl.value.currentTime = Math.max(0, target);
    if (!p) videoEl.value.play().catch(() => {});
    setTimeout(() => { suppressSync = false; }, 400);
  }
}

function onVideoError() {
  doToast('⚠️ Could not load video — check the URL or addon stream source.', 5000);
  buffering.value = false;
}

// ── Chromecast & AirPlay Handlers ─────────────────────────────────────────
async function triggerChromecast() {
  if (!room.url) {
    doToast('Load a video first before casting to TV');
    return;
  }
  try {
    await castService.requestChromecast(room.url, room.mediaMeta, currentTime.value, paused.value);
    doToast('Connected to Chromecast 📺');
  } catch (err) {
    if (err?.message) doToast(err.message);
  }
}

function triggerAirPlay() {
  if (videoEl.value) {
    castService.showAirPlayPicker(videoEl.value);
  }
}

// ── Apply remote sync ─────────────────────────────────────────────────────
function applySync({ paused: p, time, serverTime }) {
  if (!videoEl.value) return;
  const elapsed = (Date.now() - serverTime) / 1000;
  const target = p ? time : time + elapsed;

  suppressSync = true;
  videoEl.value.currentTime = Math.max(0, target);
  if (p) {
    videoEl.value.pause();
    if (isCasting.value) castService.sendPauseToCast();
  } else {
    videoEl.value.play().catch(() => {});
    if (isCasting.value) castService.sendPlayToCast();
  }
  if (isCasting.value) {
    castService.sendSeekToCast(target);
  }
  paused.value = p;
  setTimeout(() => { suppressSync = false; }, 400);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function onKeyDown(e) {
  // Ignore when typing in inputs or modal open
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (showSearchModal.value || showAddonsModal.value || showSubtitlesModal.value) return;

  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyC') showSubtitlesModal.value = !showSubtitlesModal.value;
  if (e.code === 'KeyS') showSearchModal.value = true;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  const roomId = route.params.roomId;

  document.addEventListener('keydown', onKeyDown);

  // Setup AirPlay availability detection
  if (videoEl.value) {
    castService.setupAirPlay(videoEl.value, (available) => {
      airplayAvailable.value = available;
    });
  }

  // Setup Google Cast listeners
  const offCastState = castService.on('stateChange', ({ casting }) => {
    if (typeof casting === 'boolean') {
      isCasting.value = casting;
      doToast(casting ? '📺 Streaming to TV (Chromecast)' : 'Chromecast disconnected');
    }
  });

  const offCastSync = castService.on('syncEvent', (evt) => {
    if (evt.type === 'pause_change') {
      paused.value = evt.paused;
      socket.send('player.sync', { paused: evt.paused, time: evt.time || videoEl.value?.currentTime || 0 });
    } else if (evt.type === 'time_change') {
      currentTime.value = evt.time;
    }
  });

  if (!room.roomId) {
    socket.onReconnect = () => socket.send('room.join', { roomId });
    socket.send('room.join', { roomId });
  } else {
    socket.onReconnect = () => {
      socket.send('room.join', { roomId });
    };
  }

  const offs = [
    offCastState,
    offCastSync,
    socket.on('room.joined', (data) => {
      room.$patch({
        roomId: data.roomId,
        isHost: data.isHost,
        you: data.you,
        users: data.users,
        url: data.url,
        mediaMeta: data.mediaMeta || null,
        subtitles: data.subtitles || [],
        player: data.player,
      });

      if (data.url && data.player) {
        pendingSync = data.player;
      }
      if (data.subtitles?.length && !room.currentSubtitle) {
        const defaultSub = data.subtitles.find(s => ['eng', 'en'].includes(s.lang?.toLowerCase())) || data.subtitles[0];
        room.currentSubtitle = defaultSub;
        loadCurrentSubtitle();
      }
    }),

    socket.on('room.users', ({ users }) => {
      room.users = users;
    }),

    socket.on('room.host', ({ hostId }) => {
      room.isHost = room.you?.id === hostId;
    }),

    socket.on('player.url', (data) => {
      room.url = data.url;
      room.mediaMeta = data.mediaMeta || null;
      room.subtitles = data.subtitles || [];
      room.player = { paused: true, time: 0, serverTime: Date.now() };
      paused.value = true;
      currentTime.value = 0;
      duration.value = 0;
      showUrlBar.value = false;
      pendingSync = null;

      // If casting, load new URL on Chromecast
      if (isCasting.value && data.url) {
        castService.loadMediaOnChromecast(data.url, data.mediaMeta, 0, false);
      }

      // Auto-load subtitle
      if (data.subtitles?.length) {
        const defaultSub = data.subtitles.find(s => ['eng', 'en'].includes(s.lang?.toLowerCase())) || data.subtitles[0];
        room.currentSubtitle = defaultSub;
        loadCurrentSubtitle();
      } else {
        room.currentSubtitle = null;
        if (activeSubTrackBlobUrl.value) {
          URL.revokeObjectURL(activeSubTrackBlobUrl.value);
          activeSubTrackBlobUrl.value = null;
        }
      }
    }),

    socket.on('player.sync', (data) => {
      room.player = data;
      applySync(data);
    }),

    socket.on('room.message', (msg) => {
      room.addMessage(msg);
    }),

    socket.on('error', ({ message }) => {
      if (message === 'Room not found') {
        doToast('Room not found — redirecting home', 3000);
        setTimeout(() => router.push('/'), 3000);
      } else {
        doToast(message);
      }
    }),
  ];

  onUnmounted(() => {
    offs.forEach(off => off());
    document.removeEventListener('keydown', onKeyDown);
    clearTimeout(hideTimer);
    clearTimeout(toastTimer);
    if (activeSubTrackBlobUrl.value) {
      URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    }
    socket.onReconnect = null;
    room.reset();
  });
});
</script>

<style scoped>
/* ── Layout ────────────────────────────────────────────────────────────── */
.room {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg);
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* ── Header ────────────────────────────────────────────────────────────── */
.header {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.logo-sm {
  font-size: 1.1rem;
  color: var(--accent);
  animation: heartbeat 2.4s ease-in-out infinite;
}

.room-code {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s;
}
.room-code:hover { border-color: var(--accent); }
.copy-icon { font-size: 0.75rem; color: var(--muted); }

/* Media Title Chip */
.media-title-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  max-width: 220px;
  overflow: hidden;
}
.media-chip-icon { font-size: 0.85rem; }
.media-chip-text {
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-chip-ep {
  color: var(--gold);
  font-size: 0.75rem;
  white-space: nowrap;
}

/* Header Actions */
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  background: var(--surface2);
  border: 1px solid var(--border);
  transition: all 0.15s;
}
.action-btn:hover {
  border-color: var(--accent);
  background: var(--accent-dim);
}
.search-action {
  background: rgba(224, 61, 90, 0.12);
  border-color: rgba(224, 61, 90, 0.4);
  color: #fff;
}
.search-action:hover {
  background: var(--accent);
}

.users-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px 3px 4px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.78rem;
  white-space: nowrap;
  position: relative;
}

.user-avatar {
  width: 22px; height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.user-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}

.buf-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--gold);
  animation: spin 0.8s linear infinite;
  position: absolute;
  top: 0; right: 0;
}

.header-right {
  flex-shrink: 0;
  margin-left: auto;
}

.icon-btn {
  position: relative;
  width: 36px; height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: var(--surface2);
  border: 1px solid var(--border);
  transition: border-color 0.15s, background 0.15s;
  cursor: pointer;
}
.icon-btn:hover, .icon-btn.active {
  border-color: var(--accent);
  background: var(--accent-dim);
}
.icon-btn.sm { width: 28px; height: 28px; font-size: 0.8rem; }

.badge {
  position: absolute;
  top: -4px; right: -4px;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Player ────────────────────────────────────────────────────────────── */
.player-wrap {
  position: relative;
  flex: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: default;
}

.player-wrap.controls-hidden .controls { opacity: 0; pointer-events: none; }
.player-wrap.controls-hidden { cursor: none; }

video {
  width: 100%; height: 100%;
  object-fit: contain;
  display: block;
}

/* Placeholder */
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}
.placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  max-width: 380px;
  animation: fade-in 0.4s ease both;
}
.ph-icon { font-size: 3.2rem; }
.ph-title { font-size: 1.25rem; font-weight: 700; color: var(--text); }
.ph-sub { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }

.placeholder-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-ph-search {
  padding: 10px 18px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
}
.btn-ph-search:hover { filter: brightness(1.15); }

.btn-ph-url {
  padding: 10px 16px;
  background: var(--surface2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  transition: all 0.15s;
}
.btn-ph-url:hover { border-color: var(--accent); background: var(--accent-dim); }

/* Buffering */
.buffering-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
  pointer-events: none;
}
.buf-spinner {
  width: 48px; height: 48px;
  border: 3px solid rgba(255,255,255,0.2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Floating top actions */
.floating-top-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  z-index: 5;
}

.float-btn {
  padding: 5px 12px;
  background: rgba(19,19,24,0.85);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: color 0.15s, border-color 0.15s;
}
.float-btn:hover { color: var(--text); border-color: var(--accent); }

/* URL bar */
.url-bar {
  position: absolute;
  bottom: 72px;
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, 90%);
  display: flex;
  gap: 8px;
  background: rgba(19,19,24,0.95);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 10px 14px;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  z-index: 5;
}
.url-bar input {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text);
}
.url-bar input::placeholder { color: var(--muted); }
.btn-url-load {
  flex-shrink: 0;
  padding: 6px 14px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: filter 0.15s;
}
.btn-url-load:hover:not(:disabled) { filter: brightness(1.12); }
.btn-url-cancel {
  flex-shrink: 0;
  padding: 6px 10px;
  color: var(--muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: color 0.15s;
}
.btn-url-cancel:hover { color: var(--text); }

/* Player controls */
.controls {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 12px 16px;
  background: linear-gradient(transparent, rgba(0,0,0,0.85));
  transition: opacity 0.25s ease;
  z-index: 4;
}
.controls-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctrl-btn {
  flex-shrink: 0;
  width: 36px; height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}
.ctrl-btn:hover { background: rgba(255,255,255,0.12); }
.play-btn { font-size: 1.15rem; }

.sub-ctrl-btn {
  width: 34px;
  height: 34px;
  background: var(--surface2);
  border: 1px solid var(--border);
}
.cc-badge {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}
.sub-ctrl-btn.sub-active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

.time-display {
  font-size: 0.8rem;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.time-display.muted { color: rgba(255,255,255,0.5); }

.seek-bar {
  flex: 1;
  height: 4px;
  accent-color: var(--accent);
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.volume-bar {
  width: 70px;
  flex-shrink: 0;
  height: 3px;
  accent-color: var(--text);
}

.ctrl-btn.sm {
  width: 28px;
  height: 28px;
  font-size: 0.88rem;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.sidebar {
  width: 300px;
  flex-shrink: 0;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slide-right 0.2s ease both;
}

.sidebar-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.no-messages {
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
  margin-top: 24px;
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-author {
  font-size: 0.75rem;
  font-weight: 600;
}
.msg-content {
  font-size: 0.88rem;
  color: var(--text);
  word-break: break-word;
  line-height: 1.5;
}
.msg-own .msg-author { text-align: right; }
.msg-own .msg-content { align-self: flex-end; text-align: right; }

.chat-form {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}
.chat-input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.88rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.chat-input:focus { border-color: var(--accent); }
.chat-input::placeholder { color: var(--muted); }
.chat-send {
  flex-shrink: 0;
  width: 36px; height: 36px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.15s;
}
.chat-send:hover:not(:disabled) { filter: brightness(1.15); }

/* ── Toast ──────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 10px 20px;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  pointer-events: none;
  z-index: 100;
  white-space: nowrap;
}

.toast-enter-active, .toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* ── Mobile ─────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .main { flex-direction: column; }
  .player-wrap { min-height: 40vh; }
  .sidebar { width: 100%; flex: 1; border-left: none; border-top: 1px solid var(--border); }
  .user-name { display: none; }
  .btn-label { display: none; }
  .volume-bar { display: none; }
  .url-bar { bottom: 68px; }
  .media-title-chip { display: none; }
}
</style>
