"""Numeric and quantitative precision checking service comparing figures, units, and dates."""

import re
from typing import List, Dict, Any


def _figure_type(raw: str) -> str:
    """Classify numeric figure into currency, percentage, year/date, scaled amount, or count."""
    r = raw.lower().strip()
    if "$" in r or "€" in r or "£" in r or "usd" in r:
        return "currency"
    if "%" in r or "percent" in r:
        return "percentage"
    if any(m in r for m in ["million", "billion", "thousand"]):
        return "scaled_amount"
    cleaned_num = re.sub(r"[^\d]", "", r)
    if len(cleaned_num) == 4 and (cleaned_num.startswith("19") or cleaned_num.startswith("20")):
        return "year"
    return "count"


def _normalize_num(s: str) -> float | None:
    """Parse numeric string with optional multipliers (k, m, b, million, billion) into float."""
    cleaned = re.sub(r"[,\$%]", "", s).strip().lower()
    mult = 1.0

    if cleaned.endswith("billion") or cleaned.endswith("b"):
        mult = 1_000_000_000.0
        cleaned = re.sub(r"(billion|b)$", "", cleaned).strip()
    elif cleaned.endswith("million") or cleaned.endswith("m"):
        mult = 1_000_000.0
        cleaned = re.sub(r"(million|m)$", "", cleaned).strip()
    elif cleaned.endswith("thousand") or cleaned.endswith("k"):
        mult = 1_000.0
        cleaned = re.sub(r"(thousand|k)$", "", cleaned).strip()
    elif cleaned.endswith("percent"):
        cleaned = re.sub(r"percent$", "", cleaned).strip()

    try:
        return float(cleaned) * mult
    except ValueError:
        return None


def verify_numeric_precision(claim_text: str, evidence_passages: List[str]) -> Dict[str, Any]:
    """
    Verify that quantities, currency figures, percentages, and dates in the claim match ground-truth passages.
    Flags contradictions when numbers in the claim conflict with evidence figures of the same type.
    Distinguishes unverified figures from genuine numeric contradictions.
    """
    number_pattern = r"(?:[\$€£]?\b\d+(?:,\d{3})*(?:\.\d+)?(?:%|\s*(?:million|billion|thousand|[kKmMbB]|percent)\b)?)"

    claim_number_matches = [m.strip() for m in re.findall(number_pattern, claim_text, re.IGNORECASE) if m.strip()]

    if not claim_number_matches:
        return {
            "passed": True,
            "extracted_numbers": [],
            "mismatches": [],
            "has_contradiction": False,
        }

    combined_evidence = " ".join(evidence_passages)
    ev_number_matches = [m.strip() for m in re.findall(number_pattern, combined_evidence, re.IGNORECASE) if m.strip()]

    claim_vals = [(_normalize_num(m), m, _figure_type(m)) for m in claim_number_matches if _normalize_num(m) is not None]
    ev_vals = [(_normalize_num(m), m, _figure_type(m)) for m in ev_number_matches if _normalize_num(m) is not None]

    mismatches = []
    has_contradiction = False

    for val, raw, ftype in claim_vals:
        if val is None:
            continue

        # Check exact or 0.1% tolerance match across all evidence numbers
        matched = any(abs(val - ev[0]) < max(0.001, 0.001 * abs(val)) for ev in ev_vals if ev[0] is not None)
        if not matched:
            # Check if evidence contains numbers of the same type (e.g. conflicting currency or percentage)
            same_type_ev = [ev for ev in ev_vals if ev[2] == ftype and ev[0] is not None]
            if same_type_ev:
                has_contradiction = True
                mismatches.append({
                    "claim_figure": raw,
                    "evidence_figures": [ev[1] for ev in same_type_ev[:3]],
                    "reason": f"Claim figure '{raw}' conflicts with figures of same type in evidence: {[ev[1] for ev in same_type_ev[:3]]}",
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
