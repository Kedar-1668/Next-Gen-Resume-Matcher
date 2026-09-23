const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  candidateName: { type: String, trim: true },
  email: { type: String },
  phone: { type: String },
  address: { type: String },
  careerObjective: { type: String },
  skills: [{ type: String }],
  // Education
  education: [{
    institution: String,
    degree: String,
    fieldOfStudy: String,
    passingYear: String,
    result: String,
    resultType: String
  }],
  // Experience
 experience: [{
    role: {
        type: String,
        default: ""
    },
    company: {
        type: String,
        default: ""
    },
    position: {
        type: String,
        default: ""
    },
    details: {
        type: String,
        default: ""
    },
    startDate: {
        type: String,
        default: ""
    },
    endDate: {
        type: String,
        default: ""
    },
    location: {
        type: String,
        default: ""
    },
    responsibilities: {
        type: [String],
        default: []
    },
    relatedSkills: {
        type: [String],
        default: []
    }
  }],
  // Extra Curricular
  extraCurricular: [{
    activityType: String,
    organizationName: String,
    organizationLink: String,
    rolePosition: String
  }],
  // Languages
  languages: [{
    name: String,
    proficiency: String
  }],
  // Certifications
  certifications: [{
    provider: String,
    skill: String,
    onlineLink: String,
    issueDate: String,
    expiryDate: String
  }],
  // Raw text extracted from file
  rawText: { type: String },
  // File info
  fileName: { type: String },
  filePath: { type: String },
  fileType: { type: String },
  // Source: 'upload' | 'dataset'
  source: { type: String, default: 'upload' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Resume', resumeSchema);
