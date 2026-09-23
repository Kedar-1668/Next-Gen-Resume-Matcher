const asyncHandler = require('express-async-handler');
const Match = require('../models/Match');
const Resume = require('../models/Resume');
const Job = require('../models/Job');

// @desc    Get dashboard analytics
// @route   GET /api/analytics/dashboard
const getDashboardStats = asyncHandler(async (req, res) => {
  const [totalJobs, totalResumes, totalMatches, shortlisted, interviewed] = await Promise.all([
    Job.countDocuments(),
    Resume.countDocuments(),
    Match.countDocuments(),
    Match.countDocuments({ status: 'shortlisted' }),
    Match.countDocuments({ status: 'interviewed' })
  ]);

  // Average match score
  const avgScoreResult = await Match.aggregate([
    { $group: { _id: null, avgScore: { $avg: '$overallScore' } } }
  ]);
  const avgMatchScore = avgScoreResult[0]?.avgScore?.toFixed(1) || 0;

  // Score distribution
  const scoreDistribution = await Match.aggregate([
    {
      $bucket: {
        groupBy: '$overallScore',
        boundaries: [0, 20, 40, 60, 80, 100],
        default: '100',
        output: { count: { $sum: 1 } }
      }
    }
  ]);

  // Top skills across all resumes
  const topSkills = await Resume.aggregate([
    { $unwind: '$skills' },
    { $group: { _id: '$skills', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Recent matches
  const recentMatches = await Match.find()
    .populate('resume', 'candidateName skills')
    .populate('job', 'title company')
    .sort({ createdAt: -1 })
    .limit(5);

  // Jobs by status
  const jobsByStatus = await Job.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  res.json({
    success: true,
    data: {
      totalJobs, totalResumes, totalMatches,
      shortlisted, interviewed, avgMatchScore,
      scoreDistribution, topSkills, recentMatches, jobsByStatus
    }
  });
});

// @desc    Get score analytics for a specific job
// @route   GET /api/analytics/job/:jobId
const getJobAnalytics = asyncHandler(async (req, res) => {
  const matches = await Match.find({ job: req.params.jobId }).populate('resume', 'candidateName skills');
  
  if (!matches.length) {
    return res.json({ success: true, data: { message: 'No matches found for this job' } });
  }

  const scores = matches.map(m => m.overallScore);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  // Skill gap analysis
  const allMissingSkills = matches.flatMap(m => m.missingSkills || []);
  const skillGap = allMissingSkills.reduce((acc, skill) => {
    acc[skill] = (acc[skill] || 0) + 1;
    return acc;
  }, {});
  const topMissingSkills = Object.entries(skillGap)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  res.json({
    success: true,
    data: {
      totalCandidates: matches.length,
      avgScore: avg.toFixed(1),
      maxScore: max,
      minScore: min,
      topMissingSkills,
      scoreBreakdown: {
        excellent: matches.filter(m => m.overallScore >= 80).length,
        good: matches.filter(m => m.overallScore >= 60 && m.overallScore < 80).length,
        average: matches.filter(m => m.overallScore >= 40 && m.overallScore < 60).length,
        poor: matches.filter(m => m.overallScore < 40).length
      }
    }
  });
});

module.exports = { getDashboardStats, getJobAnalytics };
