"""Audit trail recorder persisting lifecycle events, claim states, and verification logs."""

from typing import Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session

from app.db.models.audit_events import AuditEvent


def record_audit_event(
    db: Session,
    workspace_id: UUID,
    event_type: str,
    actor: str,
    description: str,
    payload: Dict[str, Any] | None = None,
) -> AuditEvent:
    """Record an immutable compliance event to the audit ledger."""
    # TODO: Add background queue dispatch to avoid blocking request thread
    event = AuditEvent(
        workspace_id=workspace_id,
        event_type=event_type,
        actor=actor,
        description=description,
        payload=payload or {},
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
