import axios from 'axios';

// VITE_API_URL is the backend origin (e.g. https://your-api.up.railway.app).
// The "/api" prefix is appended if missing. When unset (local dev) requests go
// to "/api" and are proxied to the backend by vite.config.js.
function resolveBaseUrl() {
  const raw = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '/api';
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

const api = axios.create({
  baseURL: resolveBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sih_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sih_token');
      localStorage.removeItem('sih_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export function getErrorMessage(error) {
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return serverMessage;
  if (error?.response) {
    return error.response.status >= 500
      ? 'The server ran into a problem. Please try again in a moment.'
      : 'Something went wrong. Please try again.';
  }
  if (error?.request) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

export default api;
