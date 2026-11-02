"""Document chunk database model storing text slices and pgvector embeddings."""

import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.db.session import Base


class Chunk(Base):
    """Granular text chunk extracted from a document with dense vector representation."""

    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(768), nullable=True)  # Gemini gemini-embedding-001 dimension
    token_count = Column(Integer, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="chunks")
    evidence_links = relationship("EvidenceLink", back_populates="chunk", passive_deletes=True)

    @property
    def document_filename(self) -> Optional[str]:
        return self.document.filename if self.document else None
