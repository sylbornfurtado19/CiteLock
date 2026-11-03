"""Groq API provider adapter (OpenAI-compatible chat completions; LLM only, no embeddings)."""

import logging
import time
from typing import Any, Dict, List, Optional
import httpx

from app.config import get_settings
from app.providers.base import ProviderError
from app.providers.http_client import get_http_client
from app.providers.openai_adapter import OpenAIProvider

logger = logging.getLogger(__name__)

# Non-chat models served by Groq that must never be picked for text generation.
_EXCLUDED_MODEL_MARKERS = ("whisper", "guard", "tts", "playai", "embed", "orpheus", "safeguard")
# Substrings ranked by preference when auto-selecting a chat model.
_MAX_TIMEOUT_RETRIES = 2
_TIMEOUT_BACKOFF_SECONDS = 3.0
# Reasoning models on Groq can take longer than the default 60s per call.
_MIN_READ_TIMEOUT_SECONDS = 120.0
_MAX_RATE_LIMIT_RETRIES = 4
_RATE_LIMIT_BACKOFF_SECONDS = 10.0
_PREFERRED_MODEL_MARKERS =("versatile", "70b", "120b", "llama", "gpt-oss", "qwen")


class GroqProvider(OpenAIProvider):
    """Groq integration reusing the OpenAI chat-completions adapter against Groq's compatible endpoint."""

    label = "Groq"
    _resolved_model: Optional[str] = None

    def __init__(self, client: Optional[httpx.Client] = None):
        settings = get_settings()
        self.api_key = settings.llm_api_key
        self.embedding_key = None
        self.llm_model = GroqProvider._resolved_model or settings.groq_llm_model
        self.embedding_model = ""
        self.base_url = "https://api.groq.com/openai/v1"
        self._client = client or get_http_client("groq", read_timeout=max(settings.http_read_timeout, _MIN_READ_TIMEOUT_SECONDS))

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        raise ProviderError("Groq does not provide embeddings; set EMBEDDING_PROVIDER to gemini or openai.")

    def _pick_available_model(self) -> str:
        """Query Groq for models this key can use and choose the best chat-capable one."""
        try:
            res = self._client.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            if res.status_code != 200:
                raise ProviderError(f"Groq model listing returned HTTP {res.status_code}: {res.text[:200]}")
            ids = [m["id"] for m in res.json().get("data", []) if m.get("active", True)]
        except ProviderError:
            raise
        except Exception as e:
            raise ProviderError(f"Failed to list Groq models: {str(e)[:200]}")

        chat_ids = [i for i in ids if not any(x in i.lower() for x in _EXCLUDED_MODEL_MARKERS)]
        if not chat_ids:
            raise ProviderError("No chat-capable Groq models are available for this API key.")

        def rank(model_id: str) -> int:
            lowered = model_id.lower()
            for position, marker in enumerate(_PREFERRED_MODEL_MARKERS):
                if marker in lowered:
                    return position
            return len(_PREFERRED_MODEL_MARKERS)

        chosen = sorted(chat_ids, key=lambda i: (rank(i), i))[0]
        logger.warning("Groq model '%s' unavailable; auto-selected '%s'", self.llm_model, chosen)
        GroqProvider._resolved_model = chosen
        self.llm_model = chosen
        return chosen

    @staticmethod
    def _is_model_missing(error: ProviderError) -> bool:
        text = str(error)
        return "model_not_found" in text or "decommissioned" in text or "does not exist" in text

    def _call_with_recovery(self, fn):
        """Run a provider call, retrying on rate limits and re-selecting the model if it is missing."""
        model_reselected = False
        rate_limit_retries = 0
        timeout_retries = 0
        while True:
            try:
                return fn()
            except ProviderError as e:
                if self._is_model_missing(e) and not model_reselected:
                    model_reselected = True
                    self._pick_available_model()
                    continue
                if "HTTP 429" in str(e) and rate_limit_retries < _MAX_RATE_LIMIT_RETRIES:
                    rate_limit_retries += 1
                    delay = _RATE_LIMIT_BACKOFF_SECONDS * rate_limit_retries
                    logger.warning("Groq rate limited; retrying in %.0fs", delay)
                    time.sleep(delay)
                    continue
                if self._is_timeout(e) and timeout_retries < _MAX_TIMEOUT_RETRIES:
                    timeout_retries += 1
                    logger.warning("Groq request timed out; retry %d of %d", timeout_retries, _MAX_TIMEOUT_RETRIES)
                    time.sleep(_TIMEOUT_BACKOFF_SECONDS)
                    continue
                raise

    @staticmethod
    def _is_timeout(error: ProviderError) -> bool:
        text = str(error).lower()
        return "timed out" in text or "timeout" in text

    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        return self._call_with_recovery(
            lambda: super(GroqProvider, self).complete(prompt, system_prompt=system_prompt, temperature=temperature)
        )

    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        return self._call_with_recovery(
            lambda: super(GroqProvider, self).structured_judge(claim, evidence_passages)
        )
