import api from './api';

export const getSkillGaps = () => api.get('/skill-gaps').then((r) => r.data.skillGaps);
