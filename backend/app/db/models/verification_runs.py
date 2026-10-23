"""Verification run database model capturing audit rounds, verdicts, and judge metrics."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.session import Base


class VerificationRun(Base):
    """Execution pass record of the verification judge evaluating answer claims."""

    __tablename__ = "verification_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    answer_id = Column(UUID(as_uuid=True), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number = Column(Integer, default=1, nullable=False)
    judge_model = Column(String(100), nullable=False)
    hallucination_rate = Column(Float, nullable=False)
    verification_summary = Column(JSONB, default=dict)
    latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    answer = relationship("Answer", back_populates="verification_runs")

    # TODO: Add token usage breakdown per verification round
