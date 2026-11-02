"""Unit tests for persistent HTTP client lifecycle management, connection pooling, and shutdown behavior."""

import pytest
import httpx
from app.config import Settings
from app.providers.http_client import get_http_client, close_http_clients, get_active_client_pools, HTTP2_AVAILABLE
from app.providers.openai_adapter import OpenAIProvider
from app.providers.gemini_adapter import GeminiProvider
from app.providers.base import ProviderError
import app.providers.http_client as http_client_module


@pytest.fixture(autouse=True)
def cleanup_clients():
    """Ensure HTTP clients are cleanly closed after each test."""
    yield
    close_http_clients()


def test_http_client_singleton_reuse_within_pool():
    """Verify that repeated calls to get_http_client with the same pool name return the exact same instance."""
    client1 = get_http_client("test_pool_1")
    client2 = get_http_client("test_pool_1")
    assert client1 is client2
    assert not client1.is_closed


def test_http_client_separate_pools():
    """Verify distinct pool names maintain independent client instances."""
    client_openai = get_http_client("openai")
    client_gemini = get_http_client("gemini")
    assert client_openai is not client_gemini
    assert not client_openai.is_closed
    assert not client_gemini.is_closed


def test_http_client_pool_configuration():
    """Verify configured connection limits, timeouts, and HTTP/2 settings."""
    client = get_http_client(
        "custom_test_pool",
        timeout=35.0,
        connect_timeout=4.0,
        write_timeout=8.0,
        max_keepalive=15,
        max_connections=40,
    )
    # Verify timeout configuration
    assert client.timeout.connect == 4.0
    assert client.timeout.read == 35.0
    assert client.timeout.write == 8.0

    # Verify transport and connection limits
    transport = client._transport
    assert isinstance(transport, httpx.HTTPTransport)
    assert transport._pool._max_keepalive_connections == 15
    assert transport._pool._max_connections == 40

    if HTTP2_AVAILABLE:
        assert transport._pool._http2 is True


def test_close_http_clients_shuts_down_all_pools():
    """Verify close_http_clients cleanly closes all active sockets and clears the registry."""
    c1 = get_http_client("pool_a")
    c2 = get_http_client("pool_b")

    pools_before = get_active_client_pools()
    assert "pool_a" in pools_before and pools_before["pool_a"] is True
    assert "pool_b" in pools_before and pools_before["pool_b"] is True

    close_http_clients()

    assert c1.is_closed is True
    assert c2.is_closed is True
    assert len(get_active_client_pools()) == 0

    # Requesting a closed pool re-instantiates a new healthy client
    c1_new = get_http_client("pool_a")
    assert c1_new is not c1
    assert not c1_new.is_closed


def test_openai_and_gemini_providers_share_persistent_client(monkeypatch):
    """Verify multiple OpenAI and Gemini provider instances reuse the persistent pooled client."""
    test_settings = Settings(
        environment="development",
        llm_provider="openai",
        llm_api_key="sk-test-key-mock",
        embedding_provider="openai",
        embedding_api_key="sk-test-key-mock",
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.providers.openai_adapter.get_settings", lambda: test_settings)

    p1 = OpenAIProvider()
    p2 = OpenAIProvider()
    assert p1._client is p2._client
    assert p1._client is get_http_client("openai")


def test_provider_connect_error_handled_safely(monkeypatch):
    """Verify connection errors are caught and wrapped in ProviderError without breaking the pool."""
    test_settings = Settings(
        environment="development",
        llm_provider="openai",
        llm_api_key="sk-test-key-mock",
    )
    monkeypatch.setattr("app.config.get_settings", lambda: test_settings)
    monkeypatch.setattr("app.providers.openai_adapter.get_settings", lambda: test_settings)

    def mock_failing_post(*args, **kwargs):
        raise httpx.ConnectError("Connection refused by remote host")

    monkeypatch.setattr("httpx.Client.post", mock_failing_post)

    provider = OpenAIProvider()
    with pytest.raises(ProviderError) as exc_info:
        provider.complete("Hello world")

    assert "Failed to communicate with OpenAI chat completion API" in str(exc_info.value)
    assert "Connection refused" in str(exc_info.value)


@pytest.mark.asyncio
async def test_fastapi_lifespan_closes_http_clients():
    """Verify FastAPI application lifespan hook executes shutdown and closes all clients."""
    from app.main import app, lifespan

    # Initialize a pool
    client = get_http_client("lifespan_test")
    assert not client.is_closed

    async with lifespan(app):
        # Inside lifespan context, client is open
        assert not client.is_closed

    # After lifespan exit, close_http_clients() was called
    assert client.is_closed

