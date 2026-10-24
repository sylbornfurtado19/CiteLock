# CiteLock Limitations & Operational Constraints

This document outlines key technical trade-offs, infrastructure constraints, and design boundaries for CiteLock.

---

## 1. Cloud Memory Footprint (Render Free Tier)

- **No Local PyTorch / sentence-transformers**:
  Render free tier instances are provisioned with 512MB RAM. Running PyTorch or loading HuggingFace transformer models locally leads to immediate Out-Of-Memory (OOM) process termination.
- **Provider Interface Requirement**:
  All embedding generation (`text-embedding-3-small`, etc.) and LLM evaluations are routed via lightweight HTTP API calls to external providers (e.g. OpenAI, Google Gemini).
- **Lightweight Document Parsing**:
  PDF and DOCX extraction uses `PyMuPDF` (fitz) and `python-docx` streaming rather than heavy optical character recognition (OCR) or deep learning parser pipelines.
- **Scanned PDF Handling & OCR Policy**:
  Scanned PDFs without embedded text layers are detected and marked as `failed` with an explicit reason (`Scanned PDF detected: page contains raster images but no digital text layer. OCR is currently unsupported...`). Silent reporting of success for empty text is strictly forbidden.
- **File Format Scope**:
  Phase 1 supports PDF, DOCX, and TXT files up to `MAX_FILE_SIZE_MB` (default: 25MB). Unsupported formats (e.g., audio, raw images, spreadsheets, presentations) are rejected at the validation layer.
- **Background Processing Model**:
  Ingestion operates asynchronously via FastAPI `BackgroundTasks` to avoid adding heavy task queues (e.g., Celery, Redis) to the 512MB RAM environment. Tasks process in-process; worker restarts during an in-flight upload will leave the document in `processing` state, which can be retried via `POST /workspaces/{id}/documents/{id}/reprocess`.

---

## 2. Verification & Hallucination Scope

- **Closed-Domain Grounding**:
  CiteLock evaluates claims strictly against retrieved chunk context. If a claim is factually true in the real world but missing from the workspace documents, the judge marks it as `unsupported` or `insufficient_evidence`.
- **Granularity of Atomic Claims**:
  Claim decomposition relies on prompt-based LLM parsing. Highly compound sentences may occasionally yield nested subclaims that share dependencies.
- **Numeric & Quantitative Bounds**:
  Financial and technical auditing checks strict value identity, units, and magnitudes. Approximate phrasing (e.g. "nearly $10M" vs "$9.85M") is flagged for user review.

---

## 3. Rate Limits & Self-Correction Bounds

- **Bounded Retries**:
  The self-correction controller enforces `MAX_CORRECTION_RETRIES` (default: 3) to prevent infinite loops and runaway token costs.
- **Abstention Fallback**:
  If a claim cannot be verified or corrected after maximum retries, CiteLock drops the claim or issues an explicit abstention ("The provided sources do not contain sufficient evidence to confirm...").
- **External Provider Latency**:
  Multi-step verification (draft -> decompose -> verify N claims -> correct) incurs cumulative latency proportional to the number of claims.

---

## 4. Multi-Tenancy & Data Security

- **Strict Workspace Scoping**:
  Postgres queries enforce workspace and user ownership filters on every database operation. Cross-workspace vector similarity search is partitioned by `workspace_id`.
- **Private Storage Isolation**:
  Client browsers never read or write directly to Firebase Storage. All access is governed by backend-issued temporary signed URLs or streamed uploads.
