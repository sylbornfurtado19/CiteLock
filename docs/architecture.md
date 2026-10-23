# CiteLock Architecture

CiteLock is designed as a secure, decoupled, self-correcting RAG monorepo operating across Vercel, Render, Neon, and Firebase.

## High-Level Topology

```
+-------------------------------------------------------------+
|                      User Browser                           |
+-------------------------------------------------------------+
        |                                       |
  Client UI (Next.js)                    Auth Flow (Firebase Client)
  [Vercel Edge/Server]                          |
        |                                 ID Token JWT
        |                                       |
        v                                       v
+-------------------------------------------------------------+
|                  FastAPI Backend (Render)                   |
|   - Firebase Admin SDK (token verification)                 |
|   - Multipart Document Upload & Validation                  |
|   - Retrieval & Vector Search (pgvector)                    |
|   - Claim Decomposition & LLM Verification Engine           |
|   - Self-Correction Controller                              |
+-------------------------------------------------------------+
        |                  |                       |
        v                  v                       v
+---------------+  +-------------------+  +-------------------+
|  Neon Postgres |  |  Firebase Storage  |  | Model Provider    |
|  - Relational  |  |  (Private Bucket)  |  | APIs              |
|  - pgvector    |  |  - Signed URLs     |  | - OpenAI / Gemini |
+---------------+  +-------------------+  +-------------------+
```

## Data and Auth Flows

### 1. Authentication Flow
1. User logs in on Frontend via Firebase Client SDK (Email/Password or Google Sign-In).
2. Frontend receives Firebase ID Token (JWT).
3. Every API call made by `lib/api.ts` attaches `Authorization: Bearer <ID_TOKEN>`.
4. FastAPI `get_current_user` dependency verifies the ID token using `firebase-admin` without contacting Firebase on every request (cached public key verification).
5. User records are synced or mapped to the internal `users` table via `firebase_uid`.

### 2. Document Upload & Storage Flow
1. User selects file on frontend `UploadDropzone`.
2. Browser sends multipart form data to FastAPI (`POST /api/v1/workspaces/{id}/documents/upload`).
3. Browser has **no direct access** to Firebase Storage (`storage.rules` denies all direct client operations).
4. FastAPI validates MIME type, size, and computes SHA-256 checksum.
5. FastAPI streams file to Firebase Storage under path:
   `workspaces/{workspace_id}/documents/{document_id}/{original_filename}`.
6. Ingestion service parses (PyMuPDF / python-docx), chunks, and computes embeddings via API provider.
7. Relational metadata and chunk embeddings are committed to Neon Postgres with `pgvector`.
8. When user views a document, backend generates a time-limited signed URL (`GET /documents/{id}/file`).

### 3. Query, Audit & Self-Correction Flow
1. User submits query in Chat workspace (`POST /api/v1/workspaces/{id}/queries`).
2. Pipeline orchestrator executes:
   - **Hybrid Retrieval**: Dense vector search (`pgvector`) + lexical keyword retrieval.
   - **Draft Generation**: Initial answer drafted using retrieved chunks.
   - **Claim Extraction**: Answer decomposed into isolated atomic factual claims.
   - **Verification Judge**: Structured LLM evaluation classifying claims into verdicts:
     - `supported`
     - `partially_supported`
     - `contradicted`
     - `unsupported`
     - `insufficient_evidence`
   - **Provenance & Numeric Guard**: Precision matching of figures, quotes, and section offsets.
   - **Correction Controller**: If hallucinations are detected, self-correction prompt triggers up to `MAX_CORRECTION_RETRIES`. If verification still fails, abstention or disclaimer fallback applies.
   - **Persistence**: Draft text, final text, claims, evidence links, and audit events saved to database.
