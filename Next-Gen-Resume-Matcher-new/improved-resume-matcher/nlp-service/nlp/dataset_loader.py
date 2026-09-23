"""
dataset_loader.py
─────────────────
CSV dataset loading, parsing, EDA (exploratory data analysis),
and corpus-level statistics for the Kaggle resume dataset.
"""

import csv
import re
import json
import os
from collections import Counter, defaultdict
from nlp.preprocessor import parse_skill_list, full_pipeline, normalize_text
from nlp.skills_matcher import top_skill_frequencies, normalize_skill, SKILL_TAXONOMY


CSV_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resume_data.csv")


def _safe_list(val):
    if not val or str(val).strip() in ("", "None", "N/A", "[]"):
        return []
    if isinstance(val, list):
        return val
    return parse_skill_list(str(val))


def load_csv(path: str = None, limit: int = None) -> list:
    """Load resume_data.csv and return list of row dicts."""
    path = path or CSV_PATH
    rows = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            if limit and i >= limit:
                break
            rows.append(row)
    return rows


def parse_row(row: dict) -> dict:
    """Parse a single CSV row into a structured resume dict."""
    def _list(key):
        return _safe_list(row.get(key, ""))

    # Find job_position_name (BOM-stripped key)
    job_key = next((k for k in row if "job_position_name" in k.lower()), "job_position_name")
    edu_req_key = next((k for k in row if "educational_requirements" in k.lower() or "educationaL_requirements" in k), "educationaL_requirements")

    skills = _list("skills")
    companies = _list("professional_company_names")
    positions = _list("positions")
    start_dates = _list("start_dates")
    end_dates = _list("end_dates")
    institutions = _list("educational_institution_name")
    degrees = _list("degree_names")
    fields = _list("major_field_of_studies")
    passing_years = _list("passing_years")
    responsibilities = _list("responsibilities")
    languages = _list("languages")
    proficiencies = _list("proficiency_levels")
    cert_providers = _list("certification_providers")
    cert_skills = _list("certification_skills")

    experience = [
        {
            "company": companies[i] if i < len(companies) else "",
            "position": positions[i] if i < len(positions) else "",
            "startDate": start_dates[i] if i < len(start_dates) else "",
            "endDate": end_dates[i] if i < len(end_dates) else "",
            "responsibilities": responsibilities[i:i+3] if responsibilities else [],
        }
        for i in range(max(len(companies), len(positions)))
        if i < len(companies) or i < len(positions)
    ]

    education = [
        {
            "institution": institutions[i] if i < len(institutions) else "",
            "degree": degrees[i] if i < len(degrees) else "",
            "fieldOfStudy": fields[i] if i < len(fields) else "",
            "passingYear": passing_years[i] if i < len(passing_years) else "",
        }
        for i in range(len(institutions))
    ]

    lang_list = [
        {"name": languages[i], "proficiency": proficiencies[i] if i < len(proficiencies) else ""}
        for i in range(len(languages))
    ]

    certs = [
        {"provider": cert_providers[i], "skill": cert_skills[i] if i < len(cert_skills) else ""}
        for i in range(len(cert_providers))
    ]

    # Build raw text for NLP
    raw_text = " ".join(filter(None, [
        row.get("career_objective", ""),
        " ".join(skills),
        " ".join(companies),
        " ".join(positions),
        " ".join(responsibilities),
        row.get("address", ""),
    ]))

    # Job info from same row
    skills_required = _list("skills_required")

    resume = {
        "address": row.get("address", ""),
        "careerObjective": row.get("career_objective", ""),
        "skills": skills,
        "education": education,
        "experience": experience,
        "languages": lang_list,
        "certifications": certs,
        "rawText": raw_text,
    }

    job = {
        "title": row.get(job_key, ""),
        "educationalRequirements": row.get(edu_req_key, ""),
        "experienceRequirement": row.get("experiencere_requirement", ""),
        "ageRequirement": row.get("age_requirement", ""),
        "responsibilities": _list("responsibilities.1") or [row.get("responsibilities.1", "")],
        "requiredSkills": skills_required,
        "description": row.get("responsibilities.1", ""),
    }

    matched_score_raw = row.get("matched_score", "0")
    try:
        matched_score = float(matched_score_raw or 0) * 100
    except ValueError:
        matched_score = 0

    return {"resume": resume, "job": job, "dataset_score": round(matched_score, 1)}


def load_and_parse(limit: int = None) -> list:
    """Load CSV and return list of parsed {resume, job, dataset_score} dicts."""
    rows = load_csv(limit=limit)
    return [parse_row(row) for row in rows]


# ─── EDA FUNCTIONS ────────────────────────────────────────────────────────────
def eda_skill_distribution(data: list, top_n: int = 25) -> dict:
    """Top skills across all resumes."""
    counter = Counter()
    for item in data:
        skills = item["resume"].get("skills", [])
        for s in skills:
            norm = normalize_skill(s)
            if norm:
                counter[norm] += 1
    return {
        "top_skills": [{"skill": s, "count": c} for s, c in counter.most_common(top_n)],
        "total_unique_skills": len(counter),
        "total_skill_mentions": sum(counter.values()),
    }


def eda_skill_categories(data: list) -> dict:
    """Distribution of skills by taxonomy category."""
    cat_counter = Counter()
    for item in data:
        skills = item["resume"].get("skills", [])
        for s in skills:
            norm = normalize_skill(s)
            for cat, cat_skills in SKILL_TAXONOMY.items():
                if norm in cat_skills:
                    cat_counter[cat] += 1
                    break
            else:
                cat_counter["other"] += 1
    return dict(cat_counter.most_common())


def eda_job_distribution(data: list, top_n: int = 20) -> dict:
    """Distribution of job titles."""
    counter = Counter()
    for item in data:
        title = item["job"].get("title", "").strip()
        if title:
            counter[title] += 1
    return {
        "top_jobs": [{"title": t, "count": c} for t, c in counter.most_common(top_n)],
        "unique_jobs": len(counter),
    }


def eda_skills_per_resume(data: list) -> dict:
    """Statistics on skills count per resume."""
    counts = [len(item["resume"].get("skills", [])) for item in data]
    if not counts:
        return {}
    return {
        "mean": round(sum(counts) / len(counts), 2),
        "min": min(counts),
        "max": max(counts),
        "median": sorted(counts)[len(counts) // 2],
        "total_resumes": len(counts),
        "distribution": {
            "0-5": sum(1 for c in counts if c <= 5),
            "6-10": sum(1 for c in counts if 6 <= c <= 10),
            "11-20": sum(1 for c in counts if 11 <= c <= 20),
            "21+": sum(1 for c in counts if c > 20),
        }
    }


def eda_education_distribution(data: list) -> dict:
    """Distribution of degrees across the dataset."""
    counter = Counter()
    for item in data:
        for edu in item["resume"].get("education", []):
            deg = edu.get("degree", "").strip()
            if deg and deg not in ("None", "N/A"):
                counter[deg] += 1
    return {
        "top_degrees": [{"degree": d, "count": c} for d, c in counter.most_common(15)],
        "unique_degrees": len(counter),
    }


def eda_score_distribution(data: list) -> dict:
    """Distribution of dataset match scores."""
    scores = [item["dataset_score"] for item in data if item["dataset_score"] > 0]
    if not scores:
        return {"message": "No scores available"}
    buckets = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for s in scores:
        if s <= 20: buckets["0-20"] += 1
        elif s <= 40: buckets["21-40"] += 1
        elif s <= 60: buckets["41-60"] += 1
        elif s <= 80: buckets["61-80"] += 1
        else: buckets["81-100"] += 1
    return {
        "mean": round(sum(scores) / len(scores), 2),
        "min": round(min(scores), 2),
        "max": round(max(scores), 2),
        "count": len(scores),
        "buckets": buckets,
    }


def eda_text_stats(data: list, sample_size: int = 100) -> dict:
    """NLP text statistics on career objectives."""
    sample = [item["resume"].get("careerObjective", "") for item in data[:sample_size] if item["resume"].get("careerObjective")]
    if not sample:
        return {}
    word_counts = []
    vocab_richness = []
    for text in sample:
        pipe = full_pipeline(text)
        word_counts.append(pipe["tokens_count"])
        vocab_richness.append(pipe["vocabulary_richness"])
    return {
        "sample_size": len(sample),
        "avg_words": round(sum(word_counts) / len(word_counts), 1),
        "avg_vocab_richness": round(sum(vocab_richness) / len(vocab_richness), 3),
        "max_words": max(word_counts),
        "min_words": min(word_counts),
    }


def full_eda(limit: int = 500) -> dict:
    """Run full EDA on the dataset and return all statistics."""
    data = load_and_parse(limit=limit)
    return {
        "dataset_size": len(data),
        "skill_distribution": eda_skill_distribution(data),
        "skill_categories": eda_skill_categories(data),
        "job_distribution": eda_job_distribution(data),
        "skills_per_resume": eda_skills_per_resume(data),
        "education_distribution": eda_education_distribution(data),
        "score_distribution": eda_score_distribution(data),
        "text_stats": eda_text_stats(data),
    }
