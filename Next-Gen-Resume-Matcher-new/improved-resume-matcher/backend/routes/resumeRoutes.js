const express = require('express');
const router = express.Router();
const { uploadResumes, createManualResume, getResumes, getResume, deleteResume } = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/upload', protect, upload.array('resumes', 50), uploadResumes);
router.post('/manual', protect, createManualResume);
router.get('/', protect, getResumes);
router.get('/:id', protect, getResume);
router.delete('/:id', protect, deleteResume);

module.exports = router;
