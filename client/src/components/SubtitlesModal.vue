<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-title">
          <Icon name="subtitles" size="20" />
          <h2>Select Subtitle Track</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="modal-body">

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
          <Icon name="subtitles" size="20" />
          <p class="drop-text">Upload custom <code>.srt</code> or <code>.vtt</code> subtitle file</p>
        </div>

        <!-- Subtitles List -->
        <div class="subs-section">

          <!-- Option: Subtitles Off -->
          <div class="subs-list">
            <button
              class="sub-item"
              :class="{ active: !currentSubtitle }"
              @click="chooseSubtitle(null)"
            >
              <span class="sub-lang">Disabled (Off)</span>
              <Icon v-if="!currentSubtitle" name="check" size="16" />
            </button>
          </div>

          <!-- Section 1: Stream Provided Subtitles (Top Priority) -->
          <div v-if="streamSubtitles.length" class="subs-sub-group">
            <div class="subs-header">
              <span class="section-label">From Selected Stream ({{ streamSubtitles.length }})</span>
            </div>
            <div class="subs-list">
              <button
                v-for="(sub, idx) in streamSubtitles"
                :key="'stream-' + idx"
                class="sub-item stream-sub-item"
                :class="{ active: currentSubtitle?.url === sub.url }"
                @click="chooseSubtitle(sub)"
              >
                <div class="sub-info">
                  <span class="sub-lang">{{ getLanguageName(sub.lang) || sub.lang || 'Stream Subtitle' }}</span>
                  <span class="sub-code">{{ (sub.lang || 'SUB').toUpperCase() }}</span>
                  <span class="stream-badge">STREAM</span>
                </div>
                <Icon v-if="currentSubtitle?.url === sub.url" name="check" size="16" />
              </button>
            </div>
          </div>

          <!-- Section 2: Online Addon Subtitles -->
          <div class="subs-sub-group">
            <div class="subs-header">
              <span class="section-label">Online Addon Subtitles ({{ addonSubtitles.length }})</span>
              <span v-if="loadingRemoteSubs" class="spinner-sm"></span>
            </div>

            <div class="subs-list">
              <button
                v-for="(sub, idx) in addonSubtitles"
                :key="'addon-' + idx"
                class="sub-item"
                :class="{ active: currentSubtitle?.url === sub.url }"
                @click="chooseSubtitle(sub)"
              >
                <div class="sub-info">
                  <span class="sub-lang">{{ getLanguageName(sub.lang) || sub.lang || 'Subtitle' }}</span>
                  <span class="sub-code">{{ (sub.lang || 'SUB').toUpperCase() }}</span>
                  <span v-if="sub.addonName" class="sub-addon-tag">{{ sub.addonName }}</span>
                </div>
                <Icon v-if="currentSubtitle?.url === sub.url" name="check" size="16" />
              </button>

              <div v-if="!addonSubtitles.length && !loadingRemoteSubs && !streamSubtitles.length" class="no-subs">
                No remote subtitle tracks found for this stream. You can upload a custom .srt file above.
              </div>
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
import { ref, computed, onMounted } from 'vue';
import { getLanguageName } from '@/services/subtitle.service';
import { fetchSubtitlesProgressive } from '@/services/stremio.service';
import { useAddonsStore } from '@/stores/addons';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  availableSubtitles: {
    type: Array,
    default: () => [],
  },
  availableSubs: {
    type: Array,
    default: () => [],
  },
  currentSubtitle: {
    type: Object,
    default: null,
  },
  mediaMeta: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close', 'select', 'load-custom']);

const addonsStore = useAddonsStore();
const fileInputEl = ref(null);
const isDragging = ref(false);
const dynamicSubs = ref([]);
const loadingRemoteSubs = ref(false);

const effectiveSubs = computed(() => {
  const list = (props.availableSubtitles?.length ? props.availableSubtitles : props.availableSubs) || [];
  const combined = [...list, ...dynamicSubs.value];
  const seen = new Set();
  return combined.filter(s => {
    if (!s || !s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
});

const streamSubtitles = computed(() => {
  return effectiveSubs.value.filter(s => s.isStreamSub);
});

const addonSubtitles = computed(() => {
  return effectiveSubs.value.filter(s => !s.isStreamSub);
});

function chooseSubtitle(sub) {
  emit('select', sub);
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
    emit('load-custom', {
      name: file.name,
      content: reader.result,
    });
  };
  reader.readAsText(file);
}

onMounted(async () => {
  // If no addon subtitles were passed but we have media metadata (e.g. IMDb ID), fetch on demand
  if (addonSubtitles.value.length === 0 && props.mediaMeta?.id) {
    loadingRemoteSubs.value = true;
    try {
      const type = props.mediaMeta.type || 'movie';
      await fetchSubtitlesProgressive(addonsStore.subtitleAddons, type, props.mediaMeta.id, (chunk) => {
        dynamicSubs.value.push(...chunk);
      });
    } catch {
      /* ignore */
    } finally {
      loadingRemoteSubs.value = false;
    }
  }
});
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
  width: min(500px, 100%);
  max-height: 82vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
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
  gap: 8px;
}
.header-title h2 {
  font-size: 1.05rem;
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
  background: var(--surface2);
  border-color: var(--border-light);
}

.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.drop-zone {
  border: 1px dashed rgba(255, 255, 255, 0.25);
  border-radius: var(--radius-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.15s;
  color: var(--muted);
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: #ffffff;
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}
.drop-text {
  font-size: 0.82rem;
}
.drop-text code {
  background: var(--surface2);
  padding: 2px 5px;
  border-radius: 3px;
  color: #ffffff;
}

.subs-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subs-sub-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-label {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.subs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sub-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.sub-item:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.35);
}
.sub-item.active {
  background: rgba(255, 255, 255, 0.12);
  border-color: #ffffff;
}

.stream-sub-item {
  border-color: rgba(61, 190, 122, 0.3);
  background: rgba(61, 190, 122, 0.05);
}
.stream-sub-item:hover {
  border-color: rgba(61, 190, 122, 0.6);
  background: rgba(61, 190, 122, 0.1);
}

.sub-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-lang {
  font-weight: 600;
  color: #ffffff;
}
.sub-code {
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--muted);
}
.stream-badge {
  font-size: 0.65rem;
  font-weight: 800;
  background: rgba(61, 190, 122, 0.2);
  color: #3dbe7a;
  border: 1px solid rgba(61, 190, 122, 0.4);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.03em;
}
.sub-addon-tag {
  font-size: 0.68rem;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 3px;
}

.no-subs {
  font-size: 0.82rem;
  color: var(--muted);
  text-align: center;
  padding: 14px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: var(--radius-sm);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.btn-done {
  padding: 7px 20px;
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
