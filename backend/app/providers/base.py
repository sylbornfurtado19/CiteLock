"""Abstract LLM and Embedding provider interfaces and factory constructors."""

import hashlib
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import numpy as np

from app.config import get_settings


class ProviderError(Exception):
    """Base exception for external model provider failures."""
    pass


class LLMProvider(ABC):
    """Abstract interface for large language model completion and structured judgement."""

    @abstractmethod
    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        """Generate text completion from prompt."""
        pass

    @abstractmethod
    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        """Perform structured evaluation of a claim against provided evidence."""
        pass


class EmbeddingProvider(ABC):
    """Abstract interface for remote API embedding generation."""

    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Generate dense vector embedding for single text string."""
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate dense vector embeddings for batch of text strings."""
        pass


class MockEmbeddingProvider(EmbeddingProvider):
    """Deterministic, unit-normalized vector generator for offline testing and development."""

    def __init__(self, dimension: int = 1536, simulate_failure: bool = False):
        self.dimension = dimension
        self.simulate_failure = simulate_failure

    def embed_text(self, text: str) -> List[float]:
        if self.simulate_failure:
            raise ProviderError("Simulated embedding provider failure.")

        # Hash-seeded pseudo-random vector for deterministic semantic-like consistency
        seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)
        rng = np.random.default_rng(seed)
        vec = rng.standard_normal(self.dimension).astype(float)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        if self.simulate_failure:
            raise ProviderError("Simulated batch embedding provider failure.")
        return [self.embed_text(t) for t in texts]


class MockLLMProvider(LLMProvider):
    """Deterministic, local LLM provider for testing and development without live API keys."""

    def __init__(self, simulate_failure: bool = False):
        self.simulate_failure = simulate_failure

    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        if self.simulate_failure:
            raise ProviderError("Simulated LLM completion provider failure.")

        import re
        import json

        # Claim decomposition request
        if "JSON" in prompt and ("claim" in prompt.lower() or "decompose" in prompt.lower()):
            text_match = re.search(r"Text to decompose:\s*\"\"\"(.*?)\"\"\"", prompt, re.DOTALL)
            target_text = text_match.group(1).strip() if text_match else prompt
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", target_text) if s.strip()]
            if not sentences and target_text:
                sentences = [target_text]
            claims_data = []
            for idx, s in enumerate(sentences):
                cat = "numeric" if re.search(r"\b\d+", s) else "factual"
                claims_data.append({"claim_index": idx, "claim_text": s, "category": cat})
            return json.dumps(claims_data)

        # Self-correction revision request
        if "correct" in prompt.lower() and "critique" in prompt.lower():
            if "insufficient" in prompt.lower() or "abstain" in prompt.lower():
                return "The provided reference documents do not contain sufficient evidence to confirm the stated claims."
            draft_match = re.search(r"Original Draft:\s*(.*?)(?:Critiques:|$)", prompt, re.DOTALL)
            orig_draft = draft_match.group(1).strip() if draft_match else ""
            # Strip contradicted or false assertions from the draft
            cleaned = re.sub(r"(?i)\b(contradicted|unsupported|wrong|false)\b[^\.\!\?]*[\.\!\?]?", "", orig_draft).strip()
            return cleaned or "Based on verified evidence, the confirmed details remain grounded."

        # Grounded answer generation request
        passages_match = re.search(r"Passages:\s*(.*?)(?:User Query:|$)", prompt, re.DOTALL)
        if passages_match and passages_match.group(1).strip():
            passages_text = passages_match.group(1).strip()
            first_sentence = passages_text.split(".")[0].strip()
            return f"According to the reference documents, {first_sentence}."
        return "Based on the provided documentation, no relevant reference evidence was retrieved."

    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        if self.simulate_failure:
            raise ProviderError("Simulated judge provider failure.")

        import re

        if not evidence_passages or not any(p.strip() for p in evidence_passages):
            return {
                "verdict": "insufficient_evidence",
                "confidence_score": 0.0,
                "rationale": "No evidence passages provided to evaluate the claim.",
                "supporting_quotes": [],
            }

        combined_evidence = " ".join(evidence_passages).lower()
        claim_lower = claim.lower()

        # Check for explicit contradiction or negation
        if "not " in claim_lower and "not " not in combined_evidence:
            return {
                "verdict": "contradicted",
                "confidence_score": 0.90,
                "rationale": "Claim asserts a negation that contradicts the affirmative reference evidence.",
                "supporting_quotes": [evidence_passages[0][:150]],
            }

        # Check for numeric contradiction
        claim_nums = re.findall(r"\b\d+(?:\.\d+)?%?\b", claim_lower)
        ev_nums = re.findall(r"\b\d+(?:\.\d+)?%?\b", combined_evidence)
        if claim_nums and ev_nums and not any(num in ev_nums for num in claim_nums):
            return {
                "verdict": "contradicted",
                "confidence_score": 0.92,
                "rationale": f"Numeric claim {claim_nums} contradicts figures found in evidence: {ev_nums[:3]}.",
                "supporting_quotes": [evidence_passages[0][:150]],
            }

        # Token overlap analysis
        claim_words = set(re.findall(r"\b[a-zA-Z0-9_]{3,}\b", claim_lower))
        evidence_words = set(re.findall(r"\b[a-zA-Z0-9_]{3,}\b", combined_evidence))

        if not claim_words:
            return {
                "verdict": "insufficient_evidence",
                "confidence_score": 0.2,
                "rationale": "Claim lacks meaningful factual keywords.",
                "supporting_quotes": [],
            }

        overlap = claim_words.intersection(evidence_words)
        ratio = len(overlap) / len(claim_words)

        if ratio >= 0.55:
            matching_quote = evidence_passages[0][:150]
            for p in evidence_passages:
                if any(w in p.lower() for w in overlap):
                    matching_quote = p[:150]
                    break
            return {
                "verdict": "supported",
                "confidence_score": round(min(0.99, 0.70 + ratio * 0.3), 2),
                "rationale": f"Claim propositions are affirmed by evidence passages (keyword overlap: {ratio:.0%}).",
                "supporting_quotes": [matching_quote],
            }
        elif ratio >= 0.30:
            return {
                "verdict": "partially_supported",
                "confidence_score": round(0.50 + ratio * 0.2, 2),
                "rationale": f"Claim is partially corroborated, but certain details lack explicit verification in evidence.",
                "supporting_quotes": [evidence_passages[0][:100]],
            }
        elif ratio > 0.10:
            return {
                "verdict": "unsupported",
                "confidence_score": 0.75,
                "rationale": "Evidence mentions related entities but does not substantiate the specific assertion.",
                "supporting_quotes": [],
            }
        else:
            return {
                "verdict": "insufficient_evidence",
                "confidence_score": 0.85,
                "rationale": "The retrieved context does not contain relevant information to verify this claim.",
                "supporting_quotes": [],
            }


def get_llm_provider() -> LLMProvider:
    """Factory to instantiate configured LLM provider."""
    settings = get_settings()
    provider_name = settings.llm_provider.lower()
    if provider_name == "mock":
        return MockLLMProvider()
    if provider_name == "gemini":
        from app.providers.gemini_adapter import GeminiProvider
        return GeminiProvider()
    from app.providers.openai_adapter import OpenAIProvider
    return OpenAIProvider()


def get_embedding_provider() -> EmbeddingProvider:
    """Factory to instantiate configured remote embedding provider."""
    settings = get_settings()
    provider_name = settings.embedding_provider.lower()
    if provider_name == "gemini" and settings.gemini_api_key:
        from app.providers.gemini_adapter import GeminiProvider
        return GeminiProvider()
    if provider_name == "openai" and settings.openai_api_key:
        from app.providers.openai_adapter import OpenAIProvider
        return OpenAIProvider()
    return MockEmbeddingProvider()


def get_storage_provider():
    """Factory to instantiate configured object storage provider."""
    settings = get_settings()
    provider_name = settings.storage_provider.lower()
    if provider_name == "firebase" and settings.firebase_storage_bucket:
        try:
            from app.providers.firebase_storage import FirebaseStorageProvider
            return FirebaseStorageProvider()
        except Exception:
            pass
    from app.providers.none_storage import NoneStorageProvider
    return NoneStorageProvider()
