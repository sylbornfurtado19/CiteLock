import json
import re
from typing import List, Dict, Any
import app.providers.base as providers_base


def _fallback_sentence_claims(text: str) -> List[Dict[str, Any]]:
    """Rule-based atomic claim extraction by sentence boundary decomposition."""
    if not text.strip():
        return []
    raw_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    claims: List[Dict[str, Any]] = []
    for s in raw_sentences:
        # Strip leading bullet/list markers
        cleaned = re.sub(r"^[-*•\d\.\)]\s*", "", s).strip()
        if len(cleaned) < 5:
            continue
        cat = "numeric" if re.search(r"\b\d+(?:\.\d+)?%?\b", cleaned) else "factual"
        claims.append({
            "claim_index": len(claims),
            "claim_text": cleaned,
            "category": cat,
        })
    return claims


def extract_atomic_claims(draft_text: str) -> List[Dict[str, Any]]:
    """
    Decompose draft text into discrete, independent verifiable factual propositions.
    Uses structured LLM prompting with JSON validation, falling back to sentence segmentation.
    """
    cleaned_text = draft_text.strip()
    if not cleaned_text:
        return []

    llm = providers_base.get_llm_provider()

    system_prompt = (
        "You are an expert NLP claim-decomposition system for RAG hallucination auditing.\n"
        "Your task is to break down a draft response into atomic, self-contained factual propositions.\n"
        "Rules:\n"
        "1. Each claim must express a single proposition that can be verified independently against evidence.\n"
        "2. Resolve pronouns (e.g., 'it', 'they') to full entities where clear from context.\n"
        "3. Categorize each claim into: 'factual', 'numeric', 'temporal', or 'attribution'.\n"
        "4. Respond ONLY with a valid JSON array of objects with keys:\n"
        "   - 'claim_index': integer starting from 0\n"
        "   - 'claim_text': string expressing the atomic proposition\n"
        "   - 'category': string ('factual', 'numeric', 'temporal', 'attribution')\n"
        "Do NOT include conversational filler, explanations, or text outside the JSON array."
    )

    user_prompt = f"Text to decompose:\n\"\"\"{cleaned_text}\"\"\"\n\nAtomic Claims JSON:"

    try:
        response_text = llm.complete(user_prompt, system_prompt=system_prompt, temperature=0.0)
        # Clean potential markdown wrapping
        json_str = response_text.strip()
        if json_str.startswith("```"):
            json_str = re.sub(r"^```(?:json)?\s*", "", json_str)
            json_str = re.sub(r"\s*```$", "", json_str)

        parsed = json.loads(json_str)
        if isinstance(parsed, list) and len(parsed) > 0:
            validated_claims: List[Dict[str, Any]] = []
            for idx, item in enumerate(parsed):
                if isinstance(item, dict) and "claim_text" in item and item["claim_text"].strip():
                    validated_claims.append({
                        "claim_index": idx,
                        "claim_text": item["claim_text"].strip(),
                        "category": item.get("category", "factual"),
                    })
            if validated_claims:
                return validated_claims
    except Exception:
        pass

    # Fallback if LLM output was malformed or provider had an issue
    return _fallback_sentence_claims(cleaned_text)
