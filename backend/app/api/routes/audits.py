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


@router.get("/{answer_id}", response_model=AnswerAuditResponse)
def get_answer_audit(
    answer_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retrieve full verification audit details for an answer."""
    # TODO: Fetch related claims and evidence links from database
    return {
        "answer_id": answer_id,
        "query_id": answer_id,
        "prompt": "Placeholder query prompt",
        "draft_text": "Placeholder draft text",
        "final_text": "Placeholder verified final text",
        "correction_rounds": 1,
        "is_abstained": False,
        "claims": [],
        "hallucination_rate": 0.0,
        "created_at": "2026-10-23T12:00:00Z",
    }


@router.get("/{answer_id}/export")
def export_audit(
    answer_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Export standardized audit report in JSON format."""
    # TODO: Add signature header to verify audit authenticity
    return export_answer_audit_json(db, answer_id)
