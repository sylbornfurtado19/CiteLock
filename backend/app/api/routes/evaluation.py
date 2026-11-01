"""Evaluation benchmark routes running and inspecting real factual baseline comparisons."""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.users import User
from app.db.models.workspaces import Workspace
from app.db.models.audit_events import AuditEvent
from app.api.deps import get_current_user, get_workspace_scoped
from app.schemas import (
    BenchmarkRunResponse,
    BenchmarkRunRequest,
    BenchmarkHistoryItem,
)
from evaluation.run_eval import run_benchmark_suite

router = APIRouter(prefix="/workspaces/{workspace_id}/evaluation", tags=["Evaluation"])


@router.post("/run", response_model=BenchmarkRunResponse)
def execute_benchmark(
    payload: BenchmarkRunRequest = BenchmarkRunRequest(),
    workspace: Workspace = Depends(get_workspace_scoped),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Execute real comparative benchmark across Plain RAG, Single-Pass Verify, and CiteLock.
    Measures genuine factual verification accuracy, faithfulness, hallucination rate, and latencies.
    Persists immutable audit event record in database for historical tracking.
    """
    try:
        results = run_benchmark_suite(
            dataset_path=payload.dataset_path,
            sample_size=payload.sample_size,
            db=db,
            workspace_id=workspace.id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Benchmark execution failed: {str(e)}",
        )

    # Persist benchmark result into AuditEvent
    try:
        actor_name = current_user.email or "system"
        audit_event = AuditEvent(
            workspace_id=workspace.id,
            event_type="benchmark_executed",
            actor=actor_name,
            description=f"Evaluation Benchmark Suite ({results['total_test_cases']} test cases)",
            payload=results,
        )
        db.add(audit_event)
        db.commit()
    except Exception as db_err:
        db.rollback()
        pass

    return results


@router.get("/latest", response_model=Optional[BenchmarkRunResponse])
def get_latest_benchmark(
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retrieve the most recent benchmark run for this workspace."""
    latest_event = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.workspace_id == workspace.id,
            AuditEvent.event_type == "benchmark_executed",
        )
        .order_by(AuditEvent.created_at.desc())
        .first()
    )

    if not latest_event or not latest_event.payload:
        return None

    return latest_event.payload


@router.get("/history", response_model=List[BenchmarkHistoryItem])
def get_benchmark_history(
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retrieve history of previous benchmark runs for trend analysis."""
    events = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.workspace_id == workspace.id,
            AuditEvent.event_type == "benchmark_executed",
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(10)
        .all()
    )

    history = []
    for evt in events:
        p = evt.payload or {}
        systems = p.get("systems", {})
        citelock_s = systems.get("citelock", {})
        plain_s = systems.get("plain_rag", {})

        history.append(
            BenchmarkHistoryItem(
                id=str(evt.id),
                workspace_id=str(workspace.id),
                dataset_name=p.get("dataset_name", "CiteLock Grounded Truth Benchmark"),
                total_test_cases=p.get("total_test_cases", 0),
                created_at=evt.created_at.isoformat() + "Z",
                execution_time_ms=p.get("execution_time_ms", 0.0),
                hallucination_reduction_pct=p.get("hallucination_reduction_pct", 0.0),
                citelock_hallucination_rate=citelock_s.get("hallucination_rate", 0.0),
                plain_rag_hallucination_rate=plain_s.get("hallucination_rate", 0.0),
            )
        )

    return history

