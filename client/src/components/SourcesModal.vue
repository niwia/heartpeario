<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">

      <!-- Header -->
      <div class="modal-header">
        <div class="header-title">
          <Icon name="sources" size="18" />
          <h2>Stream Sources</h2>
          <span v-if="allSources.length" class="count-badge">{{ filteredSources.length }} of {{ allSources.length }}</span>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Media Subtitle Info if Available -->
      <div v-if="mediaMeta?.title" class="source-media-bar">
        <span class="sm-title">{{ mediaMeta.title }}</span>
        <span v-if="mediaMeta.episodeTitle" class="sm-ep">{{ mediaMeta.episodeTitle }}</span>
        <span v-if="mediaMeta.year" class="sm-year">({{ mediaMeta.year }})</span>
      </div>

      <!-- Addon Filter Tabs -->
      <div v-if="availableAddonNames.length > 1" class="addon-filter-tabs-bar">
        <button
          class="addon-filter-btn"
          :class="{ active: selectedAddonFilter === 'all' }"
          @click="selectedAddonFilter = 'all'"
        >
          All ({{ allSources.length }})
        </button>
        <button
          v-for="addon in availableAddonNames"
          :key="addon.name"
          class="addon-filter-btn"
          :class="{ active: selectedAddonFilter === addon.name }"
          @click="selectedAddonFilter = addon.name"
        >
          {{ addon.name }} ({{ addon.count }})
        </button>
      </div>

      <!-- Body: List of Sources -->
      <div class="modal-body">

        <!-- Loading State -->
        <div v-if="loading" class="loading-sources-row">
          <div class="spinner-sm"></div>
          <span>Querying active addons for available streams...</span>
        </div>

        <!-- Empty State -->
        <div v-if="filteredSources.length === 0 && !loading" class="empty-sources">
          <Icon name="sources" size="32" class="empty-icon" />
          <p class="empty-title">No sources found</p>
          <p class="empty-sub">Search for this title in the catalog or check your installed addons.</p>
          <button class="btn-search-catalog" @click="$emit('open-search')">
            <Icon name="search" size="15" />
            <span>Search Catalog</span>
          </button>
        </div>

        <!-- Sources List -->
        <div v-else class="sources-list">
          <div
            v-for="(s, idx) in sortedSources"
            :key="s.url || idx"
            class="source-card"
            :class="{
              active: currentUrl === (s.url || s.externalUrl),
              'is-dead': healthMap[s.url || s.externalUrl]?.online === false
            }"
            @click="selectSource(s)"
          >
            <div class="source-left">
              <div class="addon-badge">{{ s.addonName || 'Addon' }}</div>
              <div class="source-meta">
                <div class="source-name-row">
                  <span class="source-name">{{ s.name || s.title || 'Stream ' + (idx + 1) }}</span>
                  <span v-if="extractQuality(s)" class="quality-pill" :class="qualityClass(extractQuality(s))">
                    {{ extractQuality(s) }}
                  </span>
                  <!-- Stream Health Badge -->
                  <span
                    v-if="healthMap[s.url || s.externalUrl]?.online === true"
                    class="health-pill health-ok"
                    title="Stream is verified online"
                  >
                    ONLINE
                  </span>
                  <span
                    v-else-if="healthMap[s.url || s.externalUrl]?.online === false"
                    class="health-pill health-dead"
                    title="Stream link returned 404 or dead"
                  >
                    DEAD 404
                  </span>
                </div>
                <span v-if="s.title && s.name !== s.title" class="source-details">{{ s.title }}</span>
                <span v-else-if="s.details" class="source-details">{{ s.details }}</span>
              </div>
            </div>

            <div class="source-right">
              <span v-if="currentUrl === (s.url || s.externalUrl)" class="playing-badge">PLAYING</span>
              <button v-else class="btn-switch-source">
                Select
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button
          v-if="mediaMeta?.id"
          class="btn-refresh-sources"
          :disabled="loading"
          @click="autoFetchSources"
          title="Refresh and query addons again"
        >
          Refresh Streams
        </button>
        <button class="btn-done" @click="$emit('close')">Done</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useAddonsStore } from '@/stores/addons';
import { fetchStreamsProgressive } from '@/services/stremio.service';
import Icon from '@/components/Icon.vue';

const props = defineProps({
  sources: {
    type: Array,
    default: () => [],
  },
  currentUrl: {
    type: String,
    default: '',
  },
  mediaMeta: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close', 'select-source', 'open-search']);

const addonsStore = useAddonsStore();
const fetchedSources = ref([]);
const loading = ref(false);
const selectedAddonFilter = ref('all');
const healthMap = ref({});

const allSources = computed(() => {
  if (fetchedSources.value.length > 0) return fetchedSources.value;
  return props.sources || [];
});

const availableAddonNames = computed(() => {
  const map = new Map();
  allSources.value.forEach(s => {
    const name = s.addonName || 'Addon';
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
});

const filteredSources = computed(() => {
  if (selectedAddonFilter.value === 'all') return allSources.value;
  return allSources.value.filter(s => (s.addonName || 'Addon') === selectedAddonFilter.value);
});

// Sort sources so verified dead streams are at the bottom
const sortedSources = computed(() => {
  const list = [...filteredSources.value];
  return list.sort((a, b) => {
    const urlA = a.url || a.externalUrl;
    const urlB = b.url || b.externalUrl;
    const deadA = healthMap.value[urlA]?.online === false ? 1 : 0;
    const deadB = healthMap.value[urlB]?.online === false ? 1 : 0;
    return deadA - deadB;
  });
});

async function probeStreamHealth(url) {
  if (!url || healthMap.value[url]) return;
  healthMap.value[url] = { checking: true };
  try {
    const basePath = window.location.pathname.startsWith('/watchpear2') ? '/watchpear2' : '';
    const res = await fetch(`${basePath}/api/probe?url=${encodeURIComponent(url)}`);
    if (res.ok) {
      const data = await res.json();
      healthMap.value[url] = { checking: false, online: data.online, status: data.status };
    } else {
      healthMap.value[url] = { checking: false, online: null };
    }
  } catch {
    healthMap.value[url] = { checking: false, online: null };
  }
}

function probeAllVisible() {
  const list = filteredSources.value.slice(0, 10);
  list.forEach(s => {
    const url = s.url || s.externalUrl;
    if (url) probeStreamHealth(url);
  });
}

watch(filteredSources, () => {
  probeAllVisible();
}, { immediate: true });

async function autoFetchSources() {
  if (!props.mediaMeta?.id) return;
  loading.value = true;
  fetchedSources.value = [];
  selectedAddonFilter.value = 'all';

  const type = props.mediaMeta.type === 'series' || props.mediaMeta.type === 'tv' ? 'series' : 'movie';
  const id = props.mediaMeta.episodeId || props.mediaMeta.id;

  try {
    await fetchStreamsProgressive(addonsStore.streamAddons, type, id, (chunk) => {
      fetchedSources.value.push(...chunk);
      chunk.forEach(s => {
        const url = s.url || s.externalUrl;
        if (url) probeStreamHealth(url);
      });
    });
  } catch (err) {
    console.error('[Sources] Failed to fetch streams:', err);
  } finally {
    loading.value = false;
  }
}

function selectSource(source) {
  emit('select-source', source);
  emit('close');
}

function extractQuality(stream) {
  const text = `${stream.name || ''} ${stream.title || ''} ${stream.description || ''}`.toUpperCase();
  if (text.includes('4K') || text.includes('2160P')) return '4K';
  if (text.includes('1080P')) return '1080p';
  if (text.includes('720P')) return '720p';
  if (text.includes('480P') || text.includes('360P')) return 'SD';
  return '';
}

function qualityClass(q) {
  if (q === '4K') return 'q-4k';
  if (q === '1080p') return 'q-1080';
  if (q === '720p') return 'q-720';
  return 'q-sd';
}

onMounted(() => {
  if ((!props.sources || props.sources.length === 0) && props.mediaMeta?.id) {
    autoFetchSources();
  } else {
    probeAllVisible();
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
  width: min(560px, 100%);
  max-height: 84vh;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8);
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
  padding: 1px 6px;
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

.source-media-bar {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 8px 20px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
}
.sm-title { font-weight: 700; color: #ffffff; }
.sm-ep { color: rgba(255, 255, 255, 0.85); }
.sm-year { color: var(--muted); }

.addon-filter-tabs-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #14141d;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.addon-filter-btn {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}
.addon-filter-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.4);
}
.addon-filter-btn.active {
  background: #ffffff;
  border-color: #ffffff;
  color: #0c0c12;
}

.modal-body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.loading-sources-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 0.82rem;
  margin-bottom: 10px;
}

.empty-sources {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 16px;
  gap: 8px;
}
.empty-icon { color: var(--muted); margin-bottom: 4px; }
.empty-title { font-size: 0.95rem; font-weight: 600; color: #ffffff; }
.empty-sub { font-size: 0.8rem; color: var(--muted); max-width: 300px; }

.btn-search-catalog {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-search-catalog:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.sources-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.source-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  gap: 12px;
}
.source-card:hover {
  border-color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.06);
}
.source-card.active {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.08);
}
.source-card.is-dead {
  opacity: 0.6;
  border-color: rgba(224, 61, 90, 0.3);
}

.source-left {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}
.addon-badge {
  font-size: 0.65rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.source-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.source-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.source-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quality-pill {
  font-size: 0.65rem;
  font-weight: 800;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.02em;
}
.q-4k { background: rgba(224, 61, 90, 0.2); color: #e03d5a; border: 1px solid rgba(224, 61, 90, 0.4); }
.q-1080 { background: rgba(90, 125, 224, 0.2); color: #5a7de0; border: 1px solid rgba(90, 125, 224, 0.4); }
.q-720 { background: rgba(61, 190, 122, 0.2); color: #3dbe7a; border: 1px solid rgba(61, 190, 122, 0.4); }
.q-sd { background: rgba(255, 255, 255, 0.1); color: var(--muted); border: 1px solid var(--border); }

.health-pill {
  font-size: 0.62rem;
  font-weight: 800;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.03em;
}
.health-ok {
  background: rgba(61, 190, 122, 0.15);
  color: #3dbe7a;
  border: 1px solid rgba(61, 190, 122, 0.3);
}
.health-dead {
  background: rgba(224, 61, 90, 0.15);
  color: #e03d5a;
  border: 1px solid rgba(224, 61, 90, 0.3);
}

.source-details {
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-right {
  flex-shrink: 0;
}
.playing-badge {
  font-size: 0.65rem;
  font-weight: 800;
  color: #3dbe7a;
  background: rgba(61, 190, 122, 0.15);
  border: 1px solid rgba(61, 190, 122, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
.btn-switch-source {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-switch-source:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
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
.btn-refresh-sources {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.15s;
}
.btn-refresh-sources:hover:not(:disabled) { color: #ffffff; }

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
