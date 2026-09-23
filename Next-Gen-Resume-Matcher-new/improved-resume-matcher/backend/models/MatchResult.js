const mongoose = require('mongoose');

const matchResultSchema = new mongoose.Schema(
  {
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    resume: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resume',
      required: true,
    },
    // Scores from different algorithms
    tfidfScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    semanticScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    skillsScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    experienceScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    educationScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Final weighted composite score
    finalScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    // Rank among all candidates for this job
    rank: {
      type: Number,
      default: 0,
    },
    // Matched skills
    matchedSkills: {
      type: [String],
      default: [],
    },
    missingSkills: {
      type: [String],
      default: [],
    },
    // Status / recruiter decision
    status: {
      type: String,
      enum: ['pending', 'shortlisted', 'rejected', 'hired', 'on-hold'],
      default: 'pending',
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    // Who ran this match
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Scoring breakdown for UI display
    scoreBreakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate matches
matchResultSchema.index({ job: 1, resume: 1, createdBy: 1 }, { unique: true });
matchResultSchema.index({ job: 1, finalScore: -1 });
matchResultSchema.index({ createdBy: 1, status: 1 });

module.exports = mongoose.model('MatchResult', matchResultSchema);
