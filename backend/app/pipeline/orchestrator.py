"""End-to-end RAG orchestrator: deterministic caching and single-flight around the LangGraph execution graph.

The audited pipeline itself (retrieval, generation, decomposition, verification, conditional routing,
self-correction, re-verification, finalization and persistence) runs as a LangGraph StateGraph defined in
app.pipeline.graph with node implementations in app.pipeline.nodes.
"""

import itertools
import logging
import threading
import time
from typing import Dict, Any, Callable, Optional
from uuid import UUID

logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.queries import Query
from app.db.models.answers import Answer
from app.db.models.workspaces import Workspace
from app.pipeline.graph import run_graph
from app.services.cache import (
    pipeline_cache_service,
    compute_pipeline_cache_key,
    is_safe_to_cache,
)
from datetime import datetime


def run_pipeline(
    db: Session,
    workspace_id: UUID,
    prompt: str,
    top_k: int = 5,
    on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
    use_cache: bool = True,
    cancel_event: Optional[threading.Event] = None,
) -> Dict[str, Any]:
    """
    Execute complete audited RAG pipeline with deterministic response caching and concurrency coordination:
    0. Deterministic cache lookup (workspace, document fingerprint, prompt, and model config)
    1. Hybrid retrieval (vector + keyword)
    2. Grounded draft answer synthesis
    3. Atomic claim decomposition
    4. Evidence verification across judge, numeric checks, and provenance
    5. Targeted iterative self-correction loop
    6. Relational PostgreSQL persistence with full claim and evidence linkage
    7. Safe cache population with configurable TTL and stampede prevention
    """
    start_time = time.time()
    settings = get_settings()

    def emit(stage: str, status: str, message: str, data: Optional[Dict[str, Any]] = None):
        if on_event:
            try:
                on_event({
                    "stage": stage,
                    "status": status,
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "data": data or {},
                })
            except Exception as evt_err:
                logger.warning("Error invoking on_event callback: %s", evt_err)

    graph_seq = itertools.count(1)

    def emit_graph(event: Dict[str, Any]):
        """Forward a real LangGraph node lifecycle event (kind="graph") to the streaming listener.

        Every event carries a per-run sequence number so clients can drop duplicates and detect gaps.
        """
        if on_event:
            try:
                on_event({**event, "kind": "graph", "seq": next(graph_seq)})
            except Exception as evt_err:
                logger.warning("Error invoking on_event callback for graph event: %s", evt_err)

    # Resolve workspace settings for cache key and pipeline parameters
    ws_settings = {}
    if workspace_id and db:
        try:
            ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
            if ws and ws.settings_:
                ws_settings = ws.settings_
        except Exception as ws_err:
            logger.warning("Could not read workspace settings for %s: %s", workspace_id, ws_err)

    cache_key = None
    if use_cache and pipeline_cache_service.is_enabled:
        try:
            cache_key = compute_pipeline_cache_key(
                db=db,
                workspace_id=workspace_id,
                prompt=prompt,
                top_k=top_k,
                extra_config=ws_settings,
            )
            cached_data = pipeline_cache_service.get(cache_key, workspace_id=workspace_id)
            if cached_data:
                cached_query = db.query(Query).filter(Query.id == UUID(cached_data["query_id"])).first()
                cached_answer = db.query(Answer).filter(Answer.id == UUID(cached_data["answer_id"])).first()
                if cached_query and cached_answer:
                    cached_latency = int((time.time() - start_time) * 1000)
                    cached_metadata = dict(cached_data.get("execution_metadata", {}))
                    cached_metadata["cache_hit"] = True
                    cached_metadata["latency_ms"] = cached_latency

                    emit("cache", "completed", "Loaded verified answer from deterministic pipeline cache.", {
                        "cache_hit": True,
                        "answer_id": str(cached_answer.id),
                    })

                    try:
                        from app.services.audit.recorder import record_audit_event
                        record_audit_event(
                            db=db,
                            workspace_id=workspace_id,
                            event_type="query_executed",
                            actor="user",
                            description=f"Query executed (cache hit): {prompt[:100]}",
                            payload={
                                "query_id": str(cached_query.id),
                                "answer_id": str(cached_answer.id),
                                "cache_hit": True,
                                "verification_status": cached_data.get("verification_status"),
                            },
                        )
                    except Exception as audit_err:
                        logger.warning("Failed recording cache hit audit event: %s", audit_err)

                    return {
                        "query": cached_query,
                        "answer": cached_answer,
                        "query_id": cached_query.id,
                        "answer_id": cached_answer.id,
                        "workspace_id": workspace_id,
                        "prompt": prompt,
                        "draft_text": cached_data["draft_text"],
                        "final_text": cached_data["final_text"],
                        "correction_rounds": cached_data["correction_rounds"],
                        "is_abstained": cached_data["is_abstained"],
                        "claims": cached_data["claims"],
                        "correction_history": cached_data.get("correction_history", []),
                        "verification_status": cached_data["verification_status"],
                        "execution_metadata": cached_metadata,
                        "metrics": cached_data.get("metrics", {}),
                        "latency_ms": cached_latency,
                    }
        except Exception as cache_err:
            logger.warning("Pipeline cache lookup failed: %s; proceeding with fresh execution", cache_err)

    def _execute_pipeline():
        return _run_pipeline_execution(
            db=db,
            workspace_id=workspace_id,
            prompt=prompt,
            top_k=top_k,
            ws_settings=ws_settings,
            emit=emit,
            emit_graph=emit_graph,
            start_time=start_time,
            cancel_event=cancel_event,
        )

    # Concurrency control: prevent cache stampedes for simultaneous identical requests
    if cache_key:
        pipeline_output, is_leader = pipeline_cache_service.single_flight.do(cache_key, _execute_pipeline)
        if not is_leader:
            logger.info("Cache stampede avoided: follower reused concurrent leader result for key %s", cache_key[:16])
            follower_result = dict(pipeline_output)
            follower_meta = dict(follower_result.get("execution_metadata", {}))
            follower_meta["cache_hit"] = True
            follower_result["execution_metadata"] = follower_meta
            return follower_result
    else:
        pipeline_output = _execute_pipeline()

    # Safely populate cache for successful verification runs
    if cache_key and is_safe_to_cache(pipeline_output):
        try:
            cache_payload = {
                "query_id": str(pipeline_output["query_id"]),
                "answer_id": str(pipeline_output["answer_id"]),
                "workspace_id": str(workspace_id),
                "prompt": prompt,
                "draft_text": pipeline_output["draft_text"],
                "final_text": pipeline_output["final_text"],
                "correction_rounds": pipeline_output["correction_rounds"],
                "is_abstained": pipeline_output["is_abstained"],
                "claims": pipeline_output["claims"],
                "correction_history": pipeline_output["correction_history"],
                "verification_status": pipeline_output["verification_status"],
                "execution_metadata": pipeline_output["execution_metadata"],
                "metrics": pipeline_output.get("metrics", {}),
                "latency_ms": pipeline_output["latency_ms"],
            }
            pipeline_cache_service.set(
                key=cache_key,
                workspace_id=workspace_id,
                data=cache_payload,
                ttl_seconds=settings.pipeline_cache_ttl_seconds,
            )
        except Exception as set_err:
            logger.warning("Failed storing result in pipeline cache: %s", set_err)

    return pipeline_output



def _run_pipeline_execution(
    db: Session,
    workspace_id: UUID,
    prompt: str,
    top_k: int,
    ws_settings: Dict[str, Any],
    emit: Callable,
    start_time: float,
    emit_graph: Optional[Callable] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Dict[str, Any]:
    """Execute the audited pipeline through the compiled LangGraph StateGraph (see app.pipeline.graph)."""
    timeout_seconds = get_settings().pipeline_timeout_seconds
    final_state = run_graph(
        {"prompt": prompt, "workspace_id": workspace_id, "top_k": top_k, "trace": [], "node_events": []},
        {
            "db": db,
            "emit": emit,
            "emit_graph": emit_graph,
            "ws_settings": ws_settings,
            "start_time": start_time,
            "cancelled": cancel_event,
            "deadline": start_time + timeout_seconds,
            "timeout_seconds": timeout_seconds,
        },
    )

    error_exc = final_state.get("error_exception")
    if final_state.get("error") or error_exc is not None:
        # Surface the original exception so API error mapping (502 for provider outages) is unchanged
        raise error_exc if error_exc is not None else RuntimeError(final_state["error"].get("message", "Pipeline failed."))

    persisted = final_state["persisted"]
    query_record = persisted["query"]
    answer_record = persisted["answer"]
    execution_metadata = final_state["execution_metadata"]

    return {
        "query": query_record,
        "answer": answer_record,
        "query_id": query_record.id,
        "answer_id": answer_record.id,
        "workspace_id": workspace_id,
        "prompt": prompt,
        "draft_text": final_state["draft_answer"],
        "final_text": final_state["final_text"],
        "correction_rounds": final_state.get("correction_round", 0),
        "is_abstained": bool(final_state.get("is_abstained")),
        "claims": final_state["claims"],
        "correction_history": final_state.get("correction_history", []),
        "verification_status": final_state["verification_status"],
        "execution_metadata": execution_metadata,
        "metrics": final_state["metrics"],
        "latency_ms": execution_metadata["latency_ms"],
        "graph_trace": final_state.get("trace", []),
        "execution_trace": final_state.get("node_events", []),
    }
