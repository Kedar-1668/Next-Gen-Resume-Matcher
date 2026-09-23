const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Resume = require('../models/Resume');
const Job = require('../models/Job');

// Helper to safely parse array-like string "['item1', 'item2']"
function parseArrayString(str) {
  if (!str || str === 'None' || str === 'N/A' || str.trim() === '') return [];
  try {
    // Replace single quotes with double quotes for JSON parse
    const cleaned = str
      .replace(/^\[/, '[').replace(/\]$/, ']')
      .replace(/'/g, '"')
      .replace(/None/g, 'null');
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(s => String(s).trim()) : [];
  } catch {
    // Fallback: split by comma
    return str.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(Boolean);
  }
}

// @desc    Import resumes from dataset CSV
// @route   POST /api/dataset/import
const importDataset = asyncHandler(async (req, res) => {
  const csvPath = req.body.csvPath || path.join(__dirname, '../data/resume_data.csv');
  const limit = parseInt(req.body.limit) || 50;

  if (!fs.existsSync(csvPath)) {
    res.status(404); throw new Error(`CSV file not found at ${csvPath}`);
  }

  const resumes = [];
  const jobs = new Map(); // Deduplicate jobs by title

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        if (resumes.length >= limit) return;

        // Parse resume
        const skills = parseArrayString(row.skills);
        const companies = parseArrayString(row.professional_company_names);
        const positions = parseArrayString(row.positions);
        const startDates = parseArrayString(row.start_dates);
        const endDates = parseArrayString(row.end_dates);
        const responsibilities = parseArrayString(row.responsibilities);
        const institutions = parseArrayString(row.educational_institution_name);
        const degrees = parseArrayString(row.degree_names);
        const passingYears = parseArrayString(row.passing_years);
        const fieldOfStudy = parseArrayString(row.major_field_of_studies);
        const languages = parseArrayString(row.languages);
        const proficiencies = parseArrayString(row.proficiency_levels);
        const certProviders = parseArrayString(row.certification_providers);
        const certSkills = parseArrayString(row.certification_skills);
        const certLinks = parseArrayString(row.online_links);
        const certIssueDates = parseArrayString(row.issue_dates);
        const activityTypes = parseArrayString(row.extra_curricular_activity_types);
        const orgNames = parseArrayString(row.extra_curricular_organization_names);
        const rolePositions = parseArrayString(row.role_positions);

        const experience = companies.map((company, i) => ({
          company: company || '',
          position: positions[i] || '',
          startDate: startDates[i] || '',
          endDate: endDates[i] || '',
          responsibilities: responsibilities.slice(i * 3, i * 3 + 3),
          relatedSkills: parseArrayString(row.related_skils_in_job)[i] ? [parseArrayString(row.related_skils_in_job)[i]] : []
        })).filter(e => e.company);

        const education = institutions.map((inst, i) => ({
          institution: inst || '',
          degree: degrees[i] || '',
          fieldOfStudy: fieldOfStudy[i] || '',
          passingYear: passingYears[i] || '',
          result: row.educational_results ? parseArrayString(row.educational_results)[i] || '' : '',
          resultType: row.result_types ? parseArrayString(row.result_types)[i] || '' : ''
        })).filter(e => e.institution);

        const langArray = languages.map((lang, i) => ({
          name: lang,
          proficiency: proficiencies[i] || ''
        }));

        const certifications = certProviders.map((provider, i) => ({
          provider,
          skill: certSkills[i] || '',
          onlineLink: certLinks[i] || '',
          issueDate: certIssueDates[i] || '',
          expiryDate: parseArrayString(row.expiry_dates)[i] || ''
        })).filter(c => c.provider);

        const extraCurricular = activityTypes.map((type, i) => ({
          activityType: type,
          organizationName: orgNames[i] || '',
          rolePosition: rolePositions[i] || ''
        })).filter(e => e.activityType);

        resumes.push({
          address: row.address || '',
          careerObjective: row.career_objective || '',
          skills,
          education,
          experience,
          languages: langArray,
          certifications,
          extraCurricular,
          source: 'dataset',
          rawText: [row.career_objective, skills.join(' '), responsibilities.join(' ')].join(' ')
        });

        // Parse job posting (deduplicate by title)
        const jobTitle = row['﻿job_position_name'] || row['job_position_name'] || '';
        if (jobTitle && !jobs.has(jobTitle)) {
          jobs.set(jobTitle, {
            title: jobTitle,
            description: row['responsibilities.1'] || '',
            requiredSkills: parseArrayString(row.skills_required),
            educationalRequirements: row.educationaL_requirements || row.educational_requirements || '',
            experienceRequirement: row.experiencere_requirement || '',
            ageRequirement: row.age_requirement || '',
            responsibilities: (row['responsibilities.1'] || '').split('\n').filter(Boolean),
            status: 'active'
          });
        }
      })
      .on('end', resolve)
      .on('error', reject);
  });

  // Save to MongoDB
  let savedResumes = 0, savedJobs = 0;

  // Clear existing dataset records
  await Resume.deleteMany({ source: 'dataset' });
  
  if (resumes.length > 0) {
    const result = await Resume.insertMany(resumes);
    savedResumes = result.length;
  }

  // Save unique jobs
  for (const [, jobData] of jobs) {
    await Job.findOneAndUpdate(
      { title: jobData.title, source: 'dataset' },
      { ...jobData, recruiter: req.user?._id },
      { upsert: true, new: true }
    );
    savedJobs++;
  }

  res.json({
    success: true,
    message: `Imported ${savedResumes} resumes and ${savedJobs} job postings from dataset`,
    data: { savedResumes, savedJobs }
  });
});

// @desc    Get dataset statistics
// @route   GET /api/dataset/stats
const getDatasetStats = asyncHandler(async (req, res) => {
  const datasetResumes = await Resume.countDocuments({ source: 'dataset' });
  const topSkills = await Resume.aggregate([
    { $match: { source: 'dataset' } },
    { $unwind: '$skills' },
    { $group: { _id: '$skills', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 }
  ]);

  res.json({
    success: true,
    data: {
      totalDatasetResumes: datasetResumes,
      topSkills
    }
  });
});

module.exports = { importDataset, getDatasetStats };
