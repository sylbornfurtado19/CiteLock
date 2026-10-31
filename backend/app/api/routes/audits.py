"""Hallucination audit endpoints inspecting claim verdicts, evidence links, and JSON export."""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query as FastQuery, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.db.models.answers import Answer
from app.db.models.queries import Query
from app.db.models.claims import Claim
from app.db.models.audit_events import AuditEvent
from app.api.deps import get_workspace_scoped
from app.schemas import AnswerAuditResponse, AuditListItem, AuditEventRead
from app.services.audit.exporter import export_answer_audit_json

router = APIRouter(prefix="/workspaces/{workspace_id}/audits", tags=["Audits"])
events_router = APIRouter(prefix="/workspaces/{workspace_id}/audit-events", tags=["Audit Events"])


@router.get("", response_model=List[AuditListItem])
def list_audits(
    page: int = FastQuery(1, ge=1),
    page_size: int = FastQuery(20, ge=1, le=100),
    limit: Optional[int] = FastQuery(None, ge=1, le=100),
    offset: Optional[int] = FastQuery(None, ge=0),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """List verification audits for answers in the workspace, newest first."""
    eff_limit = limit if limit is not None else page_size
    eff_offset = offset if offset is not None else (page - 1) * eff_limit

    answers = (
        db.query(Answer)
        .join(Query, Answer.query_id == Query.id)
        .filter(Query.workspace_id == workspace.id)
        .order_by(Answer.created_at.desc())
        .offset(eff_offset)
        .limit(eff_limit)
        .all()
    )

    items = []
    for ans in answers:
        claims = ans.claims
        valid_claims = [c for c in claims if c.verdict != "verification_error"]
        total_valid = len(valid_claims)
        hallucinated = sum(1 for c in valid_claims if c.verdict in ["unsupported", "contradicted"])
        hallucination_rate = round(hallucinated / total_valid, 4) if total_valid > 0 else 0.0

        v_status = ans.verification_status
        if not v_status:
            if ans.is_abstained:
                v_status = "abstained"
            elif hallucination_rate == 0.0 and total_valid > 0:
                v_status = "verified"
            elif any(c.verdict in ["supported", "partially_supported"] for c in valid_claims):
                v_status = "partially_verified"
            else:
                v_status = "unresolved"

        items.append(
            AuditListItem(
                answer_id=ans.id,
                prompt=ans.query.prompt if ans.query else "",
                verification_status=v_status,
                claim_count=len(claims),
                hallucination_rate=hallucination_rate,
                correction_rounds=ans.correction_rounds,
                created_at=ans.created_at,
            )
        )
    return items


@events_router.get("", response_model=List[AuditEventRead])
def list_audit_events(
    limit: int = FastQuery(50, ge=1, le=200),
    offset: int = FastQuery(0, ge=0),
    event_type: Optional[str] = FastQuery(None),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """List compliance and lifecycle audit trail events for a workspace, newest first."""
    query = db.query(AuditEvent).filter(AuditEvent.workspace_id == workspace.id)
    if event_type:
        query = query.filter(AuditEvent.event_type == event_type)
    return query.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()


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
