"""Audit event database model recording immutable compliance and provenance logs."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class AuditEvent(Base):
    """Immutable event record capturing state transitions, corrections, and user actions."""

    __tablename__ = "audit_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(100), nullable=False)  # document_uploaded, query_executed, claim_flagged, answer_corrected
    actor = Column(String(128), nullable=False)  # user ID or 'system'
    description = Column(Text, nullable=True)
    payload = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="audit_events")

    # TODO: Add cryptographic hash chaining for tamper-evident compliance audit trail
