<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-title">
          <span class="icon">💬</span>
          <h2>Subtitles & Audio</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">✕</button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">

        <!-- Subtitle Sync Offset Controls -->
        <div class="offset-section">
          <span class="section-label">Subtitle Sync Timing</span>
          <div class="offset-controls">
            <button class="offset-btn" @click="adjustOffset(-2500)">-2.5s</button>
            <button class="offset-btn" @click="adjustOffset(-500)">-0.5s</button>
            <span class="offset-val" :class="{ 'has-offset': offsetMs !== 0 }">
              {{ offsetMs >= 0 ? '+' : '' }}{{ (offsetMs / 1000).toFixed(1) }}s
            </span>
            <button class="offset-btn" @click="adjustOffset(+500)">+0.5s</button>
            <button class="offset-btn" @click="adjustOffset(+2500)">+2.5s</button>
            <button v-if="offsetMs !== 0" class="offset-reset" @click="resetOffset">Reset</button>
          </div>
        </div>

        <!-- Custom Subtitle File Upload / Drop -->
        <div
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDropFile"
          @click="fileInputEl?.click()"
        >
          <input
            ref="fileInputEl"
            type="file"
            accept=".srt,.vtt"
            style="display: none"
            @change="onFileSelected"
          />
          <span class="drop-icon">📁</span>
          <p class="drop-text">Drag & drop your own <code>.srt</code> or <code>.vtt</code> file here, or click to browse</p>
        </div>

        <!-- Subtitles List -->
        <div class="subs-section">
          <div class="subs-header">
            <span class="section-label">Available Subtitle Tracks ({{ availableSubs.length }})</span>
          </div>

          <div class="subs-list">
            <!-- Option: Subtitles Off -->
            <button
              class="sub-item"
              :class="{ active: !currentSubtitle }"
              @click="chooseSubtitle(null)"
            >
              <span class="sub-lang">🚫 Off</span>
              <span class="sub-check" v-if="!currentSubtitle">✓</span>
            </button>

            <!-- Remote subtitle tracks -->
            <button
              v-for="(sub, idx) in availableSubs"
              :key="idx"
              class="sub-item"
              :class="{ active: currentSubtitle?.url === sub.url }"
              @click="chooseSubtitle(sub)"
            >
              <div class="sub-info">
                <span class="sub-lang">{{ getLanguageName(sub.lang) }}</span>
                <span class="sub-code">{{ sub.lang?.toUpperCase() }}</span>
              </div>
              <span class="sub-check" v-if="currentSubtitle?.url === sub.url">✓</span>
            </button>

            <div v-if="!availableSubs.length" class="no-subs">
              No remote subtitle tracks were found for this stream. You can upload a custom <code>.srt</code> file above.
            </div>
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
import { getLanguageName } from '@/services/subtitle.service';

const props = defineProps({
  availableSubs: {
    type: Array,
    default: () => [],
  },
  currentSubtitle: {
    type: Object,
    default: null,
  },
  offsetMs: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['close', 'selectSubtitle', 'setOffset', 'loadCustomSubtitle']);

const fileInputEl = ref(null);
const isDragging = ref(false);

function chooseSubtitle(sub) {
  emit('selectSubtitle', sub);
}

function adjustOffset(delta) {
  emit('setOffset', props.offsetMs + delta);
}

function resetOffset() {
  emit('setOffset', 0);
}

function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (file) handleCustomFile(file);
}

function onDropFile(e) {
  isDragging.value = false;
  const file = e.dataTransfer.files?.[0];
  if (file) handleCustomFile(file);
}

function handleCustomFile(file) {
  if (!file.name.endsWith('.srt') && !file.name.endsWith('.vtt')) {
    alert('Please select a valid .srt or .vtt subtitle file');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    emit('loadCustomSubtitle', {
      name: file.name,
      content: reader.result,
    });
  };
  reader.readAsText(file);
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
  width: min(540px, 100%);
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
.header-title .icon { font-size: 1.3rem; }
.header-title h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
}

.close-btn {
  width: 32px; height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 1.1rem;
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover { color: var(--text); background: var(--surface2); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Offset Section */
.offset-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.offset-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
}

.offset-btn {
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text);
  transition: all 0.15s;
}
.offset-btn:hover { border-color: var(--accent); color: var(--accent); }

.offset-val {
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0 10px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.offset-val.has-offset { color: var(--accent); }

.offset-reset {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--muted);
  text-decoration: underline;
  cursor: pointer;
}
.offset-reset:hover { color: var(--text); }

/* Drop Zone */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px;
  background: var(--surface2);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: var(--accent);
  background: var(--accent-dim);
}
.drop-icon { font-size: 1.5rem; }
.drop-text {
  font-size: 0.82rem;
  color: var(--muted);
}
.drop-text code {
  color: var(--text);
  background: rgba(255,255,255,0.06);
  padding: 2px 4px;
  border-radius: 3px;
}

/* Subs List */
.subs-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.sub-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.sub-item:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-light);
}
.sub-item.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}

.sub-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-lang {
  font-size: 0.9rem;
  font-weight: 600;
}
.sub-code {
  font-size: 0.72rem;
  color: var(--muted);
  background: rgba(255,255,255,0.06);
  padding: 2px 6px;
  border-radius: 999px;
}
.sub-check {
  font-weight: 700;
  color: var(--accent);
}

.no-subs {
  text-align: center;
  padding: 16px;
  color: var(--muted);
  font-size: 0.84rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.btn-done {
  padding: 8px 20px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
}
</style>
