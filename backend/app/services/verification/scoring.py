"""Verification scoring service aggregating claim verdicts into overall hallucination rates."""

from typing import List, Dict, Any


def compute_verification_metrics(verified_claims: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate aggregate hallucination rate, verdict distributions, and grounding score."""
    if not verified_claims:
        return {
            "hallucination_rate": 0.0,
            "grounding_rate": 0.0,
            "total_claims": 0,
            "supported_count": 0,
            "partially_supported_count": 0,
            "contradicted_count": 0,
            "unsupported_count": 0,
            "insufficient_evidence_count": 0,
            "unknown_count": 0,
            "verdict_distribution": {
                "supported": 0,
                "partially_supported": 0,
                "contradicted": 0,
                "unsupported": 0,
                "insufficient_evidence": 0,
                "unknown": 0,
            },
        }

    total = len(verified_claims)
    counts = {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "unknown": 0,
    }

    for c in verified_claims:
        v = c.get("verdict")
        if v in counts and v != "unknown":
            counts[v] += 1
        else:
            counts["unknown"] += 1

    # Hallucination includes contradicted + unsupported claims
    hallucinated = counts["contradicted"] + counts["unsupported"]
    hallucination_rate = round(hallucinated / total, 4)
    grounding_rate = round((counts["supported"] + 0.5 * counts["partially_supported"]) / total, 4)

    return {
        "hallucination_rate": hallucination_rate,
        "grounding_rate": grounding_rate,
        "total_claims": total,
        "supported_count": counts["supported"],
        "partially_supported_count": counts["partially_supported"],
        "contradicted_count": counts["contradicted"],
        "unsupported_count": counts["unsupported"],
        "insufficient_evidence_count": counts["insufficient_evidence"],
        "unknown_count": counts["unknown"],
        "verdict_distribution": counts,
    }
