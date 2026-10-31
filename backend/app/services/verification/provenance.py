import logging
import re
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


class ProvenanceError(Exception):
    """Raised when provenance tracing fails due to invalid passage format or execution error."""
    pass


def trace_claim_provenance(
    claim_text: str,
    retrieved_passages: List[Dict[str, Any]],
    cited_passages: List[int] | None = None,
) -> List[Dict[str, Any]]:
    """
    Pinpoint source document chunk IDs, character offsets, and exact quotes supporting the claim.
    Calculates genuine sentence-level token overlap and character boundaries within the chunk text.
    Prefers explicitly cited passage chunks ([Passage N]), raises the overlap threshold to 0.35,
    filters out candidates outside a relative margin of the best score, and caps links to genuine matches.
    """
    if not isinstance(claim_text, str):
        raise ProvenanceError(f"claim_text must be a string, got {type(claim_text).__name__}")

    if not retrieved_passages or not claim_text.strip():
        return []

    if not isinstance(retrieved_passages, list):
        raise ProvenanceError(f"retrieved_passages must be a list, got {type(retrieved_passages).__name__}")

    cited_indices = set(cited_passages or [])
    claim_tokens = set(re.findall(r"\b[a-zA-Z0-9_]{3,}\b", claim_text.lower()))
    if not claim_tokens:
        return []

    candidate_links: List[Dict[str, Any]] = []
    # Raised threshold to eliminate weak or coincidental single-word token overlaps
    MIN_OVERLAP_THRESHOLD = 0.35

    for idx_pass, passage in enumerate(retrieved_passages):
        if not isinstance(passage, dict):
            logger.warning(f"Skipping malformed passage at index {idx_pass}: expected dict, got {type(passage).__name__}")
            continue

        chunk_id = passage.get("id") or passage.get("chunk_id")
        content = passage.get("content", "")
        if not isinstance(content, str) or not content:
            continue

        # Passages are 1-indexed in synthesis prompts (e.g. [Passage 1])
        passage_num = passage.get("passage_number") or (idx_pass + 1)
        is_cited = passage_num in cited_indices

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

            # For cited passages, allow slight leniency if reasonably grounded (>= 0.30)
            threshold = 0.30 if is_cited else MIN_OVERLAP_THRESHOLD

            if best_score >= threshold and best_sentence:
                doc_fn = (
                    passage.get("filename")
                    or passage.get("document_filename")
                    or (passage.get("metadata") or {}).get("filename")
                )
                candidate_links.append({
                    "chunk_id": chunk_id,
                    "document_filename": doc_fn,
                    "exact_quote": best_sentence[:200],
                    "start_char_offset": best_start,
                    "end_char_offset": best_end,
                    "relevance_score": round(min(1.0, best_score), 2),
                    "is_cited": is_cited,
                })
        except Exception as e:
            logger.error(f"Error calculating provenance for chunk {chunk_id}: {e}", exc_info=True)
            raise ProvenanceError(f"Provenance calculation error on chunk {chunk_id}: {e}") from e

    if not candidate_links:
        return []

    # Keep only links within a relative margin (within 25% or 0.20 score) of the best score
    max_score = max(l["relevance_score"] for l in candidate_links)
    filtered_links = [
        l for l in candidate_links
        if (max_score - l["relevance_score"]) <= 0.20 and l["relevance_score"] >= (max_score * 0.70)
    ]

    # Prefer explicitly cited chunks, then sort descending by relevance score
    filtered_links.sort(
        key=lambda x: (1 if x.get("is_cited") else 0, x["relevance_score"]),
        reverse=True,
    )

    # Cap to genuinely matching links (at most 2)
    return filtered_links[:2]
