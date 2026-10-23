"""User query database model capturing prompt, execution params, and lifecycle state."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class Query(Base):
    """User prompt submission triggering retrieval and audited verification pipeline."""

    __tablename__ = "queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    prompt = Column(Text, nullable=False)
    query_parameters = Column(JSONB, default=dict)
    status = Column(String(50), default="processing", nullable=False)  # processing, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="queries")
    answers = relationship("Answer", back_populates="query", cascade="all, delete-orphan")

    # TODO: Add query rewrite history, semantic caching keys, and conversation thread grouping
