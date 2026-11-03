"""A lighter model can be configured for claim extraction and judging without touching answer generation."""

import pytest

import app.providers.base as providers_base
from app.config import get_settings
from app.providers.groq_adapter import GroqProvider
from app.services.cache import compute_pipeline_cache_key


# Captured at collection time, before any per-test fixture replaces it with a mock
_REAL_GET_LLM_PROVIDER = providers_base.get_llm_provider


@pytest.fixture
def groq_settings(monkeypatch):
    # the shared conftest patches get_llm_provider with a mock; use the real factory captured at import time
    monkeypatch.setattr(providers_base, "get_llm_provider", _REAL_GET_LLM_PROVIDER)
    settings = get_settings()
    monkeypatch.setattr(settings, "llm_provider", "groq")
    monkeypatch.setattr(settings, "llm_api_key", "test-key")
    monkeypatch.setattr(settings, "groq_llm_model", "big-reasoning-model")
    monkeypatch.setattr(GroqProvider, "_resolved_model", None)
    return settings


def test_unset_verifier_model_changes_nothing(groq_settings, monkeypatch):
    monkeypatch.setattr(groq_settings, "verifier_llm_model", None)
    assert providers_base.get_verifier_llm_provider().llm_model == "big-reasoning-model"


def test_verifier_model_overrides_only_the_verifier_provider(groq_settings, monkeypatch):
    monkeypatch.setattr(groq_settings, "verifier_llm_model", "small-fast-model")

    verifier = providers_base.get_verifier_llm_provider()
    main = providers_base.get_llm_provider()

    assert verifier.llm_model == "small-fast-model"
    assert main.llm_model == "big-reasoning-model"


def test_blank_verifier_model_is_ignored(groq_settings, monkeypatch):
    monkeypatch.setattr(groq_settings, "verifier_llm_model", "   ")
    assert providers_base.get_verifier_llm_provider().llm_model == "big-reasoning-model"


def test_a_missing_verifier_model_does_not_change_the_main_model(groq_settings, monkeypatch):
    monkeypatch.setattr(groq_settings, "verifier_llm_model", "retired-model")
    monkeypatch.setattr(GroqProvider, "_pick_available_model", GroqProvider._pick_available_model)
    verifier = providers_base.get_verifier_llm_provider()

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"data": [{"id": "llama-fallback", "active": True}]}

    class FakeClient:
        is_closed = False

        def get(self, *a, **k):
            return FakeResponse()

    verifier._client = FakeClient()
    verifier._pick_available_model()

    assert verifier.llm_model == "llama-fallback"
    assert GroqProvider._resolved_model is None, "the shared fallback must stay untouched by a verifier override"
    assert providers_base.get_llm_provider().llm_model == "big-reasoning-model"


def test_judge_and_claim_extraction_use_the_verifier_provider():
    import inspect
    import app.services.generation.claim_extractor as extractor
    import app.services.verification.judge as judge

    assert "get_verifier_llm_provider" in inspect.getsource(judge.evaluate_claim_with_judge)
    assert "get_verifier_llm_provider" in inspect.getsource(extractor.extract_atomic_claims)
    # answer generation and correction deliberately keep the main model
    import app.services.generation.answer as answer
    assert "get_verifier_llm_provider" not in inspect.getsource(answer.generate_draft_answer)


def test_changing_the_verifier_model_changes_the_cache_key(db, workspace_a, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "verifier_llm_model", None)
    before = compute_pipeline_cache_key(db, workspace_a.id, "same question", top_k=3)
    monkeypatch.setattr(settings, "verifier_llm_model", "small-fast-model")
    after = compute_pipeline_cache_key(db, workspace_a.id, "same question", top_k=3)
    assert before != after
