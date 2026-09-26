import api from './api';

export const getAdminDashboard = () => api.get('/admin/dashboard').then((r) => r.data);
