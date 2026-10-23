"""Atomic claim extraction service decomposing text into discrete verifiable propositions."""

from typing import List, Dict, Any

from app.providers.base import get_llm_provider


def extract_atomic_claims(draft_text: str) -> List[Dict[str, Any]]:
    """Decompose draft text into atomic, independent factual propositions for evaluation."""
    # TODO: Implement few-shot prompt with JSON schema to extract claim index, text, and sub-clauses
    return [
        {
            "claim_index": 0,
            "claim_text": draft_text[:120] if draft_text else "Placeholder claim statement.",
            "category": "factual",
        }
    ]
