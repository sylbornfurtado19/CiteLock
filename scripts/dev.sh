#!/usr/bin/env bash
# Start CiteLock development environment (backend + frontend)

set -e

echo "Starting CiteLock local environment..."

# 1. Start postgres+pgvector container if docker is running
if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo "Starting local PostgreSQL via docker compose..."
    docker compose up -d postgres
else
    echo "Docker is not running or installed. Ensure your local PostgreSQL is available."
fi

# 2. Inform user about backend and frontend commands
echo ""
echo "CiteLock Dev Environment Ready!"
echo "To run backend: cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "To run frontend: cd frontend && npm run dev"
