import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import './style.css';

// Install axios interceptors for auth
import './lib/axios';

// Keep dark mode in sync with system preference changes
const mq = window.matchMedia('(prefers-color-scheme: dark)');
mq.addEventListener('change', (e) => {
  const stored = localStorage.getItem('faultline:theme');
  if (!stored) {
    document.documentElement.classList.toggle('dark', e.matches);
  }
});

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.mount('#app');
