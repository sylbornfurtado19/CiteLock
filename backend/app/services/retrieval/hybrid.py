"""Hybrid retrieval service orchestrating dense vector search, lexical matching, and reciprocal rank fusion."""

from typing import Any, Dict, List
from uuid import UUID
from sqlalchemy.orm import Session

from app.services.retrieval.vector import search_vectors
from app.services.retrieval.lexical import search_lexical


def retrieve_hybrid(
    db: Session,
    workspace_id: UUID,
    query: str,
    top_k: int = 5,
    rrf_k: int = 60,
) -> List[Dict[str, Any]]:
    """
    Execute hybrid search combining dense vector embeddings and lexical matching via Reciprocal Rank Fusion (RRF).
    Guarantees strict workspace isolation and chunk deduplication.
    """
    if not query.strip():
        return []

    vector_results = search_vectors(db, workspace_id, query, top_k=top_k * 2)
    lexical_results = search_lexical(db, workspace_id, query, top_k=top_k * 2)

    fused_scores: Dict[str, float] = {}
    chunk_map: Dict[str, Dict[str, Any]] = {}

    # 1. RRF scoring for vector results
    for rank, item in enumerate(vector_results):
        cid = item["chunk_id"]
        fused_scores[cid] = fused_scores.get(cid, 0.0) + (1.0 / (rrf_k + rank + 1))
        chunk_map[cid] = item

    # 2. RRF scoring for lexical results
    for rank, item in enumerate(lexical_results):
        cid = item["chunk_id"]
        fused_scores[cid] = fused_scores.get(cid, 0.0) + (1.0 / (rrf_k + rank + 1))
        if cid not in chunk_map:
            chunk_map[cid] = item

    # 3. Sort by aggregated RRF score
    sorted_chunk_ids = sorted(fused_scores.keys(), key=lambda cid: fused_scores[cid], reverse=True)

    results: List[Dict[str, Any]] = []
    for cid in sorted_chunk_ids[:top_k]:
        entry = chunk_map[cid].copy()
        entry["fused_score"] = round(fused_scores[cid], 5)
        results.append(entry)

    return results
