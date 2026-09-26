import api from './api';

export const listProgress = () => api.get('/progress').then((r) => r.data.progress);
export const startProgress = (payload) => api.post('/progress', payload).then((r) => r.data.progress);
export const updateProgress = (id, payload) => api.put(`/progress/${id}`, payload).then((r) => r.data.progress);
