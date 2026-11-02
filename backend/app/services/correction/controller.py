"""Self-correction controller managing iterative revision loops, targeted evidence retrieval, and abstention.

The single-step building blocks (targeted retrieval, answer revision, abstention policy) are shared by the
LangGraph pipeline nodes in app.pipeline.nodes and by the standalone execute_correction_loop below.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from app.config import get_settings
import app.providers.base as providers_base
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.security.injection_guard import sanitize_untrusted_passage

logger = logging.getLogger(__name__)

# Verdicts that require repair before an answer can be considered verified.
FAILED_VERDICTS = ("unsupported", "contradicted", "insufficient_evidence", "partially_supported")

ABSTENTION_TEXT = "The provided reference documents do not contain sufficient evidence to confirm the stated claims."


def select_failed_claims(claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return the claims whose verdict requires correction."""
    return [c for c in claims if c.get("verdict") in FAILED_VERDICTS]


def retrieve_targeted_evidence(
    db: Any,
    workspace_id: Any,
    failed_claims: List[Dict[str, Any]],
    current_passages: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Retrieve additional passages for the first failed claims, excluding passages already held."""
    newly_retrieved: List[Dict[str, Any]] = []
    if db is None or workspace_id is None:
        return newly_retrieved
    try:
        from app.services.retrieval.hybrid import retrieve_hybrid
        existing_ids = {
            str(p.get("id") or p.get("chunk_id"))
            for p in current_passages
            if (p.get("id") or p.get("chunk_id"))
        }
        for fc in failed_claims[:2]:
            claim_query = fc.get("claim_text", "")
            if claim_query:
                targeted_passages = retrieve_hybrid(db, workspace_id, claim_query, top_k=2)
                for tp in targeted_passages:
                    tp_id = str(tp.get("id") or tp.get("chunk_id"))
                    if tp_id and tp_id not in existing_ids:
                        existing_ids.add(tp_id)
                        newly_retrieved.append(tp)
    except Exception:
        pass
    return newly_retrieved


def revise_answer(
    llm: Any,
    query: str,
    current_text: str,
    failed_claims: List[Dict[str, Any]],
    passages: List[Dict[str, Any]],
) -> str:
    """Ask the model to surgically revise the draft so flagged claims are fixed or removed."""
    critiques_list = []
    for c in failed_claims:
        critiques_list.append(
            f"- Problematic Claim: \"{c.get('claim_text')}\"\n"
            f"  Audit Verdict: {c.get('verdict')}\n"
            f"  Critique: {c.get('rationale', 'Not substantiated by evidence.')}"
        )
    critiques_block = "\n".join(critiques_list)

    passage_texts = [
        f"[Passage {i+1}]: {p.get('content', '')}"
        for i, p in enumerate(passages)
        if p.get("content", "").strip()
    ]
    passages_block = "\n\n".join(passage_texts)

    system_prompt = (
        "You are CiteLock's precision self-correction editor. Your job is to surgically edit the draft response "
        "to fix or excise factual hallucinations and contradicted statements.\n"
        "Rules:\n"
        "1. Revise or remove ONLY the statements flagged in the critiques.\n"
        "2. Retain statements that are already factual and supported.\n"
        "3. Ground all replacements strictly in the provided reference passages.\n"
        "4. Never invent new ungrounded facts or append fake disclaimers.\n"
        "5. Return ONLY the revised answer text."
    )

    user_prompt = (
        f"Original Draft:\n{current_text}\n\n"
        f"Critiques:\n{critiques_block}\n\n"
        f"Reference Evidence:\n{passages_block}\n\n"
        f"User Query: {query}\n\n"
        f"Revised Answer:"
    )

    try:
        return llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0).strip()
    except Exception as e:
        logger.error(f"Provider failure during correction revision: {e}", exc_info=True)
        raise


def should_abstain(remaining_failures: List[Dict[str, Any]], claims: List[Dict[str, Any]], abstention_policy: str) -> bool:
    """Apply the workspace abstention policy (strict vs soft) to claims that remain unresolved."""
    if abstention_policy == "strict":
        return len(remaining_failures) >= max(1, len(claims) // 2)
    return len(remaining_failures) == len(claims) and len(claims) > 1


def execute_correction_loop(
    query: str,
    draft_text: str,
    verified_claims: List[Dict[str, Any]],
    retrieved_passages: List[Dict[str, Any]],
    max_retries: int | None = None,
    db: Any = None,
    workspace_id: Any = None,
    abstention_policy: str = "strict",
    llm_provider: Optional[str] = None,
) -> Tuple[str, int, bool, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Iteratively correct unsupported, contradicted, or partially supported claims up to maximum bounded retries.
    Performs targeted evidence retrieval for failed claims, re-verifies every claim,
    prevents repeated identical attempts, and cleanly abstains if ungrounded claims cannot be resolved.
    """
    settings = get_settings()
    retries_limit = max_retries if max_retries is not None else settings.max_correction_retries
    llm = providers_base.get_llm_provider(llm_provider) if llm_provider else providers_base.get_llm_provider()

    # Never attempt correction if any claim suffered a verification error
    if any(c.get("verdict") == "verification_error" for c in verified_claims):
        return draft_text, 0, False, verified_claims, []

    failed_claims = select_failed_claims(verified_claims)

    # If all claims in the draft are already supported, no correction needed
    if not failed_claims:
        return draft_text, 0, False, verified_claims, []

    current_text = draft_text
    current_claims = verified_claims
    current_passages = list(retrieved_passages)
    rounds_executed = 0
    correction_history: List[Dict[str, Any]] = []
    seen_revisions = {draft_text.strip()}

    for round_idx in range(1, retries_limit + 1):
        rounds_executed = round_idx
        failed_subset = select_failed_claims(current_claims)

        if not failed_subset:
            # All claims successfully resolved
            return current_text, rounds_executed, False, current_claims, correction_history

        # 1. Retrieve additional evidence specifically for failed claims
        newly_retrieved = retrieve_targeted_evidence(db, workspace_id, failed_subset, current_passages)
        current_passages.extend(newly_retrieved)

        # 2. Critique failed claims and revise the draft
        revised_text = revise_answer(llm, query, current_text, failed_subset, current_passages)

        if not revised_text:
            break

        # 3. Prevent repeated identical correction attempts
        if revised_text in seen_revisions:
            break
        seen_revisions.add(revised_text)

        # 4. Re-extract claims and re-verify every claim in the revised text
        new_claims = extract_atomic_claims(revised_text)
        new_verification = verify_claims(new_claims, current_passages)

        if any(c.get("verdict") == "verification_error" for c in new_verification["claims"]):
            return revised_text, rounds_executed, False, new_verification["claims"], correction_history

        new_failures = select_failed_claims(new_verification["claims"])

        attempt_record = {
            "round": round_idx,
            "draft_before": current_text,
            "revised_text": revised_text,
            "targeted_claims": [c.get("claim_text") for c in failed_subset],
            "failed_count_before": len(failed_subset),
            "failed_count_after": len(new_failures),
            "new_evidence_chunks": [str(p.get("id") or p.get("chunk_id")) for p in newly_retrieved],
            "metrics": new_verification.get("metrics"),
        }
        correction_history.append(attempt_record)

        current_text = revised_text
        current_claims = new_verification["claims"]

        if not new_failures:
            return current_text, rounds_executed, False, current_claims, correction_history

    # 5. If verification still fails after max retries, apply the workspace abstention policy
    remaining_failures = select_failed_claims(current_claims)
    if should_abstain(remaining_failures, current_claims, abstention_policy):
        return ABSTENTION_TEXT, rounds_executed, True, current_claims, correction_history

    # Otherwise return revised text while preserving the actual unresolved verdicts (never claiming false success)
    return current_text, rounds_executed, False, current_claims, correction_history
