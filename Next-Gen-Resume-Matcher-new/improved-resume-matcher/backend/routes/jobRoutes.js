const express = require('express');
const router = express.Router();
const { createJob, getJobs, getJob, updateJob, deleteJob } = require('../controllers/jobController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createJob);
router.get('/', protect, getJobs);
router.get('/:id', protect, getJob);
router.put('/:id', protect, updateJob);
router.delete('/:id', protect, deleteJob);

module.exports = router;
