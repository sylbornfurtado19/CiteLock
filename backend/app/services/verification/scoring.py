"""Verification scoring service aggregating claim verdicts into overall hallucination rates."""

from typing import List, Dict, Any


def compute_verification_metrics(verified_claims: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate aggregate hallucination rate, verdict distributions, and grounding score."""
    # TODO: Add weighted severity scoring (e.g. contradiction penalized more than unsupported)
    if not verified_claims:
        return {"hallucination_rate": 0.0, "supported_count": 0, "total_claims": 0}

    total = len(verified_claims)
    unsupported = sum(1 for c in verified_claims if c.get("verdict") in ["unsupported", "contradicted"])
    hallucination_rate = round(unsupported / total, 4)

    return {
        "hallucination_rate": hallucination_rate,
        "total_claims": total,
        "unsupported_count": unsupported,
    }
