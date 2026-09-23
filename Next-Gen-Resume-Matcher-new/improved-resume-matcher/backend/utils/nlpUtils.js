/**
 * nlpUtils.js  (v3 - Dependency-Free Fallback)
 * 
 * Pure Node.js NLP utilities — no external dependencies required.
 * Used as fallback when Python NLP service is unavailable.
 */

// ─── STOPWORDS ────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  'i','me','my','we','our','you','your','he','him','his','she','her',
  'it','its','they','them','their','what','which','who','this','that',
  'these','those','am','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','a','an','the','and','but',
  'if','or','as','of','at','by','for','with','about','into','through',
  'to','from','in','out','on','off','over','all','each','few','more',
  'no','not','only','same','so','than','too','very','can','will',
  'just','should','now','also','would','could','may','might',
]);

// ─── TECH SKILL ALIASES ───────────────────────────────────────────────────────
const SKILL_ALIASES = {
  'ml': 'machine learning', 'dl': 'deep learning', 'nlp': 'natural language processing',
  'cv': 'computer vision', 'ai': 'artificial intelligence', 'js': 'javascript',
  'ts': 'typescript', 'py': 'python', 'k8s': 'kubernetes', 'tf': 'tensorflow',
  'nodejs': 'node.js', 'node js': 'node.js', 'reactjs': 'react', 'react js': 'react',
  'vuejs': 'vue', 'vue js': 'vue', 'angularjs': 'angular', 'postgres': 'postgresql',
  'mongo': 'mongodb', 'sklearn': 'scikit-learn', 'pyspark': 'spark',
  'gcp': 'google cloud', 'aws': 'amazon web services', 'ci cd': 'ci/cd', 'cicd': 'ci/cd',
};

// ─── SIMPLE STEMMER ───────────────────────────────────────────────────────────
function stem(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('tion') && word.length > 7) return word.slice(0, -4);
  if (word.endsWith('ment') && word.length > 7) return word.slice(0, -4);
  if (word.endsWith('ness') && word.length > 7) return word.slice(0, -4);
  if (word.endsWith('ed') && word.length > 5)  return word.slice(0, -2);
  if (word.endsWith('er') && word.length > 5)  return word.slice(0, -2);
  if (word.endsWith('ly') && word.length > 5)  return word.slice(0, -2);
  if (word.endsWith('s')  && !word.endsWith('ss') && word.length > 4) return word.slice(0, -1);
  return word;
}

function preprocessText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase()
    .replace(/[^a-z0-9\s+#./\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const cleaned = preprocessText(text);
  // Expand aliases in text
  let expanded = cleaned;
  Object.entries(SKILL_ALIASES).forEach(([alias, canonical]) => {
    expanded = expanded.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  });
  return expanded.split(/\s+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function tokenizeAndStem(text) {
  return tokenize(text).map(stem);
}

// ─── TF-IDF ───────────────────────────────────────────────────────────────────
function computeTFIDF(tokensA, tokensB) {
  const N = 2;
  const allTerms = new Set([...tokensA, ...tokensB]);
  const df = {};
  allTerms.forEach(term => {
    df[term] = (tokensA.includes(term) ? 1 : 0) + (tokensB.includes(term) ? 1 : 0);
  });

  function vectorize(tokens) {
    const tf = {};
    tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });
    const total = tokens.length || 1;
    const vec = {};
    Object.entries(tf).forEach(([term, cnt]) => {
      const idf = Math.log((N + 1) / (df[term] + 1)) + 1;
      vec[term] = (cnt / total) * idf;
    });
    return vec;
  }

  return { vecA: vectorize(tokensA), vecB: vectorize(tokensB) };
}

function cosineSimilarity(vecA, vecB) {
  const terms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dot = 0, magA = 0, magB = 0;
  terms.forEach(t => {
    const a = vecA[t] || 0, b = vecB[t] || 0;
    dot += a * b; magA += a * a; magB += b * b;
  });
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

// ─── SKILLS MATCHING ─────────────────────────────────────────────────────────
const SYNONYM_GROUPS = [
  new Set(['machine learning', 'ml', 'machine learning engineer']),
  new Set(['deep learning', 'dl']),
  new Set(['natural language processing', 'nlp', 'text mining']),
  new Set(['computer vision', 'cv', 'image processing']),
  new Set(['javascript', 'js', 'es6']),
  new Set(['typescript', 'ts']),
  new Set(['python', 'py']),
  new Set(['node.js', 'nodejs', 'node js', 'node']),
  new Set(['react', 'reactjs', 'react.js']),
  new Set(['kubernetes', 'k8s']),
  new Set(['postgresql', 'postgres']),
  new Set(['mongodb', 'mongo']),
  new Set(['scikit-learn', 'sklearn']),
  new Set(['spark', 'apache spark', 'pyspark']),
  new Set(['ci/cd', 'cicd', 'ci cd', 'continuous integration']),
];

function normalizeSkill(skill) {
  const s = skill.toLowerCase().trim().replace(/\s+/g, ' ');
  return SKILL_ALIASES[s] || s;
}

function skillsOverlap(resumeSkill, jobSkill) {
  const r = normalizeSkill(resumeSkill);
  const j = normalizeSkill(jobSkill);
  if (r === j) return true;
  // Synonym check
  for (const group of SYNONYM_GROUPS) {
    if (group.has(r) && group.has(j)) return true;
  }
  // Substring check (with length guard to avoid false positives)
  if (r.length >= 4 && j.length >= 4 && (r.includes(j) || j.includes(r))) return true;
  return false;
}

function computeSkillsScore(resumeSkills, jobSkills) {
  if (!jobSkills || jobSkills.length === 0) {
    return { score: 50, matched: [], missing: [], coverage: 50 };
  }
  const matched = [], missing = [];
  jobSkills.forEach(js => {
    const found = (resumeSkills || []).some(rs => skillsOverlap(rs, js));
    if (found) matched.push(normalizeSkill(js));
    else missing.push(normalizeSkill(js));
  });
  const coverage = (matched.length / jobSkills.length) * 100;
  // Apply sqrt calibration
  const score = Math.sqrt(coverage / 100) * 100;
  return { score: Math.round(score * 10) / 10, matched, missing, coverage: Math.round(coverage) };
}

// ─── EDUCATION ────────────────────────────────────────────────────────────────
const DEGREE_LEVELS = {
  phd: 6, doctorate: 6, master: 5, msc: 5, mba: 5, mtech: 5,
  bachelor: 3, btech: 3, bsc: 3, be: 3, bca: 3, ba: 3,
  diploma: 2, hsc: 1, '12th': 1, ssc: 0, '10th': 0,
};

function getDegreeLevel(text) {
  const t = (text || '').toLowerCase();
  let level = -1;
  Object.entries(DEGREE_LEVELS).forEach(([key, val]) => {
    if (t.includes(key) && val > level) level = val;
  });
  return level;
}

function computeEducationScore(education, requirement) {
  if (!requirement) return 60;
  const reqLevel = getDegreeLevel(requirement);
  if (reqLevel < 0) return 60;
  const maxLevel = Math.max(-1, ...(education || []).map(e => getDegreeLevel(`${e.degree} ${e.fieldOfStudy}`)));
  if (maxLevel >= reqLevel) return 100;
  if (maxLevel === reqLevel - 1) return 65;
  if (maxLevel === reqLevel - 2) return 35;
  return 20;
}

// ─── EXPERIENCE ───────────────────────────────────────────────────────────────
function computeExperienceScore(experience, requirement) {
  if (!requirement) return 60;
  const reqMatch = (requirement || '').match(/(\d+)/);
  const reqYears = reqMatch ? parseInt(reqMatch[1]) : 0;
  if (reqYears === 0) return 70;

  let totalMonths = 0;
  (experience || []).forEach(exp => {
    if (!exp.startDate) return;
    const start = new Date(exp.startDate);
    const end = (exp.endDate || '').toLowerCase().match(/present|current|now|date/)
      ? new Date() : new Date(exp.endDate || '');
    if (!isNaN(start) && !isNaN(end) && end > start) {
      totalMonths += (end - start) / (1000 * 60 * 60 * 24 * 30);
    }
  });

  const years = totalMonths / 12;
  const ratio = years / reqYears;
  if (ratio >= 1.5) return 100;
  if (ratio >= 1.0) return 90;
  if (ratio >= 0.75) return 72;
  if (ratio >= 0.5) return 50;
  if (ratio >= 0.25) return 28;
  return 10;
}

// ─── MAIN SCORING FUNCTION ────────────────────────────────────────────────────
function computeMatchScore(resume, job) {
  // Build texts
  const resumeText = [
    resume.careerObjective || '',
    (resume.skills || []).join(' '),
    (resume.skills || []).join(' '),  // repeat skills for emphasis
    (resume.experience || []).map(e =>
      `${e.position || ''} ${e.company || ''} ${(e.responsibilities || []).join(' ')}`
    ).join(' '),
    (resume.education || []).map(e =>
      `${e.degree || ''} ${e.fieldOfStudy || ''} ${e.institution || ''}`
    ).join(' '),
    (resume.rawText || '').slice(0, 2000),
  ].join(' ');

  const jobText = [
    (job.title || '') + ' ' + (job.title || '') + ' ' + (job.title || ''),
    job.description || '',
    (job.requiredSkills || []).join(' '),
    (job.requiredSkills || []).join(' '),
    (job.responsibilities || []).join(' '),
    job.educationalRequirements || '',
  ].join(' ');

  // TF-IDF
  const rTokens = tokenizeAndStem(resumeText);
  const jTokens = tokenizeAndStem(jobText);
  const { vecA, vecB } = computeTFIDF(rTokens, jTokens);
  const tfidfScore = cosineSimilarity(vecA, vecB) * 100;

  // Skills
  const skillsResult  = computeSkillsScore(resume.skills || [], job.requiredSkills || []);
  const educationScore = computeEducationScore(resume.education || [], job.educationalRequirements);
  const experienceScore = computeExperienceScore(resume.experience || [], job.experienceRequirement);

  // Semantic approx: TF-IDF * 0.8 (honest fallback)
  const semanticScore = tfidfScore * 0.8;

  // Weighted total (calibrated)
  const overallScore = Math.round(
    skillsResult.score * 0.35 +
    semanticScore      * 0.28 +
    tfidfScore         * 0.20 +
    experienceScore    * 0.10 +
    educationScore     * 0.07
  );

  return {
    overallScore:    Math.min(100, Math.max(0, overallScore)),
    tfidfScore:      Math.round(tfidfScore * 10) / 10,
    skillsScore:     Math.round(skillsResult.score * 10) / 10,
    educationScore:  Math.round(educationScore),
    experienceScore: Math.round(experienceScore),
    semanticScore:   Math.round(semanticScore * 10) / 10,
    matchedSkills:   skillsResult.matched,
    missingSkills:   skillsResult.missing,
    skillCoverage:   skillsResult.coverage,
  };
}

function extractSkillsFromText(text) {
  const skills = [
    'javascript','typescript','python','java','c++','c#','php','ruby','go','rust','swift','kotlin',
    'react','angular','vue','node.js','express','django','flask','spring','laravel',
    'mongodb','mysql','postgresql','redis','elasticsearch','firebase','dynamodb',
    'aws','azure','gcp','docker','kubernetes','terraform','jenkins','git','github',
    'html','css','sass','tailwind','bootstrap','graphql','rest','api','sql','nosql',
    'machine learning','deep learning','nlp','computer vision','tensorflow','pytorch','keras',
    'scikit-learn','pandas','numpy','spark','kafka','hadoop','airflow',
    'react native','flutter','android','ios','agile','scrum','ci/cd','linux','bash',
  ];
  const lower = (text || '').toLowerCase();
  return skills.filter(s => lower.includes(s));
}

module.exports = { computeMatchScore, preprocessText, tokenizeAndStem, extractSkillsFromText, computeSkillsScore };
