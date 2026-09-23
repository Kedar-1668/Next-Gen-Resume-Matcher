"""
scorer.py  (v4 - Data Integrity Fix)
─────────────────────────────────────
Fixes over v3:
  1. build_job_text() had a Python string multiplication bug: 
     `job.get("title", "") * " " * 3` — multiplying string by string = TypeError.
     Fixed to proper repetition: `(job.get("title", "") + " ") * 3`
  2. build_resume_text() weight_raw calculation fixed
  3. All score fields guaranteed to be numbers (never None)
  4. Calibrated weights re-tuned to be less extreme
"""
from __future__ import annotations

import logging
import math
import re
from collections import Counter
from datetime import datetime

from nlp.preprocessor import full_pipeline, parse_skill_list
from nlp.tfidf_engine import SklearnTFIDFEngine
from nlp.skills_matcher import compute_skill_match, extract_skills_from_text
from nlp.semantic_engine import semantic_score, faiss_rank_resumes

logger = logging.getLogger(__name__)

DEFAULT_WEIGHTS = {
    "skills":     0.45,
    "semantic":   0.35,
    "tfidf":      0.00,
    "experience": 0.12,
    "education":  0.08,
}

DEGREE_HIERARCHY: dict[str, int] = {
    "phd": 6, "doctorate": 6, "ph.d": 6,
    "master": 5, "msc": 5, "mba": 5, "mtech": 5, "m.tech": 5,
    "me": 5, "m.sc": 5, "m.e": 5, "mca": 4,
    "bachelor": 3, "btech": 3, "b.tech": 3, "bsc": 3, "b.sc": 3,
    "be": 3, "b.e": 3, "bca": 3, "ba": 3,
    "diploma": 2, "associate": 2,
    "hsc": 1, "12th": 1, "intermediate": 1,
    "ssc": 0, "10th": 0, "matriculation": 0,
}

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}


def _safe_float(v, default=0.0) -> float:
    """Return float(v) or default if v is None/invalid."""
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


def _degree_level(text: str) -> int:
    tl = (text or "").lower()
    for kw, level in sorted(DEGREE_HIERARCHY.items(), key=lambda x: -x[1]):
        if kw in tl:
            return level
    return -1


def score_education(education: list, requirement: str) -> dict:
    required_level = _degree_level(requirement or "")
    candidate_levels = [
        _degree_level(f"{e.get('degree', '')} {e.get('fieldOfStudy', '')}")
        for e in (education or [])
    ]
    max_level = max(candidate_levels) if candidate_levels else -1

    if required_level < 0:
        score, verdict = 60, "No specific requirement — neutral score"
    elif max_level >= required_level:
        score, verdict = 100, "Meets or exceeds educational requirement"
    elif max_level == required_level - 1:
        score, verdict = 65, "One level below required"
    elif max_level == required_level - 2:
        score, verdict = 35, "Two levels below required"
    elif max_level < 0:
        score, verdict = 20, "Education info not available"
    else:
        score, verdict = 10, "Significantly below requirement"

    return {
        "score": int(score),
        "required_level": required_level,
        "candidate_level": max_level,
        "verdict": verdict,
        "education_entries": len(education or []),
    }


def _parse_date_to_months(date_str: str) -> int | None:
    s = str(date_str or "").strip().lower()
    if not s or s in ("none", "n/a", ""):
        return None
    if re.search(r"(present|current|till date|ongoing|now|date)", s):
        n = datetime.now()
        return n.year * 12 + n.month
    m = re.search(r"(\d{4})[/-](\d{1,2})", s)
    if m: return int(m.group(1)) * 12 + int(m.group(2))
    m = re.search(r"(\d{1,2})[/-](\d{4})", s)
    if m: return int(m.group(2)) * 12 + int(m.group(1))
    for mn, mv in _MONTH_MAP.items():
        m = re.search(rf"\b{mn}\b.*?(\d{{4}})", s)
        if m: return int(m.group(1)) * 12 + mv
    m = re.search(r"(\d{4})", s)
    if m: return int(m.group(1)) * 12 + 6
    return None


def score_experience(experience: list, requirement: str) -> dict:
    req_match = re.search(r"(\d+(?:\.\d+)?)", requirement or "")
    required_years = float(req_match.group(1)) if req_match else 0
    total_months = 0
    for exp in (experience or []):
        start = _parse_date_to_months(exp.get("startDate"))
        end = _parse_date_to_months(exp.get("endDate"))
        if start and end and end > start:
            total_months += end - start
    candidate_years = total_months / 12

    if required_years == 0:
     if not experience:
        score, verdict = 60, "No formal experience listed"

     else:
        exp_text = " ".join([
            str(exp.get("role", "")) + " " +
            str(exp.get("details", "")) + " " +
            str(exp.get("company", ""))
            for exp in experience
        ]).lower()

        relevant_keywords = [
            "react",
            "node",
            "express",
            "mongodb",
            "mern",
            "frontend",
            "backend",
            "full stack",
            "javascript",
            "api"
        ]

        relevance_hits = sum(
            1 for keyword in relevant_keywords
            if keyword in exp_text
        )

        if relevance_hits >= 3:
            score, verdict = 90, "Highly relevant experience"

        elif relevance_hits >= 1:
            score, verdict = 80, "Relevant internship/project experience"

        else:
            score, verdict = 60, "Experience exists but not relevant to job role"
    else:
        ratio = candidate_years / required_years
        if ratio >= 1.5:    score, verdict = 100, f"Highly experienced ({candidate_years:.1f}y vs {required_years}y req.)"
        elif ratio >= 1.0:  score, verdict = 90,  f"Meets requirement ({candidate_years:.1f}y)"
        elif ratio >= 0.75: score, verdict = 72,  f"Near requirement ({candidate_years:.1f}y vs {required_years}y req.)"
        elif ratio >= 0.5:  score, verdict = 50,  f"Partially meets ({candidate_years:.1f}y vs {required_years}y req.)"
        elif ratio >= 0.25: score, verdict = 28,  f"Below requirement ({candidate_years:.1f}y vs {required_years}y req.)"
        else:               score, verdict = 10,  f"Significantly below ({candidate_years:.1f}y vs {required_years}y req.)"

    return {
        "score": int(round(score)),
        "estimated_years": round(candidate_years, 1),
        "required_years": required_years,
        "total_positions": len(experience or []),
        "total_months": total_months,
        "verdict": verdict,
    }


def build_resume_text(resume: dict) -> str:
    """Build searchable text from resume dict. Skills repeated to boost signal."""
    skills_list = resume.get("skills", [])
    if isinstance(skills_list, str):
        skills_list = parse_skill_list(skills_list)
    skills_text = " ".join(str(s) for s in skills_list if s)

    exp_text = " ".join(
        f"{e.get('position', '')} {e.get('company', '')} "
        f"{' '.join(str(r) for r in (e.get('responsibilities') or []))}"
        for e in (resume.get("experience") or [])
    )
    edu_text = " ".join(
        f"{e.get('degree', '')} {e.get('fieldOfStudy', '')} {e.get('institution', '')}"
        for e in (resume.get("education") or [])
    )
    cert_text = " ".join(
        c.get("skill", "") for c in (resume.get("certifications") or [])
    )

    # Skills repeated 3x to emphasise them in TF-IDF
    parts = [
        resume.get("careerObjective", ""),
        skills_text,
        skills_text,        # 2nd repetition
        skills_text,        # 3rd repetition
        exp_text,
        edu_text,
        cert_text,
    ]

    # Include rawText at half weight (first 2000 chars)
    raw = resume.get("rawText", "") or ""
    if raw:
        parts.append(raw[:2000])

    return " ".join(p for p in parts if p)


def build_job_text(job: dict) -> str:
    """Build searchable text from job dict."""
    title = job.get("title", "")
    skills_list = job.get("requiredSkills", [])
    if isinstance(skills_list, str):
        skills_list = parse_skill_list(skills_list)
    skills_text = " ".join(str(s) for s in skills_list if s)
    resp_text = " ".join(str(r) for r in (job.get("responsibilities") or []))

    # Title repeated 3x to boost importance
    parts = [
        title, title, title,
        job.get("description", ""),
        skills_text, skills_text,   # skills repeated 2x
        resp_text,
        job.get("educationalRequirements", ""),
        job.get("experienceRequirement", ""),
    ]
    return " ".join(p for p in parts if p)


def _calibrate_skill_score(raw_coverage: float, n_job_skills: int) -> float:
    """Sqrt penalty curve — generous on partial matches."""
    if n_job_skills == 0:
        return 50.0
    if raw_coverage >= 100:
        return 100.0
    return max(0.0, math.sqrt(max(0, raw_coverage) / 100) * 100)


def generate_explanation(scores, skill_result, edu_result, exp_result, semantic_result) -> dict:
    overall = scores.get("overall", 0)
    lines = []

    sk = _safe_float(scores.get("skills"))
    matched = skill_result.get("matched", [])
    missing = skill_result.get("missing", [])
    n_job   = max(skill_result.get("job_skill_count", 0), 1)

    if sk >= 80:
        lines.append(f"✅ Strong skills ({sk:.0f}/100): {len(matched)}/{n_job} required skills found.")
    elif sk >= 50:
        lines.append(f"⚠️ Partial skills ({sk:.0f}/100): Missing — {', '.join(missing[:5])}.")
    else:
        lines.append(f"❌ Weak skills ({sk:.0f}/100): Key gaps — {', '.join(missing[:6]) or 'none detected'}.")

    sem = _safe_float(scores.get("semantic"))
    engine = semantic_result.get("engine", "tfidf-fallback")
    if sem >= 70:
        lines.append(f"✅ High semantic alignment ({sem:.0f}/100) via {engine}.")
    elif sem >= 40:
        lines.append(f"⚠️ Moderate semantic alignment ({sem:.0f}/100).")
    else:
        lines.append(f"❌ Low semantic alignment ({sem:.0f}/100) — language diverges from JD.")

    lines.append(f"📊 Experience: {exp_result.get('verdict', '')}")
    lines.append(f"🎓 Education: {edu_result.get('verdict', '')}")

    pairs = semantic_result.get("top_sentence_pairs", [])
    if pairs:
        top = pairs[0]
        rs = top.get("resume_sentence", "")[:70]
        js = top.get("job_sentence", "")[:70]
        lines.append(f"🔗 Best match: \"{rs}…\" ↔ \"{js}…\" ({top.get('score', 0):.0f}%)")

    cat_cov = skill_result.get("category_coverage", {})
    weak = [cat for cat, v in cat_cov.items() if v.get("pct", 100) < 50]
    if weak:
        lines.append(f"📋 Weak coverage in: {', '.join(weak)}")

    if overall >= 80:   action = "🚀 Strongly recommend for interview."
    elif overall >= 65: action = "👍 Good match — recommend for next stage."
    elif overall >= 45: action = "🤔 Borderline — review skill gaps."
    else:               action = "⛔ Not a strong match for this role."

    band = ("excellent" if overall >= 80 else "good" if overall >= 65
            else "average" if overall >= 45 else "poor" if overall >= 25 else "very_poor")

    return {
        "action": action,
        "breakdown": lines,
        "score_band": band,
        "weak_categories": weak,
    }


def score_resume_against_job(
    resume: dict,
    job: dict,
    weights: dict | None = None,
) -> dict:
    """Full multi-factor scoring with safe type handling."""
    w = {**DEFAULT_WEIGHTS, **(weights or {})}

    resume_text = build_resume_text(resume)
    job_text    = build_job_text(job)

    if not resume_text.strip() or not job_text.strip():
        logger.warning("Empty resume or job text — returning zero scores")
        return _zero_result()

    # ── 1. TF-IDF ─────────────────────────────────────────────────────────────
    try:
        tfidf_engine = SklearnTFIDFEngine(max_features=6000, ngram_range=(1, 2))
        tfidf_engine.fit([resume_text, job_text])
        tfidf_score = _safe_float(tfidf_engine.similarity(resume_text, job_text))
    except Exception as e:
        logger.warning(f"TF-IDF failed: {e}")
        tfidf_score = 0.0

    # ── 2. Skills ─────────────────────────────────────────────────────────────
    resume_skills = resume.get("skills", []) or []
    if isinstance(resume_skills, str):
        resume_skills = parse_skill_list(resume_skills)
    if len(resume_skills) < 3:
        resume_skills = list(resume_skills) + extract_skills_from_text(resume_text)

    job_skills = job.get("requiredSkills", []) or []
    if isinstance(job_skills, str):
        job_skills = parse_skill_list(job_skills)
    if not job_skills:
        job_skills = extract_skills_from_text(job_text)

    try:
        skill_result = compute_skill_match(resume_skills, job_skills)
    except Exception as e:
        logger.warning(f"Skill match failed: {e}")
        skill_result = {"matched": [], "missing": list(job_skills), "extra_skills": [],
                       "exact_matched": [], "fuzzy_matched": [], "fuzzy_score": 0,
                       "coverage_pct": 0, "category_coverage": {},
                       "resume_skill_count": 0, "job_skill_count": len(job_skills)}

    raw_skill_pct = _safe_float(skill_result.get("fuzzy_score", 0))
    skills_score  = _calibrate_skill_score(raw_skill_pct, skill_result.get("job_skill_count", 0))

    # ── 3. Education / Experience ──────────────────────────────────────────────
    edu_result = score_education(resume.get("education") or [], job.get("educationalRequirements") or "")
    exp_result = score_experience(resume.get("experience") or [], job.get("experienceRequirement") or "")

    # ── 4. Semantic ────────────────────────────────────────────────────────────
    try:
        sem_result = semantic_score(resume_text, job_text)
        semantic   = _safe_float(sem_result.get("score", 0))
    except Exception as e:
        logger.warning(f"Semantic scoring failed: {e}")
        sem_result = {"score": tfidf_score * 0.8, "engine": "error-fallback",
                      "doc_score": 0, "sentence_score": 0, "top_sentence_pairs": []}
        semantic   = tfidf_score * 0.8

    # ── Weighted total ──────────────────────────────────────────────────────────
    overall = (
        skills_score              * w["skills"] +
        semantic                  * w["semantic"] +
        tfidf_score               * w["tfidf"] +
        _safe_float(exp_result.get("score", 0)) * w["experience"] +
        _safe_float(edu_result.get("score", 0)) * w["education"]
    )
    overall = round(min(100.0, max(0.0, overall)), 1)

    scores_dict = {
        "overall":    overall,
        "skills":     skills_score,
        "semantic":   semantic,
        "tfidf":      tfidf_score,
        "education":  edu_result.get("score", 0),
        "experience": exp_result.get("score", 0),
    }
    explanation = generate_explanation(scores_dict, skill_result, edu_result, exp_result, sem_result)

    try:
        top_features = tfidf_engine.get_top_features(resume_text, 10)
    except Exception:
        top_features = []

    return {
        "overall_score":   overall,
        "score_band":      explanation["score_band"],
        "recommendation":  explanation["action"],

        "component_scores": {
            "skills_match": round(_safe_float(skills_score), 1),
            "semantic":     round(_safe_float(semantic), 1),
            "tfidf_cosine": round(_safe_float(tfidf_score), 1),
            "education":    int(_safe_float(edu_result.get("score", 0))),
            "experience":   int(_safe_float(exp_result.get("score", 0))),
        },

        "weights_used": {k: f"{v*100:.0f}%" for k, v in w.items()},

        "skills_detail": {
            "matched":          skill_result.get("matched", []),
            "missing":          skill_result.get("missing", []),
            "extra_skills":     skill_result.get("extra_skills", []),
            "exact_matched":    skill_result.get("exact_matched", []),
            "fuzzy_matched":    skill_result.get("fuzzy_matched", []),
            "coverage_pct":     round(_safe_float(raw_skill_pct), 1),
            "calibrated_score": round(_safe_float(skills_score), 1),
            "category_coverage": skill_result.get("category_coverage", {}),
        },

        "education_detail": edu_result,
        "experience_detail": exp_result,

        "semantic_detail": {
            "engine":             sem_result.get("engine", "unknown"),
            "doc_score":          round(_safe_float(sem_result.get("doc_score", 0)), 1),
            "sentence_score":     round(_safe_float(sem_result.get("sentence_score", 0)), 1),
            "top_sentence_pairs": sem_result.get("top_sentence_pairs", [])[:3],
        },

        "top_tfidf_features": top_features,
        "explanation": explanation,
    }


def _zero_result() -> dict:
    """Return a zero-score result for empty inputs."""
    return {
        "overall_score": 0, "score_band": "very_poor",
        "recommendation": "⛔ Insufficient data to score.",
        "component_scores": {"skills_match": 0, "semantic": 0, "tfidf_cosine": 0, "education": 0, "experience": 0},
        "weights_used": {k: f"{v*100:.0f}%" for k, v in DEFAULT_WEIGHTS.items()},
        "skills_detail": {"matched": [], "missing": [], "extra_skills": [], "exact_matched": [],
                         "fuzzy_matched": [], "coverage_pct": 0, "calibrated_score": 0, "category_coverage": {}},
        "education_detail": {"score": 0, "verdict": "No data"},
        "experience_detail": {"score": 0, "verdict": "No data"},
        "semantic_detail": {"engine": "none", "doc_score": 0, "sentence_score": 0, "top_sentence_pairs": []},
        "top_tfidf_features": [],
        "explanation": {"action": "⛔ No data", "breakdown": [], "score_band": "very_poor", "weak_categories": []},
    }


def batch_score_and_rank(resumes: list, job: dict) -> list:
    """Score and rank all resumes. Safe, no FAISS crash on error."""
    if not resumes:
        return []

    resume_texts = [build_resume_text(r) for r in resumes]
    job_text     = build_job_text(job)

    try:
        faiss_ranking  = faiss_rank_resumes(job_text, resume_texts)
        faiss_score_map = {idx: score for idx, score in faiss_ranking}
    except Exception as e:
        logger.warning(f"FAISS ranking skipped: {e}")
        faiss_score_map = {}

    results = []
    for i, resume in enumerate(resumes):
        try:
            score_data = score_resume_against_job(resume, job)
        except Exception as e:
            logger.error(f"Scoring failed for resume {i}: {e}")
            score_data = _zero_result()

        faiss_signal = _safe_float(faiss_score_map.get(i, 0))
        blended = score_data["overall_score"] * 0.90 + faiss_signal * 0.10
        score_data["overall_score"] = round(min(100.0, blended), 1)
        score_data["resume_index"]  = i
        score_data["faiss_score"]   = round(faiss_signal, 2)
        score_data["candidate_name"] = (
            resume.get("candidateName") or resume.get("candidate_name") or f"Candidate {i+1}"
        )
        score_data["resume_id"] = str(resume.get("_id", i))
        results.append(score_data)

    results.sort(key=lambda x: (x["overall_score"], x["component_scores"].get("semantic", 0)), reverse=True)
    for rank, r in enumerate(results, 1):
        r["rank"] = rank

    return results
