import api from './api';

export const getProfile = () => api.get('/profile').then((r) => r.data.profile);
export const updateProfile = (payload) => api.put('/profile', payload).then((r) => r.data.profile);
