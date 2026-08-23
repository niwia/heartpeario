<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">

      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-left">
          <div class="profile-avatar-preview" :style="{ background: profileStore.current.avatarColor }">
            {{ (profileStore.current.name || 'U').charAt(0).toUpperCase() }}
          </div>
          <div>
            <div class="profile-title-row">
              <h2>{{ profileStore.current.name }}</h2>
              <span class="vault-badge" title="Encrypted at rest with AES-GCM 256-bit">
                Encrypted Vault
              </span>
            </div>
            <p class="profile-sub">Personal watch party profile & encrypted data</p>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="modal-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          Watch History ({{ profileStore.watchHistory.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'friends' }"
          @click="activeTab = 'friends'"
        >
          Watch Buddies ({{ profileStore.watchBuddies.length }})
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'manage' }"
          @click="activeTab = 'manage'"
        >
          Profiles & Settings
        </button>
      </div>

      <!-- Modal Content Body -->
      <div class="modal-body">

        <!-- ── TAB 1: WATCH HISTORY ─────────────────────────────────── -->
        <div v-if="activeTab === 'history'" class="tab-pane">
          <div class="tab-header-row">
            <span class="pane-title">Your Encrypted Watch History</span>
            <button
              v-if="profileStore.watchHistory.length"
              class="btn-clear"
              @click="clearHistory"
            >
              Clear All
            </button>
          </div>

          <div v-if="profileStore.watchHistory.length" class="history-list">
            <div
              v-for="item in profileStore.watchHistory"
              :key="item.id + item.watchedAt"
              class="history-item"
              @click="playHistoryItem(item)"
              title="Click to play in room"
            >
              <img v-if="item.poster" :src="item.poster" class="history-poster" alt="" />
              <div v-else class="history-poster-ph">
                <Icon name="play" size="20" />
              </div>

              <div class="history-info">
                <div class="history-title-row">
                  <span class="history-title">{{ item.title }}</span>
                  <span v-if="item.year" class="history-year">({{ item.year }})</span>
                </div>
                <span v-if="item.episodeTitle" class="history-ep">{{ item.episodeTitle }}</span>
                <div class="history-time-meta">
                  <span>Watched {{ fmtRelativeTime(item.watchedAt) }}</span>
                  <span v-if="item.progressSeconds" class="progress-txt">
                    at {{ fmtTime(item.progressSeconds) }}
                  </span>
                </div>
              </div>

              <button class="btn-rewatch" title="Stream this for the room">
                <Icon name="play" size="14" />
                <span>Play</span>
              </button>
            </div>
          </div>

          <div v-else class="empty-state">
            <p class="empty-title">No watch history yet</p>
            <p class="empty-sub">Movies and episodes you watch with friends will be saved here securely.</p>
          </div>
        </div>

        <!-- ── TAB 2: WATCH BUDDIES ─────────────────────────────────── -->
        <div v-if="activeTab === 'friends'" class="tab-pane">
          <div class="tab-header-row">
            <span class="pane-title">People You've Watched With</span>
          </div>

          <div v-if="profileStore.watchBuddies.length" class="buddies-grid">
            <div
              v-for="friend in profileStore.watchBuddies"
              :key="friend.name"
              class="buddy-card"
            >
              <div class="buddy-avatar" :style="{ background: friend.color }">
                {{ friend.name.charAt(0).toUpperCase() }}
              </div>
              <div class="buddy-info">
                <span class="buddy-name">{{ friend.name }}</span>
                <span class="buddy-stats">
                  {{ friend.watchCount }} watch session{{ friend.watchCount > 1 ? 's' : '' }}
                </span>
                <span class="buddy-seen">Last seen {{ fmtRelativeTime(friend.lastSeen) }}</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <p class="empty-title">No watch buddies yet</p>
            <p class="empty-sub">Friends who join your rooms will be recorded in your buddy list automatically.</p>
          </div>
        </div>

        <!-- ── TAB 3: PROFILES & SETTINGS ───────────────────────────── -->
        <div v-if="activeTab === 'manage'" class="tab-pane">
          <!-- Edit Current Profile Form -->
          <div class="settings-section">
            <span class="section-title">Edit Current Profile</span>
            <div class="profile-edit-row">
              <input
                v-model="editNameInput"
                type="text"
                placeholder="Profile name"
                maxlength="30"
              />
              <div class="colors-row">
                <button
                  v-for="color in AVAILABLE_COLORS"
                  :key="color"
                  class="color-pick-btn"
                  :style="{ background: color }"
                  :class="{ active: editColorInput === color }"
                  @click="editColorInput = color"
                ></button>
              </div>
              <button class="btn-save-profile" @click="saveProfileEdit">
                Save
              </button>
            </div>
          </div>

          <!-- Switch / Create Profile -->
          <div class="settings-section">
            <span class="section-title">Switch Profiles</span>
            <div class="profiles-list">
              <div
                v-for="p in profileStore.profileList"
                :key="p.id"
                class="profile-item"
                :class="{ active: p.id === profileStore.activeProfileId }"
                @click="switchProfile(p.id)"
              >
                <div class="p-avatar" :style="{ background: p.avatarColor }">
                  {{ (p.name || 'P').charAt(0).toUpperCase() }}
                </div>
                <div class="p-info">
                  <span class="p-name">{{ p.name }}</span>
                  <span class="p-meta">{{ (p.history || []).length }} watched</span>
                </div>
                <span v-if="p.id === profileStore.activeProfileId" class="active-badge">Active</span>
                <button
                  v-if="profileStore.profileList.length > 1 && p.id !== 'main'"
                  class="btn-del-profile"
                  @click.stop="deleteProfile(p.id)"
                  title="Delete Profile"
                >
                  <Icon name="close" size="14" />
                </button>
              </div>
            </div>

            <!-- Create New Profile -->
            <form class="create-profile-form" @submit.prevent="createNewProfile">
              <input
                v-model="newProfileName"
                type="text"
                placeholder="Create new profile name…"
                maxlength="30"
              />
              <button type="submit" class="btn-create" :disabled="!newProfileName.trim()">
                + Add Profile
              </button>
            </form>
          </div>

          <!-- Encryption & Privacy Notice -->
          <div class="vault-info-box">
            <div class="v-title">
              <span>Client-Side AES-GCM 256-bit Encryption</span>
            </div>
            <p class="v-desc">
              All history, buddies, and installed addons are encrypted inside your browser vault with local device keys. Nothing is uploaded to or tracked by any central database.
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
import { ref, watch } from 'vue';
import { useProfileStore } from '@/stores/profile';
import Icon from '@/components/Icon.vue';

const emit = defineEmits(['close', 'selectStream']);
const profileStore = useProfileStore();

const activeTab = ref('history');
const editNameInput = ref(profileStore.current.name || '');
const editColorInput = ref(profileStore.current.avatarColor || '#e03d5a');
const newProfileName = ref('');

const AVAILABLE_COLORS = ['#e03d5a', '#5a7de0', '#3dbe7a', '#e0a83d', '#a03de0', '#e05a3d', '#3dbde0'];

watch(() => profileStore.current, (p) => {
  if (p) {
    editNameInput.value = p.name || '';
    editColorInput.value = p.avatarColor || '#e03d5a';
  }
}, { immediate: true });

async function saveProfileEdit() {
  const name = editNameInput.value.trim();
  if (name) {
    await profileStore.updateCurrentName(name);
    await profileStore.updateCurrentColor(editColorInput.value);
  }
}

async function switchProfile(id) {
  await profileStore.switchProfile(id);
}

async function createNewProfile() {
  const name = newProfileName.value.trim();
  if (!name) return;
  await profileStore.createProfile(name, AVAILABLE_COLORS[Math.floor(Math.random() * AVAILABLE_COLORS.length)]);
  newProfileName.value = '';
}

async function deleteProfile(id) {
  if (confirm('Are you sure you want to delete this profile and its history?')) {
    await profileStore.deleteProfile(id);
  }
}

async function clearHistory() {
  if (confirm('Clear all watch history for this profile?')) {
    await profileStore.clearHistory();
  }
}

function playHistoryItem(item) {
  if (!item.url) return;
  emit('selectStream', {
    url: item.url,
    mediaMeta: {
      id: item.id,
      title: item.title,
      episodeTitle: item.episodeTitle,
      year: item.year,
      poster: item.poster,
    },
    subtitles: [],
  });
  emit('close');
}

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  const h = Math.floor(m / 60);
  const remM = (m % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${remM}:${s}` : `${m}:${s}`;
}

function fmtRelativeTime(ts) {
  if (!ts) return '';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  return `${days}d ago`;
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
  z-index: 1000;
  animation: fade-in 0.2s ease both;
}

.modal-card {
  width: min(680px, 100%);
  max-height: 88vh;
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
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile-avatar-preview {
  width: 44px; height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.profile-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.profile-title-row h2 {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
}

.vault-badge {
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(61, 190, 122, 0.15);
  border: 1px solid rgba(61, 190, 122, 0.3);
  color: #3dbe7a;
  padding: 2px 8px;
  border-radius: 999px;
}

.profile-sub {
  font-size: 0.78rem;
  color: var(--muted);
  margin-top: 2px;
}

.close-btn {
  width: 32px; height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  transition: all 0.15s;
}
.close-btn:hover { color: var(--text); background: var(--surface2); }

.modal-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--surface2);
}
.tab-btn {
  flex: 1;
  padding: 12px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.tab-btn:hover { color: var(--text); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: rgba(255, 255, 255, 0.02);
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pane-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.btn-clear {
  font-size: 0.75rem;
  color: var(--accent);
  cursor: pointer;
}
.btn-clear:hover { text-decoration: underline; }

/* History List */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.history-item:hover {
  border-color: var(--accent);
  background: rgba(224, 61, 90, 0.05);
}

.history-poster {
  width: 42px; height: 60px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.history-poster-ph {
  width: 42px; height: 60px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  flex-shrink: 0;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  overflow: hidden;
}
.history-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.history-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-year { font-size: 0.8rem; color: var(--muted); }
.history-ep { font-size: 0.78rem; color: var(--gold); }
.history-time-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--muted);
}
.progress-txt { color: var(--accent); font-weight: 600; }

.btn-rewatch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
}

/* Buddies Grid */
.buddies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.buddy-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.buddy-avatar {
  width: 38px; height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}
.buddy-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.buddy-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.buddy-stats { font-size: 0.75rem; color: var(--gold); }
.buddy-seen { font-size: 0.7rem; color: var(--muted); }

/* Settings / Management */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.section-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}

.profile-edit-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
}
.profile-edit-row input {
  flex: 1;
  background: transparent;
  border: none;
  font-size: 0.9rem;
  color: var(--text);
}
.profile-edit-row input:focus { outline: none; }

.colors-row {
  display: flex;
  gap: 6px;
}
.color-pick-btn {
  width: 20px; height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
}
.color-pick-btn.active { border-color: #fff; transform: scale(1.15); }

.btn-save-profile {
  padding: 6px 14px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #fff;
}

.profiles-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.profile-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}
.profile-item:hover { border-color: var(--border-light); }
.profile-item.active {
  border-color: var(--accent);
  background: rgba(224, 61, 90, 0.06);
}
.p-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
}
.p-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.p-name { font-size: 0.88rem; font-weight: 600; color: var(--text); }
.p-meta { font-size: 0.72rem; color: var(--muted); }
.active-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-dim);
  padding: 2px 8px;
  border-radius: 999px;
}

.btn-del-profile {
  width: 26px; height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  border-radius: var(--radius-sm);
}
.btn-del-profile:hover { color: var(--accent); }

.create-profile-form {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.create-profile-form input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.85rem;
  color: var(--text);
}
.btn-create {
  padding: 8px 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-create:hover:not(:disabled) {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.vault-info-box {
  background: rgba(61, 190, 122, 0.06);
  border: 1px solid rgba(61, 190, 122, 0.2);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.v-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: #3dbe7a;
}
.v-desc {
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.45;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
}
.empty-title { font-size: 0.95rem; font-weight: 600; color: var(--text); margin-bottom: 4px; }
.empty-sub { font-size: 0.82rem; }

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
</style>
