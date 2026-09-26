import api from './api';

export const listMaterials = () => api.get('/materials').then((r) => r.data.materials);
export const getMaterial = (id) => api.get(`/materials/${id}`).then((r) => r.data.material);

export const uploadMaterial = (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  return api
    .post('/materials/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
      },
    })
    .then((r) => r.data.material);
};

export const analyzeMaterial = (id) => api.post(`/materials/${id}/analyze`).then((r) => r.data);
