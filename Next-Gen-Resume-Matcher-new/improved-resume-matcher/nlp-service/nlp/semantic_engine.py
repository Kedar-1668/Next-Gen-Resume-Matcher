"""
semantic_engine.py  (v4 - Robust Fallback)
─────────────────────────────────────────────
Fixes:
  1. Import errors are caught per-package (faiss may be missing even if ST installed)
  2. TF-IDF fallback uses the already-fixed SklearnTFIDFEngine (min_df=1)
  3. All scores guaranteed float (never None)
  4. sentence_level_match returns safe empty result when embeddings unavailable
"""
from __future__ import annotations

import hashlib
import logging
from typing import List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


_DIM           = 384   # all-MiniLM-L6-v2 default
_FAISS_AVAILABLE = False
from app import SEMANTIC_MODEL



try:
  
    _MODEL = SEMANTIC_MODEL
    print("MODEL LOADED SUCCESSFULLY")
    print(_MODEL)
    _DIM   = _MODEL.get_sentence_embedding_dimension()
    logger.info("✅ Sentence-Transformers loaded")
    try:
        import faiss as _faiss
        _FAISS_AVAILABLE = True
        logger.info("✅ FAISS loaded")
    except ImportError:
        logger.warning("⚠️  FAISS not installed — using numpy for similarity")
        _faiss = None
except Exception as _e:
    print("SEMANTIC MODEL LOAD FAILED:", str(_e))
    logger.warning(
        f"⚠️ Sentence-Transformers unavailable ({_e}) — TF-IDF fallback active"
    )

# ─── Embedding cache ──────────────────────────────────────────────────────────
_CACHE: dict[str, np.ndarray] = {}
_CACHE_MAX = 1024


def _key(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def _embed(text: str) -> np.ndarray | None:
    if _MODEL is None:
        return None
    k = _key(text)
    if k not in _CACHE:
        if len(_CACHE) >= _CACHE_MAX:
            for old in list(_CACHE.keys())[:_CACHE_MAX // 4]:
                del _CACHE[old]
        vec = _MODEL.encode(text, normalize_embeddings=True, show_progress_bar=False)
        _CACHE[k] = vec.astype("float32")
    return _CACHE[k]


def _embed_batch(texts: List[str]) -> np.ndarray | None:
    if _MODEL is None:
        return None
    vecs = _MODEL.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
    return vecs.astype("float32")


# ─── Sentence splitter ────────────────────────────────────────────────────────
import re as _re

def _sentences(text: str) -> List[str]:
    parts = _re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p.strip() for p in parts if len(p.strip()) > 15]


# ─── Sentence-level matching ──────────────────────────────────────────────────
def sentence_level_match(resume_text: str, job_text: str, top_k: int = 5) -> dict:
    empty = {"pairs": [], "avg_score": 0.0, "engine": "unavailable"}
    if _MODEL is None:
        return empty

    r_sents = _sentences(resume_text)[:40]
    j_sents = _sentences(job_text)[:30]
    if not r_sents or not j_sents:
        return empty

    try:
        r_vecs = _embed_batch(r_sents)
        j_vecs = _embed_batch(j_sents)

        if _FAISS_AVAILABLE and _faiss is not None:
            index = _faiss.IndexFlatIP(_DIM)
            index.add(r_vecs)
            scores_matrix, indices_matrix = index.search(j_vecs, min(top_k, len(r_sents)))
        else:
            # Numpy fallback: dot product (unit-norm vectors → cosine)
            scores_matrix  = j_vecs @ r_vecs.T            # (J, R)
            indices_matrix = np.argsort(-scores_matrix, axis=1)[:, :top_k]
            scores_matrix  = np.sort(-scores_matrix, axis=1)[:, :top_k] * -1

        pairs = []
        seen  = set()
        for j_idx, (score_row, idx_row) in enumerate(zip(scores_matrix, indices_matrix)):
            for score, r_idx in zip(score_row, idx_row):
                key = (int(r_idx), j_idx)
                if key not in seen and float(score) > 0.20:
                    seen.add(key)
                    pairs.append({
                        "resume_sentence": r_sents[int(r_idx)],
                        "job_sentence":    j_sents[j_idx],
                        "score":           round(float(score) * 100, 2),
                    })

        pairs.sort(key=lambda x: x["score"], reverse=True)
        avg = round(float(np.mean([p["score"] for p in pairs[:top_k]])) if pairs else 0, 2)
        engine = "sentence-transformers+faiss" if _FAISS_AVAILABLE else "sentence-transformers+numpy"

        return {"pairs": pairs[:top_k], "avg_score": avg, "engine": engine}
    except Exception as exc:
        logger.warning(f"sentence_level_match failed: {exc}")
        return empty


# ─── Main semantic score ──────────────────────────────────────────────────────
def semantic_score(resume_text: str, job_text: str) -> dict:
    """
    Semantic similarity. Falls back to TF-IDF if embeddings unavailable.
    Guaranteed to return a dict with 'score' as float.
    """
    if _MODEL is not None:
        try:
            r_vec = _embed((resume_text or "")[:3000])
            j_vec = _embed((job_text or "")[:3000])
            if r_vec is not None and j_vec is not None:
                doc_score = float(np.dot(r_vec, j_vec)) * 100

                sent = sentence_level_match(resume_text, job_text, top_k=5)
                blended = doc_score * 0.6 + sent["avg_score"] * 0.4

                return {
                    "score":              round(max(0.0, min(100.0, blended)), 2),
                    "doc_score":          round(doc_score, 2),
                    "sentence_score":     sent["avg_score"],
                    "top_sentence_pairs": sent["pairs"],
                    "engine":             sent["engine"],
                }
        except Exception as exc:
            logger.warning(f"Semantic embedding failed: {exc}")

    # TF-IDF fallback
    try:
        from nlp.tfidf_engine import SklearnTFIDFEngine
        engine = SklearnTFIDFEngine()
        engine.fit([resume_text or "", job_text or ""])
        score = float(engine.similarity(resume_text or "", job_text or "")) * 0.85
        return {
            "score":              round(max(0.0, min(100.0, score)), 2),
            "doc_score":          round(score, 2),
            "sentence_score":     0.0,
            "top_sentence_pairs": [],
            "engine":             "tfidf-fallback",
        }
    except Exception as exc:
        logger.error(f"TF-IDF fallback also failed: {exc}")
        return {
            "score": 0.0, "doc_score": 0.0, "sentence_score": 0.0,
            "top_sentence_pairs": [], "engine": "error",
        }


# ─── FAISS batch ranking ──────────────────────────────────────────────────────
def faiss_rank_resumes(job_text: str, resume_texts: List[str]) -> List[Tuple[int, float]]:
    if _MODEL is not None and resume_texts:
        try:
            j_vec  = _embed((job_text or "")[:3000]).reshape(1, -1)
            r_vecs = _embed_batch([(t or "")[:3000] for t in resume_texts])

            if _FAISS_AVAILABLE and _faiss is not None:
                index = _faiss.IndexFlatIP(_DIM)
                index.add(r_vecs)
                scores, indices = index.search(j_vec, len(resume_texts))
                return [(int(idx), round(float(s) * 100, 2))
                        for s, idx in zip(scores[0], indices[0]) if idx >= 0]
            else:
                # Numpy fallback
                scores = (j_vec @ r_vecs.T)[0]
                ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
                return [(int(i), round(float(s) * 100, 2)) for i, s in ranked]
        except Exception as exc:
            logger.warning(f"faiss_rank_resumes failed: {exc}")

    # TF-IDF ranking fallback
    try:
        from nlp.tfidf_engine import SklearnTFIDFEngine
        engine = SklearnTFIDFEngine()
        engine.fit([job_text or ""] + [t or "" for t in resume_texts])
        return engine.rank_against_query(job_text or "", resume_texts)
    except Exception as exc:
        logger.error(f"Ranking fallback failed: {exc}")
        return [(i, 0.0) for i in range(len(resume_texts))]
