const express = require('express');
const router = express.Router();
const { runMatching, getJobMatches, updateMatchStatus, getMatch } = require('../controllers/matchController');
const { protect } = require('../middleware/auth');

router.post('/run/:jobId', protect, runMatching);
router.get('/job/:jobId', protect, getJobMatches);
router.put('/:id/status', protect, updateMatchStatus);
router.get('/:id', protect, getMatch);

module.exports = router;
