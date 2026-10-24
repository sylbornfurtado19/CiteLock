"""Analytics endpoints summarizing hallucination rates and verdict distributions."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.api.deps import get_workspace_scoped
from app.schemas import AnalyticsSummary

router = APIRouter(prefix="/workspaces/{workspace_id}/analytics", tags=["Analytics"])


from app.db.models.queries import Query
from app.db.models.documents import Document
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.verification_runs import VerificationRun


@router.get("", response_model=AnalyticsSummary)
def get_workspace_analytics(
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Aggregate hallucination rates, verdict counts, and latency metrics from real database records."""
    total_queries = db.query(Query).filter(Query.workspace_id == workspace.id).count()
    total_documents = db.query(Document).filter(Document.workspace_id == workspace.id).count()

    claims = (
        db.query(Claim)
        .join(Answer, Claim.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace.id)
        .all()
    )

    verdict_distribution = {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "unknown": 0,
    }

    for c in claims:
        v = c.verdict if c.verdict in verdict_distribution else "unknown"
        verdict_distribution[v] += 1

    total_claims = len(claims)
    hallucinated = verdict_distribution["contradicted"] + verdict_distribution["unsupported"]
    overall_hallucination_rate = round(hallucinated / total_claims, 4) if total_claims > 0 else 0.0

    runs = (
        db.query(VerificationRun.latency_ms)
        .join(Answer, VerificationRun.answer_id == Answer.id)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace.id, VerificationRun.latency_ms.isnot(None))
        .all()
    )
    latencies = [r[0] for r in runs if r[0] is not None]
    avg_latency_ms = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    return AnalyticsSummary(
        total_queries=total_queries,
        total_documents=total_documents,
        overall_hallucination_rate=overall_hallucination_rate,
        verdict_distribution=verdict_distribution,
        avg_latency_ms=avg_latency_ms,
    )
