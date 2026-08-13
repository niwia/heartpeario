import { defineStore } from 'pinia';
import { encryptData, decryptData } from '@/services/crypto.service';

const STORAGE_KEY = 'hp_vault_profiles_enc';
const ACTIVE_PROFILE_KEY = 'hp_active_profile_id';

const DEFAULT_PROFILE = {
  id: 'main',
  name: 'My Profile',
  avatarColor: '#e03d5a',
  createdAt: Date.now(),
  history: [],
  friends: [],
  addons: [],
  settings: {
    volume: 1,
    subtitleOffsetMs: 0,
  },
};

export const useProfileStore = defineStore('profile', {
  state: () => ({
    initialized: false,
    activeProfileId: localStorage.getItem(ACTIVE_PROFILE_KEY) || 'main',
    profiles: {
      main: { ...DEFAULT_PROFILE },
    },
    loading: false,
  }),

  getters: {
    current: (state) => state.profiles[state.activeProfileId] || state.profiles.main || DEFAULT_PROFILE,
    profileList: (state) => Object.values(state.profiles),
    watchHistory: (state) => {
      const p = state.profiles[state.activeProfileId] || state.profiles.main;
      return (p?.history || []).slice().sort((a, b) => b.watchedAt - a.watchedAt);
    },
    watchBuddies: (state) => {
      const p = state.profiles[state.activeProfileId] || state.profiles.main;
      return (p?.friends || []).slice().sort((a, b) => b.lastSeen - a.lastSeen);
    },
  },

  actions: {
    async init() {
      if (this.initialized) return;
      this.loading = true;
      try {
        const rawEncrypted = localStorage.getItem(STORAGE_KEY);
        if (rawEncrypted) {
          const decrypted = await decryptData(rawEncrypted);
          if (decrypted && typeof decrypted === 'object') {
            this.profiles = decrypted;
          }
        } else {
          // Check for legacy unencrypted username
          const legacyName = localStorage.getItem('hp-username');
          if (legacyName) {
            this.profiles.main.name = legacyName;
          }
          await this._persist();
        }

        if (!this.profiles[this.activeProfileId]) {
          this.activeProfileId = Object.keys(this.profiles)[0] || 'main';
        }
      } catch (err) {
        console.warn('[ProfileStore] Error loading encrypted profiles:', err);
      } finally {
        this.initialized = true;
        this.loading = false;
      }
    },

    async _persist() {
      try {
        const encrypted = await encryptData(this.profiles);
        localStorage.setItem(STORAGE_KEY, encrypted);
        localStorage.setItem(ACTIVE_PROFILE_KEY, this.activeProfileId);
        // Also keep legacy key synced for quick access
        if (this.current?.name) {
          localStorage.setItem('hp-username', this.current.name);
        }
      } catch (err) {
        console.error('[ProfileStore] Failed to save encrypted vault:', err);
      }
    },

    async updateCurrentName(name) {
      if (!name) return;
      const p = this.current;
      p.name = name.trim().slice(0, 30);
      await this._persist();
    },

    async updateCurrentColor(color) {
      if (!color) return;
      const p = this.current;
      p.avatarColor = color;
      await this._persist();
    },

    async createProfile(name, color = '#5a7de0') {
      const id = 'prof_' + Date.now().toString(36);
      this.profiles[id] = {
        id,
        name: name.trim().slice(0, 30) || 'New Profile',
        avatarColor: color,
        createdAt: Date.now(),
        history: [],
        friends: [],
        addons: [],
        settings: { volume: 1, subtitleOffsetMs: 0 },
      };
      this.activeProfileId = id;
      await this._persist();
      return this.profiles[id];
    },

    async switchProfile(id) {
      if (this.profiles[id]) {
        this.activeProfileId = id;
        await this._persist();
      }
    },

    async deleteProfile(id) {
      if (id === 'main' && Object.keys(this.profiles).length === 1) {
        // Reset main profile
        this.profiles.main = { ...DEFAULT_PROFILE, id: 'main', createdAt: Date.now() };
      } else {
        delete this.profiles[id];
        if (this.activeProfileId === id) {
          this.activeProfileId = Object.keys(this.profiles)[0] || 'main';
        }
      }
      await this._persist();
    },

    /**
     * Record a watched title into the encrypted history
     */
    async recordWatch({ id, title, episodeTitle, year, poster, url, progressSeconds, durationSeconds }) {
      if (!title && !url) return;
      const p = this.current;
      if (!p.history) p.history = [];

      const existingIndex = p.history.findIndex(h => (h.id && h.id === id) || (h.url && h.url === url));

      const entry = {
        id: id || 'custom_' + Date.now(),
        title: title || 'Direct Stream',
        episodeTitle: episodeTitle || null,
        year: year || null,
        poster: poster || null,
        url,
        watchedAt: Date.now(),
        progressSeconds: Math.floor(progressSeconds || 0),
        durationSeconds: Math.floor(durationSeconds || 0),
      };

      if (existingIndex >= 0) {
        p.history.splice(existingIndex, 1);
      }
      p.history.unshift(entry);

      // Keep up to 100 history items per profile
      if (p.history.length > 100) p.history = p.history.slice(0, 100);

      await this._persist();
    },

    /**
     * Record users watched with into the encrypted friend list
     */
    async recordFriends(usersList, myUserId) {
      if (!Array.isArray(usersList) || usersList.length <= 1) return;
      const p = this.current;
      if (!p.friends) p.friends = [];

      const now = Date.now();
      for (const u of usersList) {
        if (!u.name || u.id === myUserId) continue;
        const existing = p.friends.find(f => f.name.toLowerCase() === u.name.toLowerCase());
        if (existing) {
          existing.lastSeen = now;
          existing.watchCount = (existing.watchCount || 1) + 1;
        } else {
          p.friends.push({
            name: u.name,
            color: u.color || '#e03d5a',
            firstSeen: now,
            lastSeen: now,
            watchCount: 1,
          });
        }
      }

      await this._persist();
    },

    async clearHistory() {
      const p = this.current;
      p.history = [];
      await this._persist();
    },
  },
});
