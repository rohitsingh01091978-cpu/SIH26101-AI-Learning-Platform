import api from './api';

export const startAssessment = () => api.post('/assessment/start').then((r) => r.data);
export const submitAssessment = (attemptId, responses) =>
  api.post('/assessment/submit', { attemptId, responses }).then((r) => r.data);
