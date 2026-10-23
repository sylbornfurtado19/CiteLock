"""Atomic claim database model decomposed from answers for independent verification."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


class Claim(Base):
    """Atomic factual statement extracted from draft answer evaluated by verification judge."""

    __tablename__ = "claims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    answer_id = Column(UUID(as_uuid=True), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False, index=True)
    claim_index = Column(Integer, nullable=False)
    claim_text = Column(Text, nullable=False)
    verdict = Column(String(50), nullable=False)  # supported, partially_supported, contradicted, unsupported, insufficient_evidence
    confidence_score = Column(Float, nullable=True)
    rationale = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    answer = relationship("Answer", back_populates="claims")
    evidence_links = relationship("EvidenceLink", back_populates="claim", cascade="all, delete-orphan")

    # TODO: Add claim categorization (e.g. numeric, causal, quote, temporal)
