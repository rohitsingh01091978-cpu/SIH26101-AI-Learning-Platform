import api from './api';

export const getPerformance = () => api.get('/performance').then((r) => r.data);
