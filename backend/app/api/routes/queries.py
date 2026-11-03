import json
import logging
import queue
import threading
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query as QueryParam, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import app.db.session
from app.db.session import get_db
from app.db.models.answers import Answer
from app.db.models.queries import Query
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import AnswerRead, QueryCreate, QueryDetail, QueryHistoryItem, QueryResponse
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.state import PipelineCancelledError, PipelineTimeoutError
from app.services.cache import pipeline_cache_service
from app.services.generation.answer import GenerationError
from app.security.injection_guard import check_prompt_injection
from app.security.rate_limit import enforce_query_rate_limit
from app.services.verification.judge import VerificationProviderError
from app.providers.base import ProviderError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/queries", tags=["Queries"])

# Interval between SSE heartbeat comments. Proxies (Render, Vercel) close connections that stay silent too long.
SSE_HEARTBEAT_SECONDS = 30.0

PROVIDER_MESSAGE = "Verification service is temporarily unavailable. Please try again later."
GENERATION_MESSAGE = "The language model provider is temporarily unavailable. Please try again later."
TIMEOUT_MESSAGE = "The pipeline exceeded its time limit. Please try again with a simpler question."
INTERNAL_MESSAGE = "An internal error occurred while processing the query."


def _is_generation_provider_failure(exc: BaseException) -> bool:
    return isinstance(exc, GenerationError) and isinstance(exc.__cause__, ProviderError)


def _describe_failure(exc: BaseException) -> Tuple[str, str, int]:
    """Map a pipeline exception to (stage, client-safe message, HTTP status for the non-streaming API)."""
    if isinstance(exc, PipelineTimeoutError):
        return "timeout", TIMEOUT_MESSAGE, status.HTTP_504_GATEWAY_TIMEOUT
    if isinstance(exc, (VerificationProviderError, ProviderError)):
        return "verification", PROVIDER_MESSAGE, status.HTTP_502_BAD_GATEWAY
    if _is_generation_provider_failure(exc):
        return "generation", GENERATION_MESSAGE, status.HTTP_502_BAD_GATEWAY
    return "execution", INTERNAL_MESSAGE, status.HTTP_500_INTERNAL_SERVER_ERROR


def _generate_pipeline_sse(workspace_id, prompt: str, top_k: int):
    """Generator executing run_pipeline in worker thread and yielding SSE frames."""
    event_queue: queue.Queue = queue.Queue()
    # Set when the client goes away so the worker stops before spending more model calls on a result nobody reads.
    cancelled = threading.Event()

    def worker():
        thread_db = app.db.session.SessionLocal()
        try:
            def on_event(evt):
                # Real LangGraph node lifecycle events travel on their own SSE event type
                event_type = "graph_event" if evt.get("kind") == "graph" else "pipeline_event"
                event_queue.put((event_type, evt))

            pipeline_result = run_pipeline(
                db=thread_db,
                workspace_id=workspace_id,
                prompt=prompt,
                top_k=top_k,
                on_event=on_event,
                cancel_event=cancelled,
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
        except PipelineCancelledError:
            logger.info("Streaming query cancelled because the client disconnected.")
        except Exception as e:
            stage, message, _ = _describe_failure(e)
            if stage == "execution":
                logger.exception("Pipeline streaming execution failed: %s", e)
                from app.config import get_settings
                if get_settings().environment.lower() != "production":
                    message = f"{message} ({type(e).__name__}: {str(e)[:300]})"
            else:
                logger.error("Pipeline streaming query failed (%s): %s", stage, e)
            event_queue.put((
                "pipeline_error",
                {
                    "stage": stage,
                    "status": "failed",
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            ))
        finally:
            thread_db.close()
            event_queue.put(("done", None))

    worker_thread = threading.Thread(target=worker, daemon=True)
    worker_thread.start()

    try:
        while True:
            try:
                event_type, payload = event_queue.get(timeout=SSE_HEARTBEAT_SECONDS)
            except queue.Empty:
                # Emit SSE heartbeat comment to keep HTTP connection alive
                yield ": ping\n\n"
                continue

            if event_type == "done":
                break

            data_json = json.dumps(payload)
            yield f"event: {event_type}\ndata: {data_json}\n\n"
    finally:
        # Runs on normal completion and when the client disconnects mid-stream (generator closed).
        cancelled.set()


@router.post(
    "",
    response_model=QueryResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(enforce_query_rate_limit)],
)
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
                # no-transform stops intermediaries from compressing/buffering the stream; X-Accel-Buffering
                # disables nginx-style proxy buffering so events reach the browser as they happen.
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    try:
        pipeline_result = run_pipeline(db, workspace.id, payload.prompt, top_k=top_k)
    except Exception as e:
        stage, message, http_status = _describe_failure(e)
        if stage == "execution":
            logger.exception("Pipeline execution failed: %s", e)
        else:
            logger.error("Pipeline query failed (%s): %s", stage, e, exc_info=True)
        raise HTTPException(status_code=http_status, detail=message)

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


@router.get("", response_model=List[QueryHistoryItem])
def list_query_history(
    limit: int = QueryParam(20, ge=1, le=100),
    offset: int = QueryParam(0, ge=0),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Previous queries for the workspace, newest first, including failed runs that never produced an answer."""
    queries = (
        db.query(Query)
        .filter(Query.workspace_id == workspace.id)
        .order_by(Query.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for q in queries:
        answer: Optional[Answer] = q.answers[0] if q.answers else None
        items.append(
            QueryHistoryItem(
                query_id=q.id,
                prompt=q.prompt,
                status=q.status,
                created_at=q.created_at,
                answer_id=answer.id if answer else None,
                verification_status=answer.verification_status if answer else None,
                correction_rounds=answer.correction_rounds if answer else None,
                claim_count=len(answer.claims) if answer else None,
                error_message=q.error_message,
                has_trace=bool(q.execution_trace),
            )
        )
    return items


@router.get("/{query_id}", response_model=QueryDetail)
def get_query_detail(
    query_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Everything needed to reopen a past query: final answer, verification, correction history and execution trace."""
    q = db.query(Query).filter(Query.id == query_id, Query.workspace_id == workspace.id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Query not found in this workspace")

    answer = q.answers[0] if q.answers else None
    return QueryDetail(
        query_id=q.id,
        workspace_id=q.workspace_id,
        prompt=q.prompt,
        status=q.status,
        created_at=q.created_at,
        error_message=q.error_message,
        execution_trace=q.execution_trace or [],
        answer=AnswerRead.model_validate(answer) if answer else None,
        verification_status=answer.verification_status if answer else None,
        execution_metadata=answer.execution_metadata if answer else {},
    )


@router.post("/stream", dependencies=[Depends(enforce_query_rate_limit)])
def execute_query_stream(
    payload: QueryCreate,
    request: Request,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Dedicated endpoint for real-time SSE progress streaming."""
    return execute_query(payload=payload, stream=True, request=request, workspace=workspace, db=db)
