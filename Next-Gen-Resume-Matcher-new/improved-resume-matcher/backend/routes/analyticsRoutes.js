const express = require('express');
const router = express.Router();
const { getDashboardStats, getJobAnalytics } = require('../controllers/analyticsController');
const { protect } = require('../middleware/auth');

router.get('/dashboard', protect, getDashboardStats);
router.get('/job/:jobId', protect, getJobAnalytics);

module.exports = router;
