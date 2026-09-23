/**
 * Match.js  (v3 - Complete Schema Fix)
 * 
 * ROOT CAUSE FIX: Added componentScores, skillsDetail, explanation, semanticDetail
 * fields that were completely missing but expected by the frontend.
 * The old schema stored only flat scalar fields (skillsScore, tfidfScore)
 * but the UI reads nested objects (componentScores.skills_match, skills_detail.matched).
 */
const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  job:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job',    required: true },
  resume:    { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  recruiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ─── Top-level score (0-100) ───────────────────────────────────────────────
  overallScore: { type: Number, min: 0, max: 100, default: 0 },
  scoreBand:    { type: String, enum: ['excellent','good','average','poor','very_poor'], default: 'poor' },

  // ─── Component scores (nested — what the UI reads) ─────────────────────────
  componentScores: {
    skills_match: { type: Number, default: 0 },
    semantic:     { type: Number, default: 0 },
    tfidf_cosine: { type: Number, default: 0 },
    experience:   { type: Number, default: 0 },
    education:    { type: Number, default: 0 },
  },

  // ─── Skills detail (nested — what the UI reads) ────────────────────────────
  skillsDetail: {
    matched:          [{ type: String }],
    missing:          [{ type: String }],
    extra_skills:     [{ type: String }],
    exact_matched:    [{ type: String }],
    fuzzy_matched:    [{ type: String }],
    coverage_pct:     { type: Number, default: 0 },
    calibrated_score: { type: Number, default: 0 },
    category_coverage: { type: mongoose.Schema.Types.Mixed, default: {} },
  },

  // ─── Semantic detail (for AI explanation panel) ────────────────────────────
  semanticDetail: {
    engine:              { type: String, default: 'tfidf-fallback' },
    doc_score:           { type: Number, default: 0 },
    sentence_score:      { type: Number, default: 0 },
    top_sentence_pairs:  [{ type: mongoose.Schema.Types.Mixed }],
  },

  // ─── Explanation (AI analysis panel) ──────────────────────────────────────
  explanation: {
    action:           { type: String, default: '' },
    breakdown:        [{ type: String }],
    score_band:       { type: String, default: '' },
    weak_categories:  [{ type: String }],
  },

  // ─── Flat aliases (kept for backward compat + simple queries) ─────────────
  tfidfScore:      { type: Number, default: 0 },
  skillsScore:     { type: Number, default: 0 },
  experienceScore: { type: Number, default: 0 },
  educationScore:  { type: Number, default: 0 },
  semanticScore:   { type: Number, default: 0 },
  matchedSkills:   [{ type: String }],
  missingSkills:   [{ type: String }],
  skillCoverage:   { type: Number, default: 0 },

  // ─── Misc ─────────────────────────────────────────────────────────────────
  rank:          { type: Number, default: 0 },
  scoringEngine: { type: String, default: 'nodejs' },
  recommendation:{ type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'shortlisted', 'rejected', 'interviewed'],
    default: 'pending'
  },
  recruiterNotes: { type: String },

}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);
