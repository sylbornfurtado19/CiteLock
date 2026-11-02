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
    embedding_dim: int = 768

    openai_llm_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Gemini model IDs must be checked against currently available models.
    gemini_llm_model: str = "gemini-3.8-flash"
    gemini_embedding_model: str = "gemini-embedding-001"

    groq_llm_model: str = "llama-3.3-70b-versatile"

    max_correction_retries: int = 2
    max_verification_workers: int = 5
    http_connect_timeout: float = 5.0
    http_read_timeout: float = 60.0
    http_write_timeout: float = 10.0
    http_max_keepalive_connections: int = 20
    http_max_connections: int = 50
    http_enable_http2: bool = False
    pipeline_cache_enabled: bool = True
    pipeline_cache_ttl_seconds: int = 600
    pipeline_cache_max_entries: int = 1000
    chunk_size: int = 500
    chunk_overlap: int = 50
    max_file_size_mb: int = 25
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "https://citelock.vercel.app"
    )
    port: int = 8000
    environment: str = "development"
    allow_dev_auth: bool = True

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
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

        allowed_llm_providers = allowed_providers | {"groq"}
        if self.llm_provider.lower() not in allowed_llm_providers:
            raise ValueError(
                f"Unknown LLM provider '{self.llm_provider}'. Allowed providers are: {', '.join(sorted(allowed_llm_providers))}."
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
            if self.llm_provider.lower() == "groq" and is_missing(self.llm_api_key):
                raise ValueError(
                    "LLM_API_KEY is required for Groq provider in production and cannot be empty or a placeholder."
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
