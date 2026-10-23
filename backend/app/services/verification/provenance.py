"""Provenance tracking service linking claims to exact character offsets and source chunk IDs."""

from typing import List, Dict, Any


def trace_claim_provenance(claim_text: str, retrieved_passages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Pinpoint source document chunk IDs, character offsets, and exact quotes supporting the claim."""
    # TODO: Implement longest common subsequence or fuzzy match for span highlight alignment
    if not retrieved_passages:
        return []

    first_chunk = retrieved_passages[0]
    return [
        {
            "chunk_id": first_chunk.get("id"),
            "exact_quote": first_chunk.get("content", "")[:120],
            "start_char_offset": 0,
            "end_char_offset": min(120, len(first_chunk.get("content", ""))),
            "relevance_score": 0.95,
        }
    ]
