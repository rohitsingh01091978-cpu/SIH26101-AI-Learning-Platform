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

export const deleteMaterial = (id) => api.delete(`/materials/${id}`).then((r) => r.data);

// Downloads the original file as a Blob. The endpoint needs the login token, so this cannot be a plain link.
export const downloadMaterialFile = async (id) => {
  try {
    const r = await api.get(`/materials/${id}/file`, { responseType: 'blob' });
    return r.data;
  } catch (err) {
    // With responseType "blob" an error body arrives as a Blob too; turn it back into JSON for getErrorMessage().
    if (err?.response?.data instanceof Blob) {
      try {
        err.response.data = JSON.parse(await err.response.data.text());
      } catch {
        /* keep as is */
      }
    }
    throw err;
  }
};
