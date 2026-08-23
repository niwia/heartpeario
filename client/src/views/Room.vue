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
          Room <code>{{ roomNotFoundCode }}</code> does not exist or expired because all users left.
        </p>
        <div class="nf-actions">
          <router-link to="/" class="btn-return-home">
            Return Home and Create Room
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
            placeholder="Your name..."
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
            placeholder="Your name..."
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
        <!-- Host Indicator Badge -->
        <div class="host-pill" :class="{ 'is-you': room.isHost }">
          <span class="host-pill-tag">HOST</span>
          <span class="host-pill-name">{{ hostDisplayName }}</span>
        </div>

        <!-- Viewers Count Pill (Click to open viewers list & host delegation) -->
        <div class="users-pill" @click="showUsersMenu = !showUsersMenu" title="View room members">
          <Icon name="user" size="14" />
          <span class="user-count">{{ room.users.length }} Viewers</span>
        </div>

        <!-- Users Dropdown Menu / Host Delegation -->
        <div v-if="showUsersMenu" class="users-dropdown-backdrop" @click="showUsersMenu = false">
          <div class="users-dropdown" @click.stop>
            <div class="users-dropdown-header">
              <span>Room Viewers ({{ room.users.length }})</span>
              <button class="close-drop-btn" @click="showUsersMenu = false">
                <Icon name="close" size="12" />
              </button>
            </div>
            <div class="users-dropdown-list">
              <div
                v-for="u in room.users"
                :key="u.id"
                class="user-dropdown-item"
              >
                <div class="user-item-left">
                  <span class="user-avatar-sm" :style="{ background: u.color }">
                    {{ u.name.charAt(0).toUpperCase() }}
                  </span>
                  <span class="user-item-name">
                    {{ u.name }}
                    <span v-if="u.id === room.you?.id" class="you-tag">(You)</span>
                  </span>
                  <span v-if="u.id === room.hostId" class="host-tag">HOST</span>
                </div>
                <div class="user-item-right">
                  <button
                    v-if="room.isHost && u.id !== room.you?.id"
                    class="btn-make-host"
                    @click="transferHost(u.id)"
                    title="Make this user Room Host"
                  >
                    Make Host
                  </button>
                </div>
              </div>
            </div>
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
          <span class="vault-mini-tag">Vault</span>
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
        :class="{ 'controls-hidden': controlsHidden && !paused && !!room.url && !room.activeCountdown }"
      >

        <!-- ── Continue Watching & Recent Streams / Placeholder ──────── -->
        <div v-if="!room.url" class="placeholder">
          <div class="placeholder-content">

            <!-- Continue Watching Section (Last up to 5 items) -->
            <div v-if="recentStreams.length > 0" class="recent-section">
              <div class="recent-header">
                <span class="recent-sec-title">Continue Watching</span>
                <span class="recent-sec-sub">Pick up where you left off</span>
              </div>

              <div class="recent-grid">
                <div
                  v-for="(item, idx) in recentStreams"
                  :key="item.id + (item.url || idx)"
                  class="recent-card"
                  @click="resumeRecentStream(item)"
                  title="Click to resume in room"
                >
                  <div class="recent-poster-wrap">
                    <img v-if="item.poster" :src="item.poster" class="recent-poster-img" alt="" />
                    <div v-else class="recent-poster-ph">
                      <Icon name="play" size="24" />
                    </div>
                    <button
                      class="btn-delete-recent"
                      @click="removeRecentStream(idx, $event)"
                      title="Remove from history"
                    >
                      <Icon name="close" size="12" />
                    </button>
                    <!-- Progress Bar -->
                    <div v-if="item.durationSeconds > 0" class="card-progress-bar">
                      <div
                        class="card-progress-fill"
                        :style="{ width: Math.min(100, (item.progressSeconds / item.durationSeconds) * 100) + '%' }"
                      ></div>
                    </div>
                  </div>

                  <div class="recent-info">
                    <span class="recent-title" :title="item.title">{{ item.title }}</span>
                    <span v-if="item.episodeTitle" class="recent-ep">{{ item.episodeTitle }}</span>
                    <span class="recent-resume-label">Resume at {{ fmtTime(item.progressSeconds) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Ready to Play Call to Action -->
            <div v-else class="empty-cinema-prompt">
              <h2 class="ph-title">Ready to Play</h2>
              <p class="ph-sub">Search for movies or shows from your addons, or paste a video URL.</p>
            </div>

            <!-- Quick Action Buttons -->
            <div class="placeholder-actions-row">
              <button class="btn-ph-action btn-main" @click="showSearchModal = true">
                <Icon name="search" size="16" />
                <span>Search Catalog</span>
              </button>
              <button class="btn-ph-action btn-sub" @click="openUrlBar">
                <Icon name="link" size="16" />
                <span>Paste Stream URL</span>
              </button>
            </div>

          </div>
        </div>

        <!-- Video Element -->
        <video
          v-show="room.url"
          ref="videoEl"
          :src="room.url || undefined"
          preload="auto"
          playsinline
          crossorigin="anonymous"
          @click="togglePlay"
          @timeupdate="onTimeUpdate"
          @durationchange="onDurationChange"
          @loadedmetadata="updateAudioTracks"
          @waiting="onWaiting"
          @canplay="onCanPlay"
          @playing="onPlaying"
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

        <!-- Big Center Play Button Overlay (when paused & stream loaded) -->
        <div
          v-if="room.url && paused && !room.activeCountdown"
          class="center-play-overlay"
          @click="togglePlay"
          title="Click to Play"
        >
          <div class="center-play-btn">
            <Icon name="play" size="36" />
          </div>
        </div>

        <!-- Buffering spinner overlay -->
        <div v-if="room.url && buffering && !paused && !room.activeCountdown" class="buffering-overlay" aria-label="Buffering">
          <div class="buf-spinner"></div>
        </div>

        <!-- ── 3-Second Synchronized Countdown Status (Bottom Left Pure Text Line, No Background) ── -->
        <div v-if="room.activeCountdown && room.url" class="countdown-bottom-indicator">
          <span class="countdown-text">{{ countdownBottomText }}</span>
          <button
            v-if="canCancelCountdown"
            class="btn-cancel-text"
            @click.stop="cancelCountdown"
            title="Cancel countdown"
          >
            Cancel
          </button>
        </div>

        <!-- Direct URL Bar Overlay -->
        <div v-if="showUrlBar" class="url-bar-wrap">
          <form class="url-bar" @submit.prevent="setDirectUrl">
            <input
              ref="urlInputEl"
              v-model="urlInput"
              type="url"
              placeholder="Paste direct video URL (MP4, MKV, WebM, HLS m3u8)..."
              spellcheck="false"
            />
            <button type="submit" class="btn-load-url" :disabled="!urlInput.trim()">
              Load Stream
            </button>
            <button type="button" class="btn-close-url" @click="showUrlBar = false">
              <Icon name="close" size="16" />
            </button>
          </form>
        </div>

        <!-- Media Info Top Overlay -->
        <div v-if="room.mediaMeta && !controlsHidden && room.url" class="media-title-overlay">
          <span class="m-title">{{ room.mediaMeta.title }}</span>
          <span v-if="room.mediaMeta.episodeTitle" class="m-ep">{{ room.mediaMeta.episodeTitle }}</span>
          <span v-if="room.mediaMeta.year" class="m-year">({{ room.mediaMeta.year }})</span>
        </div>

        <!-- ── Clean Minimal Controls Overlay ────────────────────────── -->
        <div class="controls" v-if="room.url">
          <div class="controls-inner">

            <!-- Progress Bar / Scrub Bar -->
            <div class="scrub-bar-wrap" :class="{ 'readonly-scrub': !room.isHost }">
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
                :disabled="!room.isHost"
                aria-label="Seek video"
              />
              <div
                class="scrub-progress"
                :style="{ width: duration > 0 ? (currentTime / duration) * 100 + '%' : '0%' }"
              ></div>
            </div>

            <!-- Buttons Row -->
            <div class="controls-row">
              <div class="controls-left">
                <!-- Play / Pause Button -->
                <button
                  class="ctrl-btn main-play-btn"
                  @click="togglePlay"
                  :title="playPauseButtonTitle"
                >
                  <Icon :name="paused ? 'play' : 'pause'" size="22" />
                </button>

                <!-- Backward 10s (Host Only) -->
                <button
                  v-if="room.isHost"
                  class="ctrl-btn"
                  @click="skip(-10)"
                  title="Rewind 10s (3s countdown)"
                >
                  <Icon name="backward" size="18" />
                </button>

                <!-- Forward 10s (Host Only) -->
                <button
                  v-if="room.isHost"
                  class="ctrl-btn"
                  @click="skip(10)"
                  title="Forward 10s (3s countdown)"
                >
                  <Icon name="fastfw" size="18" />
                </button>

                <!-- Volume / Mute (Local) -->
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
                  <span class="time-cur">{{ fmtTime(currentTime) }}</span>
                  <span class="time-sep">/</span>
                  <span class="time-dur">{{ fmtTime(duration) }}</span>
                </div>
              </div>

              <div class="controls-right">
                <!-- Audio Tracks Button -->
                <button
                  class="ctrl-btn"
                  @click="openAudioModal"
                  title="Select Audio Track"
                >
                  <Icon name="volume" size="18" />
                </button>

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

                <!-- Fullscreen Button -->
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
                <span class="msg-author" :style="{ color: msg.color }">
                  {{ msg.name }}
                  <span v-if="msg.userId === room.hostId" class="chat-host-tag">HOST</span>
                </span>
                <span class="msg-time">{{ fmtTimestamp(msg.ts) }}</span>
              </div>
              <div class="msg-body">{{ msg.content }}</div>
            </template>
          </div>
        </div>

        <!-- Chat input -->
        <form class="chat-input-row" @submit.prevent="sendMessage">
          <input
            v-model="chatInput"
            type="text"
            placeholder="Type a message..."
            maxlength="300"
          />
          <button type="submit" class="btn-send" :disabled="!chatInput.trim()">
            <Icon name="send" size="15" />
          </button>
        </form>
      </aside>

    </div>

    <!-- ── Toast ─────────────────────────────────────────────────────── -->
    <div v-if="toast" class="toast">{{ toast }}</div>

    <!-- ── Modals ────────────────────────────────────────────────────── -->
    <SearchMediaModal
      v-if="showSearchModal"
      @close="showSearchModal = false"
      @select-stream="onStreamSelected"
      @selectStream="onStreamSelected"
    />

    <AddonManagerModal
      v-if="showAddonsModal"
      @close="showAddonsModal = false"
    />

    <AudioTracksModal
      v-if="showAudioModal"
      :audio-tracks="detectedAudioTracks"
      @close="showAudioModal = false"
      @select="onSelectAudioTrack"
    />

    <SubtitlesModal
      v-if="showSubtitlesModal"
      :available-subtitles="room.subtitles"
      :current-subtitle="room.currentSubtitle"
      :media-meta="room.mediaMeta"
      @close="showSubtitlesModal = false"
      @select="onSelectSubtitle"
      @load-custom="onLoadCustomSubtitle"
    />

    <ProfileModal
      v-if="showProfileModal"
      @close="showProfileModal = false"
      @select-stream="onStreamSelected"
      @selectStream="onStreamSelected"
      @rename="openRenameModal"
    />

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useRoomStore } from '@/stores/room';
import { useProfileStore } from '@/stores/profile';
import socket from '@/services/socket';
import { srtToVtt, createVttUrlFromRemote } from '@/services/subtitle.service';

import Icon from '@/components/Icon.vue';
import SearchMediaModal from '@/components/SearchMediaModal.vue';
import AddonManagerModal from '@/components/AddonManagerModal.vue';
import SubtitlesModal from '@/components/SubtitlesModal.vue';
import AudioTracksModal from '@/components/AudioTracksModal.vue';
import ProfileModal from '@/components/ProfileModal.vue';

const route = useRoute();
const router = useRouter();
const room = useRoomStore();
const profileStore = useProfileStore();

// ── Modals ────────────────────────────────────────────────────────────────
const showSearchModal = ref(false);
const showAddonsModal = ref(false);
const showSubtitlesModal = ref(false);
const showAudioModal = ref(false);
const showProfileModal = ref(false);
const showJoinPrompt = ref(false);
const showRenameModal = ref(false);
const showUsersMenu = ref(false);
const joinNameInput = ref('');
const renameInput = ref('');
const joinNameInputEl = ref(null);

const detectedAudioTracks = ref([]);

const cleanRouteCode = computed(() => {
  return (route.params.roomId || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
});
const roomNotFound = ref(false);
const roomNotFoundCode = ref('');

const activeSubTrackBlobUrl = ref(null);
const roomTsMap = ref({});

// ── Recent Streams History (Up to last 5 items) ───────────────────────────
const RECENT_KEY = 'hp-recent-streams';
const recentStreams = ref([]);
let lastSavedProgressTime = 0;

function loadRecentStreams() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) {
      recentStreams.value = JSON.parse(raw) || [];
    }
  } catch {}
}

function saveRecentStreamRecord({ url, mediaMeta, subtitles, progressSeconds, durationSeconds }) {
  if (!url) return;
  try {
    const list = [...recentStreams.value];
    const id = mediaMeta?.id || url;
    const existingIdx = list.findIndex(item => (item.id && item.id === id) || item.url === url);
    const entry = {
      id,
      title: mediaMeta?.title || 'Video Stream',
      year: mediaMeta?.year || '',
      poster: mediaMeta?.poster || '',
      episodeTitle: mediaMeta?.episodeTitle || null,
      season: mediaMeta?.season || null,
      episode: mediaMeta?.episode || null,
      url,
      subtitles: subtitles || [],
      progressSeconds: Math.max(0, parseFloat(progressSeconds) || 0),
      durationSeconds: Math.max(0, parseFloat(durationSeconds) || 0),
      lastWatchedAt: Date.now(),
    };
    if (existingIdx >= 0) {
      list.splice(existingIdx, 1);
    }
    list.unshift(entry);
    const trimmed = list.slice(0, 5);
    recentStreams.value = trimmed;
    localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
  } catch {}
}

function updateCurrentStreamProgress(currentTimeVal, durationVal) {
  if (!room.url) return;
  try {
    const list = [...recentStreams.value];
    const id = room.mediaMeta?.id || room.url;
    const existing = list.find(item => (item.id && item.id === id) || item.url === room.url);
    if (existing) {
      existing.progressSeconds = Math.max(0, parseFloat(currentTimeVal) || 0);
      if (durationVal > 0) existing.durationSeconds = durationVal;
      existing.lastWatchedAt = Date.now();
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    }
  } catch {}
}

function removeRecentStream(idx, e) {
  if (e) e.stopPropagation();
  recentStreams.value.splice(idx, 1);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentStreams.value));
  } catch {}
}

function resumeRecentStream(item) {
  onStreamSelected({
    url: item.url,
    mediaMeta: {
      id: item.id,
      title: item.title,
      year: item.year,
      poster: item.poster,
      episodeTitle: item.episodeTitle,
      season: item.season,
      episode: item.episode,
    },
    subtitles: item.subtitles || [],
  });

  // If saved position is > 5s, seek to it
  if (item.progressSeconds > 5) {
    setTimeout(() => {
      if (room.isHost) {
        socket.send('player.countdown_action', {
          action: 'SEEK',
          time: item.progressSeconds,
        });
      }
    }, 600);
  }
}

// ── Player Refs ───────────────────────────────────────────────────────────
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

// ── 3-Second Action Countdown State ───────────────────────────────────────
const countdownSecondsRemaining = ref(3);
let countdownInterval = null;
let hideTimer = null;
let toastTimer = null;
let heartbeatTimer = null;
let lastAppliedSeq = 0;

const hostDisplayName = computed(() => {
  if (room.isHost) return 'You';
  const host = room.users.find(u => u.id === room.hostId);
  return host ? host.name : 'Host';
});

const playPauseButtonTitle = computed(() => {
  if (room.isHost) {
    return paused.value ? 'Start 3s countdown to Play (Space)' : 'Start 3s countdown to Pause (Space)';
  }
  return paused.value ? 'Request Resume (3s countdown)' : 'Request Pause (3s countdown)';
});

const countdownBottomText = computed(() => {
  if (!room.activeCountdown) return '';
  const action = room.activeCountdown.action;
  const initiator = room.activeCountdown.initiatedBy === room.you?.id ? 'You' : (room.activeCountdown.initiatedByName || 'Viewer');
  const sec = countdownSecondsRemaining.value;
  if (action === 'PLAY') return `Resuming in ${sec}s... (${initiator})`;
  if (action === 'PAUSE') return `Pausing in ${sec}s... (${initiator})`;
  if (action === 'SEEK') return `Seeking to ${fmtTime(room.activeCountdown.targetTime)} in ${sec}s... (${initiator})`;
  return `Action in ${sec}s... (${initiator})`;
});

const canCancelCountdown = computed(() => {
  if (!room.activeCountdown) return false;
  return room.isHost || room.activeCountdown.initiatedBy === room.you?.id;
});

function logDebug(...args) {
  const ts = new Date().toTimeString().split(' ')[0];
  console.log(`[HeartPeario ${ts}]`, ...args);
}

// ── Player Controls & Host Action Countdown Dispatch ──────────────────────
function togglePlay() {
  if (!videoEl.value || !room.url) return;
  if (room.activeCountdown) {
    cancelCountdown();
    return;
  }

  const currentPos = videoEl.value.currentTime || 0;
  if (room.isHost) {
    socket.send('player.countdown_action', {
      action: paused.value ? 'PLAY' : 'PAUSE',
      time: currentPos,
    });
  } else {
    if (paused.value) {
      socket.send('player.request_play', { time: currentPos });
    } else {
      socket.send('player.request_pause', { time: currentPos });
    }
  }
}

function skip(deltaSeconds) {
  if (!videoEl.value || !room.url || !room.isHost) return;
  const currentPos = videoEl.value.currentTime || 0;
  const newTime = Math.max(0, Math.min(duration.value || 999999, currentPos + deltaSeconds));
  socket.send('player.countdown_action', {
    action: 'SEEK',
    time: newTime,
  });
}

function onSeekInput(e) {
  if (!room.isHost) return;
  currentTime.value = parseFloat(e.target.value);
}

function onSeekEnd(e) {
  isUserScrubbing.value = false;
  if (!room.isHost) return;
  const targetTime = parseFloat(e.target.value);
  socket.send('player.countdown_action', {
    action: 'SEEK',
    time: targetTime,
  });
}

function cancelCountdown() {
  socket.send('player.cancel_countdown');
}

function transferHost(newHostId) {
  if (!room.isHost) return;
  socket.send('room.set_host', { newHostId });
  showUsersMenu.value = false;
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

function toggleFullscreen() {
  const el = document.querySelector('.player-wrap');
  if (!el) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    el.requestFullscreen().catch(() => {});
  }
}

function updateAudioTracks() {
  const tracks = [];
  if (videoEl.value?.audioTracks) {
    for (let i = 0; i < videoEl.value.audioTracks.length; i++) {
      const t = videoEl.value.audioTracks[i];
      tracks.push({
        index: i,
        id: t.id || `track-${i}`,
        label: t.label || t.language || `Audio Track ${i + 1}`,
        language: t.language || '',
        enabled: t.enabled,
      });
    }
  }
  detectedAudioTracks.value = tracks;
}

function openAudioModal() {
  updateAudioTracks();
  showAudioModal.value = true;
}

function onSelectAudioTrack(index) {
  if (!videoEl.value || !videoEl.value.audioTracks) return;
  for (let i = 0; i < videoEl.value.audioTracks.length; i++) {
    videoEl.value.audioTracks[i].enabled = (i === index);
  }
  updateAudioTracks();
  doToast(`Audio: ${detectedAudioTracks.value[index]?.label || 'Selected'}`);
}

function onTimeUpdate() {
  if (!isUserScrubbing.value && videoEl.value) {
    currentTime.value = videoEl.value.currentTime;
    const now = Date.now();
    if (now - lastSavedProgressTime > 4000) {
      lastSavedProgressTime = now;
      updateCurrentStreamProgress(videoEl.value.currentTime, videoEl.value.duration);
    }
  }
}

function onDurationChange() {
  if (videoEl.value) {
    duration.value = videoEl.value.duration;
    updateAudioTracks();
  }
}

function onWaiting() {
  if (!paused.value) buffering.value = true;
}

function onPlaying() {
  buffering.value = false;
  paused.value = false;
}

function onCanPlay() {
  buffering.value = false;
  if (videoEl.value) {
    videoEl.value.volume = isMuted.value ? 0 : volume.value;
    videoEl.value.muted = isMuted.value;
    updateAudioTracks();
  }
}

function onVideoError() {
  doToast('Could not load stream - check URL or provider');
  buffering.value = false;
}

// ── Smart Synchronization Engine ──────────────────────────────────────────
async function applySync(data) {
  if (!videoEl.value || !data) return;

  if (data.seq && lastAppliedSeq && data.seq <= lastAppliedSeq) {
    return;
  }
  if (data.seq) lastAppliedSeq = data.seq;

  const target = Math.max(0, data.time || 0);
  logDebug(`ApplySync #${data.seq || 0}: ${data.paused ? 'PAUSE' : 'PLAY'} at ${fmtTime(target)}`);

  if (data.paused) {
    videoEl.value.pause();
    if (Math.abs(videoEl.value.currentTime - target) > 0.4) {
      videoEl.value.currentTime = target;
    }
    paused.value = true;
    updateCurrentStreamProgress(target, videoEl.value.duration);
  } else {
    if (Math.abs(videoEl.value.currentTime - target) > 1.5) {
      videoEl.value.currentTime = target;
    }
    try {
      await videoEl.value.play();
    } catch (err) {
      logDebug('Play error on applySync:', err?.message);
    }
    paused.value = false;
  }
}

function startCountdownTimer(countdownData) {
  if (countdownInterval) clearInterval(countdownInterval);
  room.activeCountdown = countdownData;

  // Pre-seek buffer during countdown if seek or play
  if (videoEl.value && typeof countdownData.targetTime === 'number') {
    if (countdownData.action === 'SEEK' || (countdownData.action === 'PLAY' && paused.value)) {
      videoEl.value.currentTime = countdownData.targetTime;
    }
  }

  const updateRemaining = () => {
    if (!room.activeCountdown) {
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }
    const msLeft = room.activeCountdown.executeAt - Date.now();
    countdownSecondsRemaining.value = Math.max(1, Math.ceil(msLeft / 1000));
  };

  updateRemaining();
  countdownInterval = setInterval(updateRemaining, 100);
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
    const vttUrl = await createVttUrlFromRemote(room.currentSubtitle.url, room.subtitleOffsetMs || 0);
    if (activeSubTrackBlobUrl.value) URL.revokeObjectURL(activeSubTrackBlobUrl.value);
    activeSubTrackBlobUrl.value = vttUrl;
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
    const vtt = srtToVtt(content, room.subtitleOffsetMs || 0);
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
  showSearchModal.value = false;
  showProfileModal.value = false;
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

  nextTick(() => {
    if (videoEl.value) {
      videoEl.value.load();
    }
  });

  if (subtitles?.length) {
    const defaultSub = subtitles.find(s => ['eng', 'en'].includes(s.lang?.toLowerCase())) || subtitles[0];
    room.currentSubtitle = defaultSub;
    loadCurrentSubtitle();
  }

  saveRecentStreamRecord({
    url,
    mediaMeta,
    subtitles,
    progressSeconds: 0,
    durationSeconds: 0,
  });

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

  doToast(`Loaded: ${mediaMeta?.title || 'Stream'}`);
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
  nextTick(() => {
    if (videoEl.value) {
      videoEl.value.load();
    }
  });
  saveRecentStreamRecord({
    url,
    mediaMeta: { title: 'Direct Stream' },
    subtitles: [],
    progressSeconds: 0,
    durationSeconds: 0,
  });
  urlInput.value = '';
  showUrlBar.value = false;
  doToast('Loaded direct video stream');
}

// ── UI Helpers ────────────────────────────────────────────────────
function showControls() {
  controlsHidden.value = false;
  scheduleHideControls();
}

function scheduleHideControls() {
  clearTimeout(hideTimer);
  if (!paused.value && room.url && !room.activeCountdown) {
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
  if (showSearchModal.value || showAddonsModal.value || showSubtitlesModal.value || showAudioModal.value || showProfileModal.value || showJoinPrompt.value || showRenameModal.value || roomNotFound.value) return;

  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyC') showSubtitlesModal.value = !showSubtitlesModal.value;
  if (e.code === 'KeyS') showSearchModal.value = true;
  if (e.code === 'Escape' && room.activeCountdown) cancelCountdown();
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
  loadRecentStreams();

  const savedName = profileStore.current.name || localStorage.getItem('hp-username');
  joinNameInput.value = savedName || '';

  document.addEventListener('keydown', onKeyDown);

  if (savedName) socket.send('user.name', { name: savedName });
  socket.onReconnect = () => socket.send('room.join', { roomId });
  socket.send('room.join', { roomId });

  if (!savedName && !room.roomId) {
    showJoinPrompt.value = true;
  }

  const offs = [
    socket.on('room.joined', (data) => {
      roomNotFound.value = false;
      room.$patch({
        roomId: data.roomId,
        isHost: data.isHost,
        hostId: data.hostId,
        you: data.you,
        users: data.users,
        url: data.url,
        mediaMeta: data.mediaMeta || null,
        subtitles: data.subtitles || [],
        player: data.player,
        activeCountdown: data.activeCountdown || null,
      });

      if (data.activeCountdown) {
        startCountdownTimer(data.activeCountdown);
      }

      if (data.users?.length) {
        profileStore.recordFriends(data.users, data.you?.id);
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
      room.hostId = hostId;
      room.isHost = room.you?.id === hostId;
    }),

    socket.on('room.countdown', (data) => {
      startCountdownTimer(data);
    }),

    socket.on('room.countdown_cancelled', () => {
      if (countdownInterval) clearInterval(countdownInterval);
      room.activeCountdown = null;
    }),

    socket.on('player.url', (data) => {
      if (countdownInterval) clearInterval(countdownInterval);
      room.activeCountdown = null;
      room.url = data.url;
      room.mediaMeta = data.mediaMeta || null;
      room.subtitles = data.subtitles || [];
      room.player = { paused: true, time: 0, serverTime: Date.now() };
      paused.value = true;
      currentTime.value = 0;
      duration.value = 0;
      showUrlBar.value = false;
      lastAppliedSeq = 0;

      nextTick(() => {
        if (videoEl.value) {
          videoEl.value.load();
          updateAudioTracks();
        }
      });

      if (data.url) {
        saveRecentStreamRecord({
          url: data.url,
          mediaMeta: data.mediaMeta,
          subtitles: data.subtitles,
          progressSeconds: 0,
          durationSeconds: 0,
        });
      }

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
      if (countdownInterval) clearInterval(countdownInterval);
      room.activeCountdown = null;
      room.player = data;
      applySync(data);
    }),

    socket.on('room.message', (msg) => {
      room.addMessage(msg);
    }),

    socket.on('room.tsMap', ({ tsMap, hostId, paused: isRoomPaused }) => {
      roomTsMap.value = tsMap || {};
      if (hostId) room.hostId = hostId;

      // Viewer passive drift alignment with host
      if (!room.isHost && !paused.value && !isRoomPaused && videoEl.value && room.url && !room.activeCountdown) {
        const hostPeer = tsMap?.[room.hostId];
        if (hostPeer && typeof hostPeer.time === 'number' && !hostPeer.buffering) {
          const drift = Math.abs((hostPeer.time || 0) - videoEl.value.currentTime);
          if (drift > 2.5) {
            logDebug(`Viewer drift alignment (${drift.toFixed(1)}s) -> syncing to host position`);
            videoEl.value.currentTime = hostPeer.time;
          }
        }
      }
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

  heartbeatTimer = setInterval(() => {
    if (videoEl.value && room.url) {
      socket.send('player.ts', {
        time: videoEl.value.currentTime,
        buffering: buffering.value,
      });
    }
  }, 1000);

  onUnmounted(() => {
    offs.forEach(off => off());
    document.removeEventListener('keydown', onKeyDown);
    if (countdownInterval) clearInterval(countdownInterval);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
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
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.not-found-card h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fff;
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
  color: #fff;
  font-weight: 700;
}
.nf-actions {
  margin-top: 8px;
  width: 100%;
}
.btn-return-home {
  display: block;
  width: 100%;
  padding: 11px 20px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  text-align: center;
  transition: all 0.15s;
}
.btn-return-home:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

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
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 3px 8px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}
.join-card h2 { font-size: 1.25rem; font-weight: 700; color: #fff; }
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
  color: #ffffff;
  transition: border-color 0.15s;
}
.join-form input:focus { border-color: #ffffff; }

.btn-join-room {
  padding: 10px 20px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-join-room:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.rename-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-cancel {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--muted);
  cursor: pointer;
}
.btn-cancel:hover { color: #fff; border-color: rgba(255, 255, 255, 0.35); }

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
  text-decoration: none;
  font-size: 1.15rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.01em;
}
.logo-text {
  color: #ffffff;
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
.room-code-badge:hover { border-color: rgba(255, 255, 255, 0.4); }
.room-label { font-size: 0.68rem; font-weight: 700; color: var(--muted); }
.room-id { font-size: 0.82rem; font-weight: 700; color: #ffffff; letter-spacing: 0.05em; }
.copy-icon { color: var(--muted); }
.copied-tooltip {
  position: absolute;
  top: 100%; left: 50%;
  transform: translateX(-50%) translateY(6px);
  background: var(--surface2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
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
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 500;
  transition: all 0.15s;
  cursor: pointer;
}
.header-btn:hover { border-color: #ffffff; background: rgba(255, 255, 255, 0.08); }

/* Host Pill in Header */
.host-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  color: #ffffff;
}
.host-pill.is-you {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
}
.host-pill-tag {
  font-size: 0.65rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.15);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.05em;
}
.host-pill-name {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.users-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.users-pill:hover { border-color: #ffffff; background: rgba(255, 255, 255, 0.08); }
.user-count { font-weight: 600; color: #fff; }

/* Users Dropdown Menu */
.users-dropdown-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
}
.users-dropdown {
  position: absolute;
  top: 58px;
  right: 180px;
  width: 280px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  z-index: 101;
  animation: slide-down 0.15s ease both;
}
.users-dropdown-header {
  padding: 10px 14px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.close-drop-btn {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 2px;
}
.users-dropdown-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px 0;
}
.user-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  transition: background 0.1s;
}
.user-dropdown-item:hover { background: rgba(255, 255, 255, 0.04); }
.user-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}
.user-avatar-sm {
  width: 22px; height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.user-item-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.you-tag {
  font-size: 0.7rem;
  color: var(--muted);
  font-weight: 400;
  margin-left: 2px;
}
.host-tag {
  font-size: 0.62rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
}
.btn-make-host {
  padding: 3px 8px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-make-host:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #ffffff;
}

.user-chip-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.user-chip-btn:hover { border-color: #ffffff; background: rgba(255, 255, 255, 0.08); }
.user-color-dot { width: 8px; height: 8px; border-radius: 50%; }

.vault-mini-tag {
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 1px 5px;
  border-radius: 4px;
  letter-spacing: 0.03em;
}

.user-chip-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Toggle chat icon button */
.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px; height: 34px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-sm);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
}
.icon-btn:hover, .icon-btn.active {
  color: #fff;
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}
.badge {
  position: absolute;
  top: -4px; right: -4px;
  background: #ffffff;
  color: #000000;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 16px; height: 16px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* ── Main Area ───────────────────────────────────────────────────────────── */
.main {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ── Player ─────────────────────────────────────────────────────────────── */
.player-wrap {
  flex: 1;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  user-select: none;
}
.player-wrap video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  cursor: pointer;
}

/* Center Big Play Button Overlay */
.center-play-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  cursor: pointer;
  z-index: 15;
  transition: background 0.2s;
}
.center-play-overlay:hover {
  background: rgba(0, 0, 0, 0.4);
}
.center-play-btn {
  width: 72px; height: 72px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid rgba(255, 255, 255, 0.85);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  transition: transform 0.15s, border-color 0.15s;
}
.center-play-overlay:hover .center-play-btn {
  transform: scale(1.1);
  border-color: #ffffff;
  background: rgba(0, 0, 0, 0.75);
}

/* ── Cinema Placeholder & Continue Watching ──────────────────────────────── */
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%; height: 100%;
  padding: 24px;
  overflow-y: auto;
  background: radial-gradient(circle at center, #14141e 0%, #08080c 100%);
}
.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  max-width: 760px;
  width: 100%;
}

/* Recent Streams Grid */
.recent-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.recent-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4px;
}
.recent-sec-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.01em;
}
.recent-sec-sub {
  font-size: 0.8rem;
  color: var(--muted);
}
.recent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 14px;
  width: 100%;
}
.recent-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.recent-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}
.recent-poster-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 2/3;
  background: var(--surface2);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.recent-poster-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}
.recent-poster-ph {
  color: var(--muted);
}
.btn-delete-recent {
  position: absolute;
  top: 4px; right: 4px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}
.recent-card:hover .btn-delete-recent {
  opacity: 1;
}
.btn-delete-recent:hover {
  background: rgba(255, 255, 255, 0.3);
}

.card-progress-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 4px;
  background: rgba(0, 0, 0, 0.6);
}
.card-progress-fill {
  height: 100%;
  background: #ffffff;
}

.recent-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.recent-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-ep {
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-resume-label {
  font-size: 0.7rem;
  color: #ffffff;
  opacity: 0.8;
  margin-top: 2px;
}

.empty-cinema-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.ph-title { font-size: 1.5rem; font-weight: 700; color: #ffffff; }
.ph-sub { font-size: 0.9rem; color: var(--muted); }

.placeholder-actions-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}
.btn-ph-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-ph-action.btn-main {
  background: transparent;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.4);
}
.btn-ph-action.btn-main:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
  transform: translateY(-1px);
}
.btn-ph-action.btn-sub {
  background: transparent;
  border: 1px solid var(--border);
  color: #ffffff;
}
.btn-ph-action.btn-sub:hover {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-1px);
}

.buffering-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 18;
}
.buf-spinner {
  width: 48px; height: 48px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* ── 3-Second Synchronized Action Countdown (Bottom Left Pure Text Line, No Background) ── */
.countdown-bottom-indicator {
  position: absolute;
  bottom: 54px;
  left: 20px;
  background: transparent !important;
  border: none !important;
  padding: 0 !important;
  box-shadow: none !important;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 25;
  pointer-events: auto;
  animation: fade-in 0.15s ease both;
}
.countdown-text {
  font-size: 0.88rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.01em;
}
.btn-cancel-text {
  font-size: 0.82rem;
  font-weight: 700;
  color: #aaaaaa;
  background: none;
  border: none;
  text-decoration: underline;
  cursor: pointer;
  margin-left: 2px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}
.btn-cancel-text:hover {
  color: #ffffff;
}

/* Media Title Top Overlay */
.media-title-overlay {
  position: absolute;
  top: 16px; left: 16px;
  background: rgba(18, 18, 26, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(12px);
  z-index: 20;
  pointer-events: none;
}
.m-title { font-size: 0.95rem; font-weight: 700; color: #ffffff; }
.m-ep { font-size: 0.85rem; color: #ffffff; opacity: 0.85; }
.m-year { font-size: 0.8rem; color: var(--muted); }

/* Direct URL Bar Overlay */
.url-bar-wrap {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, 90%);
  z-index: 25;
}
.url-bar {
  display: flex;
  gap: 8px;
  background: rgba(18, 18, 26, 0.95);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px;
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7);
}
.url-bar input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 6px 10px;
  font-size: 0.88rem;
  color: #ffffff;
}
.url-bar input:focus { outline: none; }
.btn-load-url {
  padding: 6px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-load-url:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}
.btn-close-url {
  background: none;
  border: none;
  color: var(--muted);
  padding: 6px;
  cursor: pointer;
}
.btn-close-url:hover { color: #ffffff; }

/* ── Player Controls ─────────────────────────────────────────────────────── */
.controls {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.5) 60%, transparent 100%);
  padding: 36px 20px 14px;
  z-index: 20;
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.controls-hidden .controls {
  opacity: 0;
  transform: translateY(8px);
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
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: height 0.15s;
}
.scrub-bar-wrap:hover {
  height: 8px;
}
.scrub-bar-wrap.readonly-scrub {
  cursor: default;
}
.scrub-progress {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: #ffffff;
  border-radius: 3px;
  pointer-events: none;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
}
.scrub-bar {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  opacity: 0;
  cursor: pointer;
  margin: 0;
}
.readonly-scrub .scrub-bar {
  pointer-events: none;
}

/* Controls Buttons Row */
.controls-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.controls-left, .controls-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  background: transparent !important;
  border: none !important;
  color: #ffffff;
  opacity: 0.85;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
  position: relative;
  padding: 0;
}
.ctrl-btn:hover {
  background: transparent !important;
  border: none !important;
  opacity: 1;
  transform: scale(1.08);
}
.ctrl-btn.active {
  opacity: 1;
}
.sub-label {
  position: absolute;
  bottom: 0px;
  right: -2px;
  font-size: 0.55rem;
  font-weight: 800;
  background: #ffffff;
  color: #000000;
  padding: 1px 3px;
  border-radius: 2px;
  line-height: 1;
}

/* Volume Slider */
.vol-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
}
.vol-slider {
  width: 65px;
  accent-color: #ffffff;
  cursor: pointer;
}

/* Time Display */
.time-display {
  font-size: 0.88rem;
  font-weight: 600;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
  margin-left: 4px;
}
.time-cur { color: #ffffff; }
.time-sep { margin: 0 4px; color: rgba(255, 255, 255, 0.4); }
.time-dur { color: rgba(255, 255, 255, 0.6); }

/* ── Chat Sidebar ────────────────────────────────────────────────────────── */
.chat-sidebar {
  width: 300px;
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: margin-right 0.2s ease;
}
.chat-sidebar:not(.open) {
  display: none;
}
.chat-header {
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  font-weight: 700;
  color: #ffffff;
}
.icon-btn.sm {
  width: 26px; height: 26px;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  text-align: center;
  gap: 8px;
  font-size: 0.82rem;
}
.chat-msg {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.system-msg {
  font-size: 0.75rem;
  color: var(--muted);
  background: var(--surface2);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  gap: 6px;
  border-left: 2px solid rgba(255, 255, 255, 0.4);
}
.sys-time { color: var(--border-light); }
.msg-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.msg-author {
  font-size: 0.78rem;
  font-weight: 700;
}
.chat-host-tag {
  font-size: 0.58rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 1px 3px;
  border-radius: 2px;
  margin-left: 4px;
}
.msg-time {
  font-size: 0.68rem;
  color: var(--muted);
}
.msg-body {
  font-size: 0.85rem;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
}
.chat-input-row {
  padding: 10px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
}
.chat-input-row input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.85rem;
  color: var(--text);
}
.chat-input-row input:focus { border-color: rgba(255, 255, 255, 0.4); }
.btn-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-send:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}
.btn-send:disabled { opacity: 0.35; cursor: not-allowed; }

/* ── Toast ───────────────────────────────────────────────────────────────── */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 30, 0.95);
  border: 1px solid var(--border-light);
  color: #fff;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  z-index: 2000;
  animation: slide-up 0.2s ease both;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slide-down {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slide-up {
  from { opacity: 0; transform: translate(-50%, 12px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
