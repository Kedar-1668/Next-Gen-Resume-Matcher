/**
 * matchController.js  (v3 - Complete Data Flow Fix)
 *
 * ROOT CAUSE FIXES:
 *   1. scoreWithPython() now maps ALL fields from Python response into the
 *      Match document — componentScores, skillsDetail, semanticDetail, explanation
 *   2. Node.js fallback (computeMatchScore) also builds these nested objects
 *   3. Match documents are stored with full nested data so UI reads correctly
 *   4. getJobMatches populates resume + job properly for the frontend
 */
const asyncHandler = require("express-async-handler");
const Match = require("../models/Match");
const Resume = require("../models/Resume");
const Job = require("../models/Job");
const { computeMatchScore } = require("../utils/nlpUtils");

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || "http://localhost:5001";
const NLP_TIMEOUT_MS = parseInt(process.env.NLP_TIMEOUT_MS || "25000");

// ─── Map Python NLP response → Match document fields ─────────────────────────
function mapPythonResponse(s) {
  const cs = s.component_scores || {};
  const sd = s.skills_detail || {};
  const sem = s.semantic_detail || {};
  const exp = s.explanation || {};

  return {
    // Top-level
    overallScore: s.overall_score || 0,
    scoreBand: s.score_band || "poor",
    recommendation: s.recommendation || "",
    scoringEngine: "python",

    // Nested — what the UI reads
    componentScores: {
      skills_match: cs.skills_match || 0,
      semantic: cs.semantic || 0,
      tfidf_cosine: cs.tfidf_cosine || 0,
      experience: cs.experience || 0,
      education: cs.education || 0,
    },

    skillsDetail: {
      matched: sd.matched || [],
      missing: sd.missing || [],
      extra_skills: sd.extra_skills || [],
      exact_matched: sd.exact_matched || [],
      fuzzy_matched: sd.fuzzy_matched || [],
      coverage_pct: sd.coverage_pct || 0,
      calibrated_score: sd.calibrated_score || 0,
      category_coverage: sd.category_coverage || {},
    },

    semanticDetail: {
      engine: sem.engine || "tfidf-fallback",
      doc_score: sem.doc_score || 0,
      sentence_score: sem.sentence_score || 0,
      top_sentence_pairs: sem.top_sentence_pairs || [],
    },

    explanation: {
      action: exp.action || "",
      breakdown: exp.breakdown || [],
      score_band: exp.score_band || "",
      weak_categories: exp.weak_categories || [],
    },

    // Flat aliases (backward compat)
    tfidfScore: cs.tfidf_cosine || 0,
    skillsScore: cs.skills_match || 0,
    experienceScore: cs.experience || 0,
    educationScore: cs.education || 0,
    semanticScore: cs.semantic || 0,
    matchedSkills: sd.matched || [],
    missingSkills: sd.missing || [],
    skillCoverage: sd.coverage_pct || 0,
  };
}

// ─── Map Node.js fallback response → Match document fields ───────────────────
function mapNodeResponse(scores) {
  // Node.js computeMatchScore returns flat fields — wrap them into nested format
  const overall = scores.overallScore || 0;
  const tfidf = scores.tfidfScore || 0;
  const skills = scores.skillsScore || 0;
  const experience = scores.experienceScore || 0;
  const education = scores.educationScore || 0;
  const semantic = scores.semanticScore || 0;
  const matched = scores.matchedSkills || [];
  const missing = scores.missingSkills || [];
  const coverage = scores.skillCoverage || 0;

  // Generate explanation breakdown
  const breakdown = [];
  if (skills >= 80)
    breakdown.push(
      `✅ Strong skills match (${Math.round(skills)}/100): ${matched.length} skills found.`,
    );
  else if (skills >= 50)
    breakdown.push(
      `⚠️ Partial skills (${Math.round(skills)}/100): Missing — ${missing.slice(0, 5).join(", ")}.`,
    );
  else
    breakdown.push(
      `❌ Weak skills (${Math.round(skills)}/100): Key gaps — ${missing.slice(0, 5).join(", ")}.`,
    );
  if (semantic >= 60)
    breakdown.push(`✅ Good text alignment (${Math.round(semantic)}/100)`);
  else breakdown.push(`⚠️ Low text alignment (${Math.round(semantic)}/100)`);
  if (experience > 0)
    breakdown.push(`📊 Experience score: ${Math.round(experience)}/100`);
  if (education > 0)
    breakdown.push(`🎓 Education score: ${Math.round(education)}/100`);

  const band =
    overall >= 80
      ? "excellent"
      : overall >= 65
        ? "good"
        : overall >= 45
          ? "average"
          : overall >= 25
            ? "poor"
            : "very_poor";
  const action =
    overall >= 80
      ? "🚀 Strongly recommend for interview."
      : overall >= 65
        ? "👍 Good match — recommend for next stage."
        : overall >= 45
          ? "🤔 Borderline — review skill gaps."
          : "⛔ Not a strong match for this role.";

  return {
    overallScore: overall,
    scoreBand: band,
    recommendation: action,
    scoringEngine: "nodejs",

    componentScores: {
      skills_match: skills,
      semantic: semantic,
      tfidf_cosine: tfidf,
      experience: experience,
      education: education,
    },

    skillsDetail: {
      matched: matched,
      missing: missing,
      extra_skills: [],
      exact_matched: matched,
      fuzzy_matched: [],
      coverage_pct: coverage,
      calibrated_score: skills,
      category_coverage: {},
    },

    semanticDetail: {
      engine: "nodejs-tfidf",
      doc_score: tfidf,
      sentence_score: 0,
      top_sentence_pairs: [],
    },

    explanation: {
      action: action,
      breakdown: breakdown,
      score_band: band,
      weak_categories: [],
    },

    // Flat aliases
    tfidfScore: tfidf,
    skillsScore: skills,
    experienceScore: experience,
    educationScore: education,
    semanticScore: semantic,
    matchedSkills: matched,
    missingSkills: missing,
    skillCoverage: coverage,
  };
}

// ─── Score one resume against a job ──────────────────────────────────────────
async function scoreWithPython(resume, job) {
  try {
    const res = await fetch(`${NLP_SERVICE_URL}/nlp/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume, job }),
      signal: AbortSignal.timeout(NLP_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`NLP service HTTP ${res.status}`);
    const data = await res.json();

    if (data.success && data.data) {
      console.log(
        `[NLP-Python] Scored resume — overall: ${data.data.overall_score}`,
      );
      return mapPythonResponse(data.data);
    }
    throw new Error("Python NLP returned no data");
  } catch (err) {
    console.warn(`[NLP-Fallback] Using Node.js scorer: ${err.message}`);
    const scores = computeMatchScore(resume, job);
    return mapNodeResponse(scores);
  }
}

// ─── POST /api/matches/run/:jobId ─────────────────────────────────────────────
const runMatching = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { resumeIds } = req.body;

  const job = await Job.findById(jobId);
  if (!job) {
    res.status(404);
    throw new Error("Job not found");
  }

  let query = {};

  if (Array.isArray(resumeIds) && resumeIds.length > 0) {
    query = {
      _id: { $in: resumeIds },
    };
  }

  console.log("Resume Query:", query);

  const resumes = await Resume.find(query);

  console.log(
    "Fetched resumes:",
    resumes.map((r) => ({
      id: r._id,
      name: r.candidateName,
    })),
  );

  if (!resumes.length) {
    res.status(400);
    throw new Error("No resumes found");
  }

  // Delete old matches for this job
  await Match.deleteMany({ job: jobId });

  // Score all resumes
  const matchDocs = [];

  for (const resume of resumes) {
    try {
      console.log("Scoring:", resume.candidateName);

      const scored = await scoreWithPython(resume.toObject(), job.toObject());

      console.log("Score Response:", scored);

      if (!scored) {
        console.log("No score returned");
        continue;
      }

      matchDocs.push({
        job: jobId,
        resume: resume._id,
        recruiter: req.user?._id,
        ...scored,
      });
    } catch (err) {
      console.error("Scoring failed for:", resume.candidateName, err.message);
    }
  }
  // Sort by overallScore desc, rank them
  matchDocs.sort((a, b) => b.overallScore - a.overallScore);
  matchDocs.forEach((m, i) => {
    m.rank = i + 1;
  });
  console.log("Final matchDocs:", matchDocs.length);
  console.log(matchDocs);
  if (!matchDocs.length) {
    return res.status(400).json({
      success: false,
      message: "No matches generated. Check NLP scoring.",
    });
  }
  await Match.insertMany(matchDocs);
  await Job.findByIdAndUpdate(jobId, { totalApplicants: resumes.length });

  const populated = await Match.find({ job: jobId })
    .populate("resume")
    .populate("job", "title company requiredSkills")
    .sort({ rank: 1 });

  res.json({
    success: true,
    count: populated.length,
    data: populated,
  });
});

// ─── GET /api/matches/job/:jobId ─────────────────────────────────────────────
const getJobMatches = asyncHandler(async (req, res) => {
  const matches = await Match.find({ job: req.params.jobId })
    .populate("resume")
    .populate("job", "title company requiredSkills")
    .sort({ rank: 1 });

  res.json({ success: true, count: matches.length, data: matches });
});

// ─── PUT /api/matches/:id/status ─────────────────────────────────────────────
const updateMatchStatus = asyncHandler(async (req, res) => {
  const { status, recruiterNotes } = req.body;
  const match = await Match.findByIdAndUpdate(
    req.params.id,
    { status, recruiterNotes },
    { new: true },
  )
    .populate("resume")
    .populate("job", "title company");

  if (!match) {
    res.status(404);
    throw new Error("Match not found");
  }
  res.json({ success: true, data: match });
});

// ─── GET /api/matches/:id ────────────────────────────────────────────────────
const getMatch = asyncHandler(async (req, res) => {
  const match = await Match.findById(req.params.id)
    .populate("resume")
    .populate("job");
  if (!match) {
    res.status(404);
    throw new Error("Match not found");
  }
  res.json({ success: true, data: match });
});

module.exports = { runMatching, getJobMatches, updateMatchStatus, getMatch };
