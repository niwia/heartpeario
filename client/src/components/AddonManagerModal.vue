<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal-card">
      <div class="modal-header">
        <div class="header-title">
          <Icon name="addons" size="20" />
          <h2>Stremio Addons</h2>
        </div>
        <button class="close-btn" @click="$emit('close')" title="Close">
          <Icon name="close" size="18" />
        </button>
      </div>

      <div class="modal-body">
        <p class="desc">
          Install any Stremio-compatible addon (Torrentio, StremThru, etc.) to discover and stream movies and series with your room. Addons are saved securely in your browser.
        </p>

        <!-- Install Addon Form -->
        <form class="add-form" @submit.prevent="installAddon">
          <input
            v-model="manifestInput"
            type="text"
            placeholder="Paste Stremio manifest URL (e.g. https://.../manifest.json)"
            :disabled="addonsStore.loading"
            spellcheck="false"
          />
          <button type="submit" class="btn-install" :disabled="!manifestInput.trim() || addonsStore.loading">
            <span v-if="!addonsStore.loading">Install Addon</span>
            <span v-else class="spinner"></span>
          </button>
        </form>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>

        <!-- Addons List -->
        <div class="addons-list">
          <div v-for="addon in addonsStore.addons" :key="addon.id" class="addon-item" :class="{ disabled: !addon.enabled }">
            <div class="addon-left">
              <img v-if="addon.logo" :src="addon.logo" class="addon-logo" alt="" />
              <div v-else class="addon-logo-ph">
                <Icon name="addons" size="20" />
              </div>
              <div class="addon-info">
                <div class="addon-title-row">
                  <span class="addon-name">{{ addon.name }}</span>
                  <span class="addon-ver">v{{ addon.version }}</span>
                </div>
                <p class="addon-desc">{{ addon.description || 'Stremio content addon' }}</p>
              </div>
            </div>

            <div class="addon-actions">
              <button
                class="toggle-btn"
                :class="{ active: addon.enabled }"
                @click="addonsStore.toggleAddon(addon.id)"
                :title="addon.enabled ? 'Disable addon' : 'Enable addon'"
              >
                {{ addon.enabled ? 'Enabled' : 'Disabled' }}
              </button>
              <button
                v-if="addon.id !== 'community.cinemeta'"
                class="delete-btn"
                @click="addonsStore.removeAddon(addon.id)"
                title="Uninstall addon"
              >
                <Icon name="close" size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-reset" @click="resetDefaults">Restore Defaults</button>
        <button class="btn-done" @click="$emit('close')">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useAddonsStore } from '@/stores/addons';
import Icon from '@/components/Icon.vue';

defineEmits(['close']);
const addonsStore = useAddonsStore();

const manifestInput = ref('');
const errorMsg = ref('');
const successMsg = ref('');

async function installAddon() {
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const addon = await addonsStore.addAddon(manifestInput.value);
    successMsg.value = `Successfully installed ${addon.name}!`;
    manifestInput.value = '';
    setTimeout(() => { successMsg.value = ''; }, 4000);
  } catch (err) {
    errorMsg.value = err.message || 'Failed to install addon';
  }
}

function resetDefaults() {
  if (confirm('Reset installed addons to default?')) {
    addonsStore.resetToDefault();
    successMsg.value = 'Addons reset to default';
    setTimeout(() => { successMsg.value = ''; }, 3000);
  }
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
  width: min(600px, 100%);
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
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
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
  transition: color 0.15s, background 0.15s;
}
.close-btn:hover { color: var(--text); background: var(--surface2); }

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.desc {
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.5;
}

.add-form {
  display: flex;
  gap: 8px;
}
.add-form input {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.88rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.add-form input:focus { border-color: var(--accent); }

.btn-install {
  flex-shrink: 0;
  padding: 10px 16px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn-install:hover:not(:disabled) { filter: brightness(1.15); }

.error-msg {
  color: var(--accent);
  font-size: 0.82rem;
}
.success-msg {
  color: #3dbe7a;
  font-size: 0.82rem;
}

.addons-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.addon-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s, opacity 0.15s;
}
.addon-item.disabled {
  opacity: 0.55;
}

.addon-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  overflow: hidden;
}

.addon-logo {
  width: 38px; height: 38px;
  border-radius: 8px;
  object-fit: contain;
  background: rgba(0,0,0,0.3);
  padding: 2px;
  flex-shrink: 0;
}
.addon-logo-ph {
  width: 38px; height: 38px;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  flex-shrink: 0;
}

.addon-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}
.addon-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.addon-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.addon-ver {
  font-size: 0.72rem;
  color: var(--muted);
  background: rgba(255,255,255,0.06);
  padding: 2px 6px;
  border-radius: 999px;
}
.addon-desc {
  font-size: 0.78rem;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.addon-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.toggle-btn {
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--muted);
  transition: all 0.15s;
}
.toggle-btn.active {
  background: rgba(61, 190, 122, 0.15);
  border-color: #3dbe7a;
  color: #3dbe7a;
}

.delete-btn {
  width: 30px; height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
}
.delete-btn:hover {
  color: var(--accent);
  background: var(--accent-dim);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.btn-reset {
  color: var(--muted);
  font-size: 0.82rem;
  transition: color 0.15s;
}
.btn-reset:hover { color: var(--text); }

.btn-done {
  padding: 8px 18px;
  background: var(--surface2);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
  transition: border-color 0.15s, background 0.15s;
}
.btn-done:hover { border-color: var(--accent); background: var(--accent-dim); }
</style>
