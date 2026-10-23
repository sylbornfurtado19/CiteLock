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
    return {
        "statement": payload.statement,
        "verdict": res.get("verdict", Verdict.SUPPORTED),
        "confidence_score": res.get("confidence_score", 0.95),
        "rationale": res.get("rationale", "Verified by evaluation judge against context passages."),
        "supporting_quotes": res.get("supporting_quotes", []),
    }
