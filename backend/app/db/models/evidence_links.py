"""Evidence link database model mapping claims to ground-truth document chunks."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


class EvidenceLink(Base):
    """Citation mapping associating an atomic claim to an exact source document chunk."""

    __tablename__ = "evidence_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id = Column(UUID(as_uuid=True), ForeignKey("claims.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True, index=True)
    document_filename = Column(String(255), nullable=True)
    relevance_score = Column(Float, nullable=True)
    exact_quote = Column(Text, nullable=True)
    start_char_offset = Column(Integer, nullable=True)
    end_char_offset = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    claim = relationship("Claim", back_populates="evidence_links")
    chunk = relationship("Chunk", back_populates="evidence_links")

    # TODO: Implement character offset validation against original document text
