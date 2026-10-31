import logging
import uuid
from typing import List, Dict, Any

from app.services.verification.judge import evaluate_claim_with_judge, VALID_VERDICTS
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance, ProvenanceError
from app.services.verification.scoring import compute_verification_metrics
from app.services.generation.claim_extractor import strip_citation_markers
import app.providers.base as providers_base

logger = logging.getLogger(__name__)


def verify_claims(claims: List[Dict[str, Any]], retrieved_passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Execute complete evidence-based claim audit pass across structured LLM judge, numbers, and provenance.
    For every claim returns: Claim ID, Verdict, Evidence references, Source excerpts, Explanation, and Metadata.
    """
    verified_claims = []
    passage_texts = [p.get("content", "").strip() for p in retrieved_passages if p.get("content", "").strip()]

    # Index valid chunk IDs from source records to reject invalid/invented evidence IDs
    valid_chunk_ids = {
        str(p.get("id") or p.get("chunk_id"))
        for p in retrieved_passages
        if (p.get("id") or p.get("chunk_id"))
    }

    for idx, claim in enumerate(claims):
        claim_id = claim.get("id") or str(uuid.uuid4())
        raw_claim_text = claim.get("claim_text", "").strip()
        clean_claim_text, cited_passages = strip_citation_markers(raw_claim_text)
        if not cited_passages and claim.get("cited_passages"):
            cited_passages = claim.get("cited_passages", [])

        judge_res = evaluate_claim_with_judge(clean_claim_text, passage_texts)
        numeric_res = verify_numeric_precision(clean_claim_text, passage_texts)

        provenance_error = None
        try:
            raw_provenance = trace_claim_provenance(clean_claim_text, retrieved_passages, cited_passages=cited_passages)
        except Exception as e:
            logger.error(f"Provenance tracking error for claim {claim_id}: {e}", exc_info=True)
            provenance_error = str(e)
            raw_provenance = []

        # Validate evidence IDs: filter out any chunk ID that does not exist in retrieved_passages
        valid_provenance = [
            link for link in raw_provenance
            if str(link.get("chunk_id")) in valid_chunk_ids
        ]

        verdict = judge_res.get("verdict")
        if verdict not in VALID_VERDICTS:
            verdict = "insufficient_evidence" if not passage_texts else "unsupported"

        confidence = judge_res.get("confidence_score", 0.0)
        try:
            confidence = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence = 0.0

        rationale = judge_res.get("rationale", "")

        if verdict != "verification_error":
            # 1. Numeric consistency enforcement: detected contradictions override lenient judge verdicts
            if not numeric_res.get("passed", True):
                mismatches = numeric_res.get("mismatches", [])
                mismatch_detail = "; ".join(m.get("reason", "") for m in mismatches)
                if numeric_res.get("has_contradiction"):
                    verdict = "contradicted"
                    confidence = max(0.90, confidence)
                    rationale = f"[Numeric Contradiction] {mismatch_detail}. {rationale}".strip()
                else:
                    if verdict == "supported":
                        verdict = "unsupported"
                        confidence = 0.0
                        rationale = f"[Unverified Figures] {mismatch_detail}. {rationale}".strip()
                    elif verdict == "partially_supported":
                        rationale = f"[Unverified Figures] {mismatch_detail}. {rationale}".strip()

            # 2. Evidence linkage reconciliation: supported claims MUST have traceable provenance
            if verdict == "supported" and not valid_provenance:
                if not passage_texts:
                    verdict = "insufficient_evidence"
                    confidence = 0.0
                    rationale = "No evidence passages available to substantiate claim."
                else:
                    verdict = "unsupported"
                    confidence = 0.0
                    rationale = f"Claim lacks direct textual provenance in retrieved passages. {rationale}".strip()

        if provenance_error:
            rationale = f"[Provenance Error: {provenance_error}] {rationale}".strip()

        evidence_references = [link["chunk_id"] for link in valid_provenance if link.get("chunk_id")]
        source_excerpts = [link["exact_quote"] for link in valid_provenance if link.get("exact_quote")]

        # If judge provided supporting quotes from evidence, include them if not already present
        for q in judge_res.get("supporting_quotes", []):
            if q and q not in source_excerpts:
                source_excerpts.append(q)

        provider_name = getattr(
            providers_base.get_llm_provider(),
            "__class__",
            type(providers_base.get_llm_provider()),
        ).__name__

        verification_metadata = {
            "numeric_verified": numeric_res.get("passed", True),
            "has_numeric_contradiction": numeric_res.get("has_contradiction", False),
            "extracted_numbers": numeric_res.get("extracted_numbers", []),
            "judge_model": provider_name,
            "has_valid_provenance": len(valid_provenance) > 0,
            "provenance_error": provenance_error,
            "is_fallback_claim": claim.get("is_fallback", False),
            "cited_passages": cited_passages,
        }

        claim_record = {
            "id": claim_id,
            "claim_index": claim.get("claim_index", idx),
            "claim_text": clean_claim_text,
            "cited_passages": cited_passages,
            "category": claim.get("category", "factual"),
            "verdict": verdict,
            "confidence_score": round(confidence, 2),
            "rationale": rationale,
            "explanation": rationale,
            "evidence_references": evidence_references,
            "evidence_links": valid_provenance,
            "source_excerpts": source_excerpts,
            "verification_metadata": verification_metadata,
            "numeric_verified": numeric_res.get("passed", True),
        }
        verified_claims.append(claim_record)

    metrics = compute_verification_metrics(verified_claims)
    return {
        "claims": verified_claims,
        "metrics": metrics,
    }
