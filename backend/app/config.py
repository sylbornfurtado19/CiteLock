"""Application configuration and environment settings via pydantic-settings."""

from functools import lru_cache
from typing import List
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


@lru_cache()
def get_settings() -> Settings:
    """Retrieve cached application settings instance."""
    # TODO: Load and validate full environment overrides for cloud deployment
    return Settings()
