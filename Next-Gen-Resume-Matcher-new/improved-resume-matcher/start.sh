#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — Launch all three services
# Usage: bash start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "🚀 Next-Gen Resume Matcher v2.0 — Starting all services"
echo "══════════════════════════════════════════════════════"

# ─── 1. Python NLP Service ────────────────────────────────────────────────────
echo ""
echo "📦 [1/3] Starting Python NLP Service (port 5001)..."
cd "$ROOT/nlp-service"

if [ ! -d ".venv" ]; then
  echo "   Creating virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

# Copy env if missing
[ ! -f .env ] && cp .env.example .env

python app.py &
NLP_PID=$!
echo "   ✅ NLP Service started (PID $NLP_PID)"

# ─── 2. Node.js Backend ───────────────────────────────────────────────────────
echo ""
echo "📦 [2/3] Starting Node.js Backend (port 5000)..."
cd "$ROOT/backend"
[ ! -f .env ] && cp .env.example .env

if [ ! -d "node_modules" ]; then
  echo "   Installing dependencies..."
  npm install --silent
fi

npm run dev &
BACKEND_PID=$!
echo "   ✅ Backend started (PID $BACKEND_PID)"

# ─── 3. React Frontend ───────────────────────────────────────────────────────
echo ""
echo "📦 [3/3] Starting React Frontend (port 5173)..."
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "   Installing dependencies..."
  npm install --silent
fi

npm run dev &
FRONTEND_PID=$!
echo "   ✅ Frontend started (PID $FRONTEND_PID)"

echo ""
echo "══════════════════════════════════════════════════════"
echo "🌐 Frontend:    http://localhost:5173"
echo "🔧 Backend API: http://localhost:5000/api"
echo "🐍 NLP Service: http://localhost:5001/health"
echo "══════════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for any process to exit
wait -n $NLP_PID $BACKEND_PID $FRONTEND_PID
echo "A service exited. Stopping all..."
kill $NLP_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null
