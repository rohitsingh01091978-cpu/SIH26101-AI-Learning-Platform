const express = require('express');
const { getAdminDashboard } = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/dashboard', getAdminDashboard);

module.exports = router;
