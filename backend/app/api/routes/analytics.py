"""Analytics endpoints summarizing hallucination rates and verdict distributions."""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query as FastQuery
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


@router.get("", response_model=AnalyticsSummary)
def get_workspace_analytics(
    range: Optional[str] = FastQuery("all", description="Time range filter: 24h, 7d, 30d, all"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Aggregate hallucination rates, verdict counts, and latency metrics from real database records."""
    cutoff = None
    if range and range.lower() != "all":
        r = range.lower()
        now = datetime.utcnow()
        if r in ("24h", "1d"):
            cutoff = now - timedelta(hours=24)
        elif r == "7d":
            cutoff = now - timedelta(days=7)
        elif r == "30d":
            cutoff = now - timedelta(days=30)
        elif r == "1h":
            cutoff = now - timedelta(hours=1)

    queries_q = db.query(Query).filter(Query.workspace_id == workspace.id)
    if cutoff:
        queries_q = queries_q.filter(Query.created_at >= cutoff)
    total_queries = queries_q.count()

    docs_q = db.query(Document).filter(
        Document.workspace_id == workspace.id,
        Document.status == "indexed",
    )
    if cutoff:
        docs_q = docs_q.filter(Document.created_at >= cutoff)
    total_documents = docs_q.count()

    claims_q = (
        db.query(Claim)
        .join(Answer, Claim.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace.id)
    )
    if cutoff:
        claims_q = claims_q.filter(Answer.created_at >= cutoff)
    claims = claims_q.all()

    verdict_distribution = {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "verification_error": 0,
        "unknown": 0,
    }

    for c in claims:
        v = c.verdict if c.verdict in verdict_distribution else "unknown"
        verdict_distribution[v] += 1

    valid_claims = [c for c in claims if c.verdict != "verification_error"]
    total_valid = len(valid_claims)
    hallucinated = verdict_distribution["contradicted"] + verdict_distribution["unsupported"]
    overall_hallucination_rate = round(hallucinated / total_valid, 4) if total_valid > 0 else 0.0
    grounding_rate = (
        round(
            (verdict_distribution["supported"] + 0.5 * verdict_distribution["partially_supported"]) / total_valid,
            4,
        )
        if total_valid > 0
        else 1.0
    )

    runs_q = (
        db.query(VerificationRun.latency_ms)
        .join(Answer, VerificationRun.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace.id, VerificationRun.latency_ms.isnot(None))
    )
    if cutoff:
        runs_q = runs_q.filter(VerificationRun.created_at >= cutoff)
    runs = runs_q.all()
    latencies = [r[0] for r in runs if r[0] is not None]
    avg_latency_ms = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    return AnalyticsSummary(
        total_queries=total_queries,
        total_documents=total_documents,
        overall_hallucination_rate=overall_hallucination_rate,
        grounding_rate=grounding_rate,
        verdict_distribution=verdict_distribution,
        avg_latency_ms=avg_latency_ms,
    )
