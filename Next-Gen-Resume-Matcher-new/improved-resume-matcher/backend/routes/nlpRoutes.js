/**
 * nlpRoutes.js  (IMPROVED)
 * ─────────────────────────
 * Proxy routes: Node.js backend → Python Flask NLP microservice.
 *
 * Fixes over original:
 *   1. Added /explain (XAI) and /semantic (Sentence-Transformers) endpoints
 *   2. Proper timeout handling with AbortSignal
 *   3. Better error messages when NLP service is down
 *   4. Removed broken http import (was unused; now using fetch)
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const asyncHandler = require('express-async-handler');

const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://localhost:5001';
const NLP_TIMEOUT_MS = parseInt(process.env.NLP_TIMEOUT_MS || '30000');

/**
 * Generic proxy: forwards request body/params to Flask NLP service.
 */
function proxyToFlask(flaskPath, options = {}) {
  return asyncHandler(async (req, res) => {
    const url = new URL(NLP_SERVICE_URL + flaskPath);

    if (req.method === 'GET' && req.query) {
      Object.entries(req.query).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const body = req.method !== 'GET' ? JSON.stringify(req.body) : null;

    let flaskRes;
    try {
      flaskRes = await fetch(url.toString(), {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(NLP_TIMEOUT_MS),
      });
    } catch (err) {
      const msg = err.name === 'TimeoutError'
        ? `NLP service timeout after ${NLP_TIMEOUT_MS}ms`
        : `NLP service unavailable: ${err.message}`;
      return res.status(503).json({ success: false, error: msg });
    }

    const data = await flaskRes.json();
    return res.status(flaskRes.status).json(data);
  });
}

// Health check (public — no auth needed)
router.get('/health', proxyToFlask('/health'));

// ─── Preprocessing ─────────────────────────────────────────────────────────
router.post('/preprocess', protect, proxyToFlask('/nlp/preprocess'));

// ─── TF-IDF ────────────────────────────────────────────────────────────────
router.post('/tfidf/similarity', protect, proxyToFlask('/nlp/tfidf/similarity'));
router.post('/tfidf/all-metrics', protect, proxyToFlask('/nlp/tfidf/all-metrics'));

// ─── Skills ────────────────────────────────────────────────────────────────
router.post('/skills/extract', protect, proxyToFlask('/nlp/skills/extract'));
router.post('/skills/match', protect, proxyToFlask('/nlp/skills/match'));

// ─── Semantic (NEW) ─────────────────────────────────────────────────────────
// POST /api/nlp/semantic
router.post('/semantic', protect, proxyToFlask('/nlp/semantic'));

// ─── Scoring ───────────────────────────────────────────────────────────────
router.post('/score', protect, proxyToFlask('/nlp/score'));

// ─── Explain (NEW — Explainable AI) ────────────────────────────────────────
// POST /api/nlp/explain
router.post('/explain', protect, proxyToFlask('/nlp/explain'));

// ─── Batch ranking ─────────────────────────────────────────────────────────
router.post('/rank', protect, proxyToFlask('/nlp/rank'));

// ─── Full pipeline demo ────────────────────────────────────────────────────
router.post('/pipeline', protect, proxyToFlask('/nlp/pipeline'));

// ─── EDA ───────────────────────────────────────────────────────────────────
router.get('/eda', protect, proxyToFlask('/nlp/eda'));
router.get('/eda/skills', protect, proxyToFlask('/nlp/eda/skills'));
router.get('/eda/jobs', protect, proxyToFlask('/nlp/eda/jobs'));
router.get('/dataset/sample', protect, proxyToFlask('/nlp/dataset/sample'));
router.get('/dataset/match-sample', protect, proxyToFlask('/nlp/dataset/match-sample'));

module.exports = router;
