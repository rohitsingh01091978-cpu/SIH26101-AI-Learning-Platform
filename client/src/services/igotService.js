import api from './api';

export const getCourses = (params = {}) => api.get('/igot/courses', { params }).then((r) => r.data);
export const searchCourses = (q) => api.get('/igot/search', { params: { q } }).then((r) => r.data);
