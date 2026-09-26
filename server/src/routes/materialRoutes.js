const express = require('express');
const { uploadMaterial, listMaterials, getMaterial, analyzeMaterial, downloadMaterialFile, deleteMaterial } = require('../controllers/materialController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadLimiter, aiJobLimiter, fileAccessLimiter } = require('../middleware/rateLimiters');

const router = express.Router();
router.use(authenticate);

router.post('/upload', uploadLimiter, upload.single('file'), uploadMaterial);
router.get('/', listMaterials);
router.get('/:id', getMaterial);
router.get('/:id/file', fileAccessLimiter, downloadMaterialFile);
router.delete('/:id', fileAccessLimiter, deleteMaterial);
router.post('/:id/analyze', aiJobLimiter, analyzeMaterial);

module.exports = router;
