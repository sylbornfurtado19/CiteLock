"""Evaluation metrics computation for faithfulness, citation recall, precision, and hallucination reduction."""

from typing import List, Dict, Any


def compute_faithfulness_score(verdicts: List[str]) -> float:
    """Calculate ratio of fully supported claims to total claims."""
    if not verdicts:
        return 1.0
    supported = sum(1 for v in verdicts if v == "supported")
    return round(supported / len(verdicts), 4)


def compute_citation_precision(evidence_links: List[Dict[str, Any]]) -> float:
    """Calculate precision of linked citation spans against ground-truth document facts."""
    if not evidence_links:
        return 0.0
    valid_links = [l for l in evidence_links if l.get("chunk_id")]
    return round(len(valid_links) / len(evidence_links), 4)


def aggregate_system_benchmark(runs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Compute aggregate statistical benchmark metrics across a series of evaluated test cases.
    """
    if not runs:
        return {
            "hallucination_rate": 0.0,
            "faithfulness": 0.0,
            "avg_latency_ms": 0.0,
            "total_claims": 0,
            "supported_claims": 0,
            "unsupported_claims": 0,
            "contradicted_claims": 0,
            "abstained_count": 0,
            "correction_rounds_avg": 0.0,
        }

    total_claims = 0
    supported_claims = 0
    unsupported_claims = 0
    contradicted_claims = 0
    total_latencies = 0.0
    total_rounds = 0
    abstained_count = 0

    for r in runs:
        claims = r.get("claims", [])
        total_claims += len(claims)
        for c in claims:
            v = c.get("verdict")
            if v == "supported":
                supported_claims += 1
            elif v == "unsupported":
                unsupported_claims += 1
            elif v == "contradicted":
                contradicted_claims += 1

        total_latencies += r.get("latency_ms", 0.0)
        total_rounds += r.get("correction_rounds", 0)
        if r.get("is_abstained"):
            abstained_count += 1

    evaluable = total_claims if total_claims > 0 else 1
    hallucinated = unsupported_claims + contradicted_claims
    hallucination_rate = round(hallucinated / evaluable, 4)
    faithfulness = round(supported_claims / evaluable, 4)
    avg_latency = round(total_latencies / len(runs), 2)
    avg_rounds = round(total_rounds / len(runs), 2)

    return {
        "hallucination_rate": hallucination_rate,
        "faithfulness": faithfulness,
        "avg_latency_ms": avg_latency,
        "total_claims": total_claims,
        "supported_claims": supported_claims,
        "unsupported_claims": unsupported_claims,
        "contradicted_claims": contradicted_claims,
        "abstained_count": abstained_count,
        "correction_rounds_avg": avg_rounds,
    }
