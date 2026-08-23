<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-title">
          <Icon name="vol-high" size="20" />
          <h2>Select Audio Track</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">
        <div class="audio-section">
          <div class="section-header">
            <span class="section-label">Audio Tracks Detected ({{ audioTracks.length || 1 }})</span>
          </div>

          <div class="audio-list">
            <!-- If native audio tracks are detected -->
            <template v-if="audioTracks.length > 0">
              <button
                v-for="track in audioTracks"
                :key="track.index"
                class="audio-item"
                :class="{ active: track.enabled }"
                @click="onSelect(track.index)"
              >
                <div class="audio-info">
                  <span class="audio-label">{{ track.label || `Track ${track.index + 1}` }}</span>
                  <span v-if="track.language" class="audio-lang">{{ track.language.toUpperCase() }}</span>
                </div>
                <Icon v-if="track.enabled" name="check" size="16" />
              </button>
            </template>

            <!-- Default Single Track Fallback -->
            <template v-else>
              <button class="audio-item active">
                <div class="audio-info">
                  <span class="audio-label">Default Audio Track (Stream Primary)</span>
                  <span class="audio-lang">MAIN</span>
                </div>
                <Icon name="check" size="16" />
              </button>
              <p class="audio-note">
                This stream is currently playing on its embedded primary audio channel.
              </p>
            </template>
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
import Icon from '@/components/Icon.vue';

const props = defineProps({
  audioTracks: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['close', 'select']);

function onSelect(index) {
  emit('select', index);
  emit('close');
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
  width: min(480px, 100%);
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

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.audio-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.audio-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.audio-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.3);
}
.audio-item.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
  color: #ffffff;
}

.audio-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.audio-label {
  font-size: 0.88rem;
  font-weight: 600;
}
.audio-lang {
  font-size: 0.68rem;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}

.audio-note {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
  padding: 4px 2px;
}

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

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
