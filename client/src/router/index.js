import { createRouter, createWebHistory } from 'vue-router';
import Home from '@/views/Home.vue';
import Room from '@/views/Room.vue';

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes: [
    { path: '/', component: Home },
    { path: '/room/:roomId', name: 'room', component: Room },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
