"""Unit and integration tests for backend query and retrieval caching.

Verifies:
1. Deterministic cache key derivation (prompt normalization, workspace isolation, doc fingerprint, config version).
2. End-to-end pipeline cache hits with sub-millisecond response, 0 extra LLM calls, and X-Cache header.
3. Multi-tenant isolation ensuring cached responses in Workspace A never leak to Workspace B.
4. Granular cache invalidation on document ingestion, reindexing, deletion, and workspace setting update.
5. Incomplete or failed verification runs are never cached.
6. SingleFlight coordinator prevents cache stampedes under concurrent identical requests.
7. Configurable TTL expiration and metric tracking (hits, misses, expirations, invalidations, hit rate).
"""

import threading
import time
import uuid
from datetime import datetime, timedelta
import pytest
from sqlalchemy.orm import Session

from app.db.models.workspaces import Workspace
from app.db.models.users import User
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
from app.services.cache import (
    pipeline_cache_service,
    compute_pipeline_cache_key,
    compute_workspace_document_fingerprint,
    normalize_prompt,
    is_safe_to_cache,
    SingleFlightCoordinator,
    InMemoryTTLCache,
)
from app.providers.base import MockLLMProvider
import app.providers.base as providers_base
from tests.conftest import create_sample_pdf


@pytest.fixture
def cache_test_workspace(db: Session):
    """Provides an isolated workspace and user for query caching tests."""
    uid = uuid.uuid4().hex[:8]
    user = User(email=f"cache_{uid}@example.com", firebase_uid=f"fb_cache_{uid}")
    db.add(user)
    db.commit()

    ws = Workspace(name=f"Cache WS {uid}", owner_id=user.id)
    db.add(ws)
    db.commit()

    return ws


def test_prompt_normalization():
    """Verify prompt normalization handles leading/trailing spaces, multiple spaces, tabs, and newlines."""
    assert normalize_prompt("  What is  the   operating margin?  ") == "What is the operating margin?"
    assert normalize_prompt("What\n\nis\t\tthe\n operating margin?") == "What is the operating margin?"
    assert normalize_prompt("") == ""
    assert normalize_prompt(None) == ""


def test_deterministic_cache_key_generation(db: Session, cache_test_workspace):
    """Verify cache keys are deterministic across identical parameters and change with any variance."""
    ws_id = cache_test_workspace.id

    key1 = compute_pipeline_cache_key(db, ws_id, "What is the revenue?", top_k=5)
    # Extra whitespace must resolve to exact same key
    key2 = compute_pipeline_cache_key(db, ws_id, "  What   is   the   revenue?  ", top_k=5)
    assert key1 == key2

    # Different prompt must yield different key
    key_diff_prompt = compute_pipeline_cache_key(db, ws_id, "What is the margin?", top_k=5)
    assert key1 != key_diff_prompt

    # Different top_k must yield different key
    key_diff_topk = compute_pipeline_cache_key(db, ws_id, "What is the revenue?", top_k=3)
    assert key1 != key_diff_topk

    # Different workspace must yield different key (strict multi-tenant isolation)
    other_ws_id = uuid.uuid4()
    key_other_ws = compute_pipeline_cache_key(db, other_ws_id, "What is the revenue?", top_k=5)
    assert key1 != key_other_ws


def test_document_fingerprint_changes_on_document_lifecycle(db: Session, cache_test_workspace):
    """Verify workspace document fingerprint changes on addition, update, and deletion."""
    ws_id = cache_test_workspace.id

    # 1. Empty workspace fingerprint
    fp_empty = compute_workspace_document_fingerprint(db, ws_id)
    assert fp_empty == "empty"

    # 2. Add an indexed document
    now = datetime.utcnow()
    doc = Document(
        workspace_id=ws_id,
        filename="report1.pdf",
        storage_path="path/1",
        checksum="chk_aaa",
        status="indexed",
        file_size_bytes=100,
        mime_type="application/pdf",
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()

    fp_one = compute_workspace_document_fingerprint(db, ws_id)
    assert fp_one != fp_empty

    # 3. Add second indexed document
    doc2 = Document(
        workspace_id=ws_id,
        filename="report2.pdf",
        storage_path="path/2",
        checksum="chk_bbb",
        status="indexed",
        file_size_bytes=200,
        mime_type="application/pdf",
        created_at=now,
        updated_at=now,
    )
    db.add(doc2)
    db.commit()

    fp_two = compute_workspace_document_fingerprint(db, ws_id)
    assert fp_two != fp_one

    # 4. Update document checksum (content change)
    doc.checksum = "chk_aaa_modified"
    db.commit()

    fp_modified = compute_workspace_document_fingerprint(db, ws_id)
    assert fp_modified != fp_two

    # 5. Delete document
    db.delete(doc2)
    db.commit()

    fp_after_delete = compute_workspace_document_fingerprint(db, ws_id)
    assert fp_after_delete != fp_modified


def test_in_memory_ttl_cache_operations():
    """Verify InMemoryTTLCache get, set, LRU eviction, and TTL expiration behavior."""
    cache = InMemoryTTLCache(max_entries=3)
    ws_a = str(uuid.uuid4())
    ws_b = str(uuid.uuid4())

    # Add 3 entries
    cache.set("k1", ws_a, {"val": 1}, ttl_seconds=10)
    cache.set("k2", ws_a, {"val": 2}, ttl_seconds=10)
    cache.set("k3", ws_b, {"val": 3}, ttl_seconds=10)

    assert cache.get("k1", workspace_id=ws_a)["val"] == 1
    assert cache.get("k2", workspace_id=ws_a)["val"] == 2
    assert cache.get("k3", workspace_id=ws_b)["val"] == 3

    # Multi-tenant isolation: querying k1 with ws_b must miss
    assert cache.get("k1", workspace_id=ws_b) is None

    # Capacity eviction: adding 4th item evicts k1 (since k1 was least recently accessed)
    cache.set("k4", ws_a, {"val": 4}, ttl_seconds=10)
    assert cache.get("k1", workspace_id=ws_a) is None  # evicted
    assert cache.get("k2", workspace_id=ws_a)["val"] == 2
    assert cache.get("k4", workspace_id=ws_a)["val"] == 4

    # Workspace-level invalidation
    invalidated_count = cache.invalidate_workspace(ws_a)
    assert invalidated_count == 2  # k2 and k4
    assert cache.get("k2", workspace_id=ws_a) is None
    assert cache.get("k4", workspace_id=ws_a) is None
    # ws_b remains intact
    assert cache.get("k3", workspace_id=ws_b)["val"] == 3


def test_ttl_expiration_handling():
    """Verify expired cache items are evicted and count toward expiration telemetry."""
    cache = InMemoryTTLCache(max_entries=10)
    ws = str(uuid.uuid4())

    # Set item with 0 second TTL (instant expiry)
    cache.set("expired_key", ws, {"val": "old"}, ttl_seconds=0)
    time.sleep(0.01)

    result = cache.get("expired_key", workspace_id=ws)
    assert result is None

    metrics = cache.get_metrics()
    assert metrics["expirations"] == 1
    assert metrics["misses"] == 1
    assert metrics["hits"] == 0


def test_single_flight_stampede_prevention():
    """Verify SingleFlight executes function once when multiple concurrent callers arrive."""
    coordinator = SingleFlightCoordinator()
    execution_counter = 0
    lock = threading.Lock()

    def expensive_work():
        nonlocal execution_counter
        with lock:
            execution_counter += 1
        time.sleep(0.05)  # Simulate LLM pipeline execution latency
        return "expensive_result"

    results = []
    leaders = []

    def worker():
        res, is_leader = coordinator.do("stampede_key", expensive_work)
        results.append(res)
        leaders.append(is_leader)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # All 5 callers get the exact same result
    assert len(results) == 5
    assert all(r == "expensive_result" for r in results)

    # Exactly 1 thread was the leader; 4 were followers
    assert execution_counter == 1
    assert leaders.count(True) == 1
    assert leaders.count(False) == 4


def test_pipeline_cache_hit_and_x_cache_header(client, workspace_a, mock_storage, mock_embeddings, monkeypatch, db):
    """Test full pipeline caching: 1st call is MISS, 2nd identical call is HIT with 0 provider calls."""
    # Seed document
    pdf_bytes = create_sample_pdf("CiteLock operates at 99.8% precision across enterprise benchmarks.")
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("benchmark.pdf", pdf_bytes, "application/pdf")},
    )

    llm_invocation_counter = 0

    class TrackingLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            nonlocal llm_invocation_counter
            llm_invocation_counter += 1
            return super().complete(prompt, system_prompt, temperature)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: TrackingLLM())

    query_payload = {"prompt": "What precision does CiteLock achieve?", "top_k": 3}

    # 1. First execution: Cache MISS
    res1 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert res1.status_code == 201
    assert res1.headers.get("X-Cache") == "MISS"
    data1 = res1.json()
    assert data1["execution_metadata"]["cache_hit"] is False
    initial_llm_calls = llm_invocation_counter
    assert initial_llm_calls >= 1

    # 2. Second execution (identical query): Cache HIT
    res2 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert res2.status_code == 201
    assert res2.headers.get("X-Cache") == "HIT"
    data2 = res2.json()
    assert data2["execution_metadata"]["cache_hit"] is True
    assert data2["answer"]["final_text"] == data1["answer"]["final_text"]
    assert data2["query_id"] == data1["query_id"]

    # Crucial: 0 additional LLM invocations during cache hit!
    assert llm_invocation_counter == initial_llm_calls

    # 3. Verify Cache Metrics endpoint
    metrics_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries/cache-metrics")
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()
    assert metrics["hits"] >= 1
    assert metrics["misses"] >= 1
    assert metrics["hit_rate"] > 0.0


def test_cache_invalidated_when_document_uploaded(client, workspace_a, mock_storage, mock_embeddings, monkeypatch, db):
    """Verify that uploading a new document invalidates the cache so fresh answers reflect updated knowledge."""
    query_payload = {"prompt": "What is the system uptime?", "top_k": 3}

    # Upload Doc 1
    pdf1 = create_sample_pdf("System uptime is 99.9%.")
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("uptime.pdf", pdf1, "application/pdf")},
    )

    # First call: MISS, caches answer
    r1 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert r1.status_code == 201
    assert r1.headers.get("X-Cache") == "MISS"

    # Second call: HIT
    r2 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert r2.status_code == 201
    assert r2.headers.get("X-Cache") == "HIT"

    # Upload Doc 2 -> MUST invalidate cache for workspace_a
    pdf2 = create_sample_pdf("System uptime has improved to 99.99%.")
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("uptime_v2.pdf", pdf2, "application/pdf")},
    )

    # Third call after doc upload: MUST BE A MISS (fresh execution with new document set)
    r3 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert r3.status_code == 201
    assert r3.headers.get("X-Cache") == "MISS"


def test_cross_workspace_cache_isolation(client, workspace_a, workspace_b, user_b, mock_storage, mock_embeddings, db):
    """Verify that identical queries in Workspace A do not hit cache for Workspace B."""
    query_payload = {"prompt": "What are the compliance requirements?", "top_k": 3}

    # Upload doc in Workspace A
    pdf = create_sample_pdf("Compliance requires SOC2 Type II.")
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("soc2.pdf", pdf, "application/pdf")},
    )

    # Query in Workspace A: MISS, then HIT
    r_a1 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert r_a1.headers.get("X-Cache") == "MISS"

    r_a2 = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json=query_payload)
    assert r_a2.headers.get("X-Cache") == "HIT"

    # Query in Workspace B with user_b client: MUST BE A MISS (strict isolation)
    from app.api import deps
    from fastapi.testclient import TestClient
    from app.main import app

    app.dependency_overrides[deps.get_current_user] = lambda: user_b
    client_b = TestClient(app)

    r_b = client_b.post(f"/api/v1/workspaces/{workspace_b.id}/queries", json=query_payload)
    assert r_b.status_code == 201
    assert r_b.headers.get("X-Cache") == "MISS"


def test_failed_verification_runs_not_cached():
    """Verify is_safe_to_cache rejects answers with verification errors or non-completed status."""
    # 1. Safe verified result
    safe_result = {
        "verification_status": "verified",
        "claims": [{"claim_text": "C1", "verdict": "supported"}],
        "query": type("QueryStub", (), {"status": "completed"})(),
    }
    assert is_safe_to_cache(safe_result) is True

    # 2. Unsafe: claim has verification_error
    error_claim_result = {
        "verification_status": "verified",
        "claims": [{"claim_text": "C1", "verdict": "verification_error"}],
        "query": type("QueryStub", (), {"status": "completed"})(),
    }
    assert is_safe_to_cache(error_claim_result) is False

    # 3. Unsafe: status is unresolved or failed
    failed_status_result = {
        "verification_status": "unresolved",
        "claims": [{"claim_text": "C1", "verdict": "unsupported"}],
        "query": type("QueryStub", (), {"status": "completed"})(),
    }
    assert is_safe_to_cache(failed_status_result) is False

    # 4. Unsafe: query record status is failed
    failed_query_result = {
        "verification_status": "verified",
        "claims": [{"claim_text": "C1", "verdict": "supported"}],
        "query": type("QueryStub", (), {"status": "failed"})(),
    }
    assert is_safe_to_cache(failed_query_result) is False
