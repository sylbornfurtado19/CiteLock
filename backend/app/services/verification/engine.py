"""Claim verification orchestrator coordinating structured judge, numeric checks, and scoring."""

from typing import List, Dict, Any

from app.services.verification.judge import evaluate_claim_with_judge
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance
from app.services.verification.scoring import compute_verification_metrics


def verify_claims(claims: List[Dict[str, Any]], retrieved_passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Execute complete claim audit pass across structured LLM judge, numbers, and provenance."""
    verified_claims = []
    passage_texts = [p.get("content", "").strip() for p in retrieved_passages if p.get("content", "").strip()]

    for claim in claims:
        claim_text = claim.get("claim_text", "").strip()
        judge_res = evaluate_claim_with_judge(claim_text, passage_texts)
        numeric_res = verify_numeric_precision(claim_text, passage_texts)
        provenance_res = trace_claim_provenance(claim_text, retrieved_passages)

        verdict = judge_res.get("verdict")
        if not verdict:
            verdict = "insufficient_evidence" if not passage_texts else "unsupported"

        confidence = judge_res.get("confidence_score")
        if confidence is None:
            confidence = 0.0

        rationale = judge_res.get("rationale", "")

        # 1. Numeric consistency enforcement: contradictions override judge
        if not numeric_res.get("passed", True):
            mismatches = numeric_res.get("mismatches", [])
            mismatch_detail = "; ".join(m.get("reason", "") for m in mismatches)
            if numeric_res.get("has_contradiction"):
                verdict = "contradicted"
                confidence = max(0.90, confidence)
                rationale = f"[Numeric Contradiction] {mismatch_detail}. {rationale}".strip()
            else:
                if verdict in {"supported", "partially_supported"}:
                    verdict = "unsupported"
                    confidence = min(0.60, confidence)
                    rationale = f"[Unverified Figures] {mismatch_detail}. {rationale}".strip()

        # 2. Evidence linkage reconciliation: supported claims must have traceable provenance
        if verdict == "supported" and not provenance_res:
            if not passage_texts:
                verdict = "insufficient_evidence"
                confidence = 0.0
                rationale = "No evidence passages available to substantiate claim."
            else:
                verdict = "unsupported"
                confidence = min(0.50, confidence)
                rationale = f"Claim lacks direct textual provenance in retrieved passages. {rationale}".strip()

        claim_record = {
            **claim,
            "verdict": verdict,
            "confidence_score": round(confidence, 2),
            "rationale": rationale,
            "numeric_verified": numeric_res.get("passed", True),
            "evidence_links": provenance_res,
        }
        verified_claims.append(claim_record)

    metrics = compute_verification_metrics(verified_claims)
    return {
        "claims": verified_claims,
        "metrics": metrics,
    }
