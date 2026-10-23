"""Draft answer generation service synthesizing retrieved passages into grounded response."""

from typing import List, Dict, Any

from app.providers.base import get_llm_provider


def generate_draft_answer(query: str, retrieved_passages: List[Dict[str, Any]]) -> str:
    """Generate initial draft answer citing source chunk identifiers."""
    # TODO: Implement strict citation prompting and source constraint instructions
    llm = get_llm_provider()
    return f"[Draft Answer] Synthesized response for prompt '{query}' based on {len(retrieved_passages)} passages."
