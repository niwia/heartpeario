<template>
  <div class="room-page">

    <!-- ── Room Not Found Overlay ────────────────────────────────── -->
    <div v-if="roomNotFound" class="join-overlay">
      <div class="join-card">
        <div class="join-badge" style="background: rgba(224,61,90,0.2); color: var(--accent);">NOT FOUND</div>
        <h2>Room Not Found</h2>
        <p class="join-sub">
          Room <strong>{{ roomNotFoundCode }}</strong> does not exist or all viewers have left.
        </p>
        <router-link to="/" class="btn-join-room" style="text-decoration: none; text-align: center; margin-top: 8px;">
          Return Home &amp; Create Room
        </router-link>
      </div>
    </div>

    <!-- ── Join Room Prompt (for direct link invites) ────────────────── -->
    <div v-if="showJoinPrompt && !roomNotFound" class="join-overlay">
      <div class="join-card">
        <div class="join-badge">Room {{ cleanRouteCode }}</div>
        <h2>Welcome to HeartPeario</h2>
        <p class="join-sub">Choose a display name so your friends know who you are in the room.</p>
        <form class="join-form" @submit.prevent="confirmJoinName">
          <input
            ref="joinNameInputEl"
            v-model="joinNameInput"
            type="text"
            placeholder="Enter your name (e.g. Alex, Sam)…"
            maxlength="25"
            autofocus
          />
          <button type="submit" class="btn-join-room" :disabled="!joinNameInput.trim()">
            Join Watch Party
          </button>
        </form>
      </div>
    </div>

    <!-- ── Rename Modal ─────────────────────────────────────────────── -->
    <div v-if="showRenameModal" class="join-overlay" @click.self="showRenameModal = false">
      <div class="join-card">
        <h2>Change Your Display Name</h2>
        <form class="join-form" @submit.prevent="saveNewName">
          <input
            v-model="renameInput"
            type="text"
            placeholder="Your name…"
            maxlength="25"
          />
          <div class="rename-actions">
            <button type="button" class="btn-cancel" @click="showRenameModal = false">Cancel</button>
            <button type="submit" class="btn-join-room" :disabled="!renameInput.trim()">Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── Header ─────────────────────────────────────────────────── -->
    <header class="header">
      <div class="header-left">
        <router-link to="/" class="logo">
          <span class="logo-heart">♥</span>
          <span class="logo-text">HeartPeario</span>
        </router-link>

        <div class="room-code-badge" @click="copyRoomLink" title="Click to copy invite link">
          <span class="room-label">ROOM</span>
          <span class="room-id">{{ room.roomId }}</span>
          <Icon :name="copied ? 'check' : 'copy'" size="14" class="copy-icon" />
          <span v-if="copied" class="copied-tooltip">Copied!</span>
        </div>

        <button class="header-btn" @click="showSearchModal = true" title="Search Movies & Shows with Stremio Addons">
          <Icon name="search" size="15" />
          <span>Search</span>
        </button>

        <button class="header-btn" @click="showAddonsModal = true" title="Manage Stremio Addons">
          <Icon name="addons" size="15" />
          <span>Addons</span>
        </button>

        <button class="header-btn" @click="toggleUrlBar" title="Paste Direct Stream URL">
          <Icon name="link" size="15" />
          <span>Direct URL</span>
        </button>
      </div>

      <div class="header-right">
        <!-- Users dropdown / list -->
        <div class="users-pill">
          <Icon name="user" size="14" />
          <span class="user-count">{{ room.users.length }}</span>
          <div class="users-avatar-stack">
            <span
              v-for="u in room.users"
              :key="u.id"
              class="user-dot"
              :style="{ background: u.color }"
              :title="u.name + (u.id === room.you?.id ? ' (You)' : '')"
            >
              {{ u.name.charAt(0).toUpperCase() }}
            </span>
          </div>
        </div>

        <!-- You / Rename Button -->
        <button
          v-if="room.you"
          class="user-chip-btn"
          @click="openRenameModal"
          title="Click to change your display name"
        >
          <span class="user-color-dot" :style="{ background: room.you.color }"></span>
          <span class="user-chip-name">{{ room.you.name }}</span>
        </button>

        <!-- Toggle Chat -->
        <button
          id="hp-toggle-chat"
          class="icon-btn"
          :class="{ active: chatOpen }"
          @click="chatOpen = !chatOpen"
          title="Toggle Chat"
          :aria-pressed="chatOpen"
        >
          <Icon name="chat" size="16" />
          <span v-if="unread > 0 && !chatOpen" class="badge">{{ unread }}</span>
        </button>
      </div>
    </header>

    <!-- ── Main Area ────────────────────────────────────────────────── -->
    <div class="main">

      <!-- ── Player ───────────────────────────────────────────────── -->
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
            <div class="ph-icon-wrap">
              <Icon name="play" size="42" />
            </div>
            <p class="ph-title">No stream playing</p>
            <p class="ph-sub">Search for a movie or TV show with Stremio addons, or paste a direct video link.</p>
            <div class="placeholder-actions">
              <button class="btn-ph-search" @click="showSearchModal = true">
                <Icon name="search" size="16" />
                <span>Search Catalog</span>
              </button>
              <button class="btn-ph-url" @click="openUrlBar">
                <Icon name="link" size="16" />
                <span>Paste Stream URL</span>
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
          webkit-playsinline
          x-webkit-airplay="allow"
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

        <!-- Tap-to-Play Overlay for Mobile Autoplay Policy -->
        <div v-if="room.url && needsUserTapToPlay" class="tap-play-overlay" @click="handleUserTapToPlay">
          <div class="tap-play-btn">
            <Icon name="play" size="28" />
            <span>Tap to Watch in Sync</span>
          </div>
        </div>

        <!-- Direct URL bar -->
        <div v-if="showUrlBar" class="url-bar-wrap">
          <form class="url-bar" @submit.prevent="setDirectUrl">
            <input
              ref="urlInputEl"
              v-model="urlInput"
              type="url"
              placeholder="Paste direct video URL (MP4, MKV, WebM, HLS m3u8)…"
              spellcheck="false"
            />
            <button type="submit" class="btn-load-url" :disabled="!urlInput.trim()">
              Load for Room
            </button>
            <button type="button" class="btn-close-url" @click="showUrlBar = false">
              <Icon name="close" size="16" />
            </button>
          </form>
        </div>

        <!-- Floating Quick Action buttons on video hover -->
        <div class="player-floating-actions" v-if="room.url && !controlsHidden">
          <button class="float-btn" @click="showSearchModal = true" title="Search another title">
            <Icon name="search" size="14" />
            <span>Search</span>
          </button>
          <button class="float-btn" @click="openUrlBar" title="Paste a direct URL">
            <Icon name="link" size="14" />
            <span>Direct Link</span>
          </button>
        </div>

        <!-- Media Info Top Overlay -->
        <div v-if="room.mediaMeta && !controlsHidden && room.url" class="media-title-overlay">
          <span class="m-title">{{ room.mediaMeta.title }}</span>
          <span v-if="room.mediaMeta.episodeTitle" class="m-ep">{{ room.mediaMeta.episodeTitle }}</span>
          <span v-if="room.mediaMeta.year" class="m-year">({{ room.mediaMeta.year }})</span>
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
              <Icon :name="paused ? 'play' : 'pause'" size="20" />
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
              @input="onSeekInput"
              @mousedown="isUserScrubbing = true"
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
              <Icon name="subtitles" size="18" />
            </button>

            <!-- Volume & Mute -->
            <div class="volume-wrap">
              <button
                id="hp-mute-btn"
                class="ctrl-btn sm"
                :title="isMuted || volume === 0 ? 'Unmute (M)' : 'Mute (M)'"
                @click="toggleMute"
              >
                <Icon :name="isMuted || volume === 0 ? 'mute' : 'volume'" size="18" />
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
              <Icon name="airplay" size="18" />
            </button>

            <!-- Google Cast / Chromecast button -->
            <button
              id="hp-cast-btn"
              class="ctrl-btn sm sub-ctrl-btn"
              :class="{ 'sub-active': isCasting }"
              :title="isCasting ? 'Connected to TV (Chromecast)' : 'Cast to TV Screen (Chromecast)'"
              @click="triggerChromecast"
            >
              <Icon name="cast" size="18" />
            </button>

            <!-- Fullscreen -->
            <button
              id="hp-fullscreen"
              class="ctrl-btn"
              title="Fullscreen (F)"
              @click="toggleFullscreen"
            >
              <Icon name="fullscreen" size="18" />
            </button>
          </div>
        </div>
      </div>

      <!-- ── Chat sidebar ────────────────────────────────────────── -->
      <transition name="fade">
        <aside class="sidebar" v-if="chatOpen">

          <div class="sidebar-header">
            <span>Room Chat</span>
            <button class="icon-btn sm" @click="chatOpen = false" title="Close">
              <Icon name="close" size="14" />
            </button>
          </div>

          <!-- Messages -->
          <div class="messages" ref="messagesEl">
            <div v-if="room.messages.length === 0" class="chat-empty">
              <p>No messages yet.</p>
              <p class="chat-empty-sub">Play/pause actions and chat messages will appear here in real-time.</p>
            </div>

            <div
              v-for="(msg, i) in room.messages"
              :key="i"
              class="msg"
              :class="{
                mine: msg.userId === room.you?.id && !msg.isSystem,
                'system-msg': msg.isSystem,
              }"
            >
              <!-- System event message -->
              <div v-if="msg.isSystem" class="system-msg-inner">
                <span class="msg-ts">[{{ fmtTimestamp(msg.ts) }}]</span>
                <span class="system-text">{{ msg.content }}</span>
              </div>

              <!-- Standard user chat message -->
              <template v-else>
                <div class="msg-meta">
                  <span class="msg-author" :style="{ color: msg.color }">{{ msg.name }}</span>
                  <span class="msg-ts">{{ fmtTimestamp(msg.ts) }}</span>
                </div>
                <div class="msg-body">{{ msg.content }}</div>
              </template>
            </div>
          </div>

          <!-- Input -->
          <form class="chat-form" @submit.prevent="sendMessage">
            <input
              id="hp-chat-input"
              v-model="chatInput"
              type="text"
              placeholder="Send message to room…"
              maxlength="300"
              autocomplete="off"
            />
            <button type="submit" class="btn-send" :disabled="!chatInput.trim()" title="Send">
              <Icon name="send" size="16" />
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import socket from '@/services/socket';
import { createVttUrlFromRemote, srtToVtt } from '@/services/subtitle.service';
import castService from '@/services/cast.service';

import Icon from '@/components/Icon.vue';
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
const showJoinPrompt = ref(false);
const showRenameModal = ref(false);
const joinNameInput = ref('');
const renameInput = ref('');
const joinNameInputEl = ref(null);

const cleanRouteCode = computed(() => {
  return (route.params.roomId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
});
const roomNotFound = ref(false);
const roomNotFoundCode = ref('');

const activeSubTrackBlobUrl = ref(null);
const isCasting = ref(false);
const airplayAvailable = ref(false);
const needsUserTapToPlay = ref(false);

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
const isUserScrubbing = ref(false);

const chatOpen   = ref(true);
const unread     = ref(0);
const chatInput  = ref('');
const urlInput   = ref('');
const showUrlBar = ref(false);

const copied     = ref(false);
const toast      = ref('');
const controlsHidden = ref(false);

// ── Sync Engine Guard ─────────────────────────────────────────────────────
let isApplyingRemoteSync = false;
let remoteSyncTimer = null;
let pendingSync = null;
let hideTimer = null;
let toastTimer = null;
let seekDebounceTimer = null;

function logDebug(...args) {
  const ts = new Date().toTimeString().split(' ')[0];
  console.log(`[HeartPeario ${ts}]`, ...args);
}

// ── Subtitle Management ───────────────────────────────────────────────────
async function loadCurrentSubtitle() {
  if (!room.currentSubtitle?.url) {
    if (activeSubTrackBlobUrl.value) {
      URL.revokeObjectURL(activeSubTrackBlobUrl.value);
      activeSubTrackBlobUrl.value = null;
    }
    return;
  }
  try {
    const vttUrl = await createVttUrlFromRemote(room.currentSubtitle.url, room.subtitleOffsetMs);
    if (activeSubTrackBlobUrl.value) URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = vttUrl;
    logDebug('Loaded subtitle track:', room.currentSubtitle.lang);
  } catch (err) {
    logDebug('Failed to load subtitle:', err);
    doToast('Failed to load subtitle track');
  }
}

function onSelectSubtitle(sub) {
  room.currentSubtitle = sub;
  loadCurrentSubtitle();
  doToast(sub ? `Subtitles: ${sub.lang}` : 'Subtitles disabled');
}

function onSetSubtitleOffset(offsetMs) {
  room.subtitleOffsetMs = offsetMs;
  loadCurrentSubtitle();
}

function onLoadCustomSubtitle({ name, content }) {
  try {
    const vtt = srtToVtt(content, room.subtitleOffsetMs);
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    if (activeSubTrackBlobUrl.value) URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = url;
    room.currentSubtitle = { lang: name, url: 'custom' };
    showSubtitlesModal.value = false;
    doToast(`Loaded custom subtitle: ${name}`);
  } catch (err) {
    doToast('Failed to parse subtitle file');
  }
}

// ── Stream / URL Management ───────────────────────────────────────────────
function onStreamSelected({ url, mediaMeta, subtitles }) {
  room.url = url;
  room.mediaMeta = mediaMeta;
  room.subtitles = subtitles || [];
  room.currentSubtitle = null;
  if (activeSubTrackBlobUrl.value) {
    URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = null;
  }

  socket.send('player.url', { url, mediaMeta, subtitles });

  if (subtitles?.length) {
    const defaultSub = subtitles.find(s => ['eng', 'en'].includes(s.lang?.toLowerCase())) || subtitles[0];
    room.currentSubtitle = defaultSub;
    loadCurrentSubtitle();
  }

  doToast(`Loaded: ${mediaMeta.title}`);
}

function toggleUrlBar() {
  showUrlBar.value = !showUrlBar.value;
  if (showUrlBar.value) {
    nextTick(() => urlInputEl.value?.focus());
  }
}

function openUrlBar() {
  showUrlBar.value = true;
  nextTick(() => urlInputEl.value?.focus());
}

function setDirectUrl() {
  const url = urlInput.value.trim();
  if (!url) return;
  room.url = url;
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
  doToast('Loaded direct video link');
}

// ── Chat & Scroll ─────────────────────────────────────────────────────────
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

// ── Chromecast & AirPlay Handlers ─────────────────────────────────────────
async function triggerChromecast() {
  if (!room.url) {
    doToast('Load a video first before casting to TV');
    return;
  }
  try {
    await castService.requestChromecast(room.url, room.mediaMeta, currentTime.value, paused.value);
    doToast('Connected to Chromecast');
  } catch (err) {
    if (err?.message) doToast(err.message);
  }
}

function triggerAirPlay() {
  if (videoEl.value) {
    castService.showAirPlayPicker(videoEl.value);
  }
}

// ── Fullscreen (iOS Safari & Standard) ────────────────────────────────────
function toggleFullscreen() {
  const el = videoEl.value;
  if (!el) return;

  // iOS Safari native fullscreen on video element
  if (el.webkitEnterFullscreen) {
    el.webkitEnterFullscreen();
    return;
  }

  // Standard fullscreen API
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } else {
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }
}

// ── Player Controls & Native Event Handlers ───────────────────────────────
function handleUserTapToPlay() {
  needsUserTapToPlay.value = false;
  if (videoEl.value) {
    videoEl.value.play().catch(() => {});
  }
}

function togglePlay() {
  if (!videoEl.value || !room.url) return;
  needsUserTapToPlay.value = false;
  if (videoEl.value.paused) {
    videoEl.value.play().catch((err) => {
      if (err.name === 'NotAllowedError') needsUserTapToPlay.value = true;
    });
  } else {
    videoEl.value.pause();
  }
}

function toggleMute() {
  if (isMuted.value) {
    isMuted.value = false;
    volume.value = prevVolume.value || 1;
  } else {
    prevVolume.value = volume.value;
    isMuted.value = true;
    volume.value = 0;
  }
  if (videoEl.value) {
    videoEl.value.volume = isMuted.value ? 0 : volume.value;
    videoEl.value.muted = isMuted.value;
  }
}

function onSeekInput(e) {
  currentTime.value = parseFloat(e.target.value);
}

function onSeekEnd(e) {
  isUserScrubbing.value = false;
  const targetTime = parseFloat(e.target.value);
  if (videoEl.value) {
    videoEl.value.currentTime = targetTime;
  }
  clearTimeout(seekDebounceTimer);
  seekDebounceTimer = setTimeout(() => {
    logDebug('User seeked to:', targetTime);
    socket.send('player.sync', { paused: paused.value, time: targetTime });
  }, 100);
}

function onPlay() {
  paused.value = false;
  needsUserTapToPlay.value = false;
  if (!isApplyingRemoteSync && videoEl.value) {
    logDebug('Native Play emitted -> broadcasting sync');
    socket.send('player.sync', { paused: false, time: videoEl.value.currentTime });
  }
}

function onPause() {
  paused.value = true;
  controlsHidden.value = false;
  clearTimeout(hideTimer);
  if (!isApplyingRemoteSync && videoEl.value) {
    logDebug('Native Pause emitted -> broadcasting sync');
    socket.send('player.sync', { paused: true, time: videoEl.value.currentTime });
  }
}

function onSeeked() {
  if (!isApplyingRemoteSync && !isUserScrubbing.value && videoEl.value) {
    logDebug('Native Seeked emitted -> broadcasting sync');
    socket.send('player.sync', { paused: videoEl.value.paused, time: videoEl.value.currentTime });
  }
}

function onTimeUpdate() {
  if (!isUserScrubbing.value && videoEl.value) {
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
    applySync({ paused: p, time, serverTime });
  }
}

function onVideoError() {
  doToast('Could not load stream — check the URL or addon source', 5000);
  buffering.value = false;
}

// ── Remote Sync Engine ────────────────────────────────────────────────────
function applySync({ paused: p, time, serverTime }) {
  if (!videoEl.value) return;

  const elapsed = (Date.now() - serverTime) / 1000;
  const target = p ? time : time + Math.max(0, elapsed);

  isApplyingRemoteSync = true;
  clearTimeout(remoteSyncTimer);

  logDebug(`Remote Sync: ${p ? 'PAUSE' : 'PLAY'} at ${target.toFixed(1)}s (drift: ${(videoEl.value.currentTime - target).toFixed(1)}s)`);

  if (p) {
    videoEl.value.pause();
    videoEl.value.currentTime = Math.max(0, target);
    paused.value = true;
    needsUserTapToPlay.value = false;
    if (isCasting.value) {
      castService.sendPauseToCast();
      castService.sendSeekToCast(target);
    }
  } else {
    // If drift is significant (> 1.5s), seek to align
    if (Math.abs(videoEl.value.currentTime - target) > 1.5) {
      videoEl.value.currentTime = Math.max(0, target);
    }
    videoEl.value.play().catch((err) => {
      if (err.name === 'NotAllowedError') {
        needsUserTapToPlay.value = true;
      }
    });
    paused.value = false;
    if (isCasting.value) {
      castService.sendPlayToCast();
      castService.sendSeekToCast(target);
    }
  }

  remoteSyncTimer = setTimeout(() => {
    isApplyingRemoteSync = false;
  }, 500);
}

// ── UI Helpers ────────────────────────────────────────────────────────────
function showControls() {
  controlsHidden.value = false;
  scheduleHideControls();
}

function scheduleHideControls() {
  clearTimeout(hideTimer);
  if (!paused.value && room.url) {
    hideTimer = setTimeout(() => {
      controlsHidden.value = true;
    }, 3500);
  }
}

function copyRoomLink() {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  });
}

function doToast(msg, duration = 3000) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, duration);
}

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const h = Math.floor(m / 60);
  const remM = (m % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${remM}:${s}` : `${m}:${s}`;
}

function fmtTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toTimeString().split(' ')[0];
}

// ── Name Prompts ──────────────────────────────────────────────────────────
function confirmJoinName() {
  const name = joinNameInput.value.trim();
  if (!name) return;
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
  showJoinPrompt.value = false;
  const rawCode = route.params.roomId;
  const roomId = (rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  socket.send('room.join', { roomId });
}

function openRenameModal() {
  renameInput.value = room.you?.name || '';
  showRenameModal.value = true;
}

function saveNewName() {
  const name = renameInput.value.trim();
  if (!name) return;
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
  showRenameModal.value = false;
  doToast(`Name changed to ${name}`);
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────
function onKeyDown(e) {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (showSearchModal.value || showAddonsModal.value || showSubtitlesModal.value || showJoinPrompt.value || showRenameModal.value || roomNotFound.value) return;

  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyC') showSubtitlesModal.value = !showSubtitlesModal.value;
  if (e.code === 'KeyS') showSearchModal.value = true;
}

// ── Watchers ──────────────────────────────────────────────────────────────
watch(() => room.messages.length, () => {
  scrollMessages();
  if (!chatOpen.value) unread.value++;
});

watch(chatOpen, (open) => {
  if (open) {
    unread.value = 0;
    scrollMessages();
  }
});

watch(volume, (v) => {
  if (videoEl.value) {
    videoEl.value.volume = isMuted.value ? 0 : v;
    if (v > 0) isMuted.value = false;
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(() => {
  const rawCode = route.params.roomId;
  const roomId = (rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const savedName = localStorage.getItem('hp-username');

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
      doToast(casting ? 'Streaming to TV (Chromecast)' : 'Chromecast disconnected');
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

  if (savedName) socket.send('user.name', { name: savedName });
  socket.onReconnect = () => socket.send('room.join', { roomId });
  socket.send('room.join', { roomId });

  if (!savedName && !room.roomId) {
    showJoinPrompt.value = true;
  }

  const offs = [
    offCastState,
    offCastSync,
    socket.on('room.joined', (data) => {
      roomNotFound.value = false;
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

    socket.on('error', (err) => {
      if (err.message === 'Room not found') {
        roomNotFound.value = true;
        roomNotFoundCode.value = err.requestedCode || roomId;
      } else {
        doToast(err.message || 'An error occurred');
      }
    }),
  ];

  onUnmounted(() => {
    offs.forEach(off => off());
    document.removeEventListener('keydown', onKeyDown);
    clearTimeout(hideTimer);
    clearTimeout(toastTimer);
    clearTimeout(remoteSyncTimer);
    clearTimeout(seekDebounceTimer);
    if (activeSubTrackBlobUrl.value) {
      URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    }
    socket.onReconnect = null;
    room.reset();
  });
});
</script>

<style scoped>
.room-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  position: relative;
}

/* ── Join / Rename Overlays ─────────────────────────────────────────────── */
.join-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 2000;
  animation: fade-in 0.25s ease both;
}

.join-card {
  width: min(440px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.8);
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
}

.join-badge {
  align-self: center;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 999px;
  letter-spacing: 0.08em;
}

.join-card h2 {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
}

.join-sub {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.45;
}

.join-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.join-form input {
  background: var(--surface2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  font-size: 0.95rem;
  color: var(--text);
  text-align: center;
  transition: border-color 0.15s;
}
.join-form input:focus { border-color: var(--accent); }

.btn-join-room {
  padding: 12px 20px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  transition: filter 0.15s;
}
.btn-join-room:hover:not(:disabled) { filter: brightness(1.15); }

.rename-actions {
  display: flex;
  gap: 8px;
}
.btn-cancel {
  flex: 1;
  padding: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 0.9rem;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  height: 54px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 10;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  font-weight: 700;
  font-size: 1.05rem;
  margin-right: 6px;
}
.logo-heart { color: var(--accent); font-size: 1.2rem; }
.logo-text { color: var(--text); }

.room-code-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  position: relative;
  transition: border-color 0.15s;
}
.room-code-badge:hover { border-color: var(--border-light); }
.room-label { font-size: 0.7rem; color: var(--muted); font-weight: 700; }
.room-id { font-size: 0.85rem; font-weight: 700; color: var(--gold); letter-spacing: 0.05em; }
.copy-icon { color: var(--muted); }

.copied-tooltip {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  animation: fade-in 0.15s ease;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.84rem;
  font-weight: 600;
  transition: all 0.15s;
}
.header-btn:hover { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }

.users-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 999px;
}
.user-count { font-size: 0.8rem; font-weight: 600; color: var(--muted); }

.users-avatar-stack {
  display: flex;
  align-items: center;
  margin-left: 2px;
}
.user-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  margin-left: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fff;
}
.user-dot:first-child { margin-left: 0; }

.user-chip-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s;
}
.user-chip-btn:hover { border-color: var(--accent); }
.user-color-dot { width: 8px; height: 8px; border-radius: 50%; }

.icon-btn {
  width: 34px; height: 34px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  position: relative;
  transition: all 0.15s;
}
.icon-btn:hover { border-color: var(--border-light); }
.icon-btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
.icon-btn.sm { width: 28px; height: 28px; }

.badge {
  position: absolute;
  top: -4px; right: -4px;
  background: var(--accent);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 16px; height: 16px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* ── Main Layout ────────────────────────────────────────────────────────── */
.main {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* ── Player ─────────────────────────────────────────────────────────────── */
.player-wrap {
  flex: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  user-select: none;
}

video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 440px;
  gap: 10px;
}
.ph-icon-wrap {
  width: 72px; height: 72px;
  border-radius: 50%;
  background: var(--surface2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  margin-bottom: 6px;
}
.ph-title { font-size: 1.25rem; font-weight: 700; color: var(--text); }
.ph-sub { font-size: 0.88rem; color: var(--muted); line-height: 1.45; }

.placeholder-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.btn-ph-search, .btn-ph-url {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-ph-search { background: var(--accent); color: #fff; }
.btn-ph-search:hover { filter: brightness(1.15); }
.btn-ph-url { background: var(--surface2); border: 1px solid var(--border); color: var(--text); }
.btn-ph-url:hover { border-color: var(--border-light); }

.buffering-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.buf-spinner {
  width: 48px; height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.tap-play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
  cursor: pointer;
  animation: fade-in 0.2s ease both;
}
.tap-play-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--accent);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  padding: 16px 28px;
  border-radius: 999px;
  box-shadow: 0 8px 32px rgba(224, 61, 90, 0.5);
  transition: transform 0.15s;
}
.tap-play-btn:hover { transform: scale(1.05); }

/* Floating top actions on player hover */
.player-floating-actions {
  position: absolute;
  top: 16px; right: 16px;
  display: flex;
  gap: 8px;
  z-index: 5;
}
.float-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(18, 18, 26, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 600;
  backdrop-filter: blur(8px);
  transition: all 0.15s;
}
.float-btn:hover { background: var(--surface); border-color: var(--accent); }

/* Media Title Top Overlay */
.media-title-overlay {
  position: absolute;
  top: 16px; left: 16px;
  background: rgba(18, 18, 26, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 5;
}
.m-title { font-size: 0.88rem; font-weight: 700; color: #fff; }
.m-ep { font-size: 0.8rem; color: var(--gold); }
.m-year { font-size: 0.8rem; color: var(--muted); }

/* Direct URL Bar */
.url-bar-wrap {
  position: absolute;
  top: 16px; left: 50%;
  transform: translateX(-50%);
  width: min(600px, 90%);
  z-index: 20;
}
.url-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 6px 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
}
.url-bar input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 0.9rem;
  color: var(--text);
  padding: 6px 8px;
}
.url-bar input:focus { outline: none; }
.btn-load-url {
  padding: 8px 14px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.btn-close-url {
  color: var(--muted);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-close-url:hover { color: var(--text); }

/* ── Player Controls Overlay ────────────────────────────────────────────── */
.controls {
  position: absolute;
  inset-x: 0; bottom: 0;
  padding: 24px 20px 16px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.4) 60%, transparent 100%);
  transition: opacity 0.25s ease, transform 0.25s ease;
  z-index: 10;
}
.player-wrap.controls-hidden .controls {
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px);
}

.controls-inner {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ctrl-btn {
  width: 36px; height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  backdrop-filter: blur(4px);
  transition: all 0.15s;
  flex-shrink: 0;
}
.ctrl-btn:hover { background: rgba(255, 255, 255, 0.2); border-color: rgba(255, 255, 255, 0.3); }
.ctrl-btn.play-btn {
  width: 42px; height: 42px;
  background: var(--accent);
  border-color: var(--accent);
}
.ctrl-btn.play-btn:hover { filter: brightness(1.15); }
.ctrl-btn.sm { width: 32px; height: 32px; }

.sub-ctrl-btn.sub-active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

.time-display {
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.time-display.muted { color: rgba(255, 255, 255, 0.5); }

.seek-bar {
  flex: 1;
  height: 6px;
  accent-color: var(--accent);
  cursor: pointer;
}

.volume-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.volume-bar {
  width: 60px;
  height: 4px;
  accent-color: var(--accent);
  cursor: pointer;
}

/* ── Chat Sidebar ───────────────────────────────────────────────────────── */
.sidebar {
  width: 320px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-empty {
  text-align: center;
  padding: 40px 10px;
  color: var(--muted);
  font-size: 0.85rem;
}
.chat-empty-sub { font-size: 0.78rem; margin-top: 4px; }

.msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 90%;
  animation: fade-in 0.15s ease both;
}
.msg.mine {
  align-self: flex-end;
  align-items: flex-end;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
}
.msg-author { font-weight: 700; }
.msg-ts { font-size: 0.7rem; color: var(--muted); font-variant-numeric: tabular-nums; }

.msg-body {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}
.msg.mine .msg-body {
  background: var(--accent-dim);
  border-color: rgba(224, 61, 90, 0.3);
}

/* System messages in chat */
.system-msg {
  align-self: center;
  max-width: 100%;
  margin: 4px 0;
}
.system-msg-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.76rem;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.03);
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.system-text { font-style: italic; }

.chat-form {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.chat-form input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.85rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.chat-form input:focus { border-color: var(--accent); }

.btn-send {
  width: 36px; height: 36px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: filter 0.15s;
}
.btn-send:hover:not(:disabled) { filter: brightness(1.15); }
.btn-send:disabled { opacity: 0.5; }

/* ── Toast ──────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid var(--border-light);
  color: var(--text);
  padding: 10px 18px;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 9999;
  pointer-events: none;
}
.toast-enter-active, .toast-leave-active { transition: all 0.2s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 10px); }
</style>
