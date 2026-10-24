"""Google Gemini API provider adapter for remote embeddings and structured verification."""

from typing import Any, Dict, List, Optional
import httpx

from app.config import get_settings
import json
from app.config import get_settings
from app.providers.base import (
    LLMProvider,
    EmbeddingProvider,
    ProviderError,
    MockEmbeddingProvider,
    MockLLMProvider,
)


class GeminiProvider(LLMProvider, EmbeddingProvider):
    """Google Gemini API integration for generative inference and text embeddings."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.llm_api_key or "placeholder-gemini-key"
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        self._mock_fallback = MockEmbeddingProvider()
        self._mock_llm = MockLLMProvider()

    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        """Call Gemini generateContent endpoint or fall back to local mock."""
        if not self.api_key or "placeholder" in self.api_key.lower():
            return self._mock_llm.complete(prompt, system_prompt, temperature)

        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"System Instructions: {system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        try:
            with httpx.Client(timeout=45.0) as client:
                res = client.post(
                    f"{self.base_url}/models/gemini-1.5-flash:generateContent?key={self.api_key}",
                    json={
                        "contents": contents,
                        "generationConfig": {"temperature": temperature},
                    },
                )
                if res.status_code != 200:
                    raise ProviderError(f"Gemini generateContent returned HTTP {res.status_code}: {res.text[:200]}")
                data = res.json()
                return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with Gemini API: {str(e)[:200]}")

    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        """Perform structured claim verification using Gemini structured JSON mode."""
        if not self.api_key or "placeholder" in self.api_key.lower():
            return self._mock_llm.structured_judge(claim, evidence_passages)

        system_instruction = (
            "You are a factual verification judge. Evaluate the user's claim strictly against the provided reference evidence.\n"
            "Return a JSON object with: 'verdict' (one of 'supported', 'partially_supported', 'contradicted', 'unsupported', 'insufficient_evidence'), "
            "'confidence_score' (float 0.0-1.0), 'rationale' (string), and 'supporting_quotes' (list of strings)."
        )

        passages_text = "\n\n".join(f"Passage {i+1}: {p}" for i, p in enumerate(evidence_passages))
        user_prompt = f"{system_instruction}\n\nClaim to evaluate: \"{claim}\"\n\nReference Evidence:\n{passages_text}"

        try:
            with httpx.Client(timeout=45.0) as client:
                res = client.post(
                    f"{self.base_url}/models/gemini-1.5-flash:generateContent?key={self.api_key}",
                    json={
                        "contents": [{"parts": [{"text": user_prompt}]}],
                        "generationConfig": {
                            "response_mime_type": "application/json",
                            "temperature": 0.0,
                        },
                    },
                )
                if res.status_code != 200:
                    raise ProviderError(f"Gemini judge returned HTTP {res.status_code}: {res.text[:200]}")
                text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with Gemini judge API: {str(e)[:200]}")

    def embed_text(self, text: str) -> List[float]:
        """Generate text embedding using text-embedding-004 or fallback mock."""
        batch_res = self.embed_batch([text])
        return batch_res[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate batch embeddings using batchEmbedContents or fallback mock."""
        if not texts:
            return []
        if not self.api_key or "placeholder" in self.api_key.lower():
            return self._mock_fallback.embed_batch(texts)

        try:
            with httpx.Client(timeout=45.0) as client:
                requests = [
                    {"model": "models/text-embedding-004", "content": {"parts": [{"text": t}]}}
                    for t in texts
                ]
                res = client.post(
                    f"{self.base_url}/models/text-embedding-004:batchEmbedContents?key={self.api_key}",
                    json={"requests": requests},
                )
                if res.status_code != 200:
                    raise ProviderError(f"Gemini embedding returned HTTP {res.status_code}: {res.text[:200]}")
                data = res.json()
                return [e["values"] for e in data.get("embeddings", [])]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with Gemini embedding API: {str(e)[:200]}")
