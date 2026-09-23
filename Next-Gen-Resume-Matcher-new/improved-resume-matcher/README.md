# Next-Gen Resume Matcher v2.0 (Improved)

AI-powered resume screening system with semantic matching, explainable AI, and FAISS-based ranking.

---

## What Was Fixed & Improved

### 1. NLP Matching Accuracy (Major Upgrade)
| Before | After |
|--------|-------|
| Bigram Jaccard approximation for "semantic" score | Sentence-Transformers (`all-MiniLM-L6-v2`) real embeddings |
| No FAISS | FAISS flat index for fast nearest-neighbour batch ranking |
| Manual BM25 only for ranking | FAISS pre-rank + BM25 + multi-factor blend |
| No sentence-level matching | Sentence-pair alignment with top-5 matching pairs |

### 2. Explainable AI (New)
- `/nlp/explain` endpoint returns a human-readable breakdown of every score component
- Each match now includes `explanation.breakdown` — a list of ✅/⚠️/❌ bullets explaining *why* the score is what it is
- Top matching sentence pairs shown (from resume ↔ job description)

### 3. CORS Fix
- **Before**: Manual `after_request` CORS headers with a subtle origin-matching bug
- **After**: `flask-cors` properly configured; no more mysterious CORS failures in dev

### 4. Frontend–Backend Integration
- `vite.config.js` now has the `/api` proxy configured correctly (dev CORS resolved)
- Single `api.js` service with all endpoints (removed duplicate `apiServices.js` confusion)
- New `nlpAPI.semantic()` and `nlpAPI.explain()` methods

### 5. Experience Date Parsing
- **Before**: Only parsed 4-digit year, causing `end_month` calculation errors
- **After**: Handles `YYYY-MM`, `MM/YYYY`, `March 2021`, `present/current`, year-only — all correctly

### 6. Auth Middleware
- Duplicate `authMiddleware.js` and `auth.js` unified into one consistent file

### 7. Code Quality
- Proper `logging` module in Flask (replaces bare `print`)
- Type hints throughout Python code
- `require_fields()` validation helper in Flask
- Rate limiting (`express-rate-limit`) on Node.js backend
- Graceful SIGTERM shutdown in Node.js

---

## Architecture

```
┌─────────────────┐     HTTP/JSON      ┌──────────────────────┐
│  React Frontend │ ─────────────────► │  Node.js Backend     │
│  (Vite, port    │ ◄───────────────── │  (Express, port 5000)│
│   5173)         │                    │                      │
└─────────────────┘                    │  - Auth (JWT)        │
                                       │  - MongoDB ORM       │
                                       │  - File upload       │
                                       │  - NLP proxy         │
                                       └──────────┬───────────┘
                                                  │ HTTP/JSON
                                                  ▼
                                       ┌──────────────────────┐
                                       │  Python NLP Service  │
                                       │  (Flask, port 5001)  │
                                       │                      │
                                       │  - Sentence-Trans.   │
                                       │  - FAISS index       │
                                       │  - TF-IDF engine     │
                                       │  - Skills taxonomy   │
                                       │  - Explainable AI    │
                                       └──────────────────────┘
```

---

## Quick Start

```bash
# Clone / unzip the project
cd next-gen-resume-matcher

# Start everything (creates venv, installs deps, launches all 3 services)
bash start.sh
```

Open http://localhost:5173

---

## Manual Setup

### Python NLP Service
```bas
cd nlp-service
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt  # includes sentence-transformers + faiss-cpu
cp .env.example .env
python app.py
```

### Node.js Backend
```bash
cd backend
cp .env.example .env
# Edit .env: set MONGO_URI and JWT_SECRET
npm install
npm run dev
```

### React Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables

### backend/.env
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/resume-matcher
JWT_SECRET=your_secret_key
FRONTEND_URL=http://localhost:5173
NLP_SERVICE_URL=http://localhost:5001
NLP_TIMEOUT_MS=30000
```

### nlp-service/.env
```env
FLASK_PORT=5001
FLASK_DEBUG=true
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## API Reference (NLP Service)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service status + engine info |
| POST | `/nlp/preprocess` | Full NLP pipeline on text |
| POST | `/nlp/tfidf/similarity` | TF-IDF cosine similarity |
| POST | `/nlp/tfidf/all-metrics` | All similarity metrics |
| POST | `/nlp/skills/extract` | Extract skills from text |
| POST | `/nlp/skills/match` | Match resume vs job skills |
| POST | `/nlp/semantic` | **NEW** Sentence-Transformers scoring |
| POST | `/nlp/score` | Full multi-factor resume score |
| POST | `/nlp/explain` | **NEW** Explainable AI scoring |
| POST | `/nlp/rank` | Batch rank resumes for a job |
| POST | `/nlp/pipeline` | Full pipeline demo |
| GET | `/nlp/eda` | Dataset EDA |

---

## Scoring Weights

| Component | Weight | Engine |
|-----------|--------|--------|
| Skills Match | 38% | Taxonomy + fuzzy |
| Semantic | 22% | Sentence-Transformers / TF-IDF fallback |
| TF-IDF Cosine | 18% | sklearn TfidfVectorizer |
| Experience | 12% | Rule-based date parser |
| Education | 10% | Degree hierarchy |

---

## Memory-Constrained Deployment

If Sentence-Transformers is too heavy (< 2GB RAM):
1. Remove `sentence-transformers` and `faiss-cpu` from `requirements.txt`
2. The system automatically falls back to TF-IDF approximation
3. All endpoints remain functional — just less accurate semantic scores

---

## v3 Deep Fixes (This Version)

### Problem 1: Inaccurate matching scores
**Root cause**: TF-IDF engine had `min_df=2` for pair scoring (needs `min_df=1`), and skill scoring used a linear penalty that was too harsh for partial matches.
**Fix**: Dynamic `min_df` (1 for pairs, 2+ for batch). Introduced sqrt-curve skill calibration — missing 1/1 = 0, missing 1/10 = ~90.

### Problem 2: No semantic similarity
**Root cause**: "Semantic" score in v1 was actually Bigram Jaccard — pure keyword overlap.
**Fix**: Sentence-Transformers (`all-MiniLM-L6-v2`) for genuine semantic embeddings. FAISS index for fast batch comparison. Graceful TF-IDF fallback.

### Problem 3: Keyword variations missed ("ML" vs "Machine Learning")
**Root cause**: Skills matcher had ~40 aliases, no synonym groups, substring fuzzy matching was too loose (false positives) or missed things.
**Fix**: 200+ aliases, 40+ synonym equivalence groups, SequenceMatcher edit-distance (ratio ≥ 0.82), context-aware extraction with alias pre-expansion in text.

### Problem 4: Cannot compare multiple resumes efficiently
**Root cause**: No comparison UI existed in the Results page.
**Fix**: Compare Mode toggle — select 2-4 candidates, see side-by-side table with per-metric bars, matched/missing skills, winner highlighted.

### Problem 5: Unreliable ranking
**Root cause**: 3 issues — (a) stopword list removed meaningful resume verbs ("work", "use", "build"), (b) education overweighted at 10% (rarely decisive), (c) no tie-breaking on semantic score.
**Fix**: Conservative stopword list (only true function words), recalibrated weights (semantic 28%, skills 35%, tfidf 20%, exp 10%, edu 7%), semantic score as tie-break in batch ranking.
