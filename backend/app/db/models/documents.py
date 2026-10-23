"""Document metadata and indexing state database model."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.db.session import Base


class Document(Base):
    """Uploaded source document tracked with private storage path and indexing status."""

    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(1024), nullable=False)
    checksum = Column(String(64), nullable=False, index=True)
    status = Column(String(50), default="pending", nullable=False)  # pending, parsing, indexed, error
    file_size_bytes = Column(Integer, nullable=False, default=0)
    mime_type = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    workspace = relationship("Workspace", back_populates="documents")
    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")

    # TODO: Add background parsing progress percentage and error message logging
