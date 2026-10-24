"""Unit tests for draft generation, claim extraction, verification engine, numeric checks, and provenance."""

import pytest
from app.services.generation.answer import generate_draft_answer, GenerationError
from app.services.generation.claim_extractor import extract_atomic_claims, _fallback_sentence_claims
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance
from app.services.verification.judge import evaluate_claim_with_judge
from app.services.verification.engine import verify_claims
from app.services.verification.scoring import compute_verification_metrics
from app.services.correction.controller import execute_correction_loop
from app.providers.base import MockLLMProvider, ProviderError
import app.providers.base as providers_base


def test_generate_draft_answer_with_passages(mock_llm):
    passages = [
        {"id": "c1", "filename": "report.pdf", "content": "CiteLock verifies factual claims in real-time."}
    ]
    ans = generate_draft_answer("What does CiteLock verify?", passages)
    assert ans is not None
    assert len(ans) > 10
    assert "CiteLock" in ans or "reference documents" in ans


def test_empty_retrieved_context():
    """Test 13: Empty retrieved context returns grounded disclaimer and never invents answers."""
    ans = generate_draft_answer("What is the revenue?", [])
    assert "no relevant reference evidence was found" in ans.lower()


def test_provider_timeout_and_api_failure(monkeypatch):
    """Test 9: Provider failure or timeout raises GenerationError and never returns a fake answer."""
    failing_provider = MockLLMProvider(simulate_failure=True)
    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: failing_provider)

    passages = [{"id": "c1", "content": "Some evidence content."}]
    with pytest.raises(GenerationError) as exc_info:
        generate_draft_answer("Explain the architecture", passages)
    assert "Model provider failed" in str(exc_info.value) or "Simulated" in str(exc_info.value)


def test_extract_atomic_claims_structured(mock_llm):
    draft = "CiteLock monitors RAG accuracy. It was launched in 2026. The operating margin reached 18%."
    claims = extract_atomic_claims(draft)
    assert len(claims) >= 3
    assert any("CiteLock" in c["claim_text"] for c in claims)
    assert any(c["category"] == "numeric" for c in claims)
    assert all(isinstance(c["claim_index"], int) for c in claims)
    assert all("start_char_offset" in c for c in claims)


def test_extract_atomic_claims_empty_text():
    assert extract_atomic_claims("") == []
    assert extract_atomic_claims("   ") == []


def test_malformed_llm_output_claim_extraction(monkeypatch):
    """Test 8: Malformed LLM output during extraction falls back safely to deterministic sentence parser."""
    class MalformedLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            return "This is not valid json at all {broken: bracket"

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: MalformedLLM())
    draft = "First factual proposition. Second proposition with 42% growth."
    claims = extract_atomic_claims(draft)
    assert len(claims) == 2
    assert claims[0]["is_fallback"] is True
    assert claims[0]["claim_text"] == "First factual proposition."
    assert claims[1]["claim_text"] == "Second proposition with 42% growth."


def test_fallback_filters_headings_and_questions():
    """Verify fallback claim extractor ignores headings and rhetorical questions."""
    text = "# Section 1: Introduction\nWhat is CiteLock? CiteLock verifies claims. Summary:"
    claims = _fallback_sentence_claims(text)
    assert len(claims) == 1
    assert "CiteLock verifies claims" in claims[0]["claim_text"]
    assert not any("?" in c["claim_text"] for c in claims)


def test_claim_supported(mock_llm):
    """Test 1: Claim supported by a source passage."""
    claims = [{"claim_index": 0, "claim_text": "CiteLock verifies factual claims in real-time."}]
    passages = [{"id": "c1", "content": "CiteLock verifies factual claims in real-time with cryptographic audit."}]
    res = verify_claims(claims, passages)
    assert len(res["claims"]) == 1
    c = res["claims"][0]
    assert c["verdict"] == "supported"
    assert c["confidence_score"] > 0.70
    assert len(c["evidence_references"]) == 1
    assert c["evidence_references"][0] == "c1"
    assert len(c["source_excerpts"]) >= 1


def test_claim_contradicted(monkeypatch):
    """Test 2: Claim contradicted by the source."""
    claims = [{"claim_index": 0, "claim_text": "The project was launched in Paris."}]
    passages = [{"id": "c1", "content": "The project was strictly not launched in Paris, but in Tokyo."}]

    class ContradictingJudge(MockLLMProvider):
        def structured_judge(self, claim, evidence_passages):
            return {
                "verdict": "contradicted",
                "confidence_score": 0.95,
                "rationale": "Evidence explicitly refutes that the project was launched in Paris.",
                "supporting_quotes": ["The project was strictly not launched in Paris"],
            }

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: ContradictingJudge())
    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "contradicted"
    assert c["confidence_score"] >= 0.90


def test_claim_unsupported(monkeypatch):
    """Test 3: An unsupported claim (topic mentioned, but specific assertion missing)."""
    claims = [{"claim_index": 0, "claim_text": "Quantum division doubled its workforce."}]
    passages = [{"id": "c1", "content": "The Quantum division had a meeting regarding roadmap planning."}]

    class UnsupportedJudge(MockLLMProvider):
        def structured_judge(self, claim, evidence_passages):
            return {
                "verdict": "unsupported",
                "confidence_score": 0.0,
                "rationale": "Passage mentions Quantum division but does not mention doubling workforce.",
                "supporting_quotes": [],
            }

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: UnsupportedJudge())
    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "unsupported"


def test_claim_partially_supported(monkeypatch):
    """Test 4: A partially supported claim."""
    claims = [{"claim_index": 0, "claim_text": "Revenue increased by 15% and headcount reached 500."}]
    passages = [{"id": "c1", "content": "Revenue increased by 15% during the fiscal year."}]

    class PartiallySupportedJudge(MockLLMProvider):
        def structured_judge(self, claim, evidence_passages):
            return {
                "verdict": "partially_supported",
                "confidence_score": 0.65,
                "rationale": "Passage confirms 15% revenue increase, but headcount detail is absent.",
                "supporting_quotes": ["Revenue increased by 15%"],
            }

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: PartiallySupportedJudge())
    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "partially_supported"


def test_claim_insufficient_evidence():
    """Test 5: Insufficient evidence when no reference passages are available."""
    claims = [{"claim_index": 0, "claim_text": "Solar energy output was 100 gigawatts."}]
    res = verify_claims(claims, [])
    c = res["claims"][0]
    assert c["verdict"] == "insufficient_evidence"
    assert c["confidence_score"] == 0.0
    assert len(c["evidence_references"]) == 0


def test_incorrect_numerical_values():
    """Test 6: Incorrect numerical values flag contradiction."""
    claim = "The company spent $45.2M on R&D."
    evidence = ["The financial tables show R&D expenditures reached $42.5M."]
    res = verify_numeric_precision(claim, evidence)
    assert res["passed"] is False
    assert res["has_contradiction"] is True
    assert len(res["mismatches"]) >= 1
    assert "conflicts" in res["mismatches"][0]["reason"]


def test_invalid_or_nonexistent_evidence_ids():
    """Test 7: Verification rejects invalid or nonexistent evidence IDs."""
    claims = [{"claim_index": 0, "claim_text": "Security is verified cryptographically."}]
    # Passages with real ID c-real
    passages = [{"id": "c-real", "content": "Security is verified cryptographically."}]

    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "supported"
    # All evidence references must belong to valid retrieved passage IDs
    valid_ids = {"c-real"}
    for ev_ref in c["evidence_references"]:
        assert str(ev_ref) in valid_ids


def test_retry_limits_and_termination():
    """Test 12: Retry limits enforce loop termination and prevent infinite loops."""
    # A persistent hallucination that cannot be fixed
    claims = [{"claim_index": 0, "claim_text": "Non-existent assertion xyz.", "verdict": "unsupported"}]
    passages = [{"id": "c1", "content": "Unrelated document about cooking recipes."}]

    final_text, rounds, is_abstained, final_claims, history = execute_correction_loop(
        "Query", "Draft with unsupported xyz.", claims, passages, max_retries=2
    )
    # Must terminate within max_retries
    assert rounds <= 2
    # Should abstain honestly when evidence is insufficient
    assert is_abstained is True
    assert "not contain sufficient evidence" in final_text


def test_compute_verification_metrics():
    claims = [
        {"verdict": "supported"},
        {"verdict": "supported"},
        {"verdict": "contradicted"},
        {"verdict": "unsupported"},
    ]
    metrics = compute_verification_metrics(claims)
    assert metrics["total_claims"] == 4
    assert metrics["hallucination_rate"] == 0.5
    assert metrics["supported_count"] == 2
    assert metrics["contradicted_count"] == 1
    assert metrics["unsupported_count"] == 1
