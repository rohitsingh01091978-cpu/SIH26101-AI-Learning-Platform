import api from './api';

export const listCompetencies = () => api.get('/competencies').then((r) => r.data.competencies);
export const getMyCompetencies = () => api.get('/competencies/me').then((r) => r.data.competencies);
