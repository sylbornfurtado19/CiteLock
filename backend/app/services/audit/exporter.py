"""Audit data exporter serializing answer claims and provenance into standardized JSON."""

from datetime import datetime, timezone
from typing import Dict, Any, Optional
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.answers import Answer
from app.db.models.queries import Query
from app.db.models.claims import Claim
from app.db.models.evidence_links import EvidenceLink


def export_answer_audit_json(db: Session, answer_id: UUID, workspace_id: Optional[UUID] = None) -> Dict[str, Any]:
    """Serialize full verification report, claims, evidence links, and metrics for export."""
    query_builder = db.query(Answer).join(Query, Answer.query_id == Query.id).filter(Answer.id == answer_id)
    if workspace_id:
        query_builder = query_builder.filter(Query.workspace_id == workspace_id)

    answer = query_builder.first()
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer audit not found or access denied for this workspace.",
        )

    claims = db.query(Claim).filter(Claim.answer_id == answer.id).order_by(Claim.claim_index.asc()).all()

    claims_data = []
    verdict_counts = {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "unknown": 0,
    }

    for c in claims:
        v = c.verdict if c.verdict in verdict_counts else "unknown"
        verdict_counts[v] += 1

        ev_links_data = []
        for ev in c.evidence_links:
            ev_links_data.append({
                "chunk_id": str(ev.chunk_id),
                "exact_quote": ev.exact_quote,
                "relevance_score": ev.relevance_score,
                "start_char_offset": ev.start_char_offset,
                "end_char_offset": ev.end_char_offset,
            })

        claims_data.append({
            "claim_id": str(c.id),
            "claim_index": c.claim_index,
            "claim_text": c.claim_text,
            "verdict": c.verdict,
            "confidence_score": c.confidence_score,
            "rationale": c.rationale,
            "evidence_links": ev_links_data,
        })

    total_claims = len(claims)
    hallucinated = verdict_counts["contradicted"] + verdict_counts["unsupported"]
    hallucination_rate = round(hallucinated / total_claims, 4) if total_claims > 0 else 0.0

    return {
        "version": "1.0",
        "answer_id": str(answer.id),
        "query_id": str(answer.query_id),
        "workspace_id": str(answer.query.workspace_id),
        "prompt": answer.query.prompt,
        "draft_text": answer.draft_text,
        "final_text": answer.final_text,
        "correction_rounds": answer.correction_rounds,
        "is_abstained": answer.is_abstained,
        "created_at": answer.created_at.isoformat() if answer.created_at else None,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "claims": claims_data,
        "metrics": {
            "total_claims": total_claims,
            "hallucination_rate": hallucination_rate,
            "verdict_distribution": verdict_counts,
        },
    }
