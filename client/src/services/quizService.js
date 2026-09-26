import api from './api';

export const generateQuiz = (materialId, count, difficulty) =>
  api.post('/quizzes/generate', { materialId, count, difficulty }).then((r) => r.data);
export const getQuiz = (id) => api.get(`/quizzes/${id}`).then((r) => r.data);
export const startQuiz = (id) => api.post(`/quizzes/${id}/start`).then((r) => r.data);
export const answerQuestion = (id, payload) => api.post(`/quizzes/${id}/answer`, payload).then((r) => r.data);
export const submitQuiz = (id, attemptId) => api.post(`/quizzes/${id}/submit`, { attemptId }).then((r) => r.data);
