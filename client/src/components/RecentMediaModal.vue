<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">

      <!-- Header -->
      <div class="modal-header">
        <div class="header-title">
          <Icon name="history" size="18" />
          <h2>Recent & Saved Media</h2>
          <span v-if="recentStreams.length" class="count-badge">{{ recentStreams.length }} / 5</span>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <div v-if="recentStreams.length === 0" class="empty-state">
          <Icon name="history" size="36" class="empty-icon" />
          <p class="empty-title">No recent streams saved</p>
          <p class="empty-sub">Movies and shows you play in rooms will automatically appear here for quick resumption.</p>
        </div>

        <div v-else class="recent-list">
          <div
            v-for="(item, idx) in recentStreams"
            :key="item.url || idx"
            class="recent-card"
            :class="{ 'is-current': currentUrl === item.url }"
          >
            <!-- Poster -->
            <div class="poster-box">
              <img v-if="item.poster" :src="item.poster" :alt="item.title" class="poster-img" loading="lazy" />
              <div v-else class="poster-placeholder">
                <Icon name="film" size="20" />
              </div>
            </div>

            <!-- Meta -->
            <div class="card-meta">
              <div class="title-row">
                <span class="media-title">{{ item.title }}</span>
                <span v-if="item.year" class="media-year">({{ item.year }})</span>
                <span v-if="currentUrl === item.url" class="now-playing-pill">PLAYING</span>
              </div>

              <div v-if="item.episodeTitle" class="episode-title">
                {{ item.episodeTitle }}
              </div>

              <!-- Progress Bar -->
              <div v-if="item.durationSeconds > 0" class="progress-section">
                <div class="progress-bar-bg">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100)) + '%' }"
                  ></div>
                </div>
                <div class="progress-labels">
                  <span>{{ fmtTime(item.progressSeconds) }} / {{ fmtTime(item.durationSeconds) }}</span>
                  <span>{{ Math.min(100, Math.round((item.progressSeconds / item.durationSeconds) * 100)) }}%</span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="card-actions">
              <button
                class="btn-resume-stream"
                :disabled="currentUrl === item.url"
                @click="resume(item)"
                title="Resume this stream in the room"
              >
                <Icon name="play" size="14" />
                <span>{{ currentUrl === item.url ? 'Playing' : 'Resume' }}</span>
              </button>
              <button
                class="btn-remove-stream"
                @click.stop="remove(idx)"
                title="Remove from history"
              >
                <Icon name="close" size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button
          v-if="currentUrl && isHost"
          class="btn-unload"
          @click="unload"
          title="Unload current video and show the room's cinema screen"
        >
          Back to Room Cinema Screen
        </button>
        <div v-else></div>
        <button class="btn-done" @click="$emit('close')">Done</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import Icon from '@/components/Icon.vue';

const props = defineProps({
  recentStreams: {
    type: Array,
    default: () => [],
  },
  currentUrl: {
    type: String,
    default: '',
  },
  isHost: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['close', 'resume', 'remove', 'unload']);

function resume(item) {
  emit('resume', item);
  emit('close');
}

function remove(idx) {
  emit('remove', idx);
}

function unload() {
  emit('unload');
  emit('close');
}

function fmtTime(sec) {
  const s = Math.floor(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  return `${m}:${String(ss).padStart(2, '0')}`;
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
  width: min(580px, 100%);
  max-height: 84vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.85);
  overflow: hidden;
}

.modal-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-title h2 {
  font-size: 1.1rem;
  font-weight: 700;
  color: #ffffff;
}
.count-badge {
  font-size: 0.72rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 1px 7px;
  border-radius: 999px;
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
  background: var(--surface2);
  border-color: var(--border-light);
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 16px;
  gap: 8px;
}
.empty-icon { color: var(--muted); margin-bottom: 4px; }
.empty-title { font-size: 0.95rem; font-weight: 600; color: #ffffff; }
.empty-sub { font-size: 0.8rem; color: var(--muted); max-width: 340px; line-height: 1.4; }

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: all 0.15s;
}
.recent-card:hover {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.05);
}
.recent-card.is-current {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
}

.poster-box {
  width: 44px;
  height: 64px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}
.poster-img {
  width: 100%; height: 100%;
  object-fit: cover;
}
.poster-placeholder {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.04);
}

.card-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.title-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.media-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-year {
  font-size: 0.75rem;
  color: var(--muted);
}
.now-playing-pill {
  font-size: 0.62rem;
  font-weight: 800;
  color: #3dbe7a;
  background: rgba(61, 190, 122, 0.15);
  border: 1px solid rgba(61, 190, 122, 0.35);
  padding: 1px 5px;
  border-radius: 3px;
}
.episode-title {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 2px;
}
.progress-bar-bg {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: #ffffff;
  border-radius: 2px;
}
.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--muted);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.btn-resume-stream {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-resume-stream:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: #ffffff;
}
.btn-resume-stream:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn-remove-stream {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 3px;
  transition: color 0.15s;
}
.btn-remove-stream:hover {
  color: #e03d5a;
}

.modal-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.btn-unload {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.15s;
}
.btn-unload:hover { color: #ffffff; }

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

@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
