"""
app.py  (IMPROVED)
──────────────────
Flask NLP Microservice for Next-Gen Resume Matcher.

Improvements over original:
  1. Proper flask-cors usage (no manual CORS headers)
  2. /nlp/explain endpoint — Explainable AI scoring
  3. /nlp/semantic endpoint — Sentence-Transformers scoring
  4. Structured logging
  5. Request validation helpers
  6. Graceful import handling
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import logging
import traceback
import time
import os
from sentence_transformers import SentenceTransformer

SEMANTIC_MODEL = None

try:
    SEMANTIC_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    print("✅ Semantic model preloaded successfully")
except Exception as e:
    print("❌ Semantic model preload failed:", e)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nlp-service")

app = Flask(__name__)

# ─── CORS (proper flask-cors — fixes original manual header bugs) ─────────────
CORS(app, resources={r"/*": {
    "origins": os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://localhost:5000").split(","),
    "supports_credentials": True,
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Requested-With"],
}})


# ─── Response helpers ─────────────────────────────────────────────────────────
def success(data, status=200):
    return jsonify({"success": True, "data": data}), status


def error(message, status=400):
    return jsonify({"success": False, "error": message}), status


def timed(fn, *args, **kwargs):
    t0 = time.time()
    result = fn(*args, **kwargs)
    return result, round((time.time() - t0) * 1000, 1)


def require_fields(body: dict, *fields):
    """Return error response if any field is missing, else None."""
    missing = [f for f in fields if not body.get(f)]
    if missing:
        return error(f"Missing required fields: {', '.join(missing)}")
    return None


# ─── HEALTH ───────────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    # Check if semantic engine is available
    try:
        from nlp.semantic_engine import _FAISS_AVAILABLE
        semantic_engine = "sentence-transformers+faiss" if _FAISS_AVAILABLE else "tfidf-fallback"
    except Exception:
        semantic_engine = "unknown"

    return success({
        "service": "Next-Gen Resume Matcher NLP Service (Improved)",
        "version": "2.0.0",
        "status": "running",
        "semantic_engine": semantic_engine,
        "endpoints": [
            "POST /nlp/preprocess",
            "POST /nlp/tfidf/similarity",
            "POST /nlp/tfidf/all-metrics",
            "POST /nlp/skills/extract",
            "POST /nlp/skills/match",
            "POST /nlp/score",
            "POST /nlp/explain      ← NEW: Explainable AI scoring",
            "POST /nlp/semantic     ← NEW: Sentence-Transformers",
            "POST /nlp/rank",
            "POST /nlp/pipeline",
            "GET  /nlp/eda",
            "GET  /nlp/eda/skills",
            "GET  /nlp/eda/jobs",
            "GET  /nlp/dataset/sample",
        ]
    })


# ─── PREPROCESSING ────────────────────────────────────────────────────────────
@app.route("/nlp/preprocess", methods=["POST"])
def preprocess():
    body = request.get_json(force=True) or {}
    err = require_fields(body, "text")
    if err: return err
    from nlp.preprocessor import full_pipeline
    result, ms = timed(full_pipeline, body["text"], body.get("use_stemming", True))
    result["processing_time_ms"] = ms
    return success(result)


# ─── TF-IDF SIMILARITY ────────────────────────────────────────────────────────
@app.route("/nlp/tfidf/similarity", methods=["POST"])
def tfidf_similarity():
    body = request.get_json(force=True) or {}
    err = require_fields(body, "text_a", "text_b")
    if err: return err
    from nlp.tfidf_engine import SklearnTFIDFEngine, ManualTFIDF
    from nlp.preprocessor import full_pipeline
    text_a, text_b = body["text_a"], body["text_b"]

    engine = SklearnTFIDFEngine()
    sklearn_score, ms = timed(engine.similarity, text_a, text_b)
    manual = ManualTFIDF()
    manual.fit([text_a, text_b])
    vec_a = manual.transform(text_a)
    vec_b = manual.transform(text_b)
    manual_score = round(ManualTFIDF.cosine_similarity(vec_a, vec_b) * 100, 2)

    return success({
        "sklearn_tfidf_cosine": sklearn_score,
        "manual_tfidf_cosine": manual_score,
        "vocabulary_size": engine.vocabulary_size(),
        "top_features_a": engine.get_top_features(text_a, 8),
        "top_features_b": engine.get_top_features(text_b, 8),
        "processing_time_ms": ms,
    })


@app.route("/nlp/tfidf/all-metrics", methods=["POST"])
def all_similarity_metrics():
    body = request.get_json(force=True) or {}
    err = require_fields(body, "text_a", "text_b")
    if err: return err
    from nlp.tfidf_engine import compute_all_similarities
    result, ms = timed(compute_all_similarities, body["text_a"], body["text_b"])
    result["processing_time_ms"] = ms
    return success(result)


# ─── SKILLS ───────────────────────────────────────────────────────────────────
@app.route("/nlp/skills/extract", methods=["POST"])
def extract_skills():
    body = request.get_json(force=True) or {}
    err = require_fields(body, "text")
    if err: return err
    from nlp.skills_matcher import extract_skills_from_text, categorize_skills
    skills, ms = timed(extract_skills_from_text, body["text"])
    return success({
        "extracted_skills": skills,
        "count": len(skills),
        "by_category": categorize_skills(skills),
        "processing_time_ms": ms,
    })


@app.route("/nlp/skills/match", methods=["POST"])
def skills_match():
    body = request.get_json(force=True) or {}
    from nlp.skills_matcher import compute_skill_match
    result, ms = timed(compute_skill_match, body.get("resume_skills", []), body.get("job_skills", []))
    result["processing_time_ms"] = ms
    return success(result)


# ─── SEMANTIC (NEW) ───────────────────────────────────────────────────────────
@app.route("/nlp/semantic", methods=["POST"])
def semantic_endpoint():
    """
    NEW: Sentence-Transformers semantic similarity.
    Body: { "text_a": "...", "text_b": "...", "top_pairs": 5 }
    """
    body = request.get_json(force=True) or {}
    err = require_fields(body, "text_a", "text_b")
    if err: return err

    from nlp.semantic_engine import semantic_score, sentence_level_match
    try:
        result, ms = timed(semantic_score, body["text_a"], body["text_b"])
        pairs_result = sentence_level_match(body["text_a"], body["text_b"], top_k=body.get("top_pairs", 5))
        result["top_sentence_pairs"] = pairs_result["pairs"]
        result["processing_time_ms"] = ms
        return success(result)
    except Exception as e:
        logger.error(f"Semantic error: {e}")
        return error(str(e))


# ─── SCORING ──────────────────────────────────────────────────────────────────
@app.route("/nlp/score", methods=["POST"])
def score_resume():
    body = request.get_json(force=True) or {}
    if not body.get("resume") or not body.get("job"):
        return error("Both 'resume' and 'job' objects are required")
    from nlp.scorer import score_resume_against_job
    try:
        result, ms = timed(score_resume_against_job, body["resume"], body["job"])
        result["processing_time_ms"] = ms
        return success(result)
    except Exception as e:
        logger.error(f"Scoring error: {traceback.format_exc()}")
        return error(f"Scoring error: {str(e)}")


# ─── EXPLAIN (NEW — Explainable AI) ──────────────────────────────────────────
@app.route("/nlp/explain", methods=["POST"])
def explain_score():
    """
    NEW: Explainable AI endpoint.
    Same as /nlp/score but emphasises the explanation fields.
    Body: { "resume": {...}, "job": {...} }
    Returns: score + human-readable breakdown + sentence pair matches.
    """
    body = request.get_json(force=True) or {}
    if not body.get("resume") or not body.get("job"):
        return error("Both 'resume' and 'job' objects are required")
    from nlp.scorer import score_resume_against_job
    try:
        result, ms = timed(score_resume_against_job, body["resume"], body["job"])
        return success({
            "overall_score": result["overall_score"],
            "score_band": result["score_band"],
            "recommendation": result["recommendation"],
            "explanation": result["explanation"],
            "skills_detail": result["skills_detail"],
            "semantic_detail": result["semantic_detail"],
            "education_detail": result["education_detail"],
            "experience_detail": result["experience_detail"],
            "component_scores": result["component_scores"],
            "weights_used": result["weights_used"],
            "processing_time_ms": ms,
        })
    except Exception as e:
        logger.error(traceback.format_exc())
        return error(f"Explanation error: {str(e)}")


# ─── RANKING ──────────────────────────────────────────────────────────────────
@app.route("/nlp/rank", methods=["POST"])
def rank_resumes():
    body = request.get_json(force=True) or {}
    if not body.get("resumes") or not body.get("job"):
        return error("'resumes' list and 'job' object required")
    from nlp.scorer import batch_score_and_rank
    try:
        results, ms = timed(batch_score_and_rank, body["resumes"], body["job"])
        return success({
            "ranked_candidates": results,
            "total": len(results),
            "processing_time_ms": ms,
        })
    except Exception as e:
        logger.error(traceback.format_exc())
        return error(f"Ranking error: {str(e)}")


# ─── FULL PIPELINE ────────────────────────────────────────────────────────────
@app.route("/nlp/pipeline", methods=["POST"])
def full_pipeline_demo():
    body = request.get_json(force=True) or {}
    resume_text = body.get("resume_text", "")
    job_text = body.get("job_text", "")
    if not resume_text:
        return error("'resume_text' is required")

    from nlp.preprocessor import full_pipeline
    from nlp.tfidf_engine import compute_all_similarities, SklearnTFIDFEngine
    from nlp.skills_matcher import extract_skills_from_text, compute_skill_match
    from nlp.semantic_engine import semantic_score

    t0 = time.time()
    resume_pipe = full_pipeline(resume_text)
    job_pipe = full_pipeline(job_text) if job_text else {}
    resume_skills = extract_skills_from_text(resume_text)
    job_skills = extract_skills_from_text(job_text) if job_text else []
    skill_match = compute_skill_match(resume_skills, job_skills) if job_skills else {}
    similarities = compute_all_similarities(resume_text, job_text) if job_text else {}
    semantic = semantic_score(resume_text, job_text) if job_text else {"score": 0, "engine": "none"}
    engine = SklearnTFIDFEngine()
    engine.fit([resume_text, job_text] if job_text else [resume_text, "empty"])
    top_features = engine.get_top_features(resume_text, 12)
    ms = round((time.time() - t0) * 1000, 1)

    return success({
        "stage_1_normalization": {"original_length": len(resume_text), "normalized": resume_pipe.get("normalized", "")},
        "stage_2_tokenization": {"tokens": resume_pipe.get("tokens", [])[:30], "token_count": resume_pipe.get("tokens_count", 0)},
        "stage_3_stopword_removal": {"filtered_tokens": resume_pipe.get("after_stopword_removal", [])[:30], "stopwords_removed": resume_pipe.get("stopwords_removed", 0)},
        "stage_4_lemmatization": {"lemmatized": resume_pipe.get("lemmatized", [])[:30]},
        "stage_5_stemming": {"stemmed": resume_pipe.get("stemmed", [])[:30]},
        "stage_6_ngrams": {"bigrams": resume_pipe.get("bigrams", [])[:15], "trigrams": resume_pipe.get("trigrams", [])[:8]},
        "stage_7_tfidf_features": top_features,
        "stage_8_term_frequency": resume_pipe.get("term_frequency", {}),
        "stage_9_skills_extraction": {"resume_skills": resume_skills, "job_skills": job_skills},
        "stage_10_skill_matching": skill_match,
        "stage_11_similarity_metrics": similarities,
        "stage_12_semantic": {"score": semantic["score"], "engine": semantic.get("engine"), "sentence_pairs": semantic.get("top_sentence_pairs", [])[:3]},
        "vocabulary_metrics": {"unique_terms": resume_pipe.get("unique_terms", 0), "vocabulary_richness": resume_pipe.get("vocabulary_richness", 0)},
        "total_processing_time_ms": ms,
    })


# ─── EDA ──────────────────────────────────────────────────────────────────────
@app.route("/nlp/eda", methods=["GET"])
def eda_full():
    limit = int(request.args.get("limit", 500))
    try:
        from nlp.dataset_loader import full_eda
        result, ms = timed(full_eda, limit)
        result["processing_time_ms"] = ms
        return success(result)
    except Exception as e:
        logger.error(traceback.format_exc())
        return error(str(e))


@app.route("/nlp/eda/skills", methods=["GET"])
def eda_skills():
    limit = int(request.args.get("limit", 1000))
    top_n = int(request.args.get("top_n", 30))
    try:
        from nlp.dataset_loader import load_and_parse, eda_skill_distribution, eda_skill_categories
        data = load_and_parse(limit=limit)
        return success({
            "top_skills": eda_skill_distribution(data, top_n)["top_skills"],
            "by_category": eda_skill_categories(data),
            "total_resumes_analyzed": len(data),
        })
    except Exception as e:
        return error(str(e))


@app.route("/nlp/eda/jobs", methods=["GET"])
def eda_jobs():
    limit = int(request.args.get("limit", 1000))
    try:
        from nlp.dataset_loader import load_and_parse, eda_job_distribution
        data = load_and_parse(limit=limit)
        return success(eda_job_distribution(data, top_n=30))
    except Exception as e:
        return error(str(e))


@app.route("/nlp/dataset/sample", methods=["GET"])
def dataset_sample():
    n = int(request.args.get("n", 3))
    try:
        from nlp.dataset_loader import load_and_parse
        data = load_and_parse(limit=n)
        return success({"samples": data, "count": len(data)})
    except Exception as e:
        return error(str(e))


@app.route("/nlp/dataset/match-sample", methods=["GET"])
def dataset_match_sample():
    n = int(request.args.get("n", 10))
    try:
        from nlp.dataset_loader import load_and_parse
        from nlp.scorer import score_resume_against_job
        data = load_and_parse(limit=n)
        results = []
        for item in data:
            if not item["job"].get("title"):
                continue
            score_data = score_resume_against_job(item["resume"], item["job"])
            results.append({
                "job_title": item["job"]["title"],
                "dataset_score": item["dataset_score"],
                "our_score": score_data["overall_score"],
                "recommendation": score_data["recommendation"],
                "component_scores": score_data["component_scores"],
                "explanation": score_data.get("explanation", {}),
            })
        return success({"comparisons": results, "count": len(results)})
    except Exception as e:
        logger.error(traceback.format_exc())
        return error(str(e))


# ─── ERROR HANDLERS ───────────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return error("Endpoint not found", 404)


@app.errorhandler(500)
def server_error(e):
    logger.error(f"500 error: {e}")
    return error("Internal server error", 500)


if __name__ == "__main__":
    port = int(os.getenv("FLASK_PORT", 5001))
    debug = False
    logger.info(f"🐍 NLP Service v2.0 running on http://localhost:{port}")
 
    app.run(
      host="0.0.0.0",
      port=port,
      debug=debug,
      use_reloader=False
    )
