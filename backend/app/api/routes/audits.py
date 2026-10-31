"""Hallucination audit endpoints inspecting claim verdicts, evidence links, and JSON export."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.db.models.answers import Answer
from app.api.deps import get_workspace_scoped
from app.schemas import AnswerAuditResponse
from app.services.audit.exporter import export_answer_audit_json

router = APIRouter(prefix="/workspaces/{workspace_id}/audits", tags=["Audits"])


from app.db.models.queries import Query
from app.db.models.claims import Claim


@router.get("/{answer_id}", response_model=AnswerAuditResponse)
def get_answer_audit(
    answer_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retrieve full verification audit details for an answer strictly scoped to workspace."""
    answer = (
        db.query(Answer)
        .join(Query, Answer.query_id == Query.id)
        .filter(Answer.id == answer_id, Query.workspace_id == workspace.id)
        .first()
    )
    if not answer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Answer audit record not found in this workspace",
        )

    claims = db.query(Claim).filter(Claim.answer_id == answer.id).order_by(Claim.claim_index.asc()).all()
    valid_claims = [c for c in claims if c.verdict != "verification_error"]
    total_valid = len(valid_claims)
    hallucinated = sum(1 for c in valid_claims if c.verdict in ["unsupported", "contradicted"])
    hallucination_rate = round(hallucinated / total_valid, 4) if total_valid > 0 else 0.0

    return AnswerAuditResponse(
        answer_id=answer.id,
        query_id=answer.query_id,
        prompt=answer.query.prompt,
        draft_text=answer.draft_text,
        final_text=answer.final_text,
        correction_rounds=answer.correction_rounds,
        is_abstained=answer.is_abstained,
        claims=claims,
        hallucination_rate=hallucination_rate,
        correction_history=answer.correction_history,
        verification_status=answer.verification_status,
        execution_metadata=answer.execution_metadata,
        created_at=answer.created_at,
    )


@router.get("/{answer_id}/export")
def export_audit(
    answer_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Export standardized audit report in JSON format."""
    return export_answer_audit_json(db, answer_id, workspace_id=workspace.id)
