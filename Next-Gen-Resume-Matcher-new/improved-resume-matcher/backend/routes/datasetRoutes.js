const express = require('express');
const router = express.Router();
const { importDataset, getDatasetStats } = require('../controllers/datasetController');
const { protect } = require('../middleware/auth');

router.post('/import', protect, importDataset);
router.get('/stats', protect, getDatasetStats);

module.exports = router;
