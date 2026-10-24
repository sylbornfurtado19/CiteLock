"""Structured LLM judge service evaluating claims against evidence passages."""

from typing import List, Dict, Any
import app.providers.base as providers_base

VALID_VERDICTS = {
    "supported",
    "partially_supported",
    "contradicted",
    "unsupported",
    "insufficient_evidence",
}


def evaluate_claim_with_judge(claim_text: str, evidence_passages: List[str]) -> Dict[str, Any]:
    """
    Invoke structured LLM judge to classify claim into standard Verdict categories.
    Validates output schema and ensures failed or invalid responses never default to supported.
    """
    cleaned_passages = [p.strip() for p in evidence_passages if p and p.strip()]
    if not cleaned_passages:
        return {
            "verdict": "insufficient_evidence",
            "confidence_score": 0.0,
            "rationale": "No reference evidence passages provided to evaluate this claim.",
            "supporting_quotes": [],
        }

    try:
        llm = providers_base.get_llm_provider()
        res = llm.structured_judge(claim_text, cleaned_passages)
        if not isinstance(res, dict):
            return {
                "verdict": "insufficient_evidence" if not cleaned_passages else "unsupported",
                "confidence_score": 0.0,
                "rationale": f"Judge returned invalid non-dict response: {type(res)}",
                "supporting_quotes": [],
            }

        raw_verdict = str(res.get("verdict", "")).lower().strip()
        if raw_verdict not in VALID_VERDICTS:
            return {
                "verdict": "insufficient_evidence" if not cleaned_passages else "unsupported",
                "confidence_score": 0.0,
                "rationale": f"Judge returned unrecognized verdict: '{raw_verdict}'. Treated as unresolved.",
                "supporting_quotes": [],
            }

        conf = res.get("confidence_score")
        try:
            conf_float = max(0.0, min(1.0, float(conf)))
        except (TypeError, ValueError):
            conf_float = 0.0

        return {
            "verdict": raw_verdict,
            "confidence_score": conf_float,
            "rationale": str(res.get("rationale") or "Claim evaluated by structured judge against evidence."),
            "supporting_quotes": list(res.get("supporting_quotes") or []),
        }
    except Exception as e:
        return {
            "verdict": "insufficient_evidence" if not cleaned_passages else "unsupported",
            "confidence_score": 0.0,
            "rationale": f"Verification judge evaluation failed: {str(e)[:150]}",
            "supporting_quotes": [],
        }
