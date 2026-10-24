"""Unit tests for draft generation, claim extraction, verification engine, numeric checks, and provenance."""

import pytest
from app.services.generation.answer import generate_draft_answer
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.numeric import verify_numeric_precision
from app.services.verification.provenance import trace_claim_provenance
from app.services.verification.judge import evaluate_claim_with_judge
from app.services.verification.engine import verify_claims
from app.services.verification.scoring import compute_verification_metrics
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


def test_generate_draft_answer_empty_passages():
    ans = generate_draft_answer("What is the revenue?", [])
    assert "no relevant reference evidence was found" in ans.lower()


def test_extract_atomic_claims_structured(mock_llm):
    draft = "CiteLock monitors RAG accuracy. It was launched in 2026. The operating margin reached 18%."
    claims = extract_atomic_claims(draft)
    assert len(claims) >= 3
    assert any("CiteLock" in c["claim_text"] for c in claims)
    assert any(c["category"] == "numeric" for c in claims)
    assert all(isinstance(c["claim_index"], int) for c in claims)


def test_extract_atomic_claims_empty_text():
    assert extract_atomic_claims("") == []
    assert extract_atomic_claims("   ") == []


def test_verify_numeric_precision_exact_match():
    claim = "The total revenue was $42.5M in Q3."
    evidence = ["In the third quarter, total revenue was $42.5M across all divisions."]
    res = verify_numeric_precision(claim, evidence)
    assert res["passed"] is True
    assert len(res["mismatches"]) == 0
    assert res["has_contradiction"] is False


def test_verify_numeric_precision_contradiction():
    claim = "The company spent $45.2M on R&D."
    evidence = ["The financial tables show R&D expenditures reached $42.5M."]
    res = verify_numeric_precision(claim, evidence)
    assert res["passed"] is False
    assert res["has_contradiction"] is True
    assert len(res["mismatches"]) >= 1
    assert "conflicts" in res["mismatches"][0]["reason"]


def test_verify_numeric_precision_missing_number():
    claim = "The system achieved 99.9% uptime."
    evidence = ["The server runs continuously with high reliability."]
    res = verify_numeric_precision(claim, evidence)
    assert res["passed"] is False
    assert len(res["mismatches"]) >= 1


def test_trace_claim_provenance_finds_exact_offset():
    claim = "Autonomous systems received the largest investment."
    passages = [
        {
            "id": "chunk-101",
            "content": "The division had mixed results. Autonomous systems received the largest investment. Further outlays are planned.",
        }
    ]
    links = trace_claim_provenance(claim, passages)
    assert len(links) >= 1
    link = links[0]
    assert link["chunk_id"] == "chunk-101"
    assert "Autonomous systems" in link["exact_quote"]
    assert link["start_char_offset"] > 0
    assert link["end_char_offset"] > link["start_char_offset"]
    assert link["relevance_score"] >= 0.5


def test_trace_claim_provenance_empty_when_no_overlap():
    claim = "Quantum computing research started in Paris."
    passages = [
        {"id": "chunk-202", "content": "Bananas and apples are popular agricultural exports."}
    ]
    links = trace_claim_provenance(claim, passages)
    assert len(links) == 0


def test_judge_never_defaults_to_supported_on_failure(monkeypatch):
    failing_provider = MockLLMProvider(simulate_failure=True)
    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: failing_provider)

    res = evaluate_claim_with_judge("Any claim statement", ["Some evidence passage."])
    assert res["verdict"] != "supported"
    assert res["verdict"] in ["unsupported", "insufficient_evidence"]
    assert res["confidence_score"] == 0.0


def test_judge_handles_empty_evidence_as_insufficient():
    res = evaluate_claim_with_judge("Claim without evidence", [])
    assert res["verdict"] == "insufficient_evidence"
    assert res["confidence_score"] == 0.0


def test_verify_claims_supported(mock_llm):
    claims = [{"claim_index": 0, "claim_text": "CiteLock verifies factual claims in real-time."}]
    passages = [{"id": "c1", "content": "CiteLock verifies factual claims in real-time."}]
    res = verify_claims(claims, passages)
    assert len(res["claims"]) == 1
    assert res["claims"][0]["verdict"] == "supported"
    assert res["claims"][0]["confidence_score"] > 0.7
    assert len(res["claims"][0]["evidence_links"]) >= 1


def test_verify_claims_numeric_contradiction_overrides_judge(monkeypatch):
    class ContradictingMockJudge(MockLLMProvider):
        def structured_judge(self, claim, evidence_passages):
            # Simulate a naive judge claiming supported
            return {
                "verdict": "supported",
                "confidence_score": 0.95,
                "rationale": "Naive match.",
                "supporting_quotes": [],
            }

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: ContradictingMockJudge())
    claims = [{"claim_index": 0, "claim_text": "Q3 expenditures were $45.2M."}]
    passages = [{"id": "c1", "content": "Q3 expenditures were $42.5M."}]

    res = verify_claims(claims, passages)
    claim_res = res["claims"][0]
    # Numeric contradiction must override naive supported verdict
    assert claim_res["verdict"] == "contradicted"
    assert claim_res["numeric_verified"] is False
    assert "[Numeric Contradiction]" in claim_res["rationale"]


def test_compute_verification_metrics():
    claims = [
        {"verdict": "supported"},
        {"verdict": "supported"},
        {"verdict": "contradicted"},
        {"verdict": "unsupported"},
    ]
    metrics = compute_verification_metrics(claims)
    assert metrics["total_claims"] == 4
    assert metrics["hallucination_rate"] == 0.5  # 2 out of 4
    assert metrics["supported_count"] == 2
    assert metrics["contradicted_count"] == 1
    assert metrics["unsupported_count"] == 1
