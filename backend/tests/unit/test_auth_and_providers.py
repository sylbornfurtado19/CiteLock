"""Tests for authentication and model provider failure behaviors."""

import uuid
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.providers.base import (
    get_llm_provider,
    get_embedding_provider,
    MockLLMProvider,
    MockEmbeddingProvider,
    ProviderError,
)
from app.providers.openai_adapter import OpenAIProvider
from app.providers.gemini_adapter import GeminiProvider
from app.db.models.documents import Document
from app.services.ingestion.indexer import index_document
from tests.conftest import create_sample_pdf


def test_production_without_keys_fails_to_start():
    """In production, missing or placeholder required keys must fail at startup (validate in config.py)."""
    # 1. Missing LLM key for OpenAI
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            llm_provider="openai",
            llm_api_key=None,
            embedding_provider="mock",
        )
    assert "LLM_API_KEY is required for OpenAI provider in production" in str(exc.value)

    # 2. Placeholder LLM key for OpenAI
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            llm_provider="openai",
            llm_api_key="sk-placeholder-llm-key",
            embedding_provider="mock",
        )
    assert "LLM_API_KEY is required for OpenAI provider in production" in str(exc.value)

    # 3. Missing LLM key for Gemini
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            llm_provider="gemini",
            llm_api_key="",
            embedding_provider="mock",
        )
    assert "LLM_API_KEY is required for Gemini provider in production" in str(exc.value)

    # 4. Missing embedding key for Gemini (must use embedding_api_key, not llm_api_key)
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            llm_provider="mock",
            embedding_provider="gemini",
            embedding_api_key=None,
            llm_api_key="real-gemini-llm-key",
        )
    assert "EMBEDDING_API_KEY is required for Gemini embedding provider in production" in str(exc.value)

    # 5. Missing embedding key for OpenAI when llm_api_key is also missing
    with pytest.raises(ValidationError) as exc:
        Settings(
            environment="production",
            llm_provider="mock",
            embedding_provider="openai",
            embedding_api_key=None,
            llm_api_key=None,
        )
    assert "EMBEDDING_API_KEY (or LLM_API_KEY) is required for OpenAI embedding provider in production" in str(exc.value)


def test_dev_without_allow_dev_auth_returns_401(monkeypatch, db):
    """Dev auth bypass requires BOTH ENVIRONMENT=development AND ALLOW_DEV_AUTH=true.
    When ALLOW_DEV_AUTH=false in dev, unauthenticated requests must return 401."""
    test_settings = Settings(
        environment="development",
        allow_dev_auth=False,
        llm_provider="mock",
        embedding_provider="mock",
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: test_settings)

    # Unauthenticated request (no Authorization header)
    unauth_client = TestClient(app)
    response = unauth_client.get("/api/v1/workspaces")
    assert response.status_code == 401
    assert "Development bypass is disabled" in response.json()["detail"]


def test_invalid_token_returns_401_in_dev(monkeypatch, db):
    """In dev with ALLOW_DEV_AUTH=true, an invalid token must return 401, not be remapped to a shared placeholder user."""
    test_settings = Settings(
        environment="development",
        allow_dev_auth=True,
        llm_provider="mock",
        embedding_provider="mock",
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.security.firebase_auth.get_settings", lambda: test_settings)

    client_dev = TestClient(app)
    response = client_dev.get(
        "/api/v1/workspaces",
        headers={"Authorization": "Bearer invalid_garbage_token_123"},
    )
    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"] or "expired" in response.json()["detail"]


def test_mock_providers_only_when_explicitly_selected(monkeypatch):
    """Mocks are opt-in only (LLM_PROVIDER=mock and EMBEDDING_PROVIDER=mock).
    In any other environment, a missing key for a non-mock provider must raise ProviderError, not return mock output.
    Unknown provider names must raise a config error."""

    # 1. Unknown provider names raise ValidationError (config error)
    with pytest.raises(ValidationError):
        Settings(environment="development", llm_provider="unsupported_llm")

    with pytest.raises(ValidationError):
        Settings(environment="development", embedding_provider="unsupported_embed")

    # 2. When mock is explicitly selected
    mock_settings = Settings(
        environment="development",
        llm_provider="mock",
        embedding_provider="mock",
    )
    monkeypatch.setattr("app.providers.base.get_settings", lambda: mock_settings)
    monkeypatch.setattr("app.config.get_settings", lambda: mock_settings)

    llm = get_llm_provider()
    embed = get_embedding_provider()
    assert isinstance(llm, MockLLMProvider)
    assert isinstance(embed, MockEmbeddingProvider)

    # 3. In non-production (e.g. development), missing key for OpenAI raises ProviderError, not mock output
    dev_openai = Settings(
        environment="development",
        llm_provider="openai",
        llm_api_key=None,
        embedding_provider="openai",
        embedding_api_key=None,
    )
    monkeypatch.setattr("app.providers.base.get_settings", lambda: dev_openai)
    monkeypatch.setattr("app.config.get_settings", lambda: dev_openai)
    monkeypatch.setattr("app.providers.openai_adapter.get_settings", lambda: dev_openai)

    openai_llm = get_llm_provider()
    assert isinstance(openai_llm, OpenAIProvider)
    with pytest.raises(ProviderError) as exc_llm:
        openai_llm.complete("What is CiteLock?")
    assert "missing or invalid" in str(exc_llm.value).lower()

    openai_embed = get_embedding_provider()
    assert isinstance(openai_embed, OpenAIProvider)
    with pytest.raises(ProviderError) as exc_embed:
        openai_embed.embed_batch(["text"])
    assert "missing or invalid" in str(exc_embed.value).lower()

    # 4. In non-production (e.g. development), missing key for Gemini raises ProviderError, not mock output
    dev_gemini = Settings(
        environment="development",
        llm_provider="gemini",
        llm_api_key="placeholder-gemini-key",
        embedding_provider="gemini",
        embedding_api_key="placeholder-gemini-embed-key",
    )
    monkeypatch.setattr("app.providers.base.get_settings", lambda: dev_gemini)
    monkeypatch.setattr("app.config.get_settings", lambda: dev_gemini)
    monkeypatch.setattr("app.providers.gemini_adapter.get_settings", lambda: dev_gemini)

    gemini_llm = get_llm_provider()
    assert isinstance(gemini_llm, GeminiProvider)
    with pytest.raises(ProviderError) as exc_gem_llm:
        gemini_llm.complete("What is CiteLock?")
    assert "missing or invalid" in str(exc_gem_llm.value).lower()

    gemini_embed = get_embedding_provider()
    assert isinstance(gemini_embed, GeminiProvider)
    with pytest.raises(ProviderError) as exc_gem_embed:
        gemini_embed.embed_batch(["text"])
    assert "missing or invalid" in str(exc_gem_embed.value).lower()


def test_wrong_embedding_dimension_marks_document_failed(db, workspace_a, monkeypatch):
    """In indexer.py validate len(embedding) == EMBEDDING_DIM, failing the document with a clear error_message."""
    import app.providers.base as providers_base
    from app.providers.base import EmbeddingProvider

    class MismatchedDimProvider(EmbeddingProvider):
        def embed_text(self, text: str):
            return [0.1] * 768  # Configured default is 1536

        def embed_batch(self, texts):
            return [[0.1] * 768 for _ in texts]

    monkeypatch.setattr(providers_base, "get_embedding_provider", lambda: MismatchedDimProvider())

    pdf_bytes = create_sample_pdf("Testing dimension validation failure.")
    doc = Document(
        id=uuid.uuid4(),
        workspace_id=workspace_a.id,
        filename="dim_fail.pdf",
        storage_path=f"workspaces/{workspace_a.id}/documents/dim_fail.pdf",
        checksum="chk_dim_fail",
        status="uploaded",
        file_size_bytes=len(pdf_bytes),
        mime_type="application/pdf",
    )
    db.add(doc)
    db.commit()

    indexed_doc = index_document(db, doc.id, pdf_bytes)
    assert indexed_doc.status == "failed"
    assert "Embedding dimension mismatch: expected 1536, got 768." in indexed_doc.error_message


def test_verify_returns_401_unauthenticated(monkeypatch):
    """POST /api/v1/verify requires get_current_user and returns 401 when unauthenticated."""
    test_settings = Settings(
        environment="development",
        allow_dev_auth=False,
        llm_provider="mock",
        embedding_provider="mock",
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.api.deps.get_settings", lambda: test_settings)

    unauth_client = TestClient(app)
    response = unauth_client.post(
        "/api/v1/verify",
        json={
            "statement": "CiteLock verifies RAG accuracy.",
            "context_passages": ["CiteLock verifies RAG accuracy through citation grounding."],
        },
    )
    assert response.status_code == 401


def test_verify_caps_statement_and_passages(client):
    """POST /api/v1/verify caps statement length and number/size of context passages."""
    # 1. Statement exceeding 1000 characters
    res = client.post(
        "/api/v1/verify",
        json={
            "statement": "a" * 1001,
            "context_passages": ["Valid passage"],
        },
    )
    assert res.status_code == 422

    # 2. More than 20 context passages
    res = client.post(
        "/api/v1/verify",
        json={
            "statement": "Valid statement",
            "context_passages": [f"Passage {i}" for i in range(21)],
        },
    )
    assert res.status_code == 422

    # 3. Context passage exceeding 5000 characters
    res = client.post(
        "/api/v1/verify",
        json={
            "statement": "Valid statement",
            "context_passages": ["x" * 5001],
        },
    )
    assert res.status_code == 422

    # 4. Valid verify request passes
    res = client.post(
        "/api/v1/verify",
        json={
            "statement": "CiteLock is an auditor.",
            "context_passages": ["CiteLock is an auditor for citations."],
        },
    )
    assert res.status_code == 200
    assert "verdict" in res.json()


def test_gemini_adapter_headers_and_payload(monkeypatch):
    """Gemini adapter sends x-goog-api-key header (not URL query), uses embedding_api_key, and sets outputDimensionality."""
    recorded_requests = []

    def mock_post(url, *args, **kwargs):
        recorded_requests.append({"url": str(url), "headers": kwargs.get("headers"), "json": kwargs.get("json")})
        class MockResponse:
            status_code = 200
            def json(self):
                if "batchEmbedContents" in str(url):
                    return {"embeddings": [{"values": [0.0] * 1536}]}
                return {"candidates": [{"content": {"parts": [{"text": "response text"}]}}]}
        return MockResponse()

    monkeypatch.setattr("httpx.Client.post", mock_post)

    test_settings = Settings(
        environment="development",
        llm_provider="gemini",
        llm_api_key="gemini-llm-secret",
        embedding_provider="gemini",
        embedding_api_key="gemini-embed-secret",
        gemini_llm_model="gemini-1.5-flash",
        gemini_embedding_model="text-embedding-004",
        embedding_dim=1536,
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.providers.gemini_adapter.get_settings", lambda: test_settings)

    provider = GeminiProvider()

    # Test complete
    provider.complete("Test prompt")
    assert len(recorded_requests) == 1
    req1 = recorded_requests[0]
    assert "?key=" not in req1["url"]
    assert req1["headers"].get("x-goog-api-key") == "gemini-llm-secret"

    # Test embed_batch
    provider.embed_batch(["Test embedding passage"])
    assert len(recorded_requests) == 2
    req2 = recorded_requests[1]
    assert "?key=" not in req2["url"]
    assert req2["headers"].get("x-goog-api-key") == "gemini-embed-secret"
    assert req2["json"]["requests"][0]["outputDimensionality"] == 1536

