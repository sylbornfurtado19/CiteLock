"""Google Gemini API provider adapter for remote embeddings and structured verification."""

from typing import Any, Dict, List, Optional
import json
import httpx

from app.config import get_settings
from app.providers.base import (
    LLMProvider,
    EmbeddingProvider,
    ProviderError,
)


# Note: Gemini model IDs must be checked against currently available models.
class GeminiProvider(LLMProvider, EmbeddingProvider):
    """Google Gemini API integration for generative inference and text embeddings."""

    def __init__(self):
        settings = get_settings()
        self.llm_api_key = settings.llm_api_key
        self.embedding_api_key = settings.embedding_api_key
        # Gemini model IDs must be checked against currently available models.
        self.llm_model = settings.gemini_llm_model
        self.embedding_model = settings.gemini_embedding_model
        self.embedding_dim = settings.embedding_dim
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"

    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        """Call Gemini generateContent endpoint."""
        if not self.llm_api_key or "placeholder" in self.llm_api_key.lower():
            raise ProviderError("Gemini LLM API key is missing or invalid.")

        contents = []
        if system_prompt:
            contents.append({"role": "user", "parts": [{"text": f"System Instructions: {system_prompt}"}]})
            contents.append({"role": "model", "parts": [{"text": "Understood."}]})
        contents.append({"role": "user", "parts": [{"text": prompt}]})

        try:
            with httpx.Client(timeout=45.0) as client:
                res = client.post(
                    f"{self.base_url}/models/{self.llm_model}:generateContent",
                    headers={"x-goog-api-key": self.llm_api_key},
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
        if not self.llm_api_key or "placeholder" in self.llm_api_key.lower():
            raise ProviderError("Gemini LLM API key is missing or invalid.")

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
                    f"{self.base_url}/models/{self.llm_model}:generateContent",
                    headers={"x-goog-api-key": self.llm_api_key},
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
        """Generate text embedding using configured Gemini embedding model."""
        batch_res = self.embed_batch([text])
        return batch_res[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate batch embeddings using batchEmbedContents."""
        if not texts:
            return []
        if not self.embedding_api_key or "placeholder" in self.embedding_api_key.lower():
            raise ProviderError("Gemini embedding API key is missing or invalid.")

        model_name = self.embedding_model if self.embedding_model.startswith("models/") else f"models/{self.embedding_model}"
        try:
            with httpx.Client(timeout=45.0) as client:
                requests = [
                    {
                        "model": model_name,
                        "content": {"parts": [{"text": t}]},
                        "outputDimensionality": self.embedding_dim,
                    }
                    for t in texts
                ]
                res = client.post(
                    f"{self.base_url}/{model_name}:batchEmbedContents",
                    headers={"x-goog-api-key": self.embedding_api_key},
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
