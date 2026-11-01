"""Evaluation baseline runners comparing plain RAG, single-pass verification, and CiteLock self-correction."""

import time
from typing import Dict, Any, List

from app.services.generation.answer import generate_draft_answer
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.services.verification.scoring import compute_verification_metrics
from app.services.correction.controller import execute_correction_loop


def run_plain_rag(query: str, passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Baseline A: Plain standard RAG without verification or correction.
    Synthesizes draft response and audits its factual claims to measure baseline hallucination rate.
    """
    t0 = time.perf_counter()
    draft_answer = generate_draft_answer(query, passages)
    raw_claims = extract_atomic_claims(draft_answer)
    verification = verify_claims(raw_claims, passages)
    metrics = compute_verification_metrics(verification.get("claims", []))
    latency_ms = max(0.5, round((time.perf_counter() - t0) * 1000, 2))

    return {
        "system_id": "plain_rag",
        "answer": draft_answer,
        "claims": verification.get("claims", []),
        "hallucination_rate": metrics["hallucination_rate"],
        "faithfulness": metrics["grounding_rate"],
        "latency_ms": latency_ms,
        "correction_rounds": 0,
        "is_abstained": False,
    }


def run_single_verify(query: str, passages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Baseline B: RAG with single-pass verification judge but without an iterative self-correction loop.
    Flags ungrounded or contradicted claims but delivers the original uncorrected answer.
    """
    t0 = time.perf_counter()
    draft_answer = generate_draft_answer(query, passages)
    raw_claims = extract_atomic_claims(draft_answer)
    verification = verify_claims(raw_claims, passages)
    metrics = compute_verification_metrics(verification.get("claims", []))
    latency_ms = max(0.5, round((time.perf_counter() - t0) * 1000, 2))

    return {
        "system_id": "single_verify",
        "answer": draft_answer,
        "claims": verification.get("claims", []),
        "hallucination_rate": metrics["hallucination_rate"],
        "faithfulness": metrics["grounding_rate"],
        "latency_ms": latency_ms,
        "correction_rounds": 0,
        "is_abstained": False,
    }


def run_citelock_rag(
    query: str,
    passages: List[Dict[str, Any]],
    db: Any = None,
    workspace_id: Any = None,
    max_retries: int = 2,
    abstention_policy: str = "strict",
) -> Dict[str, Any]:
    """
    System C: CiteLock Self-Correcting RAG.
    Complete pipeline: draft synthesis, atomic claim extraction, multi-dimensional verification,
    and bounded iterative self-correction loop with honest abstention.
    """
    t0 = time.perf_counter()
    draft_answer = generate_draft_answer(query, passages)
    raw_claims = extract_atomic_claims(draft_answer)
    verification = verify_claims(raw_claims, passages)

    final_text, rounds, is_abstained, final_claims, history = execute_correction_loop(
        query=query,
        draft_text=draft_answer,
        verified_claims=verification.get("claims", []),
        retrieved_passages=passages,
        max_retries=max_retries,
        db=db,
        workspace_id=workspace_id,
        abstention_policy=abstention_policy,
    )

    metrics = compute_verification_metrics(final_claims)
    latency_ms = max(0.5, round((time.perf_counter() - t0) * 1000, 2))

    return {
        "system_id": "citelock",
        "answer": final_text,
        "claims": final_claims,
        "hallucination_rate": metrics["hallucination_rate"],
        "faithfulness": metrics["grounding_rate"],
        "latency_ms": latency_ms,
        "correction_rounds": rounds,
        "is_abstained": is_abstained,
    }
