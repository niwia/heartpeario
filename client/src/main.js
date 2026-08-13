import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import socket from './services/socket';
import castService from './services/cast.service';
import './style.css';

socket.connect();
castService.init();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
