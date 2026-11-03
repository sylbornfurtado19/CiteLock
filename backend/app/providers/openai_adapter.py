"""OpenAI API provider adapter with persistent HTTP connection pooling for embeddings and completions."""

from typing import Any, Dict, List, Optional
import json
import httpx

from app.config import get_settings
from app.providers.base import LLMProvider, EmbeddingProvider, ProviderError
from app.providers.http_client import get_http_client


class OpenAIProvider(LLMProvider, EmbeddingProvider):
    """OpenAI API integration reusing persistent connection pools for high-throughput inference."""

    # Provider name used in error messages; OpenAI-compatible subclasses (Groq) override it.
    label = "OpenAI"

    def __init__(self, client: Optional[httpx.Client] = None):
        settings = get_settings()
        self.api_key = settings.llm_api_key
        self.embedding_key = settings.embedding_api_key or self.api_key
        self.llm_model = settings.openai_llm_model
        self.embedding_model = settings.openai_embedding_model
        self.base_url = "https://api.openai.com/v1"
        self._client = client or get_http_client("openai")

    def close(self) -> None:
        """Close connection pool if this adapter instance manages its own client."""
        if self._client and not self._client.is_closed:
            self._client.close()

    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        """Call OpenAI chat completions API reusing pooled HTTP connection."""
        if not self.api_key or "placeholder" in self.api_key.lower():
            raise ProviderError(f"{self.label} LLM API key is missing or invalid.")

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            res = self._client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.llm_model,
                    "messages": messages,
                    "temperature": temperature,
                },
            )
            if res.status_code != 200:
                raise ProviderError(f"{self.label} completion returned HTTP {res.status_code}: {res.text[:200]}")
            data = res.json()
            return data["choices"][0]["message"]["content"].strip()
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with {self.label} chat completion API: {str(e)[:200]}")

    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        """Perform structured claim verification using OpenAI chat completions with JSON mode via pooled HTTP client."""
        if not self.api_key or "placeholder" in self.api_key.lower():
            raise ProviderError(f"{self.label} LLM API key is missing or invalid.")

        system_prompt = (
            "You are a rigorous factual verification judge. Evaluate the user's atomic claim strictly against the provided reference evidence.\n"
            "Respond ONLY with a JSON object containing:\n"
            "- 'verdict': one of ['supported', 'partially_supported', 'contradicted', 'unsupported', 'insufficient_evidence']\n"
            "- 'confidence_score': float between 0.0 and 1.0\n"
            "- 'rationale': brief explanation of the verdict\n"
            "- 'supporting_quotes': list of exact supporting substrings from the evidence\n"
            "Rules:\n"
            "1. 'contradicted': evidence explicitly refutes the claim.\n"
            "2. 'supported': evidence directly affirms the claim.\n"
            "3. 'partially_supported': evidence confirms part of the claim.\n"
            "4. 'unsupported': evidence mentions the topic but lacks the specific assertion.\n"
            "5. 'insufficient_evidence': evidence is empty or does not address the claim topic."
        )

        passages_text = "\n\n".join(f"Passage {i+1}: {p}" for i, p in enumerate(evidence_passages))
        user_prompt = f"Claim to evaluate: \"{claim}\"\n\nReference Evidence:\n{passages_text}"

        try:
            res = self._client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.llm_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.0,
                },
            )
            if res.status_code != 200:
                raise ProviderError(f"{self.label} judge returned HTTP {res.status_code}: {res.text[:200]}")
            raw_json = res.json()["choices"][0]["message"]["content"]
            return json.loads(raw_json)
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with {self.label} judge API: {str(e)[:200]}")

    def embed_text(self, text: str) -> List[float]:
        """Fetch vector embedding from configured OpenAI embedding model."""
        batch_res = self.embed_batch([text])
        return batch_res[0]

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Fetch batch vector embeddings from OpenAI API reusing persistent keep-alive connection."""
        if not texts:
            return []

        # Check for missing or placeholder key
        if not self.embedding_key or "placeholder" in self.embedding_key.lower():
            raise ProviderError("OpenAI embedding API key is missing or invalid.")

        try:
            response = self._client.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.embedding_key}"},
                json={"input": texts, "model": self.embedding_model},
            )
            if response.status_code != 200:
                raise ProviderError(f"OpenAI API returned error status {response.status_code}: {response.text[:200]}")
            data = response.json()
            sorted_data = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in sorted_data]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to communicate with OpenAI embedding API: {str(e)[:200]}")
