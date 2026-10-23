"""Dense vector similarity search service querying pgvector chunks."""

from typing import List, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session

from app.providers.base import get_embedding_provider


def search_vectors(db: Session, workspace_id: UUID, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Execute cosine distance vector similarity search on workspace chunks using pgvector."""
    # TODO: Implement SQLAlchemy pgvector cosine distance query (chunk.embedding.cosine_distance)
    provider = get_embedding_provider()
    return []
