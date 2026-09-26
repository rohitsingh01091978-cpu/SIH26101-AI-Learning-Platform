import api from './api';

export const getLearningPath = () => api.get('/learning-path').then((r) => r.data.learningPath);
export const getRecommendations = () => api.get('/recommendations').then((r) => r.data.recommendations);
