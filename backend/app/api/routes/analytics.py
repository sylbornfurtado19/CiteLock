"""Analytics endpoints summarizing hallucination rates and verdict distributions."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import AnalyticsSummary

router = APIRouter(prefix="/workspaces/{workspace_id}/analytics", tags=["Analytics"])


@router.get("", response_model=AnalyticsSummary)
def get_workspace_analytics(
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Aggregate hallucination rates, verdict counts, and latency metrics for the workspace."""
    # TODO: Implement time-series aggregation query over verification_runs table
    return {
        "total_queries": 42,
        "total_documents": 8,
        "overall_hallucination_rate": 0.048,
        "verdict_distribution": {
            "supported": 120,
            "partially_supported": 12,
            "contradicted": 2,
            "unsupported": 4,
            "insufficient_evidence": 6,
        },
        "avg_latency_ms": 340.5,
    }
