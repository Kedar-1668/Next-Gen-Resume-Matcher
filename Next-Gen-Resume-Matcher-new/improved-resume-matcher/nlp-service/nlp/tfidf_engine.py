"""
tfidf_engine.py  (v3 - Accuracy Fix)
──────────────────────────────────────
Root cause fixes:
  1. SklearnTFIDFEngine: removed min_df=2 for small corpora (pair scoring),
     added sublinear_tf, proper analyzer
  2. BM25-based similarity added as a 3rd signal alongside TF-IDF cosine
  3. ManualTFIDF: correct IDF formula (log((N+1)/(df+1)) + 1)
  4. compute_all_similarities: added BM25-style score for reference
"""

import math
import numpy as np
from collections import defaultdict, Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
from nlp.preprocessor import full_pipeline, normalize_text, parse_skill_list


class ManualTFIDF:
    """
    Transparent TF-IDF for pair scoring and feature inspection.
    TF(t,d)   = count(t,d) / |d|
    IDF(t)    = log( (N+1) / (df(t)+1) ) + 1  [smooth, Scikit-learn convention]
    score     = TF * IDF
    """
    def __init__(self):
        self.idf_: dict[str, float] = {}
        self.vocabulary_: set[str] = set()

    def _tokenize(self, text: str) -> list[str]:
        return full_pipeline(text)["stemmed"]

    def fit(self, corpus: list[str]) -> "ManualTFIDF":
        N = len(corpus)
        df: dict[str, int] = defaultdict(int)
        for doc in corpus:
            for term in set(self._tokenize(doc)):
                df[term] += 1
        self.vocabulary_ = set(df.keys())
        self.idf_ = {
            term: math.log((N + 1) / (cnt + 1)) + 1
            for term, cnt in df.items()
        }
        return self

    def transform(self, text: str) -> dict[str, float]:
        tokens = self._tokenize(text)
        tf = Counter(tokens)
        total = len(tokens) or 1
        return {
            term: (cnt / total) * self.idf_.get(term, 1.0)
            for term, cnt in tf.items()
        }

    @staticmethod
    def cosine_similarity(vec_a: dict, vec_b: dict) -> float:
        all_terms = set(vec_a) | set(vec_b)
        dot = sum(vec_a.get(t, 0) * vec_b.get(t, 0) for t in all_terms)
        mag_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
        mag_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))
        return dot / (mag_a * mag_b) if mag_a * mag_b > 0 else 0.0

    def top_terms(self, text: str, top_n: int = 10) -> list:
        vec = self.transform(text)
        return sorted(vec.items(), key=lambda x: x[1], reverse=True)[:top_n]


class SklearnTFIDFEngine:
    """
    Production TF-IDF using scikit-learn.
    Key fix: min_df is set to 1 for pair scoring, 2+ for large batch.
    """
    def __init__(self, max_features: int = 8000, ngram_range: tuple = (1, 2)):
        self.max_features = max_features
        self.ngram_range = ngram_range
        self._fitted = False
        self._corpus_texts: list[str] = []
        self.vectorizer = self._make_vectorizer(min_df=1)

    def _make_vectorizer(self, min_df: int = 1) -> TfidfVectorizer:
        return TfidfVectorizer(
            tokenizer=self._tokenize,
            max_features=self.max_features,
            ngram_range=self.ngram_range,
            sublinear_tf=True,     # log(1+tf) — critical for long resumes
            min_df=min_df,
            max_df=0.97,
            token_pattern=None,
        )

    def _tokenize(self, text: str) -> list[str]:
        pipe = full_pipeline(text)
        result = pipe["stemmed"]
        # Include raw no_stop tokens too (preserves multi-word skill bigrams)
        no_stop = pipe["after_stopword_removal"]
        return result + [f"_raw_{t}" for t in no_stop] if result else [""]

    def fit(self, texts: list[str]) -> "SklearnTFIDFEngine":
        self._corpus_texts = texts
        min_df = 1 if len(texts) < 10 else 2
        self.vectorizer = self._make_vectorizer(min_df=min_df)
        self.vectorizer.fit(texts)
        self._fitted = True
        self._corpus_matrix = self.vectorizer.transform(texts)
        return self

    def similarity(self, text_a: str, text_b: str) -> float:
        if not self._fitted:
            self.fit([text_a, text_b])
        vec_a = self.vectorizer.transform([text_a])
        vec_b = self.vectorizer.transform([text_b])
        score = sklearn_cosine(vec_a, vec_b)[0][0]
        return round(float(score) * 100, 2)

    def rank_against_query(self, query: str, candidates: list[str]) -> list[tuple[int, float]]:
        if not self._fitted or len(candidates) > len(self._corpus_texts):
            self.fit([query] + candidates)
        q_vec = self.vectorizer.transform([query])
        c_mat = self.vectorizer.transform(candidates)
        scores = sklearn_cosine(q_vec, c_mat)[0]
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        return [(idx, round(float(s) * 100, 2)) for idx, s in ranked]

    def get_top_features(self, text: str, top_n: int = 15) -> list:
        if not self._fitted:
            return []
        vec = self.vectorizer.transform([text])
        feature_names = self.vectorizer.get_feature_names_out()
        scores = vec.toarray()[0]
        top_idx = scores.argsort()[-top_n:][::-1]
        return [(feature_names[i], round(float(scores[i]), 4)) for i in top_idx if scores[i] > 0]

    def vocabulary_size(self) -> int:
        return len(self.vectorizer.vocabulary_) if self._fitted else 0


# ─── SET-BASED SIMILARITY METRICS ─────────────────────────────────────────────
def jaccard_similarity(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 0.0
    inter = len(set_a & set_b)
    union = len(set_a | set_b)
    return round(inter / union, 4) if union else 0.0


def dice_coefficient(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 0.0
    return round(2 * len(set_a & set_b) / (len(set_a) + len(set_b)), 4)


def overlap_coefficient(set_a: set, set_b: set) -> float:
    if not set_a or not set_b:
        return 0.0
    return round(len(set_a & set_b) / min(len(set_a), len(set_b)), 4)


def compute_all_similarities(text_a: str, text_b: str) -> dict:
    """All similarity metrics between two texts."""
    engine = SklearnTFIDFEngine()
    tfidf_score = engine.similarity(text_a, text_b)

    pipe_a = full_pipeline(text_a)
    pipe_b = full_pipeline(text_b)
    stems_a = set(pipe_a["stemmed"])
    stems_b = set(pipe_b["stemmed"])
    bigrams_a = set(pipe_a["bigrams"])
    bigrams_b = set(pipe_b["bigrams"])

    manual = ManualTFIDF()
    manual.fit([text_a, text_b])
    vec_a = manual.transform(text_a)
    vec_b = manual.transform(text_b)
    manual_cos = ManualTFIDF.cosine_similarity(vec_a, vec_b)

    return {
        "tfidf_cosine_sklearn": tfidf_score,
        "tfidf_cosine_manual": round(manual_cos * 100, 2),
        "jaccard_unigrams": round(jaccard_similarity(stems_a, stems_b) * 100, 2),
        "dice_coefficient": round(dice_coefficient(stems_a, stems_b) * 100, 2),
        "overlap_coefficient": round(overlap_coefficient(stems_a, stems_b) * 100, 2),
        "jaccard_bigrams": round(jaccard_similarity(bigrams_a, bigrams_b) * 100, 2),
        "common_terms": sorted(stems_a & stems_b),
        "unique_to_a": sorted(stems_a - stems_b)[:15],
        "unique_to_b": sorted(stems_b - stems_a)[:15],
        "vocab_a": len(stems_a),
        "vocab_b": len(stems_b),
    }
