"""Numeric and quantitative precision checking service comparing figures, units, and dates."""

import re
from typing import List, Dict, Any


def _normalize_num(s: str) -> float | None:
    """Parse numeric string into float for comparison."""
    cleaned = re.sub(r"[,\$%]", "", s).strip().lower()
    mult = 1.0
    if cleaned.endswith("k"):
        mult = 1_000.0
        cleaned = cleaned[:-1]
    elif cleaned.endswith("m"):
        mult = 1_000_000.0
        cleaned = cleaned[:-1]
    elif cleaned.endswith("b"):
        mult = 1_000_000_000.0
        cleaned = cleaned[:-1]
    try:
        return float(cleaned) * mult
    except ValueError:
        return None


def verify_numeric_precision(claim_text: str, evidence_passages: List[str]) -> Dict[str, Any]:
    """
    Verify that quantities, currency figures, and dates in the claim match ground-truth passages.
    Flags contradictions when numbers in the claim conflict with evidence figures.
    """
    # Extract numbers with optional decimals, currency, and suffix (%, M, K, B)
    claim_number_matches = re.findall(r"(?:\$?\b\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbB]|%)?\b)", claim_text)
    if not claim_number_matches:
        return {
            "passed": True,
            "extracted_numbers": [],
            "mismatches": [],
            "has_contradiction": False,
        }

    combined_evidence = " ".join(evidence_passages)
    ev_number_matches = re.findall(r"(?:\$?\b\d+(?:,\d{3})*(?:\.\d+)?(?:[kKmMbB]|%)?\b)", combined_evidence)

    claim_vals = [(_normalize_num(m), m) for m in claim_number_matches if _normalize_num(m) is not None]
    ev_vals = [(_normalize_num(m), m) for m in ev_number_matches if _normalize_num(m) is not None]
    ev_raw_nums = {v[0] for v in ev_vals if v[0] is not None}

    mismatches = []
    has_contradiction = False

    for val, raw in claim_vals:
        if val is None:
            continue
        # Check exact or 0.1% tolerance match
        matched = any(abs(val - ev_v) < max(0.001, 0.001 * abs(val)) for ev_v in ev_raw_nums)
        if not matched:
            # If evidence has numbers of similar magnitude or in similar entity context, it's a contradiction
            if ev_raw_nums:
                has_contradiction = True
                mismatches.append({
                    "claim_figure": raw,
                    "evidence_figures": [ev[1] for ev in ev_vals[:5]],
                    "reason": f"Claim figure '{raw}' conflicts with figures found in reference evidence: {[ev[1] for ev in ev_vals[:3]]}",
                })
            else:
                mismatches.append({
                    "claim_figure": raw,
                    "evidence_figures": [],
                    "reason": f"Figure '{raw}' does not appear in reference evidence.",
                })

    passed = len(mismatches) == 0
    return {
        "passed": passed,
        "extracted_numbers": claim_number_matches,
        "mismatches": mismatches,
        "has_contradiction": has_contradiction,
    }
