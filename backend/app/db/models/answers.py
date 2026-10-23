"""Answer database model preserving draft text, self-corrected final text, and model config."""

import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class Answer(Base):
    """Generated answer record preserving draft stages, verified final response, and metrics."""

    __tablename__ = "answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query_id = Column(UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False, index=True)
    draft_text = Column(Text, nullable=False)
    final_text = Column(Text, nullable=False)
    model_config_data = Column("model_config", JSONB, default=dict)
    correction_rounds = Column(Integer, default=0, nullable=False)
    is_abstained = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    query = relationship("Query", back_populates="answers")
    claims = relationship("Claim", back_populates="answer", cascade="all, delete-orphan")
    verification_runs = relationship("VerificationRun", back_populates="answer", cascade="all, delete-orphan")

    # TODO: Add diff computation between draft_text and final_text for timeline visualization
