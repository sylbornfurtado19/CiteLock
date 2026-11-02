"""Evidence-based claim audit engine coordinating judge verification, numeric checks, and provenance tracing."""

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional, Tuple, Set

from app.config import get_settings
from app.services.verification.judge import evaluate_claim_with_judge, VALID_VERDICTS
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance
from app.services.verification.scoring import compute_verification_metrics
from app.services.generation.claim_extractor import strip_citation_markers
import app.providers.base as providers_base

logger = logging.getLogger(__name__)


def _verify_single_claim(
    idx: int,
    claim: Dict[str, Any],
    passage_texts: List[str],
    retrieved_passages: List[Dict[str, Any]],
    valid_chunk_ids: Set[str],
    provider_name: str,
) -> Dict[str, Any]:
    """
    Execute verification for a single atomic claim against context passages.
    Thread-safe operation: operates strictly on immutable in-memory data structures.
    """
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

    return {
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


def _safe_verify_single_claim(
    idx: int,
    claim: Dict[str, Any],
    passage_texts: List[str],
    retrieved_passages: List[Dict[str, Any]],
    valid_chunk_ids: Set[str],
    provider_name: str,
) -> Tuple[int, Dict[str, Any]]:
    """
    Fault-tolerant worker wrapper. Catches any unhandled exception in an individual claim's
    verification to guarantee other concurrent claims are not dropped or corrupted.
    """
    try:
        record = _verify_single_claim(
            idx=idx,
            claim=claim,
            passage_texts=passage_texts,
            retrieved_passages=retrieved_passages,
            valid_chunk_ids=valid_chunk_ids,
            provider_name=provider_name,
        )
        return idx, record
    except Exception as exc:
        logger.error(f"Unhandled exception verifying claim {idx} ('{claim.get('claim_text')}'): {exc}", exc_info=True)
        claim_id = claim.get("id") or str(uuid.uuid4())
        raw_claim_text = claim.get("claim_text", "").strip()
        clean_claim_text, cited_passages = strip_citation_markers(raw_claim_text)
        fallback_record = {
            "id": claim_id,
            "claim_index": claim.get("claim_index", idx),
            "claim_text": clean_claim_text,
            "cited_passages": cited_passages,
            "category": claim.get("category", "factual"),
            "verdict": "verification_error",
            "confidence_score": 0.0,
            "rationale": f"Claim verification failed with error: {str(exc)[:150]}",
            "explanation": f"Claim verification failed with error: {str(exc)[:150]}",
            "evidence_references": [],
            "evidence_links": [],
            "source_excerpts": [],
            "verification_metadata": {
                "numeric_verified": False,
                "has_numeric_contradiction": False,
                "extracted_numbers": [],
                "judge_model": provider_name,
                "has_valid_provenance": False,
                "provenance_error": str(exc),
                "is_fallback_claim": claim.get("is_fallback", False),
                "cited_passages": cited_passages,
            },
            "numeric_verified": False,
        }
        return idx, fallback_record


def verify_claims(
    claims: List[Dict[str, Any]],
    retrieved_passages: List[Dict[str, Any]],
    max_workers: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Execute complete evidence-based claim audit pass across structured LLM judge, numbers, and provenance.
    Parallelizes independent claim evaluations concurrently using ThreadPoolExecutor while
    strictly preserving original claim ordering, verdict semantics, and fault isolation.

    No SQLAlchemy sessions are passed or accessed in worker threads, ensuring absolute thread-safety.
    """
    if not claims:
        return {
            "claims": [],
            "metrics": compute_verification_metrics([]),
        }

    passage_texts = [p.get("content", "").strip() for p in retrieved_passages if p.get("content", "").strip()]

    # Index valid chunk IDs from source records to reject invalid/invented evidence IDs
    valid_chunk_ids = {
        str(p.get("id") or p.get("chunk_id"))
        for p in retrieved_passages
        if (p.get("id") or p.get("chunk_id"))
    }

    provider_obj = providers_base.get_llm_provider()
    provider_name = getattr(provider_obj, "__class__", type(provider_obj)).__name__

    # Resolve concurrency limits from settings or explicit caller override
    settings = get_settings()
    configured_workers = getattr(settings, "max_verification_workers", 5)
    worker_limit = max_workers if max_workers is not None else configured_workers
    effective_workers = max(1, min(len(claims), worker_limit))

    verified_claims: List[Dict[str, Any]] = [None] * len(claims)  # type: ignore

    # Fast path for single claim or single worker configuration: execute synchronously without threadpool overhead
    if len(claims) == 1 or effective_workers == 1:
        for idx, claim in enumerate(claims):
            _, record = _safe_verify_single_claim(
                idx=idx,
                claim=claim,
                passage_texts=passage_texts,
                retrieved_passages=retrieved_passages,
                valid_chunk_ids=valid_chunk_ids,
                provider_name=provider_name,
            )
            verified_claims[idx] = record
    else:
        # Concurrent execution of independent claim verifications
        with ThreadPoolExecutor(max_workers=effective_workers, thread_name_prefix="citelock-verifier") as executor:
            future_to_idx = {
                executor.submit(
                    _safe_verify_single_claim,
                    idx,
                    claim,
                    passage_texts,
                    retrieved_passages,
                    valid_chunk_ids,
                    provider_name,
                ): idx
                for idx, claim in enumerate(claims)
            }
            for future in as_completed(future_to_idx):
                idx, record = future.result()
                verified_claims[idx] = record

    metrics = compute_verification_metrics(verified_claims)
    return {
        "claims": verified_claims,
        "metrics": metrics,
    }
