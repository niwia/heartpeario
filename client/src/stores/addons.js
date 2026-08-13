import { defineStore } from 'pinia';
import { fetchManifest, normalizeManifestUrl } from '@/services/stremio.service';

const STORAGE_KEY = 'heartpeario_addons';

const DEFAULT_ADDONS = [
  {
    id: 'community.cinemeta',
    name: 'Cinemeta Catalog',
    version: '3.0.12',
    description: 'Official movie & series catalog metadata provider.',
    logo: 'https://v3-cinemeta.strem.io/logo.png',
    manifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    enabled: true,
  },
  {
    id: 'org.stremio.opensubtitles',
    name: 'OpenSubtitles v3',
    version: '1.0.0',
    description: 'Multi-language subtitles from OpenSubtitles.',
    logo: 'https://opensubtitles-v3.strem.io/logo.png',
    manifestUrl: 'https://opensubtitles-v3.strem.io/manifest.json',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    enabled: true,
  },
];

export const useAddonsStore = defineStore('addons', {
  state: () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch { /* ignore */ }

    return {
      addons: Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_ADDONS,
      loading: false,
      error: null,
    };
  },

  getters: {
    streamAddons: (state) => state.addons.filter(a => a.enabled),
    subtitleAddons: (state) => state.addons.filter(a => a.enabled),
  },

  actions: {
    _save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.addons));
    },

    async addAddon(manifestUrlInput) {
      this.loading = true;
      this.error = null;
      try {
        const url = normalizeManifestUrl(manifestUrlInput);
        if (this.addons.some(a => a.manifestUrl === url)) {
          throw new Error('This addon is already installed');
        }
        const addon = await fetchManifest(url);
        this.addons.push(addon);
        this._save();
        return addon;
      } catch (err) {
        this.error = err.message || 'Failed to install addon';
        throw err;
      } finally {
        this.loading = false;
      }
    },

    removeAddon(id) {
      this.addons = this.addons.filter(a => a.id !== id);
      this._save();
    },

    toggleAddon(id) {
      const addon = this.addons.find(a => a.id === id);
      if (addon) {
        addon.enabled = !addon.enabled;
        this._save();
      }
    },

    resetToDefault() {
      this.addons = [...DEFAULT_ADDONS];
      this._save();
    },
  },
});
