const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  recruiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true },
  company: { type: String, trim: true },
  description: { type: String, required: true },
  requiredSkills: [{ type: String }],
  educationalRequirements: { type: String },
  experienceRequirement: { type: String },
  ageRequirement: { type: String },
  responsibilities: [{ type: String }],
  location: { type: String },
  jobType: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'], default: 'full-time' },
  status: { type: String, enum: ['active', 'closed', 'draft'], default: 'active' },
  totalApplicants: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
