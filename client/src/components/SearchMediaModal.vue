<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card" :class="{ 'has-selection': !!selectedItem }">

      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-left">
          <button v-if="selectedItem" class="back-btn" @click="selectedItem = null" title="Back to search">
            ←
          </button>
          <div class="header-title">
            <Icon name="search" size="20" />
            <h2>{{ selectedItem ? selectedItem.name : 'Search Movies & Shows' }}</h2>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <!-- Modal Content -->
      <div class="modal-body">

        <!-- ── STATE 1: SEARCH & DISCOVERY ────────────────────────────── -->
        <div v-if="!selectedItem" class="search-view">
          <div class="search-bar">
            <input
              ref="searchInputEl"
              v-model="searchQuery"
              type="text"
              placeholder="Search by title (e.g. Inception, Breaking Bad, Scary Movie)…"
              spellcheck="false"
              autocomplete="off"
              @input="onSearchInput"
            />
            <span v-if="searching" class="spinner"></span>
            <button v-else-if="searchQuery" class="clear-btn" @click="clearSearch">
              <Icon name="close" size="16" />
            </button>
          </div>

          <!-- Type Filter Tabs -->
          <div class="tabs-row">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'movies' }"
              @click="activeTab = 'movies'"
            >
              Movies ({{ searchResults.movies.length }})
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'series' }"
              @click="activeTab = 'series'"
            >
              TV Series ({{ searchResults.series.length }})
            </button>
          </div>

          <!-- Loading State while searching -->
          <div v-if="searching" class="search-loading-state">
            <div class="search-spinner"></div>
            <p class="loading-txt">Searching catalogs for "{{ searchQuery }}"...</p>
          </div>

          <!-- Results Grid -->
          <div v-else-if="currentResults.length" class="results-grid">
            <div
              v-for="item in currentResults"
              :key="item.id"
              class="media-card"
              @click="selectItem(item)"
            >
              <div class="poster-wrap">
                <img v-if="item.poster" :src="item.poster" class="poster-img" alt="" loading="lazy" />
                <div v-else class="poster-ph">
                  <Icon name="play" size="28" />
                </div>
                <span class="year-badge">{{ item.releaseInfo || item.year || '' }}</span>
              </div>
              <div class="media-meta">
                <span class="media-title" :title="item.name">{{ item.name }}</span>
              </div>
            </div>
          </div>

          <div v-else-if="searchQuery && !searching" class="empty-state">
            <p>No results found for "{{ searchQuery }}".</p>
          </div>

          <div v-else-if="!searchQuery" class="hint-state">
            <p class="hint-title">Search anything to discover and stream together</p>
            <p class="hint-sub">Streams are resolved live from your installed Stremio Addons.</p>
          </div>
        </div>

        <!-- ── STATE 2: MEDIA DETAILS & STREAMS ───────────────────────── -->
        <div v-else class="details-view">

          <!-- Media Banner Header -->
          <div class="media-banner">
            <img v-if="selectedItem.poster" :src="selectedItem.poster" class="detail-poster" alt="" />
            <div class="detail-info">
              <div class="detail-top">
                <span class="detail-type">{{ selectedItem.type?.toUpperCase() }}</span>
                <span class="detail-year">{{ selectedItem.year || selectedItem.releaseInfo }}</span>
                <span v-if="selectedItem.runtime" class="detail-runtime">{{ selectedItem.runtime }}</span>
              </div>
              <h3 class="detail-title">{{ selectedItem.name }}</h3>
              <p class="detail-desc">{{ fullMeta?.description || selectedItem.description || '' }}</p>
              <div v-if="fullMeta?.genres?.length" class="genres-row">
                <span v-for="g in fullMeta.genres" :key="g" class="genre-pill">{{ g }}</span>
              </div>
            </div>
          </div>

          <!-- Season / Episode Picker for Series -->
          <div v-if="selectedItem.type === 'series' && seasonsList.length" class="episodes-picker">
            <div class="seasons-row">
              <button
                v-for="s in seasonsList"
                :key="s"
                class="season-btn"
                :class="{ active: selectedSeason === s }"
                @click="selectedSeason = s"
              >
                Season {{ s }}
              </button>
            </div>

            <div class="episodes-list">
              <button
                v-for="ep in currentSeasonEpisodes"
                :key="ep.id"
                class="episode-btn"
                :class="{ active: selectedEpisode?.id === ep.id }"
                @click="selectEpisode(ep)"
              >
                <span class="ep-num">E{{ ep.episode }}</span>
                <span class="ep-name">{{ ep.name || ep.title || `Episode ${ep.episode}` }}</span>
              </button>
            </div>
          </div>

          <!-- Streams Section -->
          <div class="streams-section">
            <div class="streams-header">
              <h4>Available Streams</h4>
              <span v-if="loadingStreams" class="spinner sm"></span>
              <span class="streams-count">{{ filteredStreams.length }} of {{ availableStreams.length }} stream(s)</span>
            </div>

            <!-- Addon Filter Tabs -->
            <div v-if="availableAddonNames.length > 1" class="addon-filter-tabs">
              <button
                class="addon-filter-btn"
                :class="{ active: selectedAddonFilter === 'all' }"
                @click="selectedAddonFilter = 'all'"
              >
                All ({{ availableStreams.length }})
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

            <div v-if="sortedStreams.length" class="streams-list">
              <div
                v-for="(st, idx) in sortedStreams"
                :key="st.url || idx"
                class="stream-card"
                :class="{
                  'is-dead': healthMap[st.url || st.externalUrl]?.online === false
                }"
                @click="chooseStream(st)"
              >
                <div class="stream-left">
                  <!-- Badges Top Row -->
                  <div class="stream-badge-row">
                    <span class="addon-badge">{{ st.addonName || 'Addon' }}</span>
                    <span v-if="parseStreamInfo(st).quality" class="quality-pill" :class="qualityClass(parseStreamInfo(st).quality)">
                      {{ parseStreamInfo(st).quality }}
                    </span>
                    <!-- Format Badge -->
                    <span v-if="parseStreamInfo(st).format === 'mkv'" class="format-pill format-mkv" title="MKV container - plays via Desktop Player (mpv/VLC)">
                      MKV (Desktop only)
                    </span>
                    <span v-else-if="parseStreamInfo(st).format === 'hls'" class="format-pill format-hls" title="HLS adaptive stream - playable in browser">
                      HLS
                    </span>
                    <span v-else class="format-pill format-mp4" title="MP4 stream - playable in browser">
                      MP4
                    </span>
                    <!-- Size Badge -->
                    <span v-if="parseStreamInfo(st).size" class="size-pill">
                      💾 {{ parseStreamInfo(st).size }}
                    </span>
                    <!-- Health Badge -->
                    <span
                      v-if="healthMap[st.url || st.externalUrl]?.online === true"
                      class="health-pill health-ok"
                    >
                      ONLINE
                    </span>
                    <span
                      v-else-if="healthMap[st.url || st.externalUrl]?.status === 403"
                      class="health-pill health-expired"
                    >
                      EXPIRED 403
                    </span>
                    <span
                      v-else-if="healthMap[st.url || st.externalUrl]?.status === 404"
                      class="health-pill health-dead"
                    >
                      DEAD 404
                    </span>
                  </div>

                  <!-- Release / File Title -->
                  <div class="stream-file-title" :title="parseStreamInfo(st).filename">
                    {{ parseStreamInfo(st).filename }}
                  </div>

                  <!-- Tags and Details Row -->
                  <div class="stream-details-row">
                    <span v-for="tag in parseStreamInfo(st).videoTags" :key="tag" class="tag-pill tag-video">
                      {{ tag }}
                    </span>
                    <span v-for="aud in parseStreamInfo(st).audioBadges" :key="aud" class="tag-pill tag-audio">
                      {{ aud }}
                    </span>
                    <span v-if="parseStreamInfo(st).languages" class="tag-pill tag-lang">
                      🗣 {{ parseStreamInfo(st).languages }}
                    </span>
                    <span v-for="prov in parseStreamInfo(st).providerMatches" :key="prov" class="tag-pill tag-prov">
                      {{ prov }}
                    </span>
                  </div>

                  <!-- Remaining lines if any -->
                  <div v-if="parseStreamInfo(st).remainingLines?.length" class="stream-extra-lines">
                    <span v-for="(line, lIdx) in parseStreamInfo(st).remainingLines" :key="lIdx" class="extra-line">
                      {{ line }}
                    </span>
                  </div>
                </div>

                <button class="btn-play-stream" title="Stream in room for everyone">
                  <Icon name="play" size="14" />
                  <span>Play</span>
                </button>
              </div>
            </div>

            <div v-else-if="!loadingStreams" class="no-streams">
              <p>No playable streams found for this title from your active addons.</p>
              <p class="no-streams-sub">Make sure your addons are installed in the Addons manager.</p>
            </div>

            <div v-else class="streams-loading-box">
              <div class="search-spinner"></div>
              <p>Fetching streams and subtitles from your addons...</p>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { useAddonsStore } from '@/stores/addons';
import { searchCatalog, getMeta, fetchStreamsProgressive, fetchSubtitlesProgressive, parseStreamInfo } from '@/services/stremio.service';
import Icon from '@/components/Icon.vue';

const emit = defineEmits(['close', 'selectStream']);
const addonsStore = useAddonsStore();

const searchInputEl = ref(null);
const searchQuery = ref('');
const searching = ref(false);
const activeTab = ref('movies');
const searchResults = ref({ movies: [], series: [] });

// Details state
const selectedItem = ref(null);
const fullMeta = ref(null);
const selectedSeason = ref(1);
const selectedEpisode = ref(null);
const loadingStreams = ref(false);
const availableStreams = ref([]);
const availableSubtitles = ref([]);
const selectedAddonFilter = ref('all');
const healthMap = ref({});

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

let searchDebounce = null;

const currentResults = computed(() => {
  return activeTab.value === 'movies' ? searchResults.value.movies : searchResults.value.series;
});

const availableAddonNames = computed(() => {
  const map = new Map();
  availableStreams.value.forEach(s => {
    const name = s.addonName || 'Addon';
    map.set(name, (map.get(name) || 0) + 1);
  });
  return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
});

const filteredStreams = computed(() => {
  if (selectedAddonFilter.value === 'all') return availableStreams.value;
  return availableStreams.value.filter(s => (s.addonName || 'Addon') === selectedAddonFilter.value);
});

const sortedStreams = computed(() => {
  const list = [...filteredStreams.value];
  return list.sort((a, b) => {
    const urlA = a.url || a.externalUrl;
    const urlB = b.url || b.externalUrl;
    const deadA = healthMap.value[urlA]?.online === false ? 1 : 0;
    const deadB = healthMap.value[urlB]?.online === false ? 1 : 0;
    if (deadA !== deadB) return deadA - deadB;

    const fmtA = parseStreamInfo(a).format;
    const fmtB = parseStreamInfo(b).format;
    const mkvA = fmtA === 'mkv' ? 1 : 0;
    const mkvB = fmtB === 'mkv' ? 1 : 0;
    return mkvA - mkvB;
  });
});

watch(sortedStreams, (list) => {
  if (!list?.length) return;
  list.slice(0, 10).forEach(st => {
    const url = st.url || st.externalUrl;
    if (url) probeStreamHealth(url);
  });
}, { immediate: true });

const seasonsList = computed(() => {
  if (!fullMeta.value?.videos?.length) return [];
  const seasons = new Set(fullMeta.value.videos.map(v => v.season).filter(s => s > 0));
  return Array.from(seasons).sort((a, b) => a - b);
});

const currentSeasonEpisodes = computed(() => {
  if (!fullMeta.value?.videos?.length) return [];
  return fullMeta.value.videos
    .filter(v => v.season === selectedSeason.value)
    .sort((a, b) => a.episode - b.episode);
});

function onSearchInput() {
  clearTimeout(searchDebounce);
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = { movies: [], series: [] };
    searching.value = false;
    return;
  }
  searching.value = true;
  searchDebounce = setTimeout(async () => {
    try {
      const res = await searchCatalog(q);
      searchResults.value = res;
      if (res.movies.length === 0 && res.series.length > 0) {
        activeTab.value = 'series';
      }
    } catch {
      /* ignore */
    } finally {
      searching.value = false;
    }
  }, 250);
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = { movies: [], series: [] };
  searchInputEl.value?.focus();
}

async function selectItem(item) {
  selectedItem.value = item;
  fullMeta.value = null;
  availableStreams.value = [];
  availableSubtitles.value = [];
  selectedAddonFilter.value = 'all';

  try {
    const meta = await getMeta(item.type, item.id);
    fullMeta.value = meta || item;

    if (item.type === 'series') {
      const firstSeason = seasonsList.value[0] || 1;
      selectedSeason.value = firstSeason;
      const firstEp = fullMeta.value.videos?.find(v => v.season === firstSeason);
      if (firstEp) {
        selectEpisode(firstEp);
      }
    } else {
      loadStreamsForId('movie', item.id);
    }
  } catch (err) {
    console.error('Failed to load item meta:', err);
  }
}

function selectEpisode(ep) {
  selectedEpisode.value = ep;
  loadStreamsForId('series', ep.id);
}

async function loadStreamsForId(type, id) {
  loadingStreams.value = true;
  availableStreams.value = [];
  availableSubtitles.value = [];
  selectedAddonFilter.value = 'all';

  try {
    await Promise.all([
      fetchStreamsProgressive(addonsStore.streamAddons, type, id, (chunk) => {
        availableStreams.value.push(...chunk);
      }),
      fetchSubtitlesProgressive(addonsStore.subtitleAddons, type, id, (chunk) => {
        availableSubtitles.value.push(...chunk);
      }),
    ]);
  } catch (err) {
    console.error('Failed to load streams/subtitles:', err);
  } finally {
    loadingStreams.value = false;
  }
}

function chooseStream(stream) {
  const streamUrl = stream.url || stream.externalUrl;
  if (!streamUrl) return;

  const mediaMeta = {
    id: selectedItem.value.id,
    type: selectedItem.value.type,
    title: selectedItem.value.name,
    year: selectedItem.value.year || selectedItem.value.releaseInfo,
    poster: selectedItem.value.poster,
    episodeTitle: selectedEpisode.value ? `S${selectedSeason.value}E${selectedEpisode.value.episode} - ${selectedEpisode.value.name || ''}` : null,
    episodeId: selectedEpisode.value ? selectedEpisode.value.id : null,
    season: selectedEpisode.value ? selectedSeason.value : null,
    episode: selectedEpisode.value ? selectedEpisode.value.episode : null,
    description: fullMeta.value?.description || selectedItem.value.description || '',
    genres: fullMeta.value?.genres || [],
  };

  // Combine stream-provided subtitles (at the top!) with addon subtitles
  let combinedSubtitles = [...availableSubtitles.value];
  if (stream.subtitles && Array.isArray(stream.subtitles) && stream.subtitles.length > 0) {
    const streamSubs = stream.subtitles.map((sub, idx) => ({
      id: `stream-sub-${idx}`,
      url: sub.url,
      lang: sub.lang || sub.id || 'eng',
      langName: `${sub.lang?.toUpperCase() || 'SUB'} (Stream Embedded)`,
      isStreamSub: true,
    }));
    combinedSubtitles = [...streamSubs, ...combinedSubtitles];
  }

  emit('selectStream', {
    url: streamUrl,
    mediaMeta,
    subtitles: combinedSubtitles,
    sources: availableStreams.value,
  });
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
  nextTick(() => searchInputEl.value?.focus());
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
  width: min(840px, 100%);
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
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}
.header-title h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.back-btn {
  font-size: 1.3rem;
  color: var(--muted);
  width: 32px; height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--surface2);
  transition: color 0.15s;
}
.back-btn:hover { color: var(--text); }

.close-btn {
  width: 32px; height: 32px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover { color: var(--text); background: var(--surface2); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

/* ── SEARCH VIEW ────────────────────────────────────────────────────────── */
.search-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.search-bar {
  display: flex;
  align-items: center;
  position: relative;
}
.search-bar input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  padding: 12px 42px 12px 16px;
  font-size: 0.95rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.search-bar input:focus { border-color: var(--accent); }

.clear-btn {
  position: absolute;
  right: 12px;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.clear-btn:hover { color: var(--text); }

.search-bar .spinner {
  position: absolute;
  right: 14px;
}

.tabs-row {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}
.tab-btn {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--muted);
  background: var(--surface2);
  transition: all 0.15s;
}
.tab-btn.active {
  background: var(--accent-dim);
  color: var(--accent);
}

.results-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 16px;
  margin-top: 4px;
}

.media-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.15s;
}
.media-card:hover { transform: translateY(-3px); }
.media-card:hover .poster-img { border-color: var(--accent); }

.poster-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 2/3;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.poster-img {
  width: 100%; height: 100%;
  object-fit: cover;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s;
}

.poster-ph {
  width: 100%; height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.year-badge {
  position: absolute;
  bottom: 6px; right: 6px;
  background: rgba(0, 0, 0, 0.75);
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  backdrop-filter: blur(4px);
}

.media-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.empty-state, .hint-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);
}
.hint-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.hint-sub {
  font-size: 0.85rem;
}

/* ── DETAILS VIEW ───────────────────────────────────────────────────────── */
.details-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.media-banner {
  display: flex;
  gap: 16px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.detail-poster {
  width: 100px;
  aspect-ratio: 2/3;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}

.detail-top {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}
.detail-type {
  background: var(--accent-dim);
  color: var(--accent);
  padding: 2px 6px;
  border-radius: 4px;
}

.detail-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
}

.detail-desc {
  font-size: 0.84rem;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.genres-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.genre-pill {
  font-size: 0.72rem;
  background: var(--surface);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--muted);
}

/* Series Episodes Picker */
.episodes-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.seasons-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.season-btn {
  padding: 6px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.season-btn.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.episodes-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  max-height: 160px;
  overflow-y: auto;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
}

.episode-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font-size: 0.8rem;
  transition: background 0.15s;
}
.episode-btn:hover { background: rgba(255,255,255,0.08); }
.episode-btn.active {
  background: var(--accent-dim);
  border: 1px solid var(--accent);
}
.ep-num { font-weight: 700; color: var(--accent); }
.ep-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Streams Section */
.streams-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.streams-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.streams-header h4 {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.streams-count {
  font-size: 0.8rem;
  color: var(--muted);
}

.addon-filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 8px 0;
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

.streams-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stream-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.stream-card:hover {
  border-color: var(--accent);
  background: rgba(224, 61, 90, 0.06);
}

.stream-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  overflow: hidden;
}

.stream-badge-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.addon-badge {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--gold);
  background: rgba(245, 197, 24, 0.12);
  border: 1px solid rgba(245, 197, 24, 0.25);
  padding: 2px 7px;
  border-radius: 4px;
  text-transform: uppercase;
}
.format-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  letter-spacing: 0.03em;
}
.format-mkv {
  background: rgba(168, 85, 247, 0.18);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.35);
}
.format-hls {
  background: rgba(6, 182, 212, 0.18);
  color: #22d3ee;
  border: 1px solid rgba(6, 182, 212, 0.35);
}
.format-mp4 {
  background: rgba(34, 197, 94, 0.18);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.35);
}
.size-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.health-pill {
  font-size: 0.68rem;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
}
.health-ok {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.4);
}
.health-expired {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.4);
}
.health-dead {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.4);
}
.stream-file-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #ffffff;
  word-break: break-word;
  line-height: 1.35;
  margin-top: 2px;
}
.stream-details-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.tag-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
}
.tag-video { color: #60a5fa; border-color: rgba(96, 165, 250, 0.25); }
.tag-audio { color: #f472b6; border-color: rgba(244, 114, 182, 0.25); }
.tag-lang { color: #fbbf24; border-color: rgba(251, 191, 36, 0.25); }
.tag-prov { color: #a78bfa; border-color: rgba(167, 139, 250, 0.25); }
.stream-extra-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 3px;
}
.extra-line {
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.3;
}
.is-dead {
  opacity: 0.55;
  border-color: rgba(239, 68, 68, 0.25) !important;
}

.btn-play-stream {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  transition: all 0.15s;
  pointer-events: none;
}
.stream-card:hover .btn-play-stream {
  background: rgba(255, 255, 255, 0.1);
  border-color: #ffffff;
}

.search-loading-state, .streams-loading-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 14px;
  color: var(--muted);
  text-align: center;
}
.search-spinner {
  width: 28px; height: 28px;
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.loading-txt {
  font-size: 0.9rem;
  color: #ffffff;
}

.no-streams {
  text-align: center;
  padding: 24px;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  color: var(--muted);
}
.no-streams-sub {
  font-size: 0.8rem;
  margin-top: 4px;
}

.spinner.sm {
  width: 14px; height: 14px;
  border-width: 2px;
}
</style>
