"""Unit tests for concurrent claim verification engine: ordering, concurrency bounds, fault isolation, and rate-limiting."""

import time
import threading
from typing import Dict, Any, List
import pytest

from app.services.verification.engine import verify_claims
from app.providers.base import MockLLMProvider
import app.providers.base as providers_base
from app.config import get_settings


def test_concurrent_execution_actually_runs_in_parallel(monkeypatch):
    """Verify that multiple claims are executed concurrently across distinct threads."""
    observed_threads = set()
    lock = threading.Lock()

    class DelayedMockLLM(MockLLMProvider):
        def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
            with lock:
                observed_threads.add(threading.current_thread().ident)
            time.sleep(0.05)  # 50ms simulated provider latency
            return super().structured_judge(claim, evidence_passages)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: DelayedMockLLM())

    claims = [
        {"claim_index": i, "claim_text": f"Claim assertion number {i} regarding CiteLock."}
        for i in range(5)
    ]
    passages = [
        {"id": "chunk-1", "content": "CiteLock verifies factual propositions with high precision."}
    ]

    start_time = time.time()
    res = verify_claims(claims, passages, max_workers=5)
    elapsed = time.time() - start_time

    # If executed sequentially (5 * 50ms = 250ms), concurrent should complete in ~60-120ms
    assert len(res["claims"]) == 5
    assert len(observed_threads) > 1, f"Expected multiple worker threads, got {len(observed_threads)}"
    assert elapsed < 0.20, f"Expected parallel execution to take <200ms, took {elapsed:.3f}s"


def test_claim_ordering_preserved_under_variable_latencies(monkeypatch):
    """
    Verify that results maintain deterministic input order even when
    individual claims finish in reverse or random completion order.
    """
    class VariableLatencyLLM(MockLLMProvider):
        def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
            # Claim 0 takes longest, later claims finish faster
            import re
            match = re.search(r"index-(\d+)", claim)
            idx = int(match.group(1)) if match else 0
            delay = (5 - idx) * 0.01  # Claim 0 delays 50ms, Claim 4 delays 10ms
            time.sleep(delay)
            return super().structured_judge(claim, evidence_passages)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: VariableLatencyLLM())

    claims = [
        {"claim_index": i, "claim_text": f"Claim index-{i} assertion about system."}
        for i in range(5)
    ]
    passages = [{"id": "chunk-1", "content": "Evidence for system."}]

    res = verify_claims(claims, passages, max_workers=5)

    assert len(res["claims"]) == 5
    for expected_idx, claim_record in enumerate(res["claims"]):
        assert claim_record["claim_index"] == expected_idx
        assert f"index-{expected_idx}" in claim_record["claim_text"]


def test_individual_claim_failure_does_not_abort_other_claims(monkeypatch):
    """
    Verify that if a single claim encounters an unhandled exception or provider failure,
    other independent claims still verify successfully, and the failing claim is classified as verification_error.
    """
    class PartialFailingLLM(MockLLMProvider):
        def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
            if "failing-claim" in claim:
                raise RuntimeError("Simulated remote socket disconnect during judge call")
            return super().structured_judge(claim, evidence_passages)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: PartialFailingLLM())

    claims = [
        {"claim_index": 0, "claim_text": "Good claim 1 regarding CiteLock."},
        {"claim_index": 1, "claim_text": "failing-claim with sudden network failure."},
        {"claim_index": 2, "claim_text": "Good claim 2 regarding CiteLock."},
    ]
    passages = [{"id": "chunk-1", "content": "CiteLock verifies factual propositions."}]

    res = verify_claims(claims, passages, max_workers=3)

    assert len(res["claims"]) == 3
    # First claim should succeed
    assert res["claims"][0]["verdict"] != "verification_error"
    assert res["claims"][0]["claim_index"] == 0

    # Second claim should be isolated and marked verification_error
    assert res["claims"][1]["verdict"] == "verification_error"
    assert res["claims"][1]["claim_index"] == 1
    assert "Simulated remote socket disconnect" in res["claims"][1]["rationale"]

    # Third claim should also succeed
    assert res["claims"][2]["verdict"] != "verification_error"
    assert res["claims"][2]["claim_index"] == 2


def test_concurrency_limit_respects_max_workers(monkeypatch):
    """Verify that concurrency is bounded and never exceeds configured max_workers."""
    active_count = 0
    max_observed_active = 0
    lock = threading.Lock()

    class MonitoredLLM(MockLLMProvider):
        def structured_judge(self, claim: str, evidence_passages: List[str]) -> Dict[str, Any]:
            nonlocal active_count, max_observed_active
            with lock:
                active_count += 1
                if active_count > max_observed_active:
                    max_observed_active = active_count
            time.sleep(0.04)
            with lock:
                active_count -= 1
            return super().structured_judge(claim, evidence_passages)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: MonitoredLLM())

    claims = [
        {"claim_index": i, "claim_text": f"Claim {i} about CiteLock."}
        for i in range(8)
    ]
    passages = [{"id": "chunk-1", "content": "CiteLock verifies assertions."}]

    # Force max_workers=2
    res = verify_claims(claims, passages, max_workers=2)

    assert len(res["claims"]) == 8
    assert max_observed_active <= 2, f"Active threads ({max_observed_active}) exceeded max_workers (2)"


def test_single_worker_and_single_claim_fast_paths():
    """Verify max_workers=1 and single claim run deterministically without errors."""
    claims = [{"claim_index": 0, "claim_text": "CiteLock verifies factual claims in real-time."}]
    passages = [{"id": "chunk-1", "content": "CiteLock verifies factual claims in real-time."}]

    res_single_claim = verify_claims(claims, passages)
    assert len(res_single_claim["claims"]) == 1
    assert res_single_claim["claims"][0]["verdict"] == "supported"

    res_single_worker = verify_claims(claims, passages, max_workers=1)
    assert len(res_single_worker["claims"]) == 1
    assert res_single_worker["claims"][0]["verdict"] == "supported"


def test_empty_claims_safe():
    """Verify empty claims list returns empty claims safely."""
    res = verify_claims([], [])
    assert res["claims"] == []
    assert res["metrics"]["total_claims"] == 0

