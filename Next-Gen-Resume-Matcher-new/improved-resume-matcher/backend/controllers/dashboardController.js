const asyncHandler = require('express-async-handler');
const Job = require('../models/Job');
const Resume = require('../models/Resume');
const MatchResult = require('../models/MatchResult');

// @desc    Get dashboard stats
// @route   GET /api/dashboard/stats
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [
    totalJobs,
    activeJobs,
    totalResumes,
    totalMatches,
    shortlisted,
    hired,
    recentJobs,
    recentMatches,
    scoreDistribution,
    topSkills,
  ] = await Promise.all([
    Job.countDocuments({ createdBy: userId }),
    Job.countDocuments({ createdBy: userId, status: 'active' }),
    Resume.countDocuments({ uploadedBy: userId, status: 'active' }),
    MatchResult.countDocuments({ createdBy: userId }),
    MatchResult.countDocuments({ createdBy: userId, status: 'shortlisted' }),
    MatchResult.countDocuments({ createdBy: userId, status: 'hired' }),
    Job.find({ createdBy: userId }).sort({ createdAt: -1 }).limit(5).select('title status applicationCount createdAt'),
    MatchResult.find({ createdBy: userId })
      .populate('job', 'title')
      .populate('resume', 'candidateName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('finalScore status createdAt'),
    MatchResult.aggregate([
      { $match: { createdBy: userId } },
      {
        $bucket: {
          groupBy: '$finalScore',
          boundaries: [0, 20, 40, 60, 80, 100],
          default: '100',
          output: { count: { $sum: 1 } },
        },
      },
    ]),
    Resume.aggregate([
      { $match: { uploadedBy: userId } },
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      overview: {
        totalJobs,
        activeJobs,
        totalResumes,
        totalMatches,
        shortlisted,
        hired,
      },
      recentJobs,
      recentMatches,
      scoreDistribution: scoreDistribution.map((b) => ({
        range: `${b._id}-${b._id + 20 < 101 ? b._id + 20 : 100}`,
        count: b.count,
      })),
      topSkills: topSkills.map((s) => ({ skill: s._id, count: s.count })),
    },
  });
});

// @desc    Get match trends over time
// @route   GET /api/dashboard/trends
// @access  Private
const getTrends = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { days = 30 } = req.query;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));

  const [matchTrends, jobTrends] = await Promise.all([
    MatchResult.aggregate([
      { $match: { createdBy: userId, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          avgScore: { $avg: '$finalScore' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Job.aggregate([
      { $match: { createdBy: userId, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({
    success: true,
    data: { matchTrends, jobTrends },
  });
});

module.exports = { getDashboardStats, getTrends };
