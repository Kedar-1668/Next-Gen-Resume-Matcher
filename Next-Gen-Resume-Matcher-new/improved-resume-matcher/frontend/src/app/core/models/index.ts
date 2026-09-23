export interface User { _id: string; name: string; email: string; role: string; }
export interface Job {
  _id: string; title: string; company: string; description: string;
  requiredSkills: string[]; educationalRequirements: string;
  experienceRequirement: string; responsibilities: string[];
  location: string; jobType: string; status: string; totalApplicants: number;
}
export interface ComponentScores {
  skills_match: number; semantic: number; tfidf_cosine: number; experience: number; education: number;
}
export interface SkillsDetail {
  matched: string[]; missing: string[]; extra_skills: string[];
  exact_matched: string[]; fuzzy_matched: string[];
  coverage_pct: number; calibrated_score: number; category_coverage: Record<string, unknown>;
}
export interface Match {
  _id: string; job: Job;
  resume: { _id: string; candidateName: string; email: string; skills: string[]; experience: unknown[]; education: unknown[]; rawText: string; };
  overallScore: number; scoreBand: string; rank: number; status: string;
  recommendation: string; scoringEngine: string;
  componentScores: ComponentScores; skillsDetail: SkillsDetail;
  semanticDetail: { engine: string; doc_score: number; sentence_score: number; top_sentence_pairs: unknown[]; };
  explanation: { action: string; breakdown: string[]; score_band: string; weak_categories: string[]; };
  matchedSkills: string[]; missingSkills: string[];
}
