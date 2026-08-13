import { defineStore } from 'pinia';

export const useRoomStore = defineStore('room', {
  state: () => ({
    roomId: null,
    isHost: false,
    you: null,
    users: [],
    url: null,
    player: { paused: true, time: 0, serverTime: Date.now() },
    messages: [],
  }),
  actions: {
    reset() {
      this.$patch({
        roomId: null,
        isHost: false,
        you: null,
        users: [],
        url: null,
        player: { paused: true, time: 0, serverTime: Date.now() },
        messages: [],
      });
    },
    addMessage(msg) {
      this.messages.push(msg);
      if (this.messages.length > 200) this.messages.shift();
    },
  },
});
