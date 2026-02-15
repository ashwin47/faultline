import axios from 'axios';
import { toCamelCase, toSnakeCase } from './case-converter';

const TOKEN_KEY = 'faultline:token';

// Request interceptor: attach auth token + convert request body to snake_case
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.data && typeof config.data === 'object') {
    config.data = toSnakeCase(config.data);
  }
  return config;
});

// Response interceptor: pick up renewed tokens, handle 401, convert to camelCase
axios.interceptors.response.use(
  (response) => {
    // Sliding renewal: backend sends a fresh token on every authenticated response
    const renewed = response.headers['x-renewed-token'];
    if (renewed) {
      localStorage.setItem(TOKEN_KEY, renewed);
    }
    if (response.data && typeof response.data === 'object') {
      response.data = toCamelCase(response.data);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/api/auth/')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login') &&
          !window.location.pathname.startsWith('/signup') &&
          !window.location.pathname.startsWith('/verify-email')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
