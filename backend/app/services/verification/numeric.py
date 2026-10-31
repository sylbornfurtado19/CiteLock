"""Numeric and quantitative precision checking service comparing figures, units, and dates."""

import re
from datetime import date
from typing import List, Dict, Any


def strip_citation_markers(text: str) -> str:
    """Strip citation markers like '[Passage 1]' and '[Chunk ID: <uuid>]' from text."""
    clean = re.sub(r"\[Passage\s+\d+(?:\s*,\s*\d+)*\]", "", text, flags=re.IGNORECASE)
    clean = re.sub(r"\[Chunk ID:\s*[^\]]+\]", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s+([.,!?;:])", r"\1", clean)
    return re.sub(r"\s{2,}", " ", clean).strip()


def extract_figures(text: str) -> List[str]:
    """
    Extract numbers, currency, percentages, and dates from text.
    Strips citation markers first and prevents dates like 2023-05-14 from splitting into three numbers.
    """
    clean_text = strip_citation_markers(text)

    # 1. Extract dates first (YYYY-MM-DD or YYYY/MM/DD)
    date_pattern = r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b"
    dates = []
    for match in re.finditer(date_pattern, clean_text):
        dates.append((match.start(), match.end(), match.group(0)))

    # 2. Extract standard numbers and currencies
    number_pattern = r"(?:[\$€£]?\b\d+(?:,\d{3})*(?:\.\d+)?(?:%|\s*(?:million|billion|thousand|[kKmMbB]|percent)\b)?)"
    numbers = []
    for match in re.finditer(number_pattern, clean_text, flags=re.IGNORECASE):
        m_start, m_end = match.start(), match.end()
        # Ensure number is not a component of an already-extracted date
        if not any(d_start <= m_start and m_end <= d_end for d_start, d_end, _ in dates):
            val_str = match.group(0).strip()
            if val_str:
                numbers.append((m_start, m_end, val_str))

    # Combine in text position order
    all_matches = sorted(dates + numbers, key=lambda x: x[0])
    return [m[2] for m in all_matches]


def _figure_type(raw: str) -> str:
    """Classify numeric figure into currency, percentage, date, year, scaled amount, or count."""
    r = raw.lower().strip()
    if re.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}$", r):
        return "date"
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
    """Parse numeric string or date into float representation."""
    cleaned = re.sub(r"[,\$%]", "", s).strip().lower()

    # Handle ISO / delimited dates
    if re.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}$", cleaned):
        try:
            parts = [int(p) for p in re.split(r"[-/]", cleaned)]
            return float(date(parts[0], parts[1], parts[2]).toordinal())
        except (ValueError, TypeError):
            return None

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
    Evidence number matching is performed per retrieved chunk, not against one combined string.
    Flags contradictions when numbers in the claim conflict with evidence figures of the same type.
    """
    claim_number_matches = extract_figures(claim_text)

    if not claim_number_matches:
        return {
            "passed": True,
            "extracted_numbers": [],
            "mismatches": [],
            "has_contradiction": False,
        }

    # Extract figures per individual retrieved chunk
    chunks_vals: List[List[tuple]] = []
    for passage in evidence_passages:
        figs = extract_figures(passage)
        c_vals = [
            (_normalize_num(m), m, _figure_type(m))
            for m in figs
            if _normalize_num(m) is not None
        ]
        chunks_vals.append(c_vals)

    claim_vals = [
        (_normalize_num(m), m, _figure_type(m))
        for m in claim_number_matches
        if _normalize_num(m) is not None
    ]

    mismatches = []
    has_contradiction = False

    for val, raw, ftype in claim_vals:
        if val is None:
            continue

        # Check exact or tolerance match against any individual chunk's figures
        # Dates and calendar years require exact equality, while continuous numbers allow 0.1% tolerance
        tolerance = 0.001 if ftype in ("date", "year") else max(0.001, 0.001 * abs(val))
        matched = False
        for c_vals in chunks_vals:
            if any(abs(val - ev[0]) < tolerance for ev in c_vals if ev[0] is not None):
                matched = True
                break

        if not matched:
            # Check for conflicting figures of the same type across retrieved chunks
            conflicting_ev = []
            for c_vals in chunks_vals:
                for ev in c_vals:
                    if ev[2] == ftype and ev[0] is not None:
                        if ev[1] not in conflicting_ev:
                            conflicting_ev.append(ev[1])

            if conflicting_ev:
                has_contradiction = True
                mismatches.append({
                    "claim_figure": raw,
                    "evidence_figures": conflicting_ev[:3],
                    "reason": f"Claim figure '{raw}' conflicts with figures of same type in evidence: {conflicting_ev[:3]}",
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
