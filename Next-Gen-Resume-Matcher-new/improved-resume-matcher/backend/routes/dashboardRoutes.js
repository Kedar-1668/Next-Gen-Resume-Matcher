const express = require('express');
const router = express.Router();
const { getDashboardStats, getTrends } = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/stats', getDashboardStats);
router.get('/trends', getTrends);

module.exports = router;
