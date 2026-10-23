"""Structured LLM judge service evaluating claims against evidence passages."""

from typing import List, Dict, Any

from app.providers.base import get_llm_provider


def evaluate_claim_with_judge(claim_text: str, evidence_passages: List[str]) -> Dict[str, Any]:
    """Invoke structured LLM judge to classify claim into one of five standard Verdict categories."""
    # TODO: Implement strict natural language inference prompt with few-shot edge cases
    llm = get_llm_provider()
    return llm.structured_judge(claim_text, evidence_passages)
