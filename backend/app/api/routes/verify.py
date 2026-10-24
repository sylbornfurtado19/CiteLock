"""Developer verification API for auditing arbitrary claims against raw context passages."""

from fastapi import APIRouter, status
from app.schemas import VerifyRequest, VerifyResponse, Verdict
from app.services.verification.judge import evaluate_claim_with_judge

router = APIRouter(prefix="/verify", tags=["Developer Verification"])


@router.post("", response_model=VerifyResponse, status_code=status.HTTP_200_OK)
def verify_claim_endpoint(payload: VerifyRequest):
    """Direct developer endpoint to verify any statement against provided context passages."""
    # TODO: Add API key authentication for external developers
    res = evaluate_claim_with_judge(payload.statement, payload.context_passages)
    verdict_str = res.get("verdict") or Verdict.UNSUPPORTED
    conf_float = res.get("confidence_score", 0.0)
    return {
        "statement": payload.statement,
        "verdict": verdict_str,
        "confidence_score": conf_float,
        "rationale": res.get("rationale", "Verified by evaluation judge against context passages."),
        "supporting_quotes": res.get("supporting_quotes", []),
    }
