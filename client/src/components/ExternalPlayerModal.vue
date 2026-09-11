<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-box external-player-modal">
      
      <!-- Header -->
      <div class="modal-header">
        <div class="header-title-wrap">
          <div class="header-icon-pill">
            <Icon name="monitor" size="20" />
          </div>
          <div>
            <h2>External Player Sync</h2>
            <p class="modal-sub">Watch in mpv or VLC with synchronized room playback</p>
          </div>
        </div>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <!-- Content -->
      <div class="modal-body">
        
        <!-- Viewing Mode Card -->
        <div class="section-card mode-toggle-card">
          <div class="mode-info">
            <span class="mode-label">Viewing Mode:</span>
            <span class="mode-badge" :class="watchInDesktop ? 'badge-desktop' : 'badge-browser'">
              {{ watchInDesktop ? '🖥 Desktop Player (Primary)' : '🌐 Web Browser Video' }}
            </span>
          </div>
          <button
            class="btn-toggle-viewmode"
            :class="{ 'btn-switch-to-desktop': !watchInDesktop, 'btn-switch-to-browser': watchInDesktop }"
            @click="emit('switch-desktop', !watchInDesktop)"
          >
            {{ watchInDesktop ? 'Switch to In-Browser Video' : 'Switch to Desktop Player (Primary)' }}
          </button>
        </div>

        <!-- Synced Companion Section (Recommended) -->
        <div class="section-card sync-hero-card">
          <div class="card-badge">PRIMARY & RECOMMENDED</div>
          <h3>⚡ Live Desktop Companion (Zero Install)</h3>
          <p class="section-desc">
            Play full native <strong>4K, 10-bit HEVC, MKV containers, Dolby Vision & Atmos</strong> in <strong>mpv</strong> or <strong>VLC</strong> while staying 100% in sync with everyone in the room.
          </p>

          <div class="code-box-wrap">
            <div class="code-box-header">
              <span>Linux, Steam Deck & macOS (Terminal)</span>
              <button class="btn-copy-code" @click="copyCompanionCmd">
                {{ copiedCmd ? '✓ Copied' : 'Copy Command' }}
              </button>
            </div>
            <pre class="code-block"><code>{{ companionCmd }}</code></pre>
          </div>

          <div class="code-box-wrap">
            <div class="code-box-header">
              <span>Windows (PowerShell or Command Prompt)</span>
              <button class="btn-copy-code" @click="copyWindowsCmd">
                {{ copiedWinCmd ? '✓ Copied' : 'Copy Command' }}
              </button>
            </div>
            <pre class="code-block"><code>{{ windowsCmd }}</code></pre>
          </div>

          <div class="companion-actions">
            <a :href="companionScriptUrl" download="heartpeario-sync.py" class="btn-download-script">
              <Icon name="download" size="16" />
              <span>Download heartpeario-sync.py</span>
            </a>
          </div>
        </div>

        <!-- Quick Launch / Manual Links Section -->
        <div class="section-card manual-card">
          <h3>🔗 Quick Launch Commands</h3>
          <p class="section-desc">
            Open the current stream directly in your media player at the current timestamp (<strong>{{ formattedTime }}</strong>):
          </p>

          <div class="quick-commands-grid">
            <div class="cmd-item">
              <div class="cmd-item-header">
                <span class="cmd-name">mpv Command</span>
                <button class="btn-mini-copy" @click="copyText(mpvCmd, 'mpv')">
                  {{ copiedKey === 'mpv' ? '✓ Copied' : 'Copy' }}
                </button>
              </div>
              <input type="text" class="cmd-input" :value="mpvCmd" readonly @click="$event.target.select()" />
            </div>

            <div class="cmd-item">
              <div class="cmd-item-header">
                <span class="cmd-name">VLC Command</span>
                <button class="btn-mini-copy" @click="copyText(vlcCmd, 'vlc')">
                  {{ copiedKey === 'vlc' ? '✓ Copied' : 'Copy' }}
                </button>
              </div>
              <input type="text" class="cmd-input" :value="vlcCmd" readonly @click="$event.target.select()" />
            </div>
          </div>

          <div class="manual-links-row">
            <button class="btn-secondary-link" @click="copyText(currentUrl, 'url')" :disabled="!currentUrl">
              {{ copiedKey === 'url' ? '✓ Stream URL Copied' : 'Copy Raw Stream URL' }}
            </button>
            <button class="btn-secondary-link" @click="downloadM3u" :disabled="!currentUrl">
              Download .m3u Playlist
            </button>
          </div>
        </div>

        <!-- Active Room Players -->
        <div class="section-card players-card">
          <h3>👥 Connected Room Members</h3>
          <div class="players-list">
            <div v-for="user in users" :key="user.id" class="player-item">
              <span class="player-dot" :style="{ backgroundColor: user.color || '#e03d5a' }"></span>
              <span class="player-name">{{ user.name }}</span>
              <span v-if="user.isExternalPlayer" class="player-tag tag-external">
                🖥 {{ user.playerType?.toUpperCase() || 'EXTERNAL' }}
              </span>
              <span v-else class="player-tag tag-web">Web</span>
              <span v-if="user.isHost" class="player-tag tag-host">HOST</span>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button class="btn-done" @click="$emit('close')">Close</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  roomId: {
    type: String,
    default: 'TEST',
  },
  currentUrl: {
    type: String,
    default: '',
  },
  mediaMeta: {
    type: Object,
    default: null,
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  users: {
    type: Array,
    default: () => [],
  },
  watchInDesktop: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'switch-desktop']);

const copiedCmd = ref(false);
const copiedWinCmd = ref(false);
const copiedKey = ref(null);

const appBaseUrl = computed(() => {
  const origin = window.location.origin;
  const path = window.location.pathname.startsWith('/watchpear2') ? '/watchpear2/' : '/';
  return origin + path;
});

const companionScriptUrl = computed(() => {
  return `${appBaseUrl.value.replace(/\/+$/, '')}/heartpeario-sync.py`;
});

const companionCmd = computed(() => {
  return `curl -s ${companionScriptUrl.value} | python3 - --room ${props.roomId.toUpperCase()} --url "${appBaseUrl.value}"`;
});

const windowsCmd = computed(() => {
  return `python -c "import urllib.request; exec(urllib.request.urlopen('${companionScriptUrl.value}').read().decode())" --room ${props.roomId.toUpperCase()} --url "${appBaseUrl.value}"`;
});

const formattedTime = computed(() => {
  const s = Math.floor(props.currentTime || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
});

const mpvCmd = computed(() => {
  if (!props.currentUrl) return 'No stream active in room';
  const startSec = Math.floor(props.currentTime || 0);
  return `mpv "${props.currentUrl}" --start=${startSec}`;
});

const vlcCmd = computed(() => {
  if (!props.currentUrl) return 'No stream active in room';
  const startSec = Math.floor(props.currentTime || 0);
  return `vlc "${props.currentUrl}" --start-time=${startSec}`;
});

async function copyCompanionCmd() {
  try {
    await navigator.clipboard.writeText(companionCmd.value);
    copiedCmd.value = true;
    setTimeout(() => { copiedCmd.value = false; }, 2500);
  } catch {}
}

async function copyWindowsCmd() {
  try {
    await navigator.clipboard.writeText(windowsCmd.value);
    copiedWinCmd.value = true;
    setTimeout(() => { copiedWinCmd.value = false; }, 2500);
  } catch {}
}

async function copyText(text, key) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    setTimeout(() => { copiedKey.value = null; }, 2500);
  } catch {}
}

function downloadM3u() {
  if (!props.currentUrl) return;
  const title = props.mediaMeta?.title || 'HeartPeario Stream';
  const m3uContent = `#EXTM3U\n#EXTINF:-1,${title}\n${props.currentUrl}\n`;
  const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.m3u`;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-box {
  background: #141417;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  width: 100%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-pill {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(224, 61, 90, 0.15);
  color: #e03d5a;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-header h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.modal-sub {
  font-size: 0.8rem;
  color: var(--muted);
  margin: 2px 0 0;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.15s;
}
.btn-close:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.section-card {
  background: #1b1b22;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 16px 18px;
  position: relative;
}

.mode-toggle-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #16161d;
  border-color: rgba(255, 255, 255, 0.14);
}
.mode-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mode-label {
  font-size: 0.8rem;
  color: var(--muted);
  font-weight: 600;
}
.mode-badge {
  font-size: 0.76rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
}
.badge-desktop {
  background: rgba(61, 190, 122, 0.15);
  color: #3dbe7a;
  border: 1px solid rgba(61, 190, 122, 0.35);
}
.badge-browser {
  background: rgba(90, 125, 224, 0.15);
  color: #5a7de0;
  border: 1px solid rgba(90, 125, 224, 0.35);
}
.btn-toggle-viewmode {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-switch-to-desktop {
  background: transparent;
  border: 1px solid rgba(61, 190, 122, 0.4);
  color: #3dbe7a;
}
.btn-switch-to-desktop:hover {
  background: rgba(61, 190, 122, 0.12);
  border-color: #3dbe7a;
}
.btn-switch-to-browser {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
}
.btn-switch-to-browser:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.sync-hero-card {
  border-color: rgba(224, 61, 90, 0.35);
  background: linear-gradient(180deg, rgba(224, 61, 90, 0.08) 0%, rgba(27, 27, 34, 0.8) 100%);
}

.card-badge {
  position: absolute;
  top: 14px;
  right: 16px;
  font-size: 0.65rem;
  font-weight: 800;
  color: #e03d5a;
  background: rgba(224, 61, 90, 0.15);
  border: 1px solid rgba(224, 61, 90, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.05em;
}

.section-card h3 {
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 6px;
}

.section-desc {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
  margin: 0 0 14px;
}

.code-box-wrap {
  background: #0e0e12;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.code-box-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 0.72rem;
  color: var(--muted);
}

.btn-copy-code {
  background: rgba(224, 61, 90, 0.2);
  color: #ff6b85;
  border: 1px solid rgba(224, 61, 90, 0.4);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-copy-code:hover {
  background: #e03d5a;
  color: #ffffff;
}

.code-block {
  margin: 0;
  padding: 10px 14px;
  overflow-x: auto;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  color: #a8d5ff;
}

.companion-actions {
  display: flex;
  gap: 10px;
}

.btn-download-script {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #ffffff;
  text-decoration: none;
  transition: all 0.15s;
}
.btn-download-script:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #ffffff;
}

.quick-commands-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.cmd-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.cmd-name {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}

.btn-mini-copy {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-mini-copy:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.cmd-input {
  width: 100%;
  background: #111116;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: monospace;
  font-size: 0.75rem;
  color: #e2e8f0;
  outline: none;
}

.manual-links-row {
  display: flex;
  gap: 10px;
}

.btn-secondary-link {
  flex: 1;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-secondary-link:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}
.btn-secondary-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
}

.player-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.player-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  flex: 1;
}

.player-tag {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
}
.tag-external {
  background: rgba(61, 190, 122, 0.2);
  color: #3dbe7a;
  border: 1px solid rgba(61, 190, 122, 0.4);
}
.tag-web {
  background: rgba(90, 125, 224, 0.15);
  color: #5a7de0;
}
.tag-host {
  background: rgba(224, 61, 90, 0.15);
  color: #e03d5a;
}

.modal-footer {
  padding: 12px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: flex-end;
  background: rgba(255, 255, 255, 0.02);
}

.btn-done {
  padding: 8px 24px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-done:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}
</style>
