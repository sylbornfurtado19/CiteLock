#!/usr/bin/env bash
# Start CiteLock development environment (backend + frontend)

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$DIR"

echo "=========================================="
echo " Starting CiteLock Local Development Suite"
echo "=========================================="

# 1. Check if Docker is available
if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo "Starting local PostgreSQL via docker compose..."
    docker compose up -d postgres 2>/dev/null || true
else
    echo "Docker not running. Backend will automatically use local SQLite fallback store."
fi

# 2. Ensure backend .env exists
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env from defaults..."
    cp backend/.env.example backend/.env
fi

# 3. Ensure frontend .env.local exists
if [ ! -f "frontend/.env.local" ]; then
    echo "Creating frontend/.env.local..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local
fi

# Trap to kill background processes on exit
cleanup() {
    echo ""
    echo "Shutting down CiteLock development services..."
    kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 4. Start Backend
echo "Starting FastAPI backend on http://localhost:8000..."
(
    cd backend
    source .venv/bin/activate
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
) &

# 5. Wait for backend health endpoint to respond
echo "Waiting for backend service to become ready..."
for i in {1..15}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "Backend is operational on http://localhost:8000"
        break
    fi
    sleep 1
done

# 6. Start Frontend
echo "Starting Next.js frontend on http://localhost:3000..."
(
    cd frontend
    npm run dev
) &

wait
