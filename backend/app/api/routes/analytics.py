"""Analytics endpoints summarizing hallucination rates and verdict distributions via SQL-level aggregation."""

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query as FastQuery
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import AnalyticsSummary
from app.db.models.queries import Query
from app.db.models.documents import Document
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.verification_runs import VerificationRun

router = APIRouter(prefix="/workspaces/{workspace_id}/analytics", tags=["Analytics"])


def compute_workspace_analytics_sql(
    db: Session,
    workspace_id: UUID,
    cutoff: Optional[datetime] = None,
) -> AnalyticsSummary:
    """Aggregate workspace metrics primarily in database SQL rather than in-memory Python loops.

    Computes:
    - Total queries and indexed documents via SQL COUNT.
    - Verdict distributions via SQL GROUP BY and COUNT(Claim.id).
    - Grounding and hallucination rates from aggregated database counts.
    - Average verification latency via SQL AVG(VerificationRun.latency_ms), safely ignoring NULLs.
    """
    # 1. Total queries count via SQL COUNT
    queries_q = db.query(func.count(Query.id)).filter(Query.workspace_id == workspace_id)
    if cutoff:
        queries_q = queries_q.filter(Query.created_at >= cutoff)
    total_queries: int = queries_q.scalar() or 0

    # 2. Total indexed documents count via SQL COUNT
    docs_q = db.query(func.count(Document.id)).filter(
        Document.workspace_id == workspace_id,
        Document.status == "indexed",
    )
    if cutoff:
        docs_q = docs_q.filter(Document.created_at >= cutoff)
    total_documents: int = docs_q.scalar() or 0

    # 3. Verdict distribution via SQL GROUP BY Claim.verdict
    verdict_distribution = {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "verification_error": 0,
        "unknown": 0,
    }

    verdict_q = (
        db.query(Claim.verdict, func.count(Claim.id))
        .join(Answer, Claim.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace_id)
    )
    if cutoff:
        verdict_q = verdict_q.filter(Answer.created_at >= cutoff)

    verdict_rows = verdict_q.group_by(Claim.verdict).all()
    for verdict, count in verdict_rows:
        v_key = verdict if verdict in verdict_distribution else "unknown"
        verdict_distribution[v_key] += (count or 0)

    # 4. Valid claims & rate metrics derived from aggregated counts
    # Exclude verification_error from valid claims denominator (preserves existing metric contract)
    valid_claims = sum(
        count for v, count in verdict_distribution.items() if v != "verification_error"
    )
    hallucinated = verdict_distribution["contradicted"] + verdict_distribution["unsupported"]
    overall_hallucination_rate = (
        round(hallucinated / valid_claims, 4) if valid_claims > 0 else 0.0
    )
    grounded_score = (
        verdict_distribution["supported"] + 0.5 * verdict_distribution["partially_supported"]
    )
    grounding_rate = (
        round(grounded_score / valid_claims, 4) if valid_claims > 0 else 1.0
    )

    # 5. Average latency aggregated in SQL via AVG (independent join avoids Cartesian duplication)
    latency_q = (
        db.query(func.avg(VerificationRun.latency_ms))
        .join(Answer, VerificationRun.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace_id, VerificationRun.latency_ms.isnot(None))
    )
    if cutoff:
        latency_q = latency_q.filter(VerificationRun.created_at >= cutoff)

    avg_latency_val = latency_q.scalar()
    avg_latency_ms = round(float(avg_latency_val), 1) if avg_latency_val is not None else 0.0

    return AnalyticsSummary(
        total_queries=total_queries,
        total_documents=total_documents,
        overall_hallucination_rate=overall_hallucination_rate,
        grounding_rate=grounding_rate,
        verdict_distribution=verdict_distribution,
        avg_latency_ms=avg_latency_ms,
    )


@router.get("", response_model=AnalyticsSummary)
def get_workspace_analytics(
    range: Optional[str] = FastQuery("all", description="Time range filter: 1h, 24h, 7d, 30d, all"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Aggregate hallucination rates, verdict counts, and latency metrics using database-level SQL aggregation."""
    cutoff = None
    if range and range.strip().lower() != "all":
        r = range.strip().lower()
        now = datetime.utcnow()
        if r in ("24h", "1d"):
            cutoff = now - timedelta(hours=24)
        elif r == "7d":
            cutoff = now - timedelta(days=7)
        elif r == "30d":
            cutoff = now - timedelta(days=30)
        elif r == "1h":
            cutoff = now - timedelta(hours=1)

    return compute_workspace_analytics_sql(db=db, workspace_id=workspace.id, cutoff=cutoff)
