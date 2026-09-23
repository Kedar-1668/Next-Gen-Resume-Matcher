const asyncHandler = require('express-async-handler');
const Job = require('../models/Job');

// @desc Create job
// @route POST /api/jobs
const createJob = asyncHandler(async (req, res) => {
  const job = await Job.create({ ...req.body, recruiter: req.user._id });
  res.status(201).json({ success: true, data: job });
});

// @desc Get all jobs
// @route GET /api/jobs
const getJobs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };
  if (req.query.myJobs) filter.recruiter = req.user._id;

  const total = await Job.countDocuments(filter);
  const jobs = await Job.find(filter)
    .populate('recruiter', 'name email company')
    .skip(skip).limit(limit).sort({ createdAt: -1 });

  res.json({ success: true, total, page, pages: Math.ceil(total / limit), data: jobs });
});

// @desc Get single job
// @route GET /api/jobs/:id
const getJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate('recruiter', 'name email company');
  if (!job) { res.status(404); throw new Error('Job not found'); }
  res.json({ success: true, data: job });
});

// @desc Update job
// @route PUT /api/jobs/:id
const updateJob = asyncHandler(async (req, res) => {
  let job = await Job.findById(req.params.id);
  if (!job) { res.status(404); throw new Error('Job not found'); }
  job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.json({ success: true, data: job });
});

// @desc Delete job
// @route DELETE /api/jobs/:id
const deleteJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) { res.status(404); throw new Error('Job not found'); }
  await job.deleteOne();
  res.json({ success: true, message: 'Job deleted' });
});

module.exports = { createJob, getJobs, getJob, updateJob, deleteJob };
