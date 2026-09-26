import api from './api';

// The learner is identified by the JWT on the server - only the question and recent turns are sent.
export const sendChat = (message, history = []) =>
  api.post('/assistant/chat', { message, history }).then((r) => r.data);
