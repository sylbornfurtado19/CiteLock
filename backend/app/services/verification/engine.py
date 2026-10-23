"""Claim verification orchestrator coordinating structured judge, numeric checks, and scoring."""

from typing import List, Dict, Any

from app.services.verification.judge import evaluate_claim_with_judge
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance
from app.services.verification.scoring import compute_verification_metrics


def verify_claims(claims: List[Dict[str, Any]], retrieved_passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Execute complete claim audit pass across structured LLM judge, numbers, and provenance."""
    # TODO: Parallelize claim evaluations using asyncio.gather for lower latency
    verified_claims = []
    passage_texts = [p.get("content", "") for p in retrieved_passages]

    for claim in claims:
        judge_res = evaluate_claim_with_judge(claim["claim_text"], passage_texts)
        numeric_res = verify_numeric_precision(claim["claim_text"], passage_texts)
        provenance_res = trace_claim_provenance(claim["claim_text"], retrieved_passages)

        claim_record = {
            **claim,
            "verdict": judge_res.get("verdict", "supported"),
            "confidence_score": judge_res.get("confidence_score", 0.9),
            "rationale": judge_res.get("rationale", ""),
            "numeric_verified": numeric_res.get("passed", True),
            "evidence_links": provenance_res,
        }
        verified_claims.append(claim_record)

    metrics = compute_verification_metrics(verified_claims)
    return {
        "claims": verified_claims,
        "metrics": metrics,
    }
