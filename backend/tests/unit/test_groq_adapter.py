"""Groq adapter resilience: transient timeouts and rate limits are retried, and errors name the real provider."""

import httpx
import pytest

import app.providers.groq_adapter as groq
from app.config import get_settings
from app.providers.base import ProviderError


class ScriptedClient:
    """Stands in for httpx.Client; each post() pops the next scripted outcome."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def post(self, url, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    is_closed = False


def ok(text="revised answer"):
    return httpx.Response(200, json={"choices": [{"message": {"content": text}}]})


@pytest.fixture
def provider_for(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(settings, "groq_llm_model", "test-model")
    monkeypatch.setattr(groq.time, "sleep", lambda s: None)

    def make(*outcomes):
        client = ScriptedClient(outcomes)
        return groq.GroqProvider(client=client), client

    return make


def test_transient_read_timeout_is_retried_and_succeeds(provider_for):
    provider, client = provider_for(httpx.ReadTimeout("The read operation timed out"), ok())
    assert provider.complete("prompt") == "revised answer"
    assert client.calls == 2


def test_timeouts_stop_after_the_retry_budget_and_name_groq(provider_for):
    provider, client = provider_for(*[httpx.ReadTimeout("The read operation timed out")] * 5)
    with pytest.raises(ProviderError) as exc:
        provider.complete("prompt")
    assert "Groq" in str(exc.value) and "OpenAI" not in str(exc.value)
    assert client.calls == 1 + groq._MAX_TIMEOUT_RETRIES


def test_rate_limits_are_retried_independently_of_timeouts(provider_for):
    limited = httpx.Response(429, text='{"error":"rate limit"}')
    provider, client = provider_for(limited, httpx.ReadTimeout("The read operation timed out"), limited, ok("done"))
    assert provider.complete("prompt") == "done"
    assert client.calls == 4


def test_non_transient_errors_are_not_retried(provider_for):
    provider, client = provider_for(httpx.Response(401, text="invalid api key"))
    with pytest.raises(ProviderError, match="Groq completion returned HTTP 401"):
        provider.complete("prompt")
    assert client.calls == 1


def test_openai_provider_keeps_its_own_label():
    from app.providers.openai_adapter import OpenAIProvider

    assert OpenAIProvider.label == "OpenAI" and groq.GroqProvider.label == "Groq"
