<template>
  <div class="room">

    <!-- ── 404 Room Not Found Overlay ────────────────────────────────── -->
    <div v-if="roomNotFound" class="room-not-found-overlay">
      <div class="not-found-card">
        <div class="nf-icon-wrap">
          <Icon name="stop" size="36" />
        </div>
        <h2>Room Not Found</h2>
        <p class="nf-desc">
          Room <code>{{ roomNotFoundCode }}</code> doesn't exist or expired because all users left.
        </p>
        <div class="nf-actions">
          <router-link to="/" class="btn-return-home">
            Return Home &amp; Create Room
          </router-link>
        </div>
      </div>
    </div>

    <!-- ── Join Room Prompt ─────────────────────────────────────────── -->
    <div v-if="showJoinPrompt && !roomNotFound" class="join-overlay">
      <div class="join-card">
        <div class="join-badge">
          <span>ROOM: {{ cleanRouteCode }}</span>
        </div>
        <h2>Join Watch Party</h2>
        <p class="join-sub">Choose your display name for this session.</p>
        <form class="join-form" @submit.prevent="confirmJoinName">
          <input
            ref="joinNameInputEl"
            v-model="joinNameInput"
            type="text"
            placeholder="Your name…"
            maxlength="25"
            autofocus
          />
          <button type="submit" class="btn-join-room" :disabled="!joinNameInput.trim()">
            Join Watch Party →
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

        <!-- Encrypted Profile & History Vault Button -->
        <button
          class="user-chip-btn profile-vault-btn"
          @click="showProfileModal = true"
          title="Encrypted Profile, Watch History & Buddies"
        >
          <span class="user-color-dot" :style="{ background: profileStore.current.avatarColor }"></span>
          <span class="user-chip-name">{{ profileStore.current.name }}</span>
          <span class="vault-mini-tag">🔒 Vault</span>
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

        <!-- Video element with Subtitles Track for Web & Native iOS/Android Players -->
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
          @seeking="onSeeking"
          @seeked="onSeeked"
          @timeupdate="onTimeUpdate"
          @durationchange="onDurationChange"
          @waiting="onWaiting"
          @canplay="onCanPlay"
          @error="onVideoError"
          @dblclick.stop="toggleFullscreen"
        >
          <template v-if="room.subtitles && room.subtitles.length">
            <track
              v-for="sub in room.subtitles"
              :key="sub.id || sub.url || sub.lang"
              kind="subtitles"
              :src="sub.url"
              :srclang="sub.lang || 'en'"
              :label="sub.langName || sub.lang || 'Subtitles'"
              :default="sub.lang === room.currentSubtitle?.lang"
            />
          </template>
          <track
            v-else-if="activeSubTrackBlobUrl"
            kind="subtitles"
            :src="activeSubTrackBlobUrl"
            :srclang="room.currentSubtitle?.lang || 'en'"
            :label="room.currentSubtitle?.lang || 'Subtitles'"
            default
          />
        </video>

        <!-- All-Peers Buffer & Readiness Sync Banner (ONLY shown when paused & waiting for peers) -->
        <div v-if="roomReadiness.waiting && paused && room.url && room.users.length > 1" class="readiness-overlay">
          <div class="readiness-card">
            <div class="readiness-spinner"></div>
            <div class="readiness-info">
              <span class="readiness-title">Syncing Viewers… ({{ roomReadiness.readyCount }}/{{ roomReadiness.totalCount }} Ready)</span>
              <span v-if="roomReadiness.waitingFor.length" class="readiness-sub">
                Waiting for: <strong>{{ roomReadiness.waitingFor.join(', ') }}</strong> to buffer
              </span>
            </div>
            <button v-if="room.isHost" class="btn-force-play" @click="forcePlayNow" title="Start playing without waiting">
              Force Play
            </button>
          </div>
        </div>

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

        <!-- Media Info Top Overlay (shown on hover) -->
        <div v-if="room.mediaMeta && !controlsHidden && room.url" class="media-title-overlay">
          <span class="m-title">{{ room.mediaMeta.title }}</span>
          <span v-if="room.mediaMeta.episodeTitle" class="m-ep">{{ room.mediaMeta.episodeTitle }}</span>
          <span v-if="room.mediaMeta.year" class="m-year">({{ room.mediaMeta.year }})</span>
        </div>

        <!-- Controls overlay -->
        <div class="controls" v-if="room.url">
          <div class="controls-inner">

            <!-- Progress bar -->
            <div class="scrub-bar-wrap">
              <input
                type="range"
                class="scrub-bar"
                min="0"
                :max="duration || 100"
                step="0.1"
                :value="currentTime"
                @input="onSeekInput"
                @change="onSeekEnd"
                @mousedown="isUserScrubbing = true"
                @touchstart="isUserScrubbing = true"
                aria-label="Seek video"
              />
              <div
                class="scrub-progress"
                :style="{ width: duration > 0 ? (currentTime / duration) * 100 + '%' : '0%' }"
              ></div>
            </div>

            <!-- Buttons row -->
            <div class="controls-row">
              <div class="controls-left">
                <!-- Play / Pause -->
                <button class="ctrl-btn" @click="togglePlay" :title="paused ? 'Play (Space)' : 'Pause (Space)'">
                  <Icon :name="paused ? 'play' : 'pause'" size="20" />
                </button>

                <!-- Backward 10s -->
                <button class="ctrl-btn" @click="skip(-10)" title="Rewind 10s">
                  <Icon name="backward" size="18" />
                </button>

                <!-- Forward 10s -->
                <button class="ctrl-btn" @click="skip(10)" title="Forward 10s">
                  <Icon name="fastfw" size="18" />
                </button>

                <!-- Volume / Mute -->
                <div class="vol-wrap">
                  <button class="ctrl-btn" @click="toggleMute" :title="isMuted ? 'Unmute (M)' : 'Mute (M)'">
                    <Icon :name="isMuted || volume === 0 ? 'mute' : (volume > 0.5 ? 'vol-high' : 'vol-low')" size="18" />
                  </button>
                  <input
                    type="range"
                    class="vol-slider"
                    min="0"
                    max="1"
                    step="0.05"
                    v-model.number="volume"
                    aria-label="Volume"
                  />
                </div>

                <!-- Time display -->
                <div class="time-display">
                  <span>{{ fmtTime(currentTime) }}</span>
                  <span class="time-sep">/</span>
                  <span>{{ fmtTime(duration) }}</span>
                </div>
              </div>

              <div class="controls-right">
                <!-- Subtitles Button -->
                <button
                  class="ctrl-btn"
                  :class="{ active: !!room.currentSubtitle }"
                  @click="showSubtitlesModal = true"
                  title="Subtitles & Language (C)"
                >
                  <Icon name="subtitles" size="18" />
                  <span v-if="room.currentSubtitle" class="sub-label">
                    {{ room.currentSubtitle.lang?.slice(0, 3).toUpperCase() }}
                  </span>
                </button>

                <!-- AirPlay -->
                <button
                  v-if="airplayAvailable"
                  class="ctrl-btn"
                  @click="triggerAirPlay"
                  title="Stream with Apple AirPlay"
                >
                  <Icon name="airplay" size="18" />
                </button>

                <!-- Google Cast (Chromecast) -->
                <button
                  class="ctrl-btn"
                  :class="{ active: isCasting }"
                  @click="triggerChromecast"
                  title="Stream to TV with Chromecast"
                >
                  <Icon name="cast" size="18" />
                </button>

                <!-- Fullscreen -->
                <button class="ctrl-btn" @click="toggleFullscreen" title="Fullscreen (F)">
                  <Icon name="fullscreen" size="18" />
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      <!-- ── Chat Sidebar ─────────────────────────────────────────── -->
      <aside class="chat-sidebar" :class="{ open: chatOpen }">
        <div class="chat-header">
          <div class="chat-title">
            <Icon name="chat" size="15" />
            <span>Room Chat</span>
          </div>
          <button class="icon-btn sm" @click="chatOpen = false" title="Close Chat">
            <Icon name="close" size="14" />
          </button>
        </div>

        <!-- Message List -->
        <div ref="messagesEl" class="chat-messages">
          <div v-if="room.messages.length === 0" class="chat-empty">
            <Icon name="chat" size="24" />
            <p>Welcome! Messages and sync events appear here.</p>
          </div>

          <div
            v-for="(msg, i) in room.messages"
            :key="i"
            class="chat-msg"
            :class="{
              'system-msg': msg.isSystem,
              'self-msg': !msg.isSystem && msg.userId === room.you?.id,
            }"
          >
            <!-- System message -->
            <template v-if="msg.isSystem">
              <span class="sys-time">[{{ fmtTimestamp(msg.ts) }}]</span>
              <span class="sys-text">{{ msg.content }}</span>
            </template>

            <!-- User message -->
            <template v-else>
              <div class="msg-header">
                <span class="msg-author" :style="{ color: msg.color }">{{ msg.name }}</span>
                <span class="msg-time">{{ fmtTimestamp(msg.ts) }}</span>
              </div>
              <div class="msg-content">{{ msg.content }}</div>
            </template>
          </div>
        </div>

        <!-- Chat Input -->
        <form class="chat-footer" @submit.prevent="sendMessage">
          <input
            v-model="chatInput"
            type="text"
            placeholder="Type a message…"
            maxlength="300"
            autocomplete="off"
          />
          <button type="submit" class="btn-send" :disabled="!chatInput.trim()" title="Send">
            <Icon name="send" size="16" />
          </button>
        </form>
      </aside>

    </div>

    <!-- ── Stremio Catalog Search Modal ─────────────────────────────── -->
    <SearchMediaModal
      v-if="showSearchModal"
      @close="showSearchModal = false"
      @selectStream="onStreamSelected"
    />

    <!-- ── Addon Manager Modal ──────────────────────────────────────── -->
    <AddonManagerModal
      v-if="showAddonsModal"
      @close="showAddonsModal = false"
    />

    <!-- ── Subtitles & Audio Modal ──────────────────────────────────── -->
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

    <!-- ── Encrypted Profile & Watch History Modal ───────────────────── -->
    <ProfileModal
      v-if="showProfileModal"
      @close="showProfileModal = false"
      @selectStream="onStreamSelected"
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
import { useProfileStore } from '@/stores/profile';
import socket from '@/services/socket';
import { createVttUrlFromRemote, srtToVtt } from '@/services/subtitle.service';
import castService from '@/services/cast.service';

import Icon from '@/components/Icon.vue';
import SearchMediaModal from '@/components/SearchMediaModal.vue';
import AddonManagerModal from '@/components/AddonManagerModal.vue';
import SubtitlesModal from '@/components/SubtitlesModal.vue';
import ProfileModal from '@/components/ProfileModal.vue';

const route = useRoute();
const router = useRouter();
const room = useRoomStore();
const profileStore = useProfileStore();

// ── Modals & Casting ──────────────────────────────────────────────────────
const showSearchModal = ref(false);
const showAddonsModal = ref(false);
const showSubtitlesModal = ref(false);
const showProfileModal = ref(false);
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
const roomReadiness = ref({ waiting: false, readyCount: 0, totalCount: 0, waitingFor: [] });

// ── Sync Engine State ─────────────────────────────────────────────────────
let isApplyingRemoteSync = false;
let remoteSyncTimer = null;
let pendingSync = null;
let lastAppliedSeq = 0;
let currentPlayPromise = null;
let hideTimer = null;
let toastTimer = null;
let seekDebounceTimer = null;

function logDebug(...args) {
  const ts = new Date().toTimeString().split(' ')[0];
  console.log(`[HeartPeario ${ts}]`, ...args);
}

// ── Promise-Guarded Play & Pause ──────────────────────────────────────────
async function safePlay() {
  if (!videoEl.value) return;
  needsUserTapToPlay.value = false;
  try {
    currentPlayPromise = videoEl.value.play();
    await currentPlayPromise;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      needsUserTapToPlay.value = true;
    }
  } finally {
    currentPlayPromise = null;
  }
}

async function safePause() {
  if (!videoEl.value) return;
  if (currentPlayPromise) {
    try { await currentPlayPromise; } catch {}
  }
  videoEl.value.pause();
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
  lastAppliedSeq = 0;
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

  // Record to Encrypted Profile Watch History
  if (url && mediaMeta) {
    profileStore.recordWatch({
      id: mediaMeta.id,
      title: mediaMeta.title,
      episodeTitle: mediaMeta.episodeTitle,
      year: mediaMeta.year,
      poster: mediaMeta.poster,
      url,
      progressSeconds: 0,
      durationSeconds: 0,
    });
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
  lastAppliedSeq = 0;
  if (activeSubTrackBlobUrl.value) {
    URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = null;
  }
  socket.send('player.url', { url, mediaMeta: null, subtitles: [] });
  urlInput.value = '';
  showUrlBar.value = false;
}

// ── AirPlay & Cast ────────────────────────────────────────────────────────
function triggerAirPlay() {
  if (videoEl.value) {
    castService.showAirPlayPicker(videoEl.value);
  }
}

function triggerChromecast() {
  if (isCasting.value) {
    castService.stopChromecast();
  } else if (room.url) {
    castService.requestChromecastSession(
      room.url,
      room.mediaMeta,
      currentTime.value,
      paused.value
    );
  } else {
    doToast('Load a video first to cast to TV');
  }
}

// ── Fullscreen Support (with iOS Safari webkitEnterFullscreen) ────────────
function isAppleDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
         (/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
}

function toggleFullscreen() {
  const el = document.querySelector('.player-wrap');
  if (!videoEl.value) return;

  // On Apple Safari / iOS / iPadOS, ALWAYS launch native AVPlayer video fullscreen
  if (isAppleDevice() && typeof videoEl.value.webkitEnterFullscreen === 'function') {
    videoEl.value.webkitEnterFullscreen();
    return;
  }

  // Standard fullscreen API for Desktop & Android
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } else {
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (typeof videoEl.value.webkitEnterFullscreen === 'function') {
      videoEl.value.webkitEnterFullscreen();
    }
  }
}

// ── Player Controls & Native Event Handlers ───────────────────────────────
function handleUserTapToPlay() {
  needsUserTapToPlay.value = false;
  safePlay();
}

function togglePlay() {
  if (!videoEl.value || !room.url) return;
  needsUserTapToPlay.value = false;
  if (videoEl.value.paused) {
    safePlay();
  } else {
    safePause();
  }
}

function skip(deltaSeconds) {
  if (!videoEl.value || !room.url) return;
  const newTime = Math.max(0, Math.min(duration.value || 999999, videoEl.value.currentTime + deltaSeconds));
  videoEl.value.currentTime = newTime;
  currentTime.value = newTime;
  socket.send('player.sync', { paused: paused.value, time: newTime });
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

let waitingBufferTimer = null;
let justUnpausedTimestamp = 0;
let lastSentReady = null;

function setClientReadiness(isReady) {
  if (lastSentReady === isReady) return;
  lastSentReady = isReady;
  socket.send('player.readiness', { ready: isReady, time: videoEl.value?.currentTime || 0 });
}

function onWaiting() {
  clearTimeout(waitingBufferTimer);
  // Ignore transient waiting events right after unpausing (within 1.5s)
  if (Date.now() - justUnpausedTimestamp < 1500) {
    return;
  }
  // Debounce genuine buffering for 1.2s
  waitingBufferTimer = setTimeout(() => {
    if (videoEl.value && videoEl.value.readyState < 3 && !paused.value) {
      buffering.value = true;
      logDebug('Genuine buffer stall detected (>1.2s) -> sending player.buffering');
      socket.send('player.buffering', { buffering: true });
    }
  }, 1200);
}

function onSeeking() {
  clearTimeout(waitingBufferTimer);
  setClientReadiness(false);
}

function onCanPlay() {
  clearTimeout(waitingBufferTimer);
  buffering.value = false;
  setClientReadiness(true);
  socket.send('player.buffering', { buffering: false });
  if (videoEl.value) {
    videoEl.value.volume = isMuted.value ? 0 : volume.value;
    videoEl.value.muted = isMuted.value;
  }
  if (pendingSync) {
    const syncToApply = pendingSync;
    pendingSync = null;
    setTimeout(() => {
      applySync(syncToApply);
    }, 60);
  }
}

function forcePlayNow() {
  socket.send('room.force_play');
}

function onVideoError() {
  doToast('Could not load stream — check the URL or addon source', 5000);
  buffering.value = false;
}

// ── Smart Synchronization Engine ──────────────────────────────────────────
async function applySync(data) {
  if (!videoEl.value || !data) return;

  // Discard older out-of-order or duplicate packets
  if (data.seq && lastAppliedSeq && data.seq <= lastAppliedSeq) {
    logDebug(`Discarding stale/duplicate sync #${data.seq} (current: #${lastAppliedSeq})`);
    return;
  }
  if (data.seq) lastAppliedSeq = data.seq;

  // Clock-skew safe elapsed calculation (clamped between 0 and 2.5s to prevent clock-drift jumps)
  const rawElapsed = data.serverTime ? Math.max(0, (Date.now() - data.serverTime) / 1000) : 0;
  const elapsed = Math.min(2.5, rawElapsed);
  const target = data.paused ? data.time : data.time + elapsed;

  isApplyingRemoteSync = true;
  clearTimeout(remoteSyncTimer);

  const drift = (videoEl.value.currentTime - target);
  logDebug(`ApplySync #${data.seq || 0}: ${data.paused ? 'PAUSE' : 'PLAY'} target=${fmtTime(target)} (${target.toFixed(1)}s, drift: ${drift.toFixed(2)}s, rawElapsed: ${rawElapsed.toFixed(2)}s)`);

  if (data.paused) {
    await safePause();
    if (Math.abs(videoEl.value.currentTime - target) > 0.3) {
      videoEl.value.currentTime = Math.max(0, target);
    }
    paused.value = true;
    needsUserTapToPlay.value = false;
    if (isCasting.value) {
      castService.sendPauseToCast();
      castService.sendSeekToCast(target);
    }
  } else {
    justUnpausedTimestamp = Date.now();
    roomReadiness.value.waiting = false;
    // Only seek if drift exceeds 1.0s to avoid audio clipping / stutter
    if (Math.abs(videoEl.value.currentTime - target) > 1.0) {
      videoEl.value.currentTime = Math.max(0, target);
    }
    await safePlay();
    paused.value = false;
    if (isCasting.value) {
      castService.sendPlayToCast();
      castService.sendSeekToCast(target);
    }
  }

  remoteSyncTimer = setTimeout(() => {
    isApplyingRemoteSync = false;
  }, 400);
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
  const name = joinNameInput.value.trim() || profileStore.current.name || 'Friend';
  profileStore.updateCurrentName(name);
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
  showJoinPrompt.value = false;
  const rawCode = route.params.roomId;
  const roomId = (rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  socket.send('room.join', { roomId });
}

function openRenameModal() {
  renameInput.value = room.you?.name || profileStore.current.name || '';
  showRenameModal.value = true;
}

function saveNewName() {
  const name = renameInput.value.trim();
  if (!name) return;
  profileStore.updateCurrentName(name);
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
  showRenameModal.value = false;
  doToast(`Name changed to ${name}`);
}

// ── Chat ──────────────────────────────────────────────────────────────────
function sendMessage() {
  const content = chatInput.value.trim();
  if (!content) return;
  socket.send('room.message', { content });
  chatInput.value = '';
}

function scrollMessages() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────
function onKeyDown(e) {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (showSearchModal.value || showAddonsModal.value || showSubtitlesModal.value || showProfileModal.value || showJoinPrompt.value || showRenameModal.value || roomNotFound.value) return;

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

// Record friends automatically when room users change
watch(() => room.users, (users) => {
  if (users && users.length > 0) {
    profileStore.recordFriends(users, room.you?.id);
  }
}, { deep: true });

// ── Lifecycle ─────────────────────────────────────────────────────────────
onMounted(async () => {
  const rawCode = route.params.roomId;
  const roomId = (rawCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  await profileStore.init();

  const savedName = profileStore.current.name || localStorage.getItem('hp-username');
  joinNameInput.value = savedName || '';

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

      if (data.users?.length) {
        profileStore.recordFriends(data.users, data.you?.id);
      }

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
      profileStore.recordFriends(users, room.you?.id);
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
      lastAppliedSeq = 0;

      // If casting, load new URL on Chromecast
      if (isCasting.value && data.url) {
        castService.loadMediaOnChromecast(data.url, data.mediaMeta, 0, false);
      }

      // Record to encrypted profile history
      if (data.url && data.mediaMeta) {
        profileStore.recordWatch({
          id: data.mediaMeta.id,
          title: data.mediaMeta.title,
          episodeTitle: data.mediaMeta.episodeTitle,
          year: data.mediaMeta.year,
          poster: data.mediaMeta.poster,
          url: data.url,
          progressSeconds: 0,
          durationSeconds: 0,
        });
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

    socket.on('room.readiness', (data) => {
      roomReadiness.value = {
        waiting: !data.allReady,
        readyCount: data.readyCount,
        totalCount: data.totalCount,
        waitingFor: data.waitingFor || [],
      };
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
.room {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  position: relative;
}

/* ── 404 Room Not Found Overlay ─────────────────────────────────────────── */
.room-not-found-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 15, 0.95);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1100;
  animation: fade-in 0.25s ease both;
}
.not-found-card {
  width: min(440px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 36px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.8);
}
.nf-icon-wrap {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: rgba(224, 61, 90, 0.12);
  border: 1px solid rgba(224, 61, 90, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.not-found-card h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text);
}
.nf-desc {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.5;
}
.nf-desc code {
  background: var(--surface2);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--accent);
  font-weight: 700;
}
.nf-actions {
  margin-top: 8px;
  width: 100%;
}
.btn-return-home {
  display: block;
  width: 100%;
  padding: 12px 20px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  font-weight: 600;
  color: #fff;
  text-align: center;
  transition: filter 0.15s, transform 0.1s;
}
.btn-return-home:hover { filter: brightness(1.15); transform: translateY(-1px); }

/* ── Join / Rename Overlays ─────────────────────────────────────────────── */
.join-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
  animation: fade-in 0.2s ease both;
}
.join-card {
  width: min(380px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
}
.join-badge {
  display: inline-flex;
  align-self: flex-start;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid rgba(224, 61, 90, 0.3);
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}
.join-card h2 { font-size: 1.25rem; font-weight: 700; color: var(--text); }
.join-sub { font-size: 0.82rem; color: var(--muted); margin-top: -6px; }

.join-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.join-form input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.95rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.join-form input:focus { border-color: var(--accent); }

.btn-join-room {
  padding: 11px 20px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.92rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
}
.btn-join-room:hover:not(:disabled) { filter: brightness(1.15); }

.rename-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-cancel {
  padding: 8px 16px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--muted);
}
.btn-cancel:hover { color: var(--text); border-color: var(--border-light); }

/* ── Header ─────────────────────────────────────────────────────────────── */
.header {
  height: 54px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
  z-index: 10;
  gap: 12px;
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
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text);
}
.logo-heart { color: var(--accent); font-size: 1.2rem; }
.logo-text {
  background: linear-gradient(120deg, #fff 40%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

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
.room-code-badge:hover { border-color: var(--accent); }
.room-label { font-size: 0.68rem; font-weight: 700; color: var(--muted); }
.room-id { font-size: 0.82rem; font-weight: 700; color: var(--text); letter-spacing: 0.05em; }
.copy-icon { color: var(--muted); }
.copied-tooltip {
  position: absolute;
  top: 100%; left: 50%;
  transform: translateX(-50%) translateY(6px);
  background: var(--accent);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
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
  font-size: 0.82rem;
  font-weight: 500;
  transition: all 0.15s;
}
.header-btn:hover { border-color: var(--accent); color: var(--accent); }

.users-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--muted);
}
.user-count { font-weight: 700; color: var(--text); }
.users-avatar-stack {
  display: flex;
  align-items: center;
  margin-left: 4px;
}
.user-dot {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 2px solid var(--surface2);
  margin-left: -5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  font-weight: 700;
  color: #fff;
}
.user-dot:first-child { margin-left: 0; }

.user-chip-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s;
}
.user-chip-btn:hover { border-color: var(--accent); }
.user-color-dot { width: 8px; height: 8px; border-radius: 50%; }

.vault-mini-tag {
  font-size: 0.65rem;
  color: #3dbe7a;
  background: rgba(61, 190, 122, 0.12);
  padding: 1px 5px;
  border-radius: 999px;
}

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

/* ── Player Wrap ────────────────────────────────────────────────────────── */
.player-wrap {
  flex: 1;
  background: #000;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000;
}

/* Placeholder */
.placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, #181824 0%, #0c0c14 100%);
  padding: 24px;
}
.placeholder-inner {
  max-width: 440px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.ph-icon-wrap {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: var(--accent-dim);
  border: 1px solid rgba(224, 61, 90, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.ph-title { font-size: 1.3rem; font-weight: 700; color: var(--text); }
.ph-sub { font-size: 0.88rem; color: var(--muted); line-height: 1.5; }
.placeholder-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  flex-wrap: wrap;
  justify-content: center;
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

/* All-Peers Readiness Overlay */
.readiness-overlay {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  animation: slide-down 0.25s ease both;
  pointer-events: auto;
  max-width: 90%;
}
.readiness-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid rgba(224, 61, 90, 0.4);
  border-radius: 999px;
  padding: 8px 18px;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
}
.readiness-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(224, 61, 90, 0.3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
.readiness-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.readiness-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.02em;
}
.readiness-sub {
  font-size: 0.72rem;
  color: var(--muted);
}
.readiness-sub strong {
  color: var(--gold);
}
.btn-force-play {
  padding: 5px 12px;
  background: var(--accent);
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  transition: filter 0.15s;
  margin-left: 6px;
  flex-shrink: 0;
}
.btn-force-play:hover { filter: brightness(1.2); }

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

/* Media Title Top Overlay */
.media-title-overlay {
  position: absolute;
  top: 16px; left: 16px;
  background: rgba(18, 18, 26, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(8px);
  z-index: 5;
  font-size: 0.85rem;
  color: var(--text);
}
.m-title { font-weight: 700; }
.m-ep { color: var(--gold); }
.m-year { color: var(--muted); }

/* Direct URL bar */
.url-bar-wrap {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, 92%);
  z-index: 20;
  animation: slide-down 0.2s ease both;
}
.url-bar {
  display: flex;
  gap: 8px;
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}
.url-bar input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 0.9rem;
}
.url-bar input:focus { outline: none; }
.btn-load-url {
  padding: 6px 14px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}
.btn-load-url:hover:not(:disabled) { filter: brightness(1.15); }
.btn-close-url {
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.btn-close-url:hover { color: var(--text); }

/* ── Player Controls Overlay ────────────────────────────────────────────── */
.controls {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.3) 60%, transparent 100%);
  padding: 32px 16px 12px;
  z-index: 10;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.controls-hidden .controls,
.controls-hidden .media-title-overlay {
  opacity: 0;
  pointer-events: none;
}

.controls-inner {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Scrub Bar */
.scrub-bar-wrap {
  position: relative;
  width: 100%;
  height: 6px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.scrub-bar-wrap:hover .scrub-bar { height: 8px; }
.scrub-bar {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  position: relative;
  z-index: 2;
  transition: height 0.15s;
}
.scrub-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 8px rgba(224, 61, 90, 0.8);
  cursor: pointer;
  transition: transform 0.15s;
}
.scrub-bar:hover::-webkit-slider-thumb { transform: scale(1.25); }
.scrub-progress {
  position: absolute;
  top: 50%; left: 0;
  transform: translateY(-50%);
  height: 4px;
  background: var(--accent);
  border-radius: 999px;
  pointer-events: none;
  z-index: 1;
}

.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.controls-left, .controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ctrl-btn {
  width: 36px; height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: transparent;
  transition: background 0.15s, color 0.15s;
  position: relative;
}
.ctrl-btn:hover { background: rgba(255, 255, 255, 0.15); }
.ctrl-btn.active { color: var(--accent); }

.sub-label {
  font-size: 0.65rem;
  font-weight: 700;
  margin-left: 2px;
  background: var(--accent);
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
}

.vol-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}
.vol-slider {
  width: 70px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  outline: none;
  cursor: pointer;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
}

.time-display {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}
.time-sep { color: rgba(255, 255, 255, 0.4); }

/* ── Chat Sidebar ───────────────────────────────────────────────────────── */
.chat-sidebar {
  width: 320px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s ease, transform 0.25s ease;
}
.chat-sidebar:not(.open) {
  width: 0;
  border-left-width: 0;
  overflow: hidden;
}

.chat-header {
  height: 46px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;
}
.chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  text-align: center;
  font-size: 0.82rem;
  gap: 8px;
}

.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.msg-author { font-size: 0.78rem; font-weight: 700; }
.msg-time { font-size: 0.68rem; color: var(--muted); }
.msg-content {
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}

.system-msg {
  font-size: 0.75rem;
  color: var(--muted);
  font-style: italic;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sys-time { color: rgba(255, 255, 255, 0.35); font-size: 0.68rem; font-style: normal; }

.chat-footer {
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 6px;
  background: var(--surface2);
}
.chat-footer input {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  font-size: 0.85rem;
  color: var(--text);
}
.chat-footer input:focus { border-color: var(--accent); }
.btn-send {
  width: 34px; height: 34px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-send:hover:not(:disabled) { filter: brightness(1.15); }

/* ── Toast ──────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid var(--border-light);
  color: var(--text);
  padding: 10px 20px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  font-weight: 500;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
  z-index: 2000;
  backdrop-filter: blur(8px);
}
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 10px); }
</style>
