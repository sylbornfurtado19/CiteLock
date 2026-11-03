"""End-to-end and production-readiness tests: history restore, failures, SSE behaviour, limits and concurrency.

These drive the real FastAPI app, real LangGraph graph, real verification/retrieval services and the test
database. Only the model provider is scripted (the shipped MockLLMProvider or small subclasses of it).
"""

import json
import threading
import time
import uuid
from typing import Any, Dict, List

import pytest

import app.api.routes.queries as queries_route
import app.pipeline.nodes as nodes
import app.providers.base as providers_base
from app.config import Settings, get_settings
from app.db.models.answers import Answer
from app.db.models.chunks import Chunk
from app.db.models.documents import Document
from app.db.models.queries import Query
from app.pipeline.orchestrator import run_pipeline
from app.providers.base import MockLLMProvider, ProviderError
from app.services.cache import pipeline_cache_service

FACT = "CiteLock achieves 99.8% precision on benchmark datasets."


def seed_document(db, workspace, embeddings, text: str = FACT) -> None:
    doc = Document(
        workspace_id=workspace.id,
        filename="specs.txt",
        storage_path=f"workspaces/{workspace.id}/specs.txt",
        checksum=uuid.uuid4().hex,
        status="indexed",
        file_size_bytes=len(text),
        mime_type="text/plain",
    )
    db.add(doc)
    db.commit()
    db.add(Chunk(document_id=doc.id, chunk_index=0, content=text, embedding=embeddings.embed_text(text), metadata_={"source": "specs.txt"}))
    db.commit()


def parse_sse(body: str) -> List[Dict[str, Any]]:
    frames = []
    for raw in body.split("\n\n"):
        raw = raw.strip()
        if not raw:
            continue
        if raw.startswith(":"):
            frames.append({"event": "heartbeat", "data": raw})
            continue
        event = next(line[6:].strip() for line in raw.splitlines() if line.startswith("event:"))
        data = "\n".join(line[5:].lstrip() for line in raw.splitlines() if line.startswith("data:"))
        frames.append({"event": event, "data": json.loads(data)})
    return frames


def stream(client, workspace, prompt="What precision does CiteLock achieve?"):
    res = client.post(f"/api/v1/workspaces/{workspace.id}/queries/stream", json={"prompt": prompt, "top_k": 3})
    assert res.status_code == 200
    return res, parse_sse(res.text)


# ---------------------------------------------------------------------------
# A. Normal execution, end to end through the real stack
# ---------------------------------------------------------------------------


def test_normal_execution_streams_graph_then_completes_with_a_full_answer(client, workspace_a, mock_embeddings, db):
    seed_document(db, workspace_a, mock_embeddings)

    res, frames = stream(client, workspace_a)

    events = [f["event"] for f in frames]
    assert events[-1] == "pipeline_complete"
    assert "pipeline_error" not in events
    graph = [f["data"] for f in frames if f["event"] == "graph_event"]
    assert [g["node"] for g in graph if g["event"] == "node_start"][:5] == [
        "query_input", "evidence_retrieval", "answer_generation", "claim_decomposition", "claim_verification",
    ]
    # Sequence numbers are strictly increasing, so a client can drop duplicates and spot gaps
    assert [g["seq"] for g in graph] == list(range(1, len(graph) + 1))
    # persistence completes before the backend declares the run complete
    last_graph = max(i for i, f in enumerate(frames) if f["event"] == "graph_event")
    assert any(g["node"] == "database_persistence" and g["event"] == "node_complete" for g in graph)
    assert last_graph < len(frames) - 1

    done = frames[-1]["data"]
    answer = done["answer"]
    assert answer["final_text"].strip() and answer["draft_text"].strip()
    assert answer["claims"], "completion payload must carry the verified claims"
    meta = done["execution_metadata"]
    for key in ("grounding_rate", "hallucination_rate", "latency_ms", "correction_rounds"):
        assert key in meta
    assert done["verification_status"] in ("verified", "partially_verified", "unresolved", "abstained")
    assert [t["node"] for t in answer["execution_trace"]][0] == "query_input"


def test_sse_headers_prevent_buffering_and_compression(client, workspace_a, mock_embeddings, db):
    seed_document(db, workspace_a, mock_embeddings)
    res, _ = stream(client, workspace_a)

    assert res.headers["content-type"].startswith("text/event-stream")
    assert "no-transform" in res.headers["cache-control"] and "no-cache" in res.headers["cache-control"]
    assert res.headers["x-accel-buffering"] == "no"


# ---------------------------------------------------------------------------
# B/C. Correction and abstention through the real verification services
# ---------------------------------------------------------------------------


class CorrectingLLM(MockLLMProvider):
    """Drafts one contradicted statement, then repairs it when asked to revise."""

    def complete(self, prompt, system_prompt=None, temperature=0.0):
        if "Critiques:" in prompt:
            return "CiteLock achieves 99.8% precision based on benchmark datasets."
        if "Reference Evidence Passages" in prompt:
            return "CiteLock achieves 99.8% precision. It has a contradicted claim that fails verification."
        return super().complete(prompt, system_prompt, temperature)


def test_correction_path_runs_correction_and_reverification_nodes(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: CorrectingLLM())

    _, frames = stream(client, workspace_a)

    done = frames[-1]
    assert done["event"] == "pipeline_complete"
    started = [f["data"]["node"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_start"]
    assert "self_correction" in started and "re_verification" in started
    assert started.index("self_correction") < started.index("re_verification")
    answer = done["data"]["answer"]
    assert answer["correction_rounds"] >= 1
    assert "contradicted claim that fails" not in answer["final_text"]
    assert answer["correction_history"], "correction history must be part of the completion payload"
    decisions = [f["data"]["route"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "route_decision"]
    assert decisions[0] == "correct"


def test_abstention_when_documents_cannot_support_the_answer(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)

    class Ungrounded(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            return "The secret quantum core was deployed in 1990. The energy output reached 999 megawatts."

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: Ungrounded())

    _, frames = stream(client, workspace_a, prompt="What was the quantum energy output?")

    assert frames[-1]["event"] == "pipeline_complete"
    answer = frames[-1]["data"]["answer"]
    assert answer["is_abstained"] is True
    assert "sufficient evidence" in answer["final_text"].lower()
    assert frames[-1]["data"]["verification_status"] == "abstained"
    trace_nodes = [t["node"] for t in answer["execution_trace"]]
    assert "abstention" in trace_nodes and trace_nodes[-1] == "database_persistence"
    assert answer["claims"], "the evaluated claims stay visible even when the answer abstains"


# ---------------------------------------------------------------------------
# D. Error handling
# ---------------------------------------------------------------------------


class DownLLM(MockLLMProvider):
    def complete(self, prompt, system_prompt=None, temperature=0.0):
        raise ProviderError("Gemini generateContent returned HTTP 503")


def test_llm_provider_outage_sends_pipeline_error_and_records_the_failed_run(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: DownLLM())

    _, frames = stream(client, workspace_a)

    assert frames[-1]["event"] == "pipeline_error"
    assert "pipeline_complete" not in [f["event"] for f in frames]
    assert "temporarily unavailable" in frames[-1]["data"]["message"]
    assert "503" not in frames[-1]["data"]["message"], "provider internals must not leak to the client"
    errors = [f["data"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_error"]
    assert errors[0]["node"] == "answer_generation" and errors[-1]["node"] == "error_handler"

    history = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries").json()
    failed = next(h for h in history if h["status"] == "failed")
    assert failed["answer_id"] is None and failed["has_trace"] is True and failed["error_message"]


def test_retrieval_failure_is_reported_not_swallowed(client, workspace_a, monkeypatch):
    def boom(*a, **k):
        raise ProviderError("embedding service unreachable")

    monkeypatch.setattr(nodes, "retrieve_hybrid", boom)
    _, frames = stream(client, workspace_a)
    assert frames[-1]["event"] == "pipeline_error"
    node_errors = [f["data"]["node"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_error"]
    assert node_errors[0] == "evidence_retrieval"


def test_database_failure_during_persistence_is_reported_and_leaves_no_partial_answer(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    import app.services.audit.recorder as recorder

    def boom(*a, **k):
        raise RuntimeError("connection to server was lost")

    monkeypatch.setattr(recorder, "record_audit_event", boom)
    before = db.query(Answer).count()

    _, frames = stream(client, workspace_a)

    assert frames[-1]["event"] == "pipeline_error"
    assert db.query(Answer).count() == before
    persistence_failed = [f["data"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_error" and f["data"]["node"] == "database_persistence"]
    assert persistence_failed, "the graph must show the persistence node failing"


def test_pipeline_timeout_stops_the_run_with_a_clear_message(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    monkeypatch.setattr(get_settings(), "pipeline_timeout_seconds", 0.0)

    _, frames = stream(client, workspace_a)

    assert frames[-1]["event"] == "pipeline_error"
    assert frames[-1]["data"]["stage"] == "timeout" and "time limit" in frames[-1]["data"]["message"]
    node_errors = [f["data"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_error"]
    assert node_errors[0]["error"]["kind"] == "timeout"
    non_stream = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json={"prompt": "another question", "top_k": 3})
    assert non_stream.status_code == 504


def test_invalid_model_output_degrades_safely_instead_of_crashing(client, workspace_a, mock_embeddings, db, monkeypatch):
    """Claim decomposition returns non-JSON and the judge returns garbage; the run still completes honestly."""
    seed_document(db, workspace_a, mock_embeddings)

    class Garbage(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            if "claim decomposition engine" in (system_prompt or ""):
                return "this is not json {{{"
            return super().complete(prompt, system_prompt, temperature)

        def structured_judge(self, claim, evidence_passages):
            return {"verdict": "banana", "confidence_score": "high"}

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: Garbage())

    _, frames = stream(client, workspace_a)

    assert frames[-1]["event"] == "pipeline_complete"
    verdicts = {c["verdict"] for c in frames[-1]["data"]["answer"]["claims"]}
    assert "supported" not in verdicts, "an unrecognised verdict must never be treated as support"


def test_client_disconnect_cancels_remaining_work(db, workspace_a, mock_embeddings, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    cancelled = threading.Event()
    started = []

    class SlowThenCancel(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            started.append(1)
            cancelled.set()  # the client "disconnects" while the first model call is in flight
            return super().complete(prompt, system_prompt, temperature)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: SlowThenCancel())
    with pytest.raises(Exception) as exc:
        run_pipeline(db, workspace_a.id, "cancel me", top_k=3, use_cache=False, cancel_event=cancelled)

    assert exc.typename == "PipelineCancelledError"
    assert len(started) == 1, "no further model calls after the client left"
    assert db.query(Query).filter(Query.workspace_id == workspace_a.id, Query.status == "failed").count() == 0


def test_closing_the_stream_early_stops_the_pipeline_before_it_spends_more_model_calls(db, workspace_a, monkeypatch):
    """What Starlette does when the browser disconnects (or the user presses Stop): it closes the SSE generator."""
    import app.api.routes.queries as q

    model_calls = []
    release = threading.Event()

    def slow_retrieval(*a, **k):
        release.wait(2)  # the run is still on its first real step when the client leaves
        return [{"id": str(uuid.uuid4()), "content": FACT, "filename": "t.txt"}]

    monkeypatch.setattr(nodes, "retrieve_hybrid", slow_retrieval)
    monkeypatch.setattr(nodes, "generate_draft_answer", lambda *a, **k: model_calls.append("draft") or "Draft.")

    generator = q._generate_pipeline_sse(workspace_a.id, "stop me", 3)
    first = next(generator)  # first SSE frame: the run has started
    assert first.startswith("event:")
    generator.close()  # client disconnect
    release.set()
    time.sleep(0.5)

    assert model_calls == [], "no model call may start after the client has left"
    assert db.query(Query).filter(Query.workspace_id == workspace_a.id, Query.status == "completed").count() == 0
    assert db.query(Query).filter(Query.workspace_id == workspace_a.id, Query.status == "failed").count() == 0, \
        "an abandoned run is not recorded as a failure"


# ---------------------------------------------------------------------------
# History: restore the answer, verification, corrections and graph from the database
# ---------------------------------------------------------------------------


def test_history_restores_completed_query_exactly_as_it_ran(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    monkeypatch.setattr(providers_base, "get_llm_provider", lambda *a, **k: CorrectingLLM())
    _, frames = stream(client, workspace_a)
    live = frames[-1]["data"]

    listing = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries").json()
    item = next(h for h in listing if h["query_id"] == live["query_id"])
    assert item["status"] == "completed" and item["answer_id"] == live["answer"]["id"] and item["has_trace"]
    assert item["claim_count"] == len(live["answer"]["claims"])

    detail = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries/{live['query_id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["prompt"] == live["prompt"] and body["status"] == "completed"
    assert body["answer"]["final_text"] == live["answer"]["final_text"]
    assert body["answer"]["correction_history"] == live["answer"]["correction_history"]
    assert [c["verdict"] for c in body["answer"]["claims"]] == [c["verdict"] for c in live["answer"]["claims"]]
    assert body["verification_status"] == live["verification_status"]
    # the restored trace is the live run's trace, node for node, not a reconstruction
    live_started = [f["data"]["node"] for f in frames if f["event"] == "graph_event" and f["data"]["event"] == "node_start"]
    assert [t["node"] for t in body["execution_trace"]] == live_started
    assert [t["status"] for t in body["execution_trace"]] == ["completed"] * len(live_started)
    assert body["execution_trace"] == live["answer"]["execution_trace"]


def test_history_restores_a_failed_query_with_its_failed_node(client, workspace_a, monkeypatch):
    def boom(*a, **k):
        raise ProviderError("embedding provider unavailable")

    monkeypatch.setattr(nodes, "retrieve_hybrid", boom)
    stream(client, workspace_a)

    item = next(h for h in client.get(f"/api/v1/workspaces/{workspace_a.id}/queries").json() if h["status"] == "failed")
    body = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries/{item['query_id']}").json()

    assert body["answer"] is None and body["error_message"]
    assert [(t["node"], t["status"]) for t in body["execution_trace"]] == [
        ("query_input", "completed"), ("evidence_retrieval", "failed"), ("error_handler", "failed"),
    ]


def test_history_is_workspace_scoped(client, workspace_a, workspace_b, mock_embeddings, db):
    seed_document(db, workspace_a, mock_embeddings)
    _, frames = stream(client, workspace_a)
    query_id = frames[-1]["data"]["query_id"]

    assert client.get(f"/api/v1/workspaces/{workspace_b.id}/queries/{query_id}").status_code in (403, 404)
    assert client.get(f"/api/v1/workspaces/{workspace_a.id}/queries/{uuid.uuid4()}").status_code == 404


def test_audit_endpoint_returns_the_same_restorable_trace(client, workspace_a, mock_embeddings, db):
    seed_document(db, workspace_a, mock_embeddings)
    _, frames = stream(client, workspace_a)
    live = frames[-1]["data"]

    audit = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{live['answer']['id']}").json()
    assert audit["execution_trace"] == live["answer"]["execution_trace"]


def test_traces_recorded_inline_on_older_answers_still_restore(db, workspace_a):
    """Answers saved before migration 0008 kept their trace in model_config; it must keep working."""
    q = Query(workspace_id=workspace_a.id, prompt="old", status="completed")
    db.add(q)
    db.commit()
    trace = [{"node": "query_input", "status": "completed"}]
    ans = Answer(query_id=q.id, draft_text="d", final_text="f", model_config_data={"execution_trace": trace})
    db.add(ans)
    db.commit()
    db.refresh(ans)
    assert ans.execution_trace == trace


# ---------------------------------------------------------------------------
# SSE reliability
# ---------------------------------------------------------------------------


def test_heartbeats_keep_slow_streams_alive(client, workspace_a, mock_embeddings, db, monkeypatch):
    seed_document(db, workspace_a, mock_embeddings)
    monkeypatch.setattr(queries_route, "SSE_HEARTBEAT_SECONDS", 0.05)
    original = nodes.generate_draft_answer

    def slow(*a, **k):
        time.sleep(0.4)
        return original(*a, **k)

    monkeypatch.setattr(nodes, "generate_draft_answer", slow)

    res, frames = stream(client, workspace_a)

    assert any(f["event"] == "heartbeat" for f in frames)
    assert frames[-1]["event"] == "pipeline_complete"
    # heartbeats are SSE comments, so they never appear as events a client could mistake for data
    assert ": ping" in res.text


# ---------------------------------------------------------------------------
# Limits, cache, concurrency, size
# ---------------------------------------------------------------------------


def test_large_claim_collections_complete_with_bounded_trace_size(db, workspace_a, monkeypatch):
    claims = [{"claim_text": f"Claim number {i} about Titan.", "claim_index": i} for i in range(400)]
    monkeypatch.setattr(nodes, "retrieve_hybrid", lambda *a, **k: [{"id": str(uuid.uuid4()), "content": "Titan.", "filename": "t.txt"}])
    monkeypatch.setattr(nodes, "generate_draft_answer", lambda *a, **k: "Draft.")
    monkeypatch.setattr(nodes, "extract_atomic_claims", lambda *a, **k: claims)
    verified = [
        {"id": str(uuid.uuid4()), "claim_index": c["claim_index"], "claim_text": c["claim_text"], "verdict": "supported",
         "confidence_score": 0.9, "rationale": "r" * 900, "evidence_links": []}
        for c in claims
    ]
    monkeypatch.setattr(nodes, "verify_claims", lambda *a, **k: {"claims": verified, "metrics": {"hallucination_rate": 0.0, "grounding_rate": 1.0, "total_claims": 400}})

    started = time.time()
    result = run_pipeline(db, workspace_a.id, "big run", top_k=3, use_cache=False)
    elapsed = time.time() - started

    assert len(result["claims"]) == 400  # nothing is dropped from the saved answer
    assert elapsed < 10
    trace = db.query(Query).filter(Query.id == result["query_id"]).one().execution_trace
    verification = next(t for t in trace if t["node"] == "claim_verification")["data"]
    assert len(verification["claims"]) == nodes.MAX_PAYLOAD_CLAIMS  # inspection payload is capped...
    assert verification["claims_total"] == 400 and verification["claims_truncated"] is True  # ...and says so
    assert len(json.dumps(trace)) < 2_500_000


def test_concurrent_identical_queries_execute_the_graph_once(db, workspace_a, monkeypatch):
    calls = []
    gate = threading.Event()

    def slow_retrieval(*a, **k):
        calls.append(1)
        gate.wait(2)
        return [{"id": str(uuid.uuid4()), "content": FACT, "filename": "t.txt"}]

    monkeypatch.setattr(nodes, "retrieve_hybrid", slow_retrieval)
    monkeypatch.setattr(nodes, "generate_draft_answer", lambda *a, **k: "Draft.")
    monkeypatch.setattr(nodes, "extract_atomic_claims", lambda *a, **k: [{"claim_text": "c", "claim_index": 0}])
    monkeypatch.setattr(nodes, "verify_claims", lambda *a, **k: {
        "claims": [{"id": "1", "claim_index": 0, "claim_text": "c", "verdict": "supported", "confidence_score": 1.0, "rationale": "", "evidence_links": []}],
        "metrics": {"hallucination_rate": 0.0, "grounding_rate": 1.0, "total_claims": 1},
    })

    results: List[Any] = []

    def worker():
        results.append(run_pipeline(db, workspace_a.id, "same question", top_k=3))

    threads = [threading.Thread(target=worker) for _ in range(3)]
    for t in threads:
        t.start()
    time.sleep(0.3)
    gate.set()
    for t in threads:
        t.join(10)

    assert len(results) == 3
    assert len(calls) == 1, "identical concurrent queries must share one execution"
    assert len({str(r["answer_id"]) for r in results}) == 1
    assert pipeline_cache_service.get_metrics()["hits"] + pipeline_cache_service.get_metrics()["misses"] >= 1


# ---------------------------------------------------------------------------
# Production configuration
# ---------------------------------------------------------------------------


def test_cors_origins_are_normalised_so_a_trailing_slash_cannot_break_the_browser():
    s = Settings(cors_origins="http://localhost:3000, https://cite-lock.vercel.app/ ,", environment="test")
    assert s.cors_origin_list == ["http://localhost:3000", "https://cite-lock.vercel.app"]


def test_cors_allows_the_deployed_frontend_and_blocks_other_origins(client):
    ok = client.options(
        "/health",
        headers={"Origin": "https://cite-lock.vercel.app", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "https://cite-lock.vercel.app"
    blocked = client.options(
        "/health",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in blocked.headers


def test_unauthenticated_requests_are_rejected_in_production_mode(workspace_a, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(get_settings(), "environment", "production")
    monkeypatch.setattr(get_settings(), "allow_dev_auth", False)
    app.dependency_overrides.clear()
    with TestClient(app) as raw:
        res = raw.get(f"/api/v1/workspaces/{workspace_a.id}/queries")
    assert res.status_code == 401


def test_health_endpoint_is_public():
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as raw:
        assert raw.get("/health").json()["status"] == "ok"
