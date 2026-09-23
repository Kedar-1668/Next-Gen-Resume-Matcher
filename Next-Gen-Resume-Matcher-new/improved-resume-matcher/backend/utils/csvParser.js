/**
 * CSV Parser Utility
 * Parses the Kaggle resume dataset CSV into structured resume objects
 * Fields mapped from: address, career_objective, skills, educational_institution_name,
 * degree_names, passing_years, educational_results, result_types, major_field_of_studies,
 * professional_company_names, company_urls, start_dates, end_dates, related_skils_in_job,
 * positions, locations, responsibilities, languages, proficiency_levels,
 * certification_providers, certification_skills, online_links, issue_dates, expiry_dates,
 * job_position_name, educationaL_requirements, experiencere_requirement, age_requirement,
 * responsibilities.1, skills_required, matched_score
 */

const parseArrayField = (value) => {
  if (!value || value === 'None' || value === 'N/A' || value === '') return [];
  try {
    // Remove Python-style list brackets and quotes
    const cleaned = value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .replace(/'/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'None' && s !== 'nan');
    return cleaned;
  } catch {
    return [];
  }
};

const parseResponsibilities = (value) => {
  if (!value || value === 'None') return [];
  return value.split(/\n|;/).map((s) => s.trim()).filter((s) => s.length > 0);
};

/**
 * Transform a raw CSV row (from resume_data.csv) into a Resume document
 */
const transformCSVRow = (row) => {
  const skills = parseArrayField(row.skills);
  const institutions = parseArrayField(row.educational_institution_name);
  const degrees = parseArrayField(row.degree_names);
  const passingYears = parseArrayField(row.passing_years);
  const results = parseArrayField(row.educational_results);
  const resultTypes = parseArrayField(row.result_types);
  const fieldOfStudies = parseArrayField(row.major_field_of_studies);

  const companies = parseArrayField(row.professional_company_names);
  const companyUrls = parseArrayField(row.company_urls);
  const startDates = parseArrayField(row.start_dates);
  const endDates = parseArrayField(row.end_dates);
  const positions = parseArrayField(row.positions);
  const locations = parseArrayField(row.locations);
  const relatedSkills = parseArrayField(row.related_skils_in_job);

  const languages = parseArrayField(row.languages);
  const proficiencies = parseArrayField(row.proficiency_levels);

  const certProviders = parseArrayField(row.certification_providers);
  const certSkills = parseArrayField(row.certification_skills);
  const certLinks = parseArrayField(row.online_links);
  const certIssueDates = parseArrayField(row.issue_dates);
  const certExpiryDates = parseArrayField(row.expiry_dates);

  const activityTypes = parseArrayField(row.extra_curricular_activity_types);
  const orgNames = parseArrayField(row.extra_curricular_organization_names);
  const orgLinks = parseArrayField(row.extra_curricular_organization_links);
  const rolePositions = parseArrayField(row.role_positions);

  // Build education array
  const education = institutions.map((inst, i) => ({
    institution: inst,
    degree: degrees[i] || '',
    fieldOfStudy: fieldOfStudies[i] || '',
    passingYear: passingYears[i] || '',
    result: results[i] || '',
    resultType: resultTypes[i] || '',
  }));

  // Build experience array
  const experience = companies.map((company, i) => ({
    company,
    companyUrl: companyUrls[i] || '',
    position: positions[i] || '',
    location: locations[i] || '',
    startDate: startDates[i] || '',
    endDate: endDates[i] || '',
    responsibilities: [],
    relatedSkills: relatedSkills,
  }));

  // Parse responsibilities for first experience
  if (experience.length > 0 && row.responsibilities) {
    experience[0].responsibilities = parseResponsibilities(row.responsibilities);
  }

  // Build languages array
  const languagesArr = languages.map((lang, i) => ({
    language: lang,
    proficiency: proficiencies[i] || '',
  }));

  // Build certifications array
  const certifications = certProviders.map((provider, i) => ({
    provider,
    skill: certSkills[i] || '',
    onlineLink: certLinks[i] || '',
    issueDate: certIssueDates[i] || '',
    expiryDate: certExpiryDates[i] || '',
  }));

  // Build extracurricular array
  const extracurricular = activityTypes.map((type, i) => ({
    activityType: type,
    organizationName: orgNames[i] || '',
    organizationLink: orgLinks[i] || '',
    rolePosition: rolePositions[i] || '',
  }));

  // Build raw text for NLP
  const rawText = [
    row.career_objective || '',
    skills.join(' '),
    education.map((e) => `${e.degree} ${e.fieldOfStudy} ${e.institution}`).join(' '),
    experience.map((e) => `${e.position} ${e.company} ${e.responsibilities.join(' ')} ${e.relatedSkills.join(' ')}`).join(' '),
    certifications.map((c) => `${c.provider} ${c.skill}`).join(' '),
  ].join(' ');

  return {
    address: row.address || '',
    careerObjective: row.career_objective || '',
    skills,
    education,
    experience,
    languages: languagesArr,
    certifications,
    extracurricular,
    rawText,
    fileType: 'csv',
    fromDataset: true,
    status: 'active',
  };
};

/**
 * Also parse the job-side fields from the same CSV row
 */
const extractJobFromCSVRow = (row) => {
  const skillsRequired = parseArrayField(row.skills_required);
  const responsibilities = parseArrayField(row['responsibilities.1'] || row.responsibilities);

  return {
    title: row['﻿job_position_name'] || row.job_position_name || 'Unknown Position',
    educationRequired: row['educationaL_requirements'] || '',
    experienceRequired: row['experiencere_requirement'] || '',
    ageRequirement: row['age_requirement'] || '',
    skillsRequired,
    responsibilities: parseResponsibilities(Array.isArray(responsibilities) ? responsibilities.join('\n') : responsibilities),
  };
};

module.exports = { transformCSVRow, extractJobFromCSVRow, parseArrayField };
