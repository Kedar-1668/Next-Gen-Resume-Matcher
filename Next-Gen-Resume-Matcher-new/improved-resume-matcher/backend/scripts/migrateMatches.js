/**
 * migrateMatches.js
 * Run this ONCE to backfill componentScores, skillsDetail, explanation
 * on old Match documents that were stored with only flat scalar fields.
 *
 * Usage:  node backend/scripts/migrateMatches.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Match    = require('../models/Match');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const old = await Match.find({
    $or: [
      { componentScores: { $exists: false } },
      { 'componentScores.skills_match': { $exists: false } },
    ]
  });

  console.log(`Found ${old.length} old Match documents to migrate`);

  let updated = 0;
  for (const m of old) {
    const cs = {
      skills_match: m.skillsScore     || 0,
      semantic:     m.semanticScore   || 0,
      tfidf_cosine: m.tfidfScore      || 0,
      experience:   m.experienceScore || 0,
      education:    m.educationScore  || 0,
    };
    const sd = {
      matched:          m.matchedSkills || [],
      missing:          m.missingSkills || [],
      extra_skills:     [],
      exact_matched:    m.matchedSkills || [],
      fuzzy_matched:    [],
      coverage_pct:     m.skillCoverage || 0,
      calibrated_score: m.skillsScore   || 0,
      category_coverage: {},
    };
    const band = m.overallScore >= 80 ? 'excellent' : m.overallScore >= 65 ? 'good'
               : m.overallScore >= 45 ? 'average' : m.overallScore >= 25 ? 'poor' : 'very_poor';
    const action = m.overallScore >= 80 ? '🚀 Strongly recommend.'
                 : m.overallScore >= 65 ? '👍 Good candidate.'
                 : m.overallScore >= 45 ? '🤔 Borderline match.'
                 : '⛔ Not a strong match.';
    const breakdown = [
      cs.skills_match >= 50
        ? `✅ Skills match: ${Math.round(cs.skills_match)}/100`
        : `⚠️ Skills match: ${Math.round(cs.skills_match)}/100`,
      `📊 Experience: ${Math.round(cs.experience)}/100`,
      `🎓 Education: ${Math.round(cs.education)}/100`,
    ];

    await Match.updateOne({ _id: m._id }, {
      $set: {
        componentScores: cs,
        skillsDetail:    sd,
        scoreBand:       band,
        recommendation:  action,
        explanation: {
          action,
          breakdown,
          score_band:      band,
          weak_categories: [],
        },
        semanticDetail: {
          engine:             'migrated',
          doc_score:          m.tfidfScore || 0,
          sentence_score:     0,
          top_sentence_pairs: [],
        },
      }
    });
    updated++;
  }

  console.log(`✅ Migrated ${updated} documents`);
  await mongoose.disconnect();
}

migrate().catch(err => { console.error(err); process.exit(1); });
