"""Groq API provider adapter (OpenAI-compatible chat completions; LLM only, no embeddings)."""

from typing import List, Optional
import httpx

from app.config import get_settings
from app.providers.base import ProviderError
from app.providers.http_client import get_http_client
from app.providers.openai_adapter import OpenAIProvider


class GroqProvider(OpenAIProvider):
    """Groq integration reusing the OpenAI chat-completions adapter against Groq's compatible endpoint."""

    def __init__(self, client: Optional[httpx.Client] = None):
        settings = get_settings()
        self.api_key = settings.llm_api_key
        self.embedding_key = None
        self.llm_model = settings.groq_llm_model
        self.embedding_model = ""
        self.base_url = "https://api.groq.com/openai/v1"
        self._client = client or get_http_client("groq")

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        raise ProviderError("Groq does not provide embeddings; set EMBEDDING_PROVIDER to gemini or openai.")
