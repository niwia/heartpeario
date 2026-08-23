<template>
  <div class="home">
    <!-- Background glow blobs -->
    <div class="bg-blob blob1" aria-hidden="true"></div>
    <div class="bg-blob blob2" aria-hidden="true"></div>

    <div class="hero">
      <!-- Profile Header Chip -->
      <button class="profile-top-chip" @click="showProfileModal = true" title="Manage Profiles & Encrypted History">
        <span class="p-dot" :style="{ background: profileStore.current.avatarColor }"></span>
        <span class="p-name">{{ profileStore.current.name }}</span>
        <span class="p-vault-tag">Vault</span>
      </button>

      <!-- Logo -->
      <div class="logo" aria-label="HeartPeario">
        <span class="heart" aria-hidden="true">HP</span>
        <span class="wordmark">HeartPeario</span>
      </div>
      <p class="tagline">Watch videos together in sync, instantly.</p>

      <!-- Card -->
      <div class="card">
        <!-- Username -->
        <div class="field">
          <label for="hp-username">Your name</label>
          <input
            id="hp-username"
            v-model="username"
            type="text"
            placeholder="How should friends call you?"
            maxlength="30"
            autocomplete="off"
            @keyup.enter="createRoom"
          />
        </div>

        <!-- Create -->
        <button
          id="hp-create"
          class="btn-accent"
          :disabled="creating"
          @click="createRoom"
        >
          <span v-if="!creating">Create a Room</span>
          <span v-else class="spinner"></span>
        </button>

        <div class="sep"><span>or join an existing room</span></div>

        <!-- Join -->
        <div class="join-row">
          <input
            id="hp-join-code"
            v-model="joinCode"
            type="text"
            placeholder="Room code (e.g. TEST)"
            maxlength="10"
            autocomplete="off"
            @keyup.enter="joinRoom"
          />
          <button
            id="hp-join"
            class="btn-ghost"
            :disabled="!joinCode.trim()"
            @click="joinRoom"
          >
            Join →
          </button>
        </div>

        <p class="error" v-if="error" aria-live="polite">{{ error }}</p>
      </div>

      <!-- Quick Test Room Shortcut -->
      <div class="quick-join-hint">
        <span>Public Test Room: </span>
        <button class="link-btn" @click="joinCode = 'TEST'; joinRoom()">Join "TEST" Room</button>
      </div>

      <p class="hint">Share the room link — anyone who opens it joins instantly.</p>
    </div>

    <!-- Profile & History Modal -->
    <ProfileModal
      v-if="showProfileModal"
      @close="showProfileModal = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import socket from '@/services/socket';
import { useRoomStore } from '@/stores/room';
import { useProfileStore } from '@/stores/profile';
import ProfileModal from '@/components/ProfileModal.vue';

const router = useRouter();
const room = useRoomStore();
const profileStore = useProfileStore();

const username = ref('');
const joinCode = ref('');
const creating = ref(false);
const error = ref('');
const showProfileModal = ref(false);

watch(() => profileStore.current.name, (val) => {
  if (val && !username.value) username.value = val;
});

function applyUsername() {
  const name = username.value.trim() || profileStore.current.name || 'Friend';
  profileStore.updateCurrentName(name);
  localStorage.setItem('hp-username', name);
  socket.send('user.name', { name });
}

function createRoom() {
  error.value = '';
  creating.value = true;
  applyUsername();
  socket.send('room.create');
}

function joinRoom() {
  const code = joinCode.value.trim().replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!code) return;
  error.value = '';
  applyUsername();
  socket.send('room.join', { roomId: code });
}

onMounted(async () => {
  room.reset();
  await profileStore.init();
  username.value = profileStore.current.name || localStorage.getItem('hp-username') || '';

  const offs = [
    socket.on('room.joined', (data) => {
      creating.value = false;
      room.$patch({
        roomId: data.roomId,
        isHost: data.isHost,
        you: data.you,
        users: data.users,
        url: data.url,
        player: data.player,
      });
      router.push({ name: 'room', params: { roomId: data.roomId } });
    }),
    socket.on('error', (err) => {
      creating.value = false;
      error.value = err.message || 'Room not found';
    }),
  ];

  return () => offs.forEach(off => off());
});
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
  position: relative;
}

/* Ambient glow blobs */
.bg-blob {
  position: fixed;
  border-radius: 50%;
  filter: blur(120px);
  pointer-events: none;
  z-index: 0;
}
.blob1 {
  width: 420px; height: 420px;
  background: radial-gradient(circle, rgba(224,61,90,0.12), transparent 70%);
  top: -80px; left: -100px;
}
.blob2 {
  width: 320px; height: 320px;
  background: radial-gradient(circle, rgba(240,160,48,0.08), transparent 70%);
  bottom: -60px; right: -60px;
}

.hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  animation: fade-in 0.5s ease both;
}

.profile-top-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.profile-top-chip:hover {
  border-color: var(--accent);
  background: var(--surface2);
  transform: translateY(-1px);
}
.p-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
}
.p-vault-tag {
  font-size: 0.68rem;
  color: #3dbe7a;
  background: rgba(61, 190, 122, 0.12);
  padding: 2px 6px;
  border-radius: 999px;
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  user-select: none;
}
.heart {
  font-size: 2.4rem;
  color: var(--accent);
  animation: heartbeat 2.4s ease-in-out infinite;
  display: inline-block;
}
.wordmark {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(120deg, #fff 30%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.tagline {
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 400;
  margin-top: -8px;
}

/* Card */
.card {
  width: min(420px, 100%);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}

/* Field */
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.field input, .join-row input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.95rem;
  color: var(--text);
  transition: border-color 0.15s;
}
.field input:focus, .join-row input:focus {
  border-color: var(--accent);
}

/* Buttons */
.btn-accent {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--accent);
  border-radius: var(--radius-sm);
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  transition: filter 0.15s, transform 0.1s;
  min-height: 44px;
}
.btn-accent:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
.btn-accent:active:not(:disabled) { transform: translateY(0); }

.btn-ghost {
  flex-shrink: 0;
  padding: 10px 18px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text);
  transition: border-color 0.15s, background 0.15s;
  white-space: nowrap;
}
.btn-ghost:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-dim); }

/* Separator */
.sep {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 0.8rem;
}
.sep::before, .sep::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* Join row */
.join-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.join-row input {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  font-size: 0.95rem;
}

/* Quick Join */
.quick-join-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: var(--muted);
}
.link-btn {
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }

/* Error */
.error {
  color: var(--accent);
  font-size: 0.85rem;
  text-align: center;
}

/* Hint */
.hint {
  color: var(--muted);
  font-size: 0.8rem;
  text-align: center;
  max-width: 340px;
  line-height: 1.6;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
</style>
