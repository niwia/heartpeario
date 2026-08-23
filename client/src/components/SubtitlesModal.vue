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
          <div class="subs-header">
            <span class="section-label">Available Subtitle Tracks ({{ effectiveSubs.length }})</span>
            <span v-if="loadingRemoteSubs" class="spinner-sm"></span>
          </div>

          <div class="subs-list">
            <!-- Option: Subtitles Off -->
            <button
              class="sub-item"
              :class="{ active: !currentSubtitle }"
              @click="chooseSubtitle(null)"
            >
              <span class="sub-lang">Disabled (Off)</span>
              <Icon v-if="!currentSubtitle" name="check" size="16" />
            </button>

            <!-- Remote subtitle tracks -->
            <button
              v-for="(sub, idx) in effectiveSubs"
              :key="idx"
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

            <div v-if="!effectiveSubs.length && !loadingRemoteSubs" class="no-subs">
              No remote subtitle tracks found for this stream. You can upload a custom .srt file above.
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
  // If no subtitles were passed but we have media metadata (e.g. IMDb ID), fetch on demand
  if (effectiveSubs.value.length === 0 && props.mediaMeta?.id) {
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
  z-index: 1000;
  animation: fade-in 0.2s ease both;
}

.modal-card {
  width: min(520px, 100%);
  max-height: 80vh;
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
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Drop Zone */
.drop-zone {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--surface2);
  border: 1px dashed var(--border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--muted);
  transition: all 0.15s;
}
.drop-zone:hover, .drop-zone.dragging {
  border-color: #ffffff;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.04);
}
.drop-text {
  font-size: 0.82rem;
}
.drop-text code {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}

/* Subtitles List */
.subs-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.subs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.spinner-sm {
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.subs-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
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
  color: #ffffff;
  cursor: pointer;
  transition: all 0.15s;
}
.sub-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.3);
}
.sub-item.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
  color: #ffffff;
}

.sub-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sub-lang {
  font-size: 0.88rem;
  font-weight: 600;
}
.sub-code {
  font-size: 0.68rem;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
}
.sub-addon-tag {
  font-size: 0.65rem;
  color: var(--gold);
}

.no-subs {
  text-align: center;
  padding: 16px;
  color: var(--muted);
  font-size: 0.82rem;
  background: var(--surface2);
  border-radius: var(--radius-sm);
}

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

@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
