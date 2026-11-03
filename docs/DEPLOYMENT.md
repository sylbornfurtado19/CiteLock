# CiteLock deployment guide

Frontend on **Vercel**, backend on **Render** (Docker), database on **Neon Postgres + pgvector**, auth and file
storage on **Firebase**. Everything below was checked against the code in this repository; items that can only
be confirmed on the live platforms are listed under "Verify after deploying".

## 1. Environment variables

### Backend (Render -> your service -> Environment)

| Variable | Required | Example / notes |
|---|---|---|
| `ENVIRONMENT` | yes | `production`. Enables strict key validation and disables the dev login bypass. |
| `DATABASE_URL` | yes | Neon URL with the psycopg driver: `postgresql+psycopg://USER:PASS@HOST/DB?sslmode=require` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | yes | Raw service-account JSON (one line) |
| `FIREBASE_STORAGE_BUCKET` | yes | `your-project.firebasestorage.app` |
| `STORAGE_PROVIDER` | yes | `firebase` |
| `LLM_PROVIDER` | yes | `gemini`, `groq`, or `openai` |
| `LLM_API_KEY` | yes | Key for the chosen LLM provider |
| `EMBEDDING_PROVIDER` | yes | `gemini` or `openai` (Groq has no embeddings) |
| `EMBEDDING_API_KEY` | yes | Key for the embedding provider |
| `EMBEDDING_DIM` | no | Default `768`; must match the `chunks.embedding` column (migration 0007) |
| `GEMINI_LLM_MODEL` | if Gemini | A currently available model; Google retires models, check the model list |
| `GROQ_LLM_MODEL` | no | Groq auto-selects a model if the configured one is gone |
| `CORS_ORIGINS` | yes | Comma-separated frontend origins, e.g. `https://your-app.vercel.app` |
| `MAX_CORRECTION_RETRIES` | no | Default 2; capped at 10 in code |
| `PIPELINE_TIMEOUT_SECONDS` | no | Default 300; run budget checked before each graph node |
| `MAX_VERIFICATION_WORKERS` | no | Default 1; raise only with a paid LLM tier |
| `HTTP_READ_TIMEOUT` | no | Default 60 seconds per model call |
| `ALLOW_DEV_AUTH` | no | Leave unset or `false`. It only works when `ENVIRONMENT=development` anyway |

Never commit real values. Rotate any key that has appeared in a chat, log or screenshot.

### Frontend (Vercel -> Project -> Settings -> Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | Backend public URL, `https://citelock-backend.onrender.com` (no trailing slash). The build fails on Vercel without it, and the query streaming client refuses to call `localhost` from a deployed site. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | |

## 2. Deploy the backend on Render

1. Push this repository to GitHub.
2. Render -> **New -> Blueprint** and select the repo (it reads `render.yaml`), or **New -> Web Service** with:
   - Runtime **Docker**, Dockerfile path `backend/Dockerfile`, Docker context `backend`
   - Health check path `/health`
3. Fill in every variable from the backend table. `sync: false` values in `render.yaml` must be entered by hand.
4. Deploy. The container runs `alembic upgrade head` and then Uvicorn on `$PORT`, so migrations (including
   `0008_query_execution_trace`) are applied automatically on every start. In **Logs** look for
   `Running upgrade ... -> 0008_query_execution_trace` on the first deploy and
   `Application startup complete`.
5. Note the service URL (`https://<name>.onrender.com`).

pgvector: migration `0001` runs `CREATE EXTENSION IF NOT EXISTS vector`. On Neon the extension is available to the
default role; if the migration fails on that line, run `CREATE EXTENSION vector;` once in the Neon SQL editor.

Free plan note: the service sleeps when idle and the first request can take about a minute. The frontend shows a
"waking up" message; retry once it is awake.

## 3. Deploy the frontend on Vercel

1. Vercel -> **Add New -> Project** -> import the repo.
2. **Root Directory:** `frontend`. Framework preset: Next.js (build `next build`, defaults are correct).
3. Add the frontend environment variables above for **Production** (and Preview if you use previews).
4. Deploy.
5. Firebase console -> Authentication -> Settings -> **Authorized domains**: add your Vercel domain
   (`your-app.vercel.app` and any custom domain). Without this, sign-in fails.
6. Backend `CORS_ORIGINS`: add the same Vercel origin and redeploy the backend. (`*.vercel.app` origins also pass
   the built-in pattern, but list your real domain explicitly.)

The browser streams queries straight to the backend URL (not through Vercel rewrites), so long-running Server-Sent
Events are not subject to Vercel's rewrite timeouts. Other API calls use the `/api` rewrite configured in
`frontend/next.config.mjs`.

## 4. Verify after deploying

```bash
curl -s https://<backend>/health
# {"status":"ok","service":"citelock-backend","version":"0.1.0"}

curl -s -i -X OPTIONS https://<backend>/api/v1/workspaces \
  -H "Origin: https://<your-app>.vercel.app" -H "Access-Control-Request-Method: GET"
# expect: access-control-allow-origin: https://<your-app>.vercel.app
```

In the app: upload a document, wait for **indexed**, ask a question, and check that
(a) the Execution graph tab fills in node by node, (b) the answer shows the verification summary, and
(c) **Previous queries** reopens the answer and its graph after a page reload.

SSE through the platform proxy cannot be proven from this repository. If events arrive all at once at the end,
check for a proxy or CDN in front of the backend that buffers responses; the backend already sends
`Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, plus a heartbeat comment every 30 seconds.

## 5. Common failures

| Symptom | Cause / fix |
|---|---|
| Build fails: "NEXT_PUBLIC_API_URL is required" | Set it in Vercel before building |
| App says the backend URL is not configured | `NEXT_PUBLIC_API_URL` missing or set to localhost on a deployed site |
| Browser blocks requests (CORS) | Add the exact frontend origin to `CORS_ORIGINS` |
| Sign-in fails | Add the Vercel domain to Firebase Authorized domains |
| "Verification service is temporarily unavailable" | LLM provider outage, rate limit, or retired model; read the Render logs for the provider's message |
| Run stops with "time limit" | Raise `PIPELINE_TIMEOUT_SECONDS` or use a faster model |
| Startup crash about a missing key | `ENVIRONMENT=production` requires `LLM_API_KEY` / `EMBEDDING_API_KEY` |

## 6. Local development

```bash
docker compose up -d postgres
cd backend && pip install -e ".[dev]" && alembic upgrade head && uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev
```

Tests: `cd backend && pytest -q`, `cd frontend && npm test`. The optional live end-to-end test is described in
`frontend/src/lib/e2e.live.test.ts`.
