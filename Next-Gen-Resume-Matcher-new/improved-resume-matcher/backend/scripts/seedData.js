/**
 * Seed Script: Import resume_data.csv into MongoDB
 * Usage: node scripts/seedData.js <path-to-csv>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Resume = require('../models/Resume');
const User = require('../models/User');
const Job = require('../models/Job');
const { transformCSVRow, extractJobFromCSVRow } = require('../utils/csvParser');
const { preprocessText } = require('../utils/nlpUtils');

const CSV_PATH = process.argv[2] || path.resolve(__dirname, '../data/resume_data.csv');
const BATCH_SIZE = 100;

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Create or find seed user
    let seedUser = await User.findOne({ email: 'seed@recruiter.com' });
    if (!seedUser) {
      seedUser = await User.create({
        name: 'Seed Recruiter',
        email: 'seed@recruiter.com',
        password: 'Seed@1234',
        company: 'Demo Corp',
        role: 'recruiter',
      });
      console.log('✅ Seed user created: seed@recruiter.com / Seed@1234');
    }

    if (!fs.existsSync(CSV_PATH)) {
      console.error(`❌ CSV not found at: ${CSV_PATH}`);
      console.log('Usage: node scripts/seedData.js /path/to/resume_data.csv');
      process.exit(1);
    }

    const rows = [];
    const jobSet = new Map(); // deduplicate jobs by title

    await new Promise((resolve, reject) => {
      fs.createReadStream(CSV_PATH)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`📄 Read ${rows.length} rows from CSV`);

    // Clear old seed data
    await Resume.deleteMany({ uploadedBy: seedUser._id, fromDataset: true });
    console.log('🗑  Cleared old seed resumes');

    let imported = 0;
    let batch = [];

    for (const row of rows) {
      try {
        const resumeData = transformCSVRow(row);
        resumeData.uploadedBy = seedUser._id;
        resumeData.processedTokens = preprocessText(resumeData.rawText || '');
        batch.push(resumeData);

        // Collect unique jobs
        const jobData = extractJobFromCSVRow(row);
        if (jobData.title && !jobSet.has(jobData.title)) {
          jobSet.set(jobData.title, jobData);
        }

        if (batch.length >= BATCH_SIZE) {
          await Resume.insertMany(batch, { ordered: false });
          imported += batch.length;
          console.log(`  ↳ Inserted ${imported}/${rows.length} resumes...`);
          batch = [];
        }
      } catch (err) {
        // skip bad rows
      }
    }

    // Insert remaining
    if (batch.length > 0) {
      await Resume.insertMany(batch, { ordered: false });
      imported += batch.length;
    }

    console.log(`✅ Imported ${imported} resumes`);

    // Seed jobs
    await Job.deleteMany({ createdBy: seedUser._id });
    const jobDocs = [...jobSet.values()].map((j) => ({
      ...j,
      description: `${j.title} role. Requirements: ${j.educationRequired || 'N/A'}. Experience: ${j.experienceRequired || 'N/A'}. Age: ${j.ageRequirement || 'N/A'}.`,
      createdBy: seedUser._id,
      status: 'active',
    }));

    if (jobDocs.length > 0) {
      await Job.insertMany(jobDocs, { ordered: false });
      console.log(`✅ Seeded ${jobDocs.length} jobs`);
    }

    console.log('\n🎉 Seeding complete!');
    console.log('Login with: seed@recruiter.com / Seed@1234');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
};

run();
