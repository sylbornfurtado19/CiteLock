# CiteLock

Self-Correcting RAG and Hallucination Auditor.

CiteLock is an enterprise-grade retrieval-augmented generation (RAG) platform that audits AI-generated answers against trusted source documents in real time. It decomposes draft answers into verifiable atomic claims, scores each claim with rigorous provenance tracking and structured verification judges, and self-corrects unsupported or contradictory statements before returning the answer to the user.

---

## Architecture Overview

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS (Vercel)
- **Backend**: Python 3.11, FastAPI, SQLAlchemy 2.0 (Docker on Render)
- **Database**: Neon Postgres with `pgvector` for relational and vector data
- **Authentication**: Firebase Authentication (ID token verified via `firebase-admin` on FastAPI)
- **Storage**: Firebase Cloud Storage (private bucket, accessed exclusively via backend signed URLs)
- **Model Providers**: OpenAI / Google Gemini via abstraction interfaces (no local torch/sentence-transformers for RAM efficiency)

---

## Directory Structure

```text
citelock/
├── README.md
├── .gitignore
├── docker-compose.yml
├── firebase.json
├── storage.rules
├── render.yaml
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── limitations.md
├── scripts/
│   ├── dev.sh
│   └── seed.sh
├── backend/
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── alembic/
│   └── app/
└── frontend/
    ├── package.json
    ├── next.config.ts
    └── src/
```

---

## Quickstart

### Prerequisites

- Node.js >= 18.18.0
- Python >= 3.11
- Docker & Docker Compose (optional for local Postgres+pgvector)

### 1. Environment Setup

Copy example environments for both services:

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
```

### 2. Run Local Postgres & Vector DB (Docker)

```bash
docker compose up -d postgres
```

### 3. Run Backend

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Health check: [http://localhost:8000/health](http://localhost:8000/health)
Interactive API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend application: [http://localhost:3000](http://localhost:3000)

---

## Deployment

- **Frontend**: Connect repository to [Vercel](https://vercel.com). Root directory: `frontend`.
- **Backend**: Deploy on [Render](https://render.com) using the root `render.yaml` blueprint.
- **Storage Rules**: Run `firebase deploy --only storage` to enforce private bucket security.
