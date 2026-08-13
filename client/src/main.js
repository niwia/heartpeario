import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import socket from './services/socket';
import './style.css';

socket.connect();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
