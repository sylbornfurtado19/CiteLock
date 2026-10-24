# CiteLock

Self-Correcting RAG and Hallucination Auditor.

Status: Production-hardened with full transaction rollback safety, background task error states, cascading deletion, type-aware numeric verification, and automated end-to-end integration test coverage. Evaluation results await execution of a reproducible benchmark suite.

CiteLock is a retrieval-augmented generation (RAG) platform that audits AI-generated answers against trusted source documents. It decomposes draft answers into verifiable atomic claims, scores each claim with provenance tracking and structured verification judges, and self-corrects unsupported or contradictory statements before returning the answer to the user.

---

## Core Pipeline Features

1. **Evidence-Grounded Synthesis**: LLM generation grounded strictly in retrieved context passages with honest disclaimers for missing context.
2. **Atomic Claim Extraction**: Validated structured output extracting standalone verifiable atomic assertions with sentence-level fallbacks.
3. **Multi-Verdict Verification Judge**: Structured verdicts (`supported`, `partially_supported`, `contradicted`, `unsupported`, `insufficient_evidence`) with token-level provenance span offsets.
4. **Type-Aware Numeric Checking**: Distinguishes currency, percentages, 4-digit years/dates, scaled quantities, and counts without false contradictions.
5. **Bounded Self-Correction Loop**: Multi-pass iterative correction that critiques failed claims, regenerates targeted revisions, and re-verifies claims until resolved or cleanly abstained.
6. **Transaction Safety & Cascade Deletion**: Full atomic database rollback hooks preventing orphaned queries/claims; chunk ID pre-validation; foreign key cascading on document/chunk deletion.
7. **Document Ingestion & Robust Error States**: Asynchronous background worker and synchronous endpoints for PDF, DOCX, and TXT with structured logging and explicit `uploaded -> processing -> indexed/failed` state transitions.
8. **Relational Persistence & Auditing**: Relational storage for queries, answers, claims, evidence links, and verification runs, with workspace-isolated audit history and real-time analytics.
9. **Production Security**: Strict opt-in dev authentication (`ALLOW_DEV_AUTH=true` only in `ENVIRONMENT=development`), server-side credential isolation, and prompt-injection security policies.

---

## Architecture Overview

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS (Vercel)
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (Docker on Render)
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
│   ├── app/
│   └── tests/
│       ├── unit/
│       └── integration/
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

### 3. Run Backend & Migrations

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

### 4. Run Automated Backend Tests

```bash
cd backend
pytest -v
```

### 5. Run Frontend

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
