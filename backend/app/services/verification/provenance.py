import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class ProvenanceError(Exception):
    """Raised when provenance tracing fails due to invalid passage format or execution error."""
    pass


def trace_claim_provenance(claim_text: str, retrieved_passages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Pinpoint source document chunk IDs, character offsets, and exact quotes supporting the claim.
    Calculates genuine sentence-level token overlap and character boundaries within the chunk text.
    """
    if not isinstance(claim_text, str):
        raise ProvenanceError(f"claim_text must be a string, got {type(claim_text).__name__}")

    if not retrieved_passages or not claim_text.strip():
        return []

    if not isinstance(retrieved_passages, list):
        raise ProvenanceError(f"retrieved_passages must be a list, got {type(retrieved_passages).__name__}")

    claim_tokens = set(re.findall(r"\b[a-zA-Z0-9_]{3,}\b", claim_text.lower()))
    if not claim_tokens:
        return []

    links: List[Dict[str, Any]] = []

    for idx_pass, passage in enumerate(retrieved_passages):
        if not isinstance(passage, dict):
            logger.warning(f"Skipping malformed passage at index {idx_pass}: expected dict, got {type(passage).__name__}")
            continue

        chunk_id = passage.get("id") or passage.get("chunk_id")
        content = passage.get("content", "")
        if not isinstance(content, str) or not content:
            continue

        try:
            # Split content into sentences to find best matching excerpt
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", content) if s.strip()]
            best_sentence = ""
            best_score = 0.0
            best_start = 0
            best_end = 0

            for s in sentences:
                s_tokens = set(re.findall(r"\b[a-zA-Z0-9_]{3,}\b", s.lower()))
                if not s_tokens:
                    continue
                overlap = claim_tokens.intersection(s_tokens)
                score = len(overlap) / len(claim_tokens)
                if score > best_score:
                    best_score = score
                    best_sentence = s
                    idx = content.find(s)
                    if idx != -1:
                        best_start = idx
                        best_end = idx + len(s)
                    else:
                        best_start = 0
                        best_end = len(s)

            if best_score >= 0.20 and best_sentence:
                links.append({
                    "chunk_id": chunk_id,
                    "exact_quote": best_sentence[:200],
                    "start_char_offset": best_start,
                    "end_char_offset": best_end,
                    "relevance_score": round(min(1.0, best_score), 2),
                })
        except Exception as e:
            logger.error(f"Error calculating provenance for chunk {chunk_id}: {e}", exc_info=True)
            raise ProvenanceError(f"Provenance calculation error on chunk {chunk_id}: {e}") from e

    # Sort descending by relevance score
    links.sort(key=lambda x: x["relevance_score"], reverse=True)
    return links[:3]
