const express = require('express');
const { uploadMaterial, listMaterials, getMaterial, analyzeMaterial } = require('../controllers/materialController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();
router.use(authenticate);

router.post('/upload', upload.single('file'), uploadMaterial);
router.get('/', listMaterials);
router.get('/:id', getMaterial);
router.post('/:id/analyze', analyzeMaterial);

module.exports = router;
