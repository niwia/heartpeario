<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">

      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-title">
          <Icon name="settings" size="20" />
          <h2>Room & Player Settings</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="settings-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'addons' }"
          @click="activeTab = 'addons'"
        >
          <Icon name="addons" size="16" />
          <span>Stremio Addons</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'direct-url' }"
          @click="activeTab = 'direct-url'"
        >
          <Icon name="link" size="16" />
          <span>Direct Stream URL</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          <Icon name="user" size="16" />
          <span>Profile</span>
        </button>
      </div>

      <!-- Modal Body Content -->
      <div class="modal-body">

        <!-- ── TAB 1: ADDONS MANAGER ───────────────────────────────── -->
        <div v-if="activeTab === 'addons'" class="tab-pane">
          <p class="tab-desc">
            Install Stremio addons (Torrentio, StremThru, Subtitles, etc.) to discover and play streams in the room. Addons are saved in your local browser vault.
          </p>

          <!-- Install Addon Form -->
          <form class="add-form" @submit.prevent="installAddon">
            <input
              v-model="manifestInput"
              type="text"
              placeholder="Paste Stremio manifest URL (e.g. https://.../manifest.json)"
              :disabled="addonsStore.loading"
              spellcheck="false"
            />
            <button type="submit" class="btn-install" :disabled="!manifestInput.trim() || addonsStore.loading">
              <span v-if="!addonsStore.loading">Install Addon</span>
              <span v-else class="spinner-sm"></span>
            </button>
          </form>

          <p v-if="addonError" class="msg-error">{{ addonError }}</p>
          <p v-if="addonSuccess" class="msg-success">{{ addonSuccess }}</p>

          <!-- Addons List -->
          <div class="addons-list">
            <div
              v-for="addon in addonsStore.addons"
              :key="addon.id"
              class="addon-card"
              :class="{ disabled: !addon.enabled }"
            >
              <div class="addon-left">
                <img v-if="addon.logo" :src="addon.logo" class="addon-logo" alt="" />
                <div v-else class="addon-logo-ph">
                  <Icon name="addons" size="18" />
                </div>
                <div class="addon-info">
                  <div class="addon-title-row">
                    <span class="addon-name">{{ addon.name }}</span>
                    <span class="addon-ver">v{{ addon.version }}</span>
                  </div>
                  <p class="addon-desc">{{ addon.description || 'Stremio addon' }}</p>
                </div>
              </div>

              <div class="addon-actions">
                <button
                  class="btn-toggle"
                  :class="{ active: addon.enabled }"
                  @click="addonsStore.toggleAddon(addon.id)"
                  :title="addon.enabled ? 'Disable addon' : 'Enable addon'"
                >
                  {{ addon.enabled ? 'Enabled' : 'Disabled' }}
                </button>
                <button
                  v-if="addon.id !== 'community.cinemeta'"
                  class="btn-del"
                  @click="addonsStore.removeAddon(addon.id)"
                  title="Uninstall addon"
                >
                  <Icon name="close" size="14" />
                </button>
              </div>
            </div>
          </div>

          <div class="pane-footer-action">
            <button class="btn-text-link" @click="resetAddons">Restore Default Addons</button>
          </div>
        </div>

        <!-- ── TAB 2: DIRECT STREAM URL ────────────────────────────── -->
        <div v-else-if="activeTab === 'direct-url'" class="tab-pane">
          <p class="tab-desc">
            Load any direct video link (MP4, MKV, WebM, HLS m3u8) to watch in synchronized playback with your room.
          </p>

          <form class="direct-url-form" @submit.prevent="submitDirectUrl">
            <input
              v-model="directUrlInput"
              type="url"
              placeholder="https://example.com/video.mp4"
              spellcheck="false"
              required
            />
            <button type="submit" class="btn-load-direct" :disabled="!directUrlInput.trim()">
              Load Stream for Room
            </button>
          </form>
        </div>

        <!-- ── TAB 3: PROFILE SETTINGS ─────────────────────────────── -->
        <div v-else-if="activeTab === 'profile'" class="tab-pane">
          <div class="profile-section">
            <label class="section-label">Display Name</label>
            <div class="name-edit-row">
              <input
                v-model="profileNameInput"
                type="text"
                maxlength="25"
                placeholder="Your display name..."
              />
              <button
                class="btn-save-name"
                :disabled="!profileNameInput.trim() || profileNameInput === profileStore.current.name"
                @click="saveProfileName"
              >
                Save
              </button>
            </div>
          </div>

          <div class="profile-section">
            <label class="section-label">Avatar Color</label>
            <div class="color-picker-row">
              <button
                v-for="c in AVAILABLE_COLORS"
                :key="c"
                class="color-dot"
                :class="{ active: profileColor === c }"
                :style="{ background: c }"
                @click="selectColor(c)"
              ></button>
            </div>
          </div>

          <div class="profile-section">
            <label class="section-label">TMDB API Key / Token (Metadata & HD Backdrops)</label>
            <div class="name-edit-row">
              <input
                v-model="tmdbKeyInput"
                type="text"
                placeholder="Optional custom TMDB API Key"
                spellcheck="false"
              />
              <button class="btn-save-name" @click="saveTmdbKey">
                Save
              </button>
            </div>
            <p class="tmdb-hint">
              HeartPeario automatically enriches movies/shows with HD backdrops, ratings, and plot summaries via TMDB. You can supply your own API key or use default.
            </p>
          </div>

          <div class="vault-info-box">
            <span class="v-title">Private Browser Storage</span>
            <p class="v-desc">
              Your profile, display name, and addons are kept secure inside your local browser storage.
            </p>
          </div>
        </div>

      </div>

      <!-- Modal Footer -->
      <div class="modal-footer">
        <button class="btn-done" @click="$emit('close')">Done</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAddonsStore } from '@/stores/addons';
import { useProfileStore } from '@/stores/profile';
import { getTmdbApiKey, getTmdbToken, setTmdbApiKey } from '@/services/tmdb.service';
import socket from '@/services/socket';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  initialTab: {
    type: String,
    default: 'addons',
  },
});

const emit = defineEmits(['close', 'load-direct-url']);

const addonsStore = useAddonsStore();
const profileStore = useProfileStore();

const activeTab = ref(props.initialTab || 'addons');

// Addons state
const manifestInput = ref('');
const addonError = ref('');
const addonSuccess = ref('');

// Direct URL state
const directUrlInput = ref('');

// Profile & TMDB state
const profileNameInput = ref(profileStore.current.name || '');
const profileColor = ref(profileStore.current.avatarColor || '#e03d5a');
const tmdbKeyInput = ref(getTmdbApiKey() || '');
const tmdbSaved = ref(false);
const AVAILABLE_COLORS = ['#e03d5a', '#5a7de0', '#3dbe7a', '#e0a83d', '#a03de0', '#e05a3d', '#3dbde0', '#ffffff'];

function saveTmdbKey() {
  setTmdbApiKey(tmdbKeyInput.value, tmdbKeyInput.value);
  tmdbSaved.value = true;
  setTimeout(() => { tmdbSaved.value = false; }, 2500);
}

async function installAddon() {
  addonError.value = '';
  addonSuccess.value = '';
  try {
    const addon = await addonsStore.addAddon(manifestInput.value);
    addonSuccess.value = `Installed "${addon.name}" successfully!`;
    manifestInput.value = '';
  } catch (err) {
    addonError.value = err.message || 'Failed to install addon';
  }
}

function resetAddons() {
  addonsStore.resetToDefaults();
  addonSuccess.value = 'Addons reset to defaults!';
  setTimeout(() => { addonSuccess.value = ''; }, 3000);
}

function removeAddon(manifestUrl) {
  addonsStore.removeAddon(manifestUrl);
}

function handleDirectUrlSubmit() {
  const url = directUrlInput.value.trim();
  if (!url) return;
  emit('load-direct-url', url);
  emit('close');
}

function saveProfileName() {
  const name = profileNameInput.value.trim();
  if (!name) return;
  profileStore.updateCurrentName(name);
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
}

function selectColor(color) {
  profileColor.value = color;
  profileStore.updateCurrentColor(color);
  socket.send('user.color', { color });
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 2500;
  animation: fade-in 0.2s ease both;
}

.modal-card {
  width: min(560px, 100%);
  max-height: 85vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-title h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
}

.close-btn {
  width: 32px; height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.close-btn:hover {
  color: #ffffff;
  border-color: var(--border-light);
  background: var(--surface2);
}

/* Tabs Navigation */
.settings-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  background: transparent;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: #ffffff;
}
.tab-btn.active {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.08);
}

/* Modal Body */
.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tab-desc {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.45;
}

/* Form Styles */
.add-form, .direct-url-form {
  display: flex;
  gap: 8px;
}
.add-form input, .direct-url-form input, .name-edit-row input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.85rem;
  color: #ffffff;
  transition: border-color 0.15s;
}
.add-form input:focus, .direct-url-form input:focus, .name-edit-row input:focus {
  border-color: rgba(255, 255, 255, 0.4);
}

.btn-install, .btn-load-direct, .btn-save-name {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-install:hover:not(:disabled), .btn-load-direct:hover:not(:disabled), .btn-save-name:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.msg-error { font-size: 0.8rem; color: #ff5e7e; }
.msg-success { font-size: 0.8rem; color: #3dbe7a; }

/* Addons list */
.addons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow-y: auto;
}
.addon-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  gap: 12px;
}
.addon-card.disabled { opacity: 0.55; }
.addon-left {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}
.addon-logo {
  width: 28px; height: 28px;
  object-fit: contain;
  border-radius: 4px;
}
.addon-logo-ph {
  width: 28px; height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
.addon-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.addon-title-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.addon-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
}
.addon-ver {
  font-size: 0.68rem;
  color: var(--muted);
}
.addon-desc {
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addon-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.btn-toggle {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
}
.btn-toggle.active {
  border-color: #3dbe7a;
  color: #3dbe7a;
  background: rgba(61, 190, 122, 0.1);
}
.btn-del {
  width: 26px; height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  background: transparent;
  border: none;
  cursor: pointer;
}
.btn-del:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.pane-footer-action {
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}
.btn-text-link {
  font-size: 0.78rem;
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
}
.btn-text-link:hover { color: #ffffff; }

/* Profile Pane */
.profile-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.name-edit-row {
  display: flex;
  gap: 8px;
}
.color-picker-row {
  display: flex;
  gap: 10px;
}
.color-dot {
  width: 24px; height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s;
}
.color-dot:hover { transform: scale(1.15); }
.color-dot.active { border-color: #ffffff; transform: scale(1.2); }

.vault-info-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.v-title { font-size: 0.8rem; font-weight: 700; color: #ffffff; }
.v-desc { font-size: 0.75rem; color: var(--muted); line-height: 1.4; }

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.btn-done {
  padding: 8px 22px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  font-size: 0.86rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-done:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.spinner-sm {
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
