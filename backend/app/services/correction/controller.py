"""Self-correction controller managing iterative revision loops, targeted evidence retrieval, and abstention."""

import logging
from typing import List, Dict, Any, Tuple
from app.config import get_settings
import app.providers.base as providers_base
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.security.injection_guard import sanitize_untrusted_passage

logger = logging.getLogger(__name__)


def execute_correction_loop(
    query: str,
    draft_text: str,
    verified_claims: List[Dict[str, Any]],
    retrieved_passages: List[Dict[str, Any]],
    max_retries: int | None = None,
    db: Any = None,
    workspace_id: Any = None,
) -> Tuple[str, int, bool, List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Iteratively correct unsupported, contradicted, or partially supported claims up to maximum bounded retries.
    Performs targeted evidence retrieval for failed claims, re-verifies every claim,
    prevents repeated identical attempts, and cleanly abstains if ungrounded claims cannot be resolved.
    """
    settings = get_settings()
    retries_limit = max_retries if max_retries is not None else settings.max_correction_retries
    llm = providers_base.get_llm_provider()

    failed_claims = [
        c for c in verified_claims
        if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence", "partially_supported"]
    ]

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
        failed_subset = [
            c for c in current_claims
            if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence", "partially_supported"]
        ]

        if not failed_subset:
            # All claims successfully resolved
            return current_text, rounds_executed, False, current_claims, correction_history

        # 1. Retrieve additional evidence specifically for failed claims
        newly_retrieved = []
        if db is not None and workspace_id is not None:
            try:
                from app.services.retrieval.hybrid import retrieve_hybrid
                existing_ids = {
                    str(p.get("id") or p.get("chunk_id"))
                    for p in current_passages
                    if (p.get("id") or p.get("chunk_id"))
                }
                for fc in failed_subset[:2]:
                    claim_query = fc.get("claim_text", "")
                    if claim_query:
                        targeted_passages = retrieve_hybrid(db, workspace_id, claim_query, top_k=2)
                        for tp in targeted_passages:
                            tp_id = str(tp.get("id") or tp.get("chunk_id"))
                            if tp_id and tp_id not in existing_ids:
                                existing_ids.add(tp_id)
                                newly_retrieved.append(tp)
                if newly_retrieved:
                    current_passages.extend(newly_retrieved)
            except Exception:
                pass

        # 2. Format critiques for failed claims
        critiques_list = []
        for c in failed_subset:
            critiques_list.append(
                f"- Problematic Claim: \"{c.get('claim_text')}\"\n"
                f"  Audit Verdict: {c.get('verdict')}\n"
                f"  Critique: {c.get('rationale', 'Not substantiated by evidence.')}"
            )
        critiques_block = "\n".join(critiques_list)

        passage_texts = [
            f"[Passage {i+1}]: {p.get('content', '')}"
            for i, p in enumerate(current_passages)
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
            revised_text = llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0).strip()
        except Exception:
            # Provider failure during revision pass: break and evaluate current state
            break

        if not revised_text:
            break

        # 3. Prevent repeated identical correction attempts
        if revised_text in seen_revisions:
            break
        seen_revisions.add(revised_text)

        # 4. Re-extract claims and re-verify every claim in the revised text
        new_claims = extract_atomic_claims(revised_text)
        new_verification = verify_claims(new_claims, current_passages)

        new_failures = [
            c for c in new_verification["claims"]
            if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence", "partially_supported"]
        ]

        attempt_record = {
            "round": round_idx,
            "draft_before": current_text,
            "revised_text": revised_text,
            "targeted_claims": [c.get("claim_text") for c in failed_subset],
            "failed_count_before": len(failed_subset),
            "failed_count_after": len(new_failures),
            "new_evidence_chunks": [str(p.get("id") or p.get("chunk_id")) for p in newly_retrieved],
        }
        correction_history.append(attempt_record)

        current_text = revised_text
        current_claims = new_verification["claims"]

        if not new_failures:
            return current_text, rounds_executed, False, current_claims, correction_history

    # 5. If verification still fails after max retries:
    remaining_failures = [
        c for c in current_claims
        if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence", "partially_supported"]
    ]

    # If evidence remains insufficient or majority of claims remain unverified, abstain honestly
    if len(remaining_failures) >= max(1, len(current_claims) // 2):
        abstention_text = "The provided reference documents do not contain sufficient evidence to confirm the stated claims."
        abstained_claims = extract_atomic_claims(abstention_text)
        abstained_verification = verify_claims(abstained_claims, current_passages)
        return abstention_text, rounds_executed, True, abstained_verification["claims"], correction_history

    # Otherwise return revised text while preserving the actual unresolved verdicts (never claiming false success)
    return current_text, rounds_executed, False, current_claims, correction_history
