"""Atomic claim decomposition service extracting independently verifiable factual propositions."""

import json
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

import app.providers.base as providers_base


def strip_citation_markers(text: str) -> tuple[str, List[int]]:
    """
    Extract cited passage indices from citation markers and strip them from the claim text.
    Handles markers like '[Passage 1]', '[Passage 1, 2]', and '[Chunk ID: <uuid>]'.
    Returns cleaned text and a list of integer cited passage numbers.
    """
    passage_matches = re.findall(r"\[Passage\s+(\d+(?:\s*,\s*\d+)*)\]", text, flags=re.IGNORECASE)
    cited_passages: List[int] = []
    for match in passage_matches:
        for num_str in re.split(r"\s*,\s*", match):
            if num_str.isdigit():
                cited_passages.append(int(num_str))

    # Strip [Passage ...] markers
    cleaned = re.sub(r"\[Passage\s+\d+(?:\s*,\s*\d+)*\]", "", text, flags=re.IGNORECASE)

    # Strip [Chunk ID: ...] markers
    cleaned = re.sub(r"\[Chunk ID:\s*[^\]]+\]", "", cleaned, flags=re.IGNORECASE)

    # Clean whitespace before punctuation
    cleaned = re.sub(r"\s+([.,!?;:])", r"\1", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()

    return cleaned, cited_passages


class ExtractedClaim(BaseModel):
    """Structured atomic claim representation with position mapping and verification status."""
    claim_index: int
    claim_text: str
    category: str = Field(default="factual")  # factual, numeric, temporal, attribution
    source_sentence: Optional[str] = None
    start_char_offset: Optional[int] = None
    end_char_offset: Optional[int] = None
    is_fallback: bool = False
    cited_passages: List[int] = Field(default_factory=list)


def _is_heading_or_question(sentence: str) -> bool:
    """Detect whether a string is a question, header, or formatting artifact rather than a factual claim."""
    s = sentence.strip()
    if not s or s.endswith("?"):
        return True
    if re.match(r"^#{1,6}\s+", s) or re.match(r"^[A-Z\s]{4,}:?$", s):
        return True
    if s.endswith(":") and len(s.split()) < 6:
        return True
    if len(s) < 12:
        return True
    return False


def _fallback_sentence_claims(text: str) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based atomic claim extraction by sentence boundary decomposition.
    Filters out headings, questions, and formatting artifacts.
    Claims from fallback are marked is_fallback=True and are NEVER marked as verified automatically.
    """
    if not text.strip():
        return []

    raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    claims: List[Dict[str, Any]] = []

    for s in raw_sentences:
        cleaned = re.sub(r"^[-*•\d\.\)]\s*", "", s).strip()
        cleaned_claim, cited_passages = strip_citation_markers(cleaned)
        if _is_heading_or_question(cleaned_claim):
            continue

        cat = "numeric" if re.search(r"\b\d+(?:\.\d+)?%?\b", cleaned_claim) else "factual"

        start_offset = text.find(s)
        end_offset = start_offset + len(s) if start_offset != -1 else None

        claim_obj = ExtractedClaim(
            claim_index=len(claims),
            claim_text=cleaned_claim,
            category=cat,
            source_sentence=s,
            start_char_offset=start_offset if start_offset != -1 else None,
            end_char_offset=end_offset,
            is_fallback=True,
            cited_passages=cited_passages,
        )
        claims.append(claim_obj.model_dump())

    return claims


def extract_atomic_claims(draft_text: str) -> List[Dict[str, Any]]:
    """
    Decompose draft text into discrete, independent verifiable factual propositions.
    Uses structured LLM prompting with JSON validation and position mapping,
    falling back to deterministic sentence segmentation. Never marks claims as verified automatically.
    """
    cleaned_text = draft_text.strip()
    if not cleaned_text:
        return []

    llm = providers_base.get_llm_provider()

    system_prompt = (
        "You are CiteLock's expert NLP claim decomposition engine.\n"
        "Your task is to decompose a draft answer into atomic, independently verifiable factual claims.\n"
        "Rules:\n"
        "1. Each claim must express a single factual proposition that can be verified against evidence.\n"
        "2. Exclude rhetorical questions, greetings, section headings, and conversational filler.\n"
        "3. Resolve ambiguous pronouns (e.g., 'it', 'they', 'the company') to full named entities.\n"
        "4. Categorize each claim into: 'factual', 'numeric', 'temporal', or 'attribution'.\n"
        "5. Return ONLY a valid JSON array of objects with keys:\n"
        "   - 'claim_index': integer starting from 0\n"
        "   - 'claim_text': string expressing the atomic proposition\n"
        "   - 'category': string ('factual', 'numeric', 'temporal', 'attribution')\n"
        "   - 'source_sentence': the original sentence from the draft text where this claim originates."
    )

    user_prompt = f"Draft Text to Decompose:\n\"\"\"{cleaned_text}\"\"\"\n\nAtomic Claims JSON:"

    try:
        response_text = llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0)
        json_str = response_text.strip()
        if json_str.startswith("```"):
            json_str = re.sub(r"^```(?:json)?\s*", "", json_str)
            json_str = re.sub(r"\s*```$", "", json_str)

        parsed = json.loads(json_str)
        if isinstance(parsed, list) and len(parsed) > 0:
            validated_claims: List[Dict[str, Any]] = []
            for idx, item in enumerate(parsed):
                if not isinstance(item, dict):
                    continue
                c_text = item.get("claim_text", "").strip()
                cleaned_claim, cited_passages = strip_citation_markers(c_text)
                if not cleaned_claim or _is_heading_or_question(cleaned_claim):
                    continue

                source_sentence = item.get("source_sentence")
                if not cited_passages and source_sentence:
                    _, cited_passages = strip_citation_markers(source_sentence)

                start_offset = None
                end_offset = None
                if source_sentence and source_sentence in cleaned_text:
                    start_offset = cleaned_text.find(source_sentence)
                    end_offset = start_offset + len(source_sentence)
                elif cleaned_claim in cleaned_text:
                    start_offset = cleaned_text.find(cleaned_claim)
                    end_offset = start_offset + len(cleaned_claim)
                elif c_text in cleaned_text:
                    start_offset = cleaned_text.find(c_text)
                    end_offset = start_offset + len(c_text)

                claim_model = ExtractedClaim(
                    claim_index=len(validated_claims),
                    claim_text=cleaned_claim,
                    category=item.get("category", "factual"),
                    source_sentence=source_sentence,
                    start_char_offset=start_offset,
                    end_char_offset=end_offset,
                    is_fallback=False,
                    cited_passages=cited_passages,
                )
                validated_claims.append(claim_model.model_dump())

            if validated_claims:
                return validated_claims
    except Exception:
        pass

    # Safe deterministic fallback if LLM output was malformed or provider had an issue
    return _fallback_sentence_claims(cleaned_text)
