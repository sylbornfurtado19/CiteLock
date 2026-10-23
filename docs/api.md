# CiteLock API Specification

The CiteLock FastAPI backend exposes RESTful endpoints for workspace management, document ingestion, query execution, hallucination auditing, and developer verification.

All protected endpoints require the header:
```http
Authorization: Bearer <firebase_id_token>
```

---

## 1. System & Health

- `GET /health`
  - Unauthenticated health check for Render and monitoring.
  - Returns `{"status": "ok", "environment": "production"}`.

---

## 2. Workspaces

- `GET /api/v1/workspaces`
  - List workspaces accessible to current authenticated user.
- `POST /api/v1/workspaces`
  - Create a new workspace.
  - Body: `{"name": "string", "description": "string"}`
- `GET /api/v1/workspaces/{workspace_id}`
  - Retrieve workspace metadata.

---

## 3. Documents

- `POST /api/v1/workspaces/{workspace_id}/documents/upload`
  - Multipart form upload (`file: UploadFile`).
  - Stores file in private bucket under `workspaces/{workspace_id}/documents/{document_id}/{original_filename}`.
  - Triggers asynchronous parser and pgvector indexing.
- `GET /api/v1/workspaces/{workspace_id}/documents`
  - List documents in workspace.
- `GET /api/v1/workspaces/{workspace_id}/documents/{document_id}/file`
  - Returns temporary signed URL for viewing/downloading the document.
- `DELETE /api/v1/workspaces/{workspace_id}/documents/{document_id}`
  - Deletes document records, chunk embeddings, and storage object.

---

## 4. Queries & Execution

- `POST /api/v1/workspaces/{workspace_id}/queries`
  - Executes retrieval, draft generation, verification, and correction pipeline.
  - Body:
    ```json
    {
      "prompt": "What were the Q3 operational expenditures?",
      "top_k": 5,
      "strictness": "high"
    }
    ```
  - Response includes query ID, final answer, claim verdicts, citations, and correction rounds.

---

## 5. Audits & Analytics

- `GET /api/v1/workspaces/{workspace_id}/audits/{answer_id}`
  - Full audit report for an answer: draft text, final text, atomic claims, evidence links, and correction logs.
- `GET /api/v1/workspaces/{workspace_id}/audits/{answer_id}/export`
  - Exports standardized audit JSON for compliance and benchmarks.
- `GET /api/v1/workspaces/{workspace_id}/analytics`
  - Aggregated metrics: Hallucination rate, verdict distribution, latency, and token consumption.

---

## 6. Developer Verification API

- `POST /api/v1/verify`
  - Direct endpoint to verify any arbitrary text against provided context passages.
  - Useful for external developers testing verification without document ingestion.
