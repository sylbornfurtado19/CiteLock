"""Abstract LLM and Embedding provider interfaces and factory constructors."""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

from app.config import get_settings


class LLMProvider(ABC):
    """Abstract interface for large language model completion and structured judgement."""

    @abstractmethod
    def complete(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.0) -> str:
        """Generate text completion from prompt."""
        # TODO: Implement token streaming support
        pass

    @abstractmethod
    def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
        """Perform structured evaluation of a claim against provided evidence."""
        # TODO: Add JSON schema output enforcement
        pass


class EmbeddingProvider(ABC):
    """Abstract interface for remote API embedding generation."""

    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Generate dense vector embedding for single text string."""
        # TODO: Add client-side rate limit throttling and exponential backoff
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate dense vector embeddings for batch of text strings."""
        # TODO: Implement batch chunking for large payload batches
        pass


def get_llm_provider() -> LLMProvider:
    """Factory to instantiate configured LLM provider."""
    # TODO: Add dynamic fallback provider chaining
    settings = get_settings()
    provider_name = settings.llm_provider.lower()
    if provider_name == "gemini":
        from app.providers.gemini_adapter import GeminiProvider
        return GeminiProvider()
    from app.providers.openai_adapter import OpenAIProvider
    return OpenAIProvider()


def get_embedding_provider() -> EmbeddingProvider:
    """Factory to instantiate configured remote embedding provider."""
    # TODO: Support alternative API providers like Voyage AI or Cohere
    settings = get_settings()
    provider_name = settings.embedding_provider.lower()
    if provider_name == "gemini":
        from app.providers.gemini_adapter import GeminiProvider
        return GeminiProvider()
    from app.providers.openai_adapter import OpenAIProvider
    return OpenAIProvider()


def get_storage_provider():
    """Factory to instantiate configured object storage provider."""
    # TODO: Add S3/GCS adapter alternatives
    settings = get_settings()
    provider_name = settings.storage_provider.lower()
    if provider_name == "firebase":
        from app.providers.firebase_storage import FirebaseStorageProvider
        return FirebaseStorageProvider()
    from app.providers.none_storage import NoneStorageProvider
    return NoneStorageProvider()
