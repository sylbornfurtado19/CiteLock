"""Self-correction controller managing iterative revision loops, retry bounds, and abstention."""

from typing import List, Dict, Any, Tuple
from app.config import get_settings
import app.providers.base as providers_base
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims


def execute_correction_loop(
    query: str,
    draft_text: str,
    verified_claims: List[Dict[str, Any]],
    retrieved_passages: List[Dict[str, Any]],
    max_retries: int | None = None,
) -> Tuple[str, int, bool, List[Dict[str, Any]]]:
    """
    Iteratively correct unsupported or contradictory claims up to maximum bounded retries.
    Re-verifies claims after each revision pass. Abstains if ungrounded claims cannot be resolved.
    """
    settings = get_settings()
    retries_limit = max_retries if max_retries is not None else settings.max_correction_retries
    llm = providers_base.get_llm_provider()

    failed_claims = [
        c for c in verified_claims
        if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence"]
    ]

    # If all claims in the draft are already supported/partially_supported, no correction needed
    if not failed_claims:
        return draft_text, 0, False, verified_claims

    current_text = draft_text
    current_claims = verified_claims
    rounds_executed = 0

    passage_texts = [
        f"[Passage {i+1}]: {p.get('content', '')}"
        for i, p in enumerate(retrieved_passages)
        if p.get("content", "").strip()
    ]
    passages_block = "\n\n".join(passage_texts)

    for round_idx in range(1, retries_limit + 1):
        rounds_executed = round_idx
        failed_subset = [
            c for c in current_claims
            if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence"]
        ]

        if not failed_subset:
            # All claims successfully resolved
            return current_text, rounds_executed, False, current_claims

        # Format critiques for failed claims
        critiques_list = []
        for c in failed_subset:
            critiques_list.append(
                f"- Problematic Claim: \"{c.get('claim_text')}\"\n"
                f"  Audit Verdict: {c.get('verdict')}\n"
                f"  Critique: {c.get('rationale', 'Not substantiated by evidence.')}"
            )
        critiques_block = "\n".join(critiques_list)

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

        # Re-extract claims and re-verify every claim in the revised text
        new_claims = extract_atomic_claims(revised_text)
        new_verification = verify_claims(new_claims, retrieved_passages)

        current_text = revised_text
        current_claims = new_verification["claims"]

        # Check if new verification succeeded
        new_failures = [
            c for c in current_claims
            if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence"]
        ]
        if not new_failures:
            return current_text, rounds_executed, False, current_claims

    # If verification still fails after max retries:
    remaining_failures = [
        c for c in current_claims
        if c.get("verdict") in ["unsupported", "contradicted", "insufficient_evidence"]
    ]

    # If majority or critical claims remain unverified, abstain honestly
    if len(remaining_failures) >= max(1, len(current_claims) // 2):
        abstention_text = "The provided reference documents do not contain sufficient evidence to confirm the stated claims."
        abstained_claims = extract_atomic_claims(abstention_text)
        abstained_verification = verify_claims(abstained_claims, retrieved_passages)
        return abstention_text, rounds_executed, True, abstained_verification["claims"]

    # Otherwise return revised text while preserving the actual unresolved verdicts
    return current_text, rounds_executed, False, current_claims
