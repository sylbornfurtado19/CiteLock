import json
import logging
import queue
import threading
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query as QueryParam, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import app.db.session
from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import QueryCreate, QueryResponse
from app.pipeline.orchestrator import run_pipeline
from app.services.cache import pipeline_cache_service
from app.security.injection_guard import check_prompt_injection
from app.services.verification.judge import VerificationProviderError
from app.providers.base import ProviderError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/queries", tags=["Queries"])


def _generate_pipeline_sse(workspace_id, prompt: str, top_k: int):
    """Generator executing run_pipeline in worker thread and yielding SSE frames."""
    event_queue: queue.Queue = queue.Queue()

    def worker():
        thread_db = app.db.session.SessionLocal()
        try:
            def on_event(evt):
                event_queue.put(("pipeline_event", evt))

            pipeline_result = run_pipeline(
                db=thread_db,
                workspace_id=workspace_id,
                prompt=prompt,
                top_k=top_k,
                on_event=on_event,
            )

            query_obj = pipeline_result["query"]
            answer_obj = pipeline_result["answer"]

            response_model = QueryResponse(
                query_id=query_obj.id,
                workspace_id=workspace_id,
                prompt=query_obj.prompt,
                answer=answer_obj,
                verification_status=pipeline_result.get("verification_status"),
                execution_metadata=pipeline_result.get("execution_metadata", {}),
            )
            complete_data = json.loads(response_model.model_dump_json())
            event_queue.put(("pipeline_complete", complete_data))
        except (VerificationProviderError, ProviderError) as e:
            logger.error("Provider outage during streaming query: %s", e)
            event_queue.put((
                "pipeline_error",
                {
                    "stage": "verification",
                    "status": "failed",
                    "message": "Verification service is temporarily unavailable. Please try again later.",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            ))
        except Exception as e:
            logger.exception("Pipeline streaming execution failed: %s", e)
            from app.config import get_settings
            detail = (
                f" ({type(e).__name__}: {str(e)[:300]})"
                if get_settings().environment.lower() != "production"
                else ""
            )
            event_queue.put((
                "pipeline_error",
                {
                    "stage": "execution",
                    "status": "failed",
                    "message": f"An internal error occurred while processing the query.{detail}",
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            ))
        finally:
            thread_db.close()
            event_queue.put(("done", None))

    worker_thread = threading.Thread(target=worker, daemon=True)
    worker_thread.start()

    while True:
        try:
            event_type, payload = event_queue.get(timeout=30.0)
        except queue.Empty:
            # Emit SSE heartbeat comment to keep HTTP connection alive
            yield ": ping\n\n"
            continue

        if event_type == "done":
            break

        data_json = json.dumps(payload)
        yield f"event: {event_type}\ndata: {data_json}\n\n"


@router.post("", response_model=QueryResponse, status_code=status.HTTP_201_CREATED)
def execute_query(
    payload: QueryCreate,
    stream: bool = QueryParam(default=False),
    request: Request = None,
    response: Response = None,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """
    Run audited RAG pipeline with verification, self-correction, and full database persistence.
    Supports real-time pipeline event streaming via `stream=true` or `Accept: text/event-stream`.
    """
    is_suspicious, msg = check_prompt_injection(payload.prompt)
    if is_suspicious:
        try:
            from app.db.models.audit_events import AuditEvent
            event = AuditEvent(
                workspace_id=workspace.id,
                event_type="security_prompt_injection_blocked",
                actor="user",
                description=msg,
                payload={"flagged_prompt": payload.prompt[:500]},
            )
            db.add(event)
            db.commit()
        except Exception:
            db.rollback()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Query rejected by Prompt Injection Guard: {msg}",
        )

    # Resolve effective top_k respecting workspace settings
    top_k = payload.top_k
    ws_settings = (workspace.settings if hasattr(workspace, "settings") else None) or {}
    if payload.top_k == 5 and "retrieval_top_k" in ws_settings:
        top_k = ws_settings["retrieval_top_k"]

    # Determine whether streaming transport is requested
    is_streaming_requested = stream or (
        request and request.headers.get("accept") == "text/event-stream"
    )

    if is_streaming_requested:
        return StreamingResponse(
            _generate_pipeline_sse(workspace.id, payload.prompt, top_k),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        pipeline_result = run_pipeline(db, workspace.id, payload.prompt, top_k=top_k)
    except (VerificationProviderError, ProviderError) as e:
        logger.error("Provider outage during query processing: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Verification service is temporarily unavailable. Please try again later.",
        )
    except Exception as e:
        logger.exception("Pipeline execution failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while processing the query.",
        )

    query_obj = pipeline_result["query"]
    answer_obj = pipeline_result["answer"]
    exec_meta = pipeline_result.get("execution_metadata", {})
    is_cache_hit = bool(exec_meta.get("cache_hit", False))

    if response is not None:
        response.headers["X-Cache"] = "HIT" if is_cache_hit else "MISS"

    return QueryResponse(
        query_id=query_obj.id,
        workspace_id=workspace.id,
        prompt=query_obj.prompt,
        answer=answer_obj,
        verification_status=pipeline_result.get("verification_status"),
        execution_metadata=exec_meta,
    )


@router.get("/cache-metrics")
def get_query_cache_metrics(
    workspace: Workspace = Depends(get_workspace_scoped),
):
    """Retrieve telemetry metrics for pipeline query caching (hit rate, miss rate, evictions)."""
    return pipeline_cache_service.get_metrics()


@router.post("/stream")
def execute_query_stream(
    payload: QueryCreate,
    request: Request,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Dedicated endpoint for real-time SSE progress streaming."""
    return execute_query(payload=payload, stream=True, request=request, workspace=workspace, db=db)
