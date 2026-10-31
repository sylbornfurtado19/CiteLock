"""Application configuration and environment settings via pydantic-settings."""

from functools import lru_cache
from typing import List, Optional
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration settings loaded from environment variables."""

    database_url: str = "postgresql+psycopg://citelock:citelock_dev_password@localhost:5432/citelock"
    firebase_service_account_json: str | None = None
    firebase_storage_bucket: str | None = None
    storage_provider: str = "firebase"
    llm_provider: str = "openai"
    llm_api_key: str | None = None
    embedding_provider: str = "openai"
    embedding_api_key: str | None = None
    embedding_dim: int = 1536

    openai_llm_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Gemini model IDs must be checked against currently available models.
    gemini_llm_model: str = "gemini-1.5-flash"
    gemini_embedding_model: str = "text-embedding-004"

    max_correction_retries: int = 2
    chunk_size: int = 500
    chunk_overlap: int = 50
    max_file_size_mb: int = 25
    cors_origins: str = "http://localhost:3000,https://citelock.vercel.app"
    port: int = 8000
    environment: str = "production"
    allow_dev_auth: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_providers_and_keys(self) -> "Settings":
        allowed_providers = {"openai", "gemini", "mock"}

        if self.llm_provider.lower() not in allowed_providers:
            raise ValueError(
                f"Unknown LLM provider '{self.llm_provider}'. Allowed providers are: {', '.join(sorted(allowed_providers))}."
            )

        if self.embedding_provider.lower() not in allowed_providers:
            raise ValueError(
                f"Unknown embedding provider '{self.embedding_provider}'. Allowed providers are: {', '.join(sorted(allowed_providers))}."
            )

        if self.environment.lower() == "production":
            def is_missing(key: Optional[str]) -> bool:
                return not key or not key.strip() or "placeholder" in key.lower()

            if self.llm_provider.lower() == "openai" and is_missing(self.llm_api_key):
                raise ValueError(
                    "LLM_API_KEY is required for OpenAI provider in production and cannot be empty or a placeholder."
                )
            if self.llm_provider.lower() == "gemini" and is_missing(self.llm_api_key):
                raise ValueError(
                    "LLM_API_KEY is required for Gemini provider in production and cannot be empty or a placeholder."
                )
            if self.embedding_provider.lower() == "gemini" and is_missing(self.embedding_api_key):
                raise ValueError(
                    "EMBEDDING_API_KEY is required for Gemini embedding provider in production and cannot be empty or a placeholder."
                )
            if self.embedding_provider.lower() == "openai" and is_missing(self.embedding_api_key) and is_missing(self.llm_api_key):
                raise ValueError(
                    "EMBEDDING_API_KEY (or LLM_API_KEY) is required for OpenAI embedding provider in production and cannot be empty or a placeholder."
                )

        return self


@lru_cache()
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    # TODO: Load and validate full environment overrides for cloud deployment
    return Settings()
