"""Lexical BM25 and keyword search service over workspace document chunks."""

from typing import List, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session


def search_lexical(db: Session, workspace_id: UUID, query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Execute keyword-based full text search using PostgreSQL tsvector or in-memory BM25."""
    # TODO: Implement Postgres websearch_to_tsquery ranking or rank_bm25 integration
    return []
