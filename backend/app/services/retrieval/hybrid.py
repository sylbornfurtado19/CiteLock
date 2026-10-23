"""Hybrid retrieval service orchestrating dense vector search, lexical matching, and fusion."""

from typing import List, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session

from app.services.retrieval.vector import search_vectors
from app.services.retrieval.lexical import search_lexical
from app.services.retrieval.reranker import rerank_candidates


def retrieve_hybrid(db: Session, workspace_id: UUID, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Execute hybrid search combining vector embeddings and lexical keywords followed by reranking."""
    # TODO: Implement score normalization and deduplication by chunk ID
    vector_results = search_vectors(db, workspace_id, query, top_k=top_k)
    lexical_results = search_lexical(db, workspace_id, query, top_k=top_k)
    combined = vector_results + lexical_results
    return rerank_candidates(query, combined, top_n=top_k)
