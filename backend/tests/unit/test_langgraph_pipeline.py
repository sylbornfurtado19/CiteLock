"""Tests proving the audited RAG pipeline genuinely executes through a LangGraph StateGraph."""

import uuid
from typing import Any, Dict, List, Optional

import pytest
from langgraph.graph.state import CompiledStateGraph

import app.pipeline.graph as graph_module
import app.pipeline.nodes as nodes
from app.db.models.answers import Answer
from app.db.models.audit_events import AuditEvent
from app.db.models.claims import Claim
from app.db.models.queries import Query
from app.db.models.verification_runs import VerificationRun
from app.pipeline.graph import get_pipeline_graph
from app.pipeline.orchestrator import run_pipeline
from app.pipeline.state import (
    HARD_MAX_CORRECTION_ROUNDS,
    ROUTE_ABSTAIN,
    ROUTE_CORRECT,
    ROUTE_ERROR,
    ROUTE_FINALIZE,
)
from app.providers.base import ProviderError
from app.services.cache import pipeline_cache_service
from app.services.correction.controller import ABSTENTION_TEXT
from app.services.generation.answer import GenerationError
from app.services.verification.judge import VerificationProviderError
from app.services.verification.scoring import compute_verification_metrics


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def claim(text: str, verdict: str, idx: int = 0) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "claim_index": idx,
        "claim_text": text,
        "verdict": verdict,
        "confidence_score": 0.9,
        "rationale": f"Judged {verdict}.",
        "evidence_links": [],
    }


def verification(*claims: Dict[str, Any]) -> Dict[str, Any]:
    return {"claims": list(claims), "metrics": compute_verification_metrics(list(claims))}


PASSAGES = [{"id": str(uuid.uuid4()), "content": "Titan uses mTLS.", "filename": "titan.txt"}]


class Scenario:
    """Scriptable fakes for the service layer the graph nodes delegate to."""

    def __init__(self, monkeypatch, passages: Optional[List[Dict[str, Any]]] = None):
        self.passages = PASSAGES if passages is None else passages
        self.verify_results: List[Dict[str, Any]] = []
        self.revisions: List[str] = []
        self.calls = {"verify": 0, "revise": 0, "decompose": 0}
        self.draft = "Draft answer."
        self.decomposed = [{"claim_text": "Titan uses mTLS.", "claim_index": 0}]

        monkeypatch.setattr(nodes, "retrieve_hybrid", lambda *a, **k: list(self.passages))
        monkeypatch.setattr(nodes, "generate_draft_answer", lambda *a, **k: self.draft)
        monkeypatch.setattr(nodes, "extract_atomic_claims", self._decompose)
        monkeypatch.setattr(nodes, "verify_claims", self._verify)
        monkeypatch.setattr(nodes, "revise_answer", self._revise)
        monkeypatch.setattr(nodes, "retrieve_targeted_evidence", lambda *a, **k: [])

    def _decompose(self, text):
        self.calls["decompose"] += 1
        return list(self.decomposed)

    def _verify(self, claims, passages, *a, **k):
        index = min(self.calls["verify"], len(self.verify_results) - 1)
        self.calls["verify"] += 1
        return self.verify_results[index]

    def _revise(self, llm, query, current_text, failed, passages):
        index = min(self.calls["revise"], len(self.revisions) - 1)
        self.calls["revise"] += 1
        return self.revisions[index]


@pytest.fixture
def scenario(monkeypatch):
    return Scenario(monkeypatch)


def set_workspace_policy(db, workspace, **policy):
    workspace.settings_ = policy
    db.commit()


def run(db, workspace, prompt="How do components communicate?", **kwargs):
    return run_pipeline(db, workspace.id, prompt, top_k=3, use_cache=False, **kwargs)


def audit_events(db, event_type, query_id=None):
    """Count audit events of a type, optionally only those recorded for one query."""
    events = db.query(AuditEvent).filter(AuditEvent.event_type == event_type).all()
    if query_id is None:
        return len(events)
    return sum(1 for e in events if (e.payload or {}).get("query_id") == str(query_id))


# ---------------------------------------------------------------------------
# Graph structure: it is a real, compiled LangGraph
# ---------------------------------------------------------------------------


def test_pipeline_graph_is_a_compiled_langgraph_with_all_required_nodes():
    compiled = get_pipeline_graph()
    assert isinstance(compiled, CompiledStateGraph)

    node_names = set(compiled.get_graph().nodes) - {"__start__", "__end__"}
    assert node_names == {
        "query_input",
        "evidence_retrieval",
        "answer_generation",
        "claim_decomposition",
        "claim_verification",
        "verification_router",
        "self_correction",
        "re_verification",
        "abstention",
        "final_answer_generation",
        "database_persistence",
        "error_handler",
    }


def test_graph_edges_encode_conditional_router_and_correction_loop():
    drawable = get_pipeline_graph().get_graph()
    edges = {(e.source, e.target, e.conditional) for e in drawable.edges}

    # Router fans out conditionally to all four outcomes
    for target in ("final_answer_generation", "self_correction", "abstention", "error_handler"):
        assert ("verification_router", target, True) in edges
    # Self-correction feeds re-verification, which can loop back or exit
    assert any(s == "self_correction" and t == "re_verification" for s, t, _ in edges)
    for target in ("self_correction", "final_answer_generation", "abstention", "error_handler"):
        assert ("re_verification", target, True) in edges
    # Persistence is last: it ends the run, or hands a failed commit to the error handler
    assert ("database_persistence", "__end__", True) in edges
    assert ("database_persistence", "error_handler", True) in edges


def test_run_pipeline_executes_through_the_langgraph_invoke(db, workspace_a, scenario, monkeypatch):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    invocations = []
    original = CompiledStateGraph.invoke

    def spy(self, *args, **kwargs):
        invocations.append(self)
        return original(self, *args, **kwargs)

    monkeypatch.setattr(CompiledStateGraph, "invoke", spy)
    result = run(db, workspace_a)

    assert len(invocations) == 1
    assert result["execution_metadata"]["orchestrator"] == "langgraph"


# ---------------------------------------------------------------------------
# Routing decisions (pure policy)
# ---------------------------------------------------------------------------


def base_state(**overrides):
    state = {
        "claims": [],
        "passages": PASSAGES,
        "abstention_policy": "strict",
        "correction_round": 0,
        "max_correction_rounds": 3,
    }
    state.update(overrides)
    return state


def test_decide_route_all_supported_finalizes():
    route, _ = nodes.decide_route(base_state(claims=[claim("a", "supported")]))
    assert route == ROUTE_FINALIZE


@pytest.mark.parametrize("verdict", ["unsupported", "contradicted", "partially_supported"])
def test_decide_route_failed_claims_with_retries_correct(verdict):
    route, _ = nodes.decide_route(base_state(claims=[claim("a", verdict)]))
    assert route == ROUTE_CORRECT


def test_decide_route_insufficient_evidence_with_passages_corrects():
    route, _ = nodes.decide_route(base_state(claims=[claim("a", "insufficient_evidence")]))
    assert route == ROUTE_CORRECT


@pytest.mark.parametrize("policy", ["strict", "soft"])
def test_decide_route_insufficient_evidence_corrects_first_regardless_of_policy(policy):
    state = base_state(claims=[claim("a", "insufficient_evidence")], passages=[], abstention_policy=policy)
    assert nodes.decide_route(state)[0] == ROUTE_CORRECT


def test_decide_route_insufficient_evidence_after_retries_follows_policy():
    claims = [claim("a", "insufficient_evidence"), claim("b", "insufficient_evidence", 1)]
    strict = base_state(claims=claims, correction_round=3, abstention_policy="strict")
    soft_mixed = base_state(claims=[claim("a", "supported"), claim("b", "insufficient_evidence", 1)],
                            correction_round=3, abstention_policy="soft")
    assert nodes.decide_route(strict)[0] == ROUTE_ABSTAIN
    assert nodes.decide_route(soft_mixed)[0] == ROUTE_FINALIZE


def test_decide_route_retries_exhausted_abstains_under_strict():
    state = base_state(claims=[claim("a", "unsupported")], correction_round=3)
    assert nodes.decide_route(state)[0] == ROUTE_ABSTAIN


def test_decide_route_retries_exhausted_keeps_partial_answer_under_soft_policy():
    claims = [claim("a", "supported"), claim("b", "unsupported", 1)]
    state = base_state(claims=claims, correction_round=3, abstention_policy="soft")
    assert nodes.decide_route(state)[0] == ROUTE_FINALIZE


def test_decide_route_verification_error_goes_to_error_handling():
    assert nodes.decide_route(base_state(claims=[claim("a", "verification_error")]))[0] == ROUTE_ERROR


def test_decide_route_recorded_error_wins():
    state = base_state(claims=[claim("a", "supported")], error={"stage": "x", "kind": "provider", "message": "m"})
    assert nodes.decide_route(state)[0] == ROUTE_ERROR


def test_decide_route_never_exceeds_hard_cap():
    state = base_state(
        claims=[claim("a", "unsupported")],
        correction_round=HARD_MAX_CORRECTION_ROUNDS,
        max_correction_rounds=999,
    )
    assert nodes.decide_route(state)[0] != ROUTE_CORRECT


# ---------------------------------------------------------------------------
# Successful query execution and persistence
# ---------------------------------------------------------------------------


def test_supported_claims_take_the_direct_path_and_persist(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    result = run(db, workspace_a)

    assert result["verification_status"] == "verified"
    assert result["correction_rounds"] == 0
    assert result["is_abstained"] is False
    assert result["graph_trace"] == [
        "query_input",
        "evidence_retrieval",
        "answer_generation",
        "claim_decomposition",
        "claim_verification",
        "verification_router:finalize",
        "final_answer_generation",
        "database_persistence",
    ]
    assert scenario.calls["revise"] == 0

    query = db.query(Query).filter(Query.id == result["query_id"]).one()
    assert query.status == "completed" and query.workspace_id == workspace_a.id
    answer = db.query(Answer).filter(Answer.id == result["answer_id"]).one()
    assert answer.final_text == "Draft answer."
    assert db.query(Claim).filter(Claim.answer_id == answer.id).count() == 1
    assert db.query(VerificationRun).filter(VerificationRun.answer_id == answer.id).count() == 1
    assert audit_events(db, "query_executed", result["query_id"]) == 1


def test_sse_events_keep_existing_stage_names(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]
    events = []
    run(db, workspace_a, on_event=events.append)

    stages = [(e["stage"], e["status"]) for e in stage_events(events)]
    assert stages[0] == ("retrieval", "running")
    for expected in [("retrieval", "completed"), ("generation", "completed"), ("decomposition", "completed"),
                     ("verification", "completed"), ("correction", "completed"), ("finalizing", "completed")]:
        assert expected in stages
    assert {e["stage"] for e in stage_events(events)} <= {"retrieval", "generation", "decomposition", "verification", "correction", "finalizing"}


# ---------------------------------------------------------------------------
# Real node lifecycle events (drive the execution graph UI) and persisted trace
# ---------------------------------------------------------------------------


def stage_events(events):
    return [e for e in events if "stage" in e]


def graph_events(events):
    return [e for e in events if e.get("kind") == "graph"]


def test_every_node_emits_real_start_and_complete_events_in_order(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]
    events = []
    run(db, workspace_a, on_event=events.append)

    ge = graph_events(events)
    starts = [e["node"] for e in ge if e["event"] == "node_start"]
    completes = [e["node"] for e in ge if e["event"] == "node_complete"]
    expected = ["query_input", "evidence_retrieval", "answer_generation", "claim_decomposition",
                "claim_verification", "verification_router", "final_answer_generation", "database_persistence"]
    assert starts == expected and completes == expected
    # Each start names the real predecessor, so the UI can animate only edges that were actually taken
    assert [e["from_node"] for e in ge if e["event"] == "node_start"][:3] == [None, "query_input", "evidence_retrieval"]
    # start always precedes the matching complete
    for node in expected:
        first_start = next(i for i, e in enumerate(ge) if e["node"] == node and e["event"] == "node_start")
        first_done = next(i for i, e in enumerate(ge) if e["node"] == node and e["event"] == "node_complete")
        assert first_start < first_done
    assert all("timestamp" in e for e in ge)


def test_router_emits_a_route_decision_with_the_real_target(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("bad", "unsupported")), verification(claim("ok", "supported"))]
    scenario.revisions = ["fixed"]
    events = []
    run(db, workspace_a, on_event=events.append)

    decisions = [e for e in graph_events(events) if e["event"] == "route_decision"]
    assert [(d["node"], d["route"], d["to_node"]) for d in decisions] == [
        ("verification_router", "correct", "self_correction"),
        ("re_verification", "finalize", "final_answer_generation"),
    ]
    assert all(d["reason"] for d in decisions)


def test_node_payloads_carry_inspection_data(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("bad", "contradicted")), verification(claim("ok", "supported"))]
    scenario.revisions = ["fixed answer"]
    events = []
    run(db, workspace_a, on_event=events.append)

    by_node = {}
    for e in graph_events(events):
        if e["event"] == "node_complete":
            by_node.setdefault(e["node"], []).append(e)

    retrieval = by_node["evidence_retrieval"][0]["data"]
    assert retrieval["passages_count"] == 1 and retrieval["passages"][0]["document"] == "titan.txt"
    assert by_node["answer_generation"][0]["data"]["draft_answer"] == "Draft answer."
    assert by_node["claim_decomposition"][0]["data"]["claim_count"] == 1
    verify = by_node["claim_verification"][0]["data"]
    assert verify["claims"][0]["verdict"] == "contradicted" and "rationale" in verify["claims"][0]
    correction = by_node["self_correction"][0]
    assert correction["round"] == 1
    assert correction["data"]["previous_answer"] == "Draft answer." and correction["data"]["revised_answer"] == "fixed answer"
    reverify = by_node["re_verification"][0]["data"]
    assert reverify["failed_before"] == 1 and reverify["failed_after"] == 0
    assert "hallucination_rate" in reverify["metrics_before"] and "hallucination_rate" in reverify["metrics_after"]
    assert by_node["database_persistence"][0]["data"]["persisted"] is True


def test_payloads_never_contain_secrets(db, workspace_a, scenario, monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-super-secret-value")
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]
    events = []
    run(db, workspace_a, on_event=events.append)

    blob = repr(graph_events(events)).lower()
    for forbidden in ("api_key", "secret", "password", "bearer", "database_url", "private_key"):
        assert forbidden not in blob


def test_node_failure_emits_node_error_then_error_handler(db, workspace_a, scenario, monkeypatch):
    scenario.verify_results = [verification(claim("c", "verification_error"))]
    events = []
    with pytest.raises(VerificationProviderError):
        run(db, workspace_a, on_event=events.append)

    ge = graph_events(events)
    failed = [e for e in ge if e["event"] == "node_error"]
    assert [e["node"] for e in failed] == ["claim_verification", "error_handler"] or failed[0]["node"] == "claim_verification"
    assert failed[0]["error"]["kind"] == "verification"
    handler_start = next(e for e in ge if e["node"] == "error_handler" and e["event"] == "node_start")
    assert handler_start["from_node"] == "claim_verification"
    assert not any(e["node"] == "database_persistence" for e in ge)


def test_execution_trace_is_persisted_with_the_answer(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("bad", "unsupported")), verification(claim("ok", "supported"))]
    scenario.revisions = ["fixed"]
    result = run(db, workspace_a)

    answer = db.query(Answer).filter(Answer.id == result["answer_id"]).one()
    trace = answer.execution_trace
    assert [t["node"] for t in trace] == [
        "query_input", "evidence_retrieval", "answer_generation", "claim_decomposition", "claim_verification",
        "verification_router", "self_correction", "re_verification", "final_answer_generation", "database_persistence",
    ]
    assert all(t["status"] == "completed" for t in trace)
    router = next(t for t in trace if t["node"] == "verification_router")
    assert router["route"] == "correct" and router["to_node"] == "self_correction"
    assert next(t for t in trace if t["node"] == "self_correction")["round"] == 1


def test_trace_is_exposed_by_query_and_audit_endpoints(client, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    res = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json={"prompt": "How do they talk?", "top_k": 3})
    assert res.status_code == 201
    answer = res.json()["answer"]
    assert [t["node"] for t in answer["execution_trace"]][0] == "query_input"

    audit = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{answer['id']}")
    assert audit.status_code == 200
    assert audit.json()["execution_trace"] == answer["execution_trace"]


def test_sse_endpoint_streams_graph_events(client, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    res = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries/stream", json={"prompt": "Stream me please", "top_k": 3})

    assert res.status_code == 200
    body = res.text
    assert "event: graph_event" in body and "event: pipeline_event" in body and "event: pipeline_complete" in body
    assert body.index("event: graph_event") < body.index("event: pipeline_complete")
    assert '"node": "claim_verification"' in body


def test_dump_frontend_fixtures(client, db, workspace_a, scenario):
    """Regenerate the fixtures the frontend tests replay (set CITELOCK_DUMP_FIXTURES=<dir>).

    Each fixture holds the raw SSE body exactly as the browser receives it from the streaming endpoint, plus the
    history detail JSON for the same query, so frontend tests exercise real backend output end to end.
    """
    import json
    import os

    out_dir = os.environ.get("CITELOCK_DUMP_FIXTURES")
    if not out_dir:
        pytest.skip("Set CITELOCK_DUMP_FIXTURES to regenerate frontend fixtures.")
    os.makedirs(out_dir, exist_ok=True)

    def record(name, setup, **policy):
        scenario.calls.update({"verify": 0, "revise": 0, "decompose": 0})
        setup()
        set_workspace_policy(db, workspace_a, **policy)
        res = client.post(
            f"/api/v1/workspaces/{workspace_a.id}/queries/stream",
            json={"prompt": f"fixture {name}", "top_k": 3},
        )
        assert res.status_code == 200
        history = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries").json()
        item = next(h for h in history if h["prompt"] == f"fixture {name}")
        detail = client.get(f"/api/v1/workspaces/{workspace_a.id}/queries/{item['query_id']}").json()
        with open(os.path.join(out_dir, f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump({"scenario": name, "sse": res.text, "detail": detail, "history_item": item}, fh, indent=2)

    def verified():
        scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    def corrected():
        scenario.verify_results = [
            verification(claim("Titan uses SSH.", "contradicted")),
            verification(claim("Titan uses TLS.", "unsupported")),
            verification(claim("Titan uses mTLS.", "supported")),
        ]
        scenario.revisions = ["Titan uses TLS.", "Titan uses mTLS."]

    def abstained():
        scenario.verify_results = [verification(claim("Titan uses magic.", "unsupported"))]
        scenario.revisions = ["attempt one", "attempt two"]

    def failed():
        scenario.verify_results = [verification(claim("c", "verification_error"))]

    record("verified", verified)
    record("corrected", corrected, max_correction_retries=3)
    record("abstained", abstained, max_correction_retries=2, abstention_policy="strict")
    record("failed", failed)

# ---------------------------------------------------------------------------
# Correction loops
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_verdict", ["unsupported", "contradicted"])
def test_failed_claim_is_corrected_and_reverified(db, workspace_a, scenario, bad_verdict):
    scenario.verify_results = [
        verification(claim("Titan uses SSH.", bad_verdict)),
        verification(claim("Titan uses mTLS.", "supported")),
    ]
    scenario.revisions = ["Titan uses mTLS."]

    result = run(db, workspace_a)

    assert result["correction_rounds"] == 1
    assert result["final_text"] == "Titan uses mTLS."
    assert result["verification_status"] == "verified"
    assert len(result["correction_history"]) == 1
    assert result["correction_history"][0]["failed_count_before"] == 1
    assert result["correction_history"][0]["failed_count_after"] == 0
    assert result["graph_trace"][5:9] == [
        f"verification_router:correct",
        "self_correction",
        "re_verification:finalize",
        "final_answer_generation",
    ]
    answer = db.query(Answer).filter(Answer.id == result["answer_id"]).one()
    assert answer.correction_rounds == 1 and answer.draft_text == "Draft answer."
    assert db.query(VerificationRun).filter(VerificationRun.answer_id == answer.id).count() == 2
    assert audit_events(db, "correction_round", result["query_id"]) == 1


def test_multiple_correction_rounds_loop_back_until_resolved(db, workspace_a, scenario):
    scenario.verify_results = [
        verification(claim("v0", "unsupported")),
        verification(claim("v1", "contradicted")),
        verification(claim("v2", "supported")),
    ]
    scenario.revisions = ["revision one", "revision two"]
    set_workspace_policy(db, workspace_a, max_correction_retries=3)

    result = run(db, workspace_a)

    assert result["correction_rounds"] == 2
    assert result["final_text"] == "revision two"
    assert scenario.calls["revise"] == 2
    assert result["graph_trace"].count("self_correction") == 2
    assert result["graph_trace"].count("re_verification:correct") == 1
    assert db.query(VerificationRun).filter(VerificationRun.answer_id == result["answer_id"]).count() == 3


def test_strict_retry_limit_stops_the_loop_and_abstains(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("never supported", "unsupported"))]
    scenario.revisions = [f"attempt {i}" for i in range(50)]
    set_workspace_policy(db, workspace_a, max_correction_retries=2, abstention_policy="strict")

    result = run(db, workspace_a)

    assert scenario.calls["revise"] == 2
    assert result["correction_rounds"] == 2
    assert result["is_abstained"] is True
    assert result["final_text"] == ABSTENTION_TEXT
    assert result["verification_status"] == "abstained"
    assert result["graph_trace"][-3:] == ["abstention", "final_answer_generation", "database_persistence"]
    assert audit_events(db, "abstention", result["query_id"]) == 1


def test_soft_policy_returns_best_answer_with_unresolved_verdicts(db, workspace_a, scenario):
    scenario.decomposed = [{"claim_text": "a"}, {"claim_text": "b"}]
    scenario.verify_results = [
        verification(claim("a", "supported", 0), claim("b", "unsupported", 1)),
    ]
    scenario.revisions = ["revised once", "revised twice"]
    set_workspace_policy(db, workspace_a, max_correction_retries=2, abstention_policy="soft")

    result = run(db, workspace_a)

    assert result["is_abstained"] is False
    assert result["correction_rounds"] == 2
    assert result["verification_status"] in ("partially_verified", "unresolved")
    verdicts = {c["verdict"] for c in result["claims"]}
    assert "unsupported" in verdicts


def test_workspace_retry_setting_cannot_exceed_hard_cap(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("never", "unsupported"))]
    scenario.revisions = [f"attempt {i}" for i in range(100)]
    set_workspace_policy(db, workspace_a, max_correction_retries=999)

    run(db, workspace_a)

    assert scenario.calls["revise"] == HARD_MAX_CORRECTION_ROUNDS


def test_zero_retries_skips_correction_entirely(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("bad", "unsupported"))]
    scenario.revisions = ["unused"]
    set_workspace_policy(db, workspace_a, max_correction_retries=0)

    result = run(db, workspace_a)

    assert scenario.calls["revise"] == 0
    assert result["correction_rounds"] == 0
    assert result["is_abstained"] is True


def test_identical_revision_stalls_instead_of_looping(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("bad", "unsupported"))]
    scenario.revisions = [scenario.draft]  # model returns the unchanged draft
    set_workspace_policy(db, workspace_a, max_correction_retries=5)

    result = run(db, workspace_a)

    assert scenario.calls["revise"] == 1
    assert result["correction_rounds"] == 1
    assert scenario.calls["verify"] == 1  # no pointless re-verification of an unchanged answer
    assert result["is_abstained"] is True


# ---------------------------------------------------------------------------
# Insufficient evidence
# ---------------------------------------------------------------------------


def test_insufficient_evidence_with_empty_index_corrects_then_abstains_when_strict(db, workspace_a, monkeypatch):
    scenario = Scenario(monkeypatch, passages=[])
    scenario.draft = "No relevant evidence was found."
    scenario.verify_results = [verification(claim("No relevant evidence.", "insufficient_evidence"))]
    scenario.revisions = [f"revision {i}" for i in range(10)]
    set_workspace_policy(db, workspace_a, max_correction_retries=2, abstention_policy="strict")

    result = run(db, workspace_a)

    assert scenario.calls["revise"] == 2
    assert result["is_abstained"] is True
    assert result["final_text"] == ABSTENTION_TEXT


def test_insufficient_evidence_with_single_claim_is_kept_under_soft_policy(db, workspace_a, monkeypatch):
    scenario = Scenario(monkeypatch, passages=[])
    scenario.verify_results = [verification(claim("Unverifiable.", "insufficient_evidence"))]
    scenario.revisions = [f"revision {i}" for i in range(10)]
    set_workspace_policy(db, workspace_a, max_correction_retries=1, abstention_policy="soft")

    result = run(db, workspace_a)

    assert scenario.calls["revise"] == 1
    assert result["is_abstained"] is False
    assert result["claims"][0]["verdict"] == "insufficient_evidence"


def test_insufficient_evidence_with_retrievable_context_attempts_correction(db, workspace_a, scenario):
    scenario.verify_results = [
        verification(claim("Titan uses X.", "insufficient_evidence")),
        verification(claim("Titan uses mTLS.", "supported")),
    ]
    scenario.revisions = ["Titan uses mTLS."]

    result = run(db, workspace_a)

    assert result["correction_rounds"] == 1
    assert result["is_abstained"] is False


# ---------------------------------------------------------------------------
# Provider failures
# ---------------------------------------------------------------------------


def answer_count(db, workspace):
    return db.query(Answer).join(Query, Answer.query_id == Query.id).filter(Query.workspace_id == workspace.id).count()


def failed_queries(db, workspace):
    return db.query(Query).filter(Query.workspace_id == workspace.id, Query.status == "failed").all()


def test_generation_provider_failure_routes_to_error_handler(db, workspace_a, scenario, monkeypatch):
    def boom(*a, **k):
        try:
            raise ProviderError("Gemini generateContent returned HTTP 429")
        except ProviderError as inner:
            raise GenerationError("Model provider failed during answer generation") from inner

    monkeypatch.setattr(nodes, "generate_draft_answer", boom)

    with pytest.raises(GenerationError):
        run(db, workspace_a)

    assert len(failed_queries(db, workspace_a)) == 1
    assert answer_count(db, workspace_a) == 0


def test_retrieval_provider_failure_raises_provider_error(db, workspace_a, scenario, monkeypatch):
    def boom(*a, **k):
        raise ProviderError("embedding provider unavailable")

    monkeypatch.setattr(nodes, "retrieve_hybrid", boom)

    with pytest.raises(ProviderError):
        run(db, workspace_a)
    assert len(failed_queries(db, workspace_a)) == 1


def test_verification_error_claims_raise_verification_provider_error(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("c", "verification_error"))]

    events = []
    with pytest.raises(VerificationProviderError):
        run(db, workspace_a, on_event=events.append)

    assert ("verification", "failed") in [(e["stage"], e["status"]) for e in stage_events(events)]
    failed = failed_queries(db, workspace_a)
    assert len(failed) == 1 and "verification_error" in failed[0].query_parameters["error_summary"]
    assert answer_count(db, workspace_a) == 0


def test_verification_error_during_reverification_is_an_error_not_a_pass(db, workspace_a, scenario):
    scenario.verify_results = [
        verification(claim("bad", "unsupported")),
        verification(claim("still", "verification_error")),
    ]
    scenario.revisions = ["revised"]

    events = []
    with pytest.raises(VerificationProviderError):
        run(db, workspace_a, on_event=events.append)

    assert ("correction", "failed") in [(e["stage"], e["status"]) for e in stage_events(events)]
    assert len(failed_queries(db, workspace_a)) == 1


def test_correction_provider_failure_routes_to_error_handler(db, workspace_a, scenario, monkeypatch):
    scenario.verify_results = [verification(claim("bad", "unsupported"))]

    def boom(*a, **k):
        raise ProviderError("revision model offline")

    monkeypatch.setattr(nodes, "revise_answer", boom)

    with pytest.raises(ProviderError):
        run(db, workspace_a)
    assert len(failed_queries(db, workspace_a)) == 1


def test_persistence_failure_rolls_back_and_raises(db, workspace_a, scenario, monkeypatch):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    def boom(*a, **k):
        raise RuntimeError("audit ledger unavailable")

    import app.services.audit.recorder as recorder
    monkeypatch.setattr(recorder, "record_audit_event", boom)

    with pytest.raises(RuntimeError, match="audit ledger unavailable"):
        run(db, workspace_a)

    # Nothing from the failed commit survives; only a failed query row remains so the history shows the run.
    assert answer_count(db, workspace_a) == 0
    assert db.query(Query).filter(Query.workspace_id == workspace_a.id, Query.status == "completed").count() == 0
    failed = failed_queries(db, workspace_a)
    assert len(failed) == 1 and "audit ledger unavailable" in failed[0].error_message
    assert failed[0].execution_trace[-1]["node"] == "error_handler"
    assert [t["node"] for t in failed[0].execution_trace if t["status"] == "failed"] == ["database_persistence", "error_handler"]


# ---------------------------------------------------------------------------
# Cache behaviour around the graph
# ---------------------------------------------------------------------------


def test_cache_miss_then_hit_skips_the_graph(db, workspace_a, scenario, monkeypatch):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    invocations = []
    original = CompiledStateGraph.invoke
    monkeypatch.setattr(CompiledStateGraph, "invoke", lambda self, *a, **k: (invocations.append(1), original(self, *a, **k))[1])

    assert pipeline_cache_service.is_enabled
    first = run_pipeline(db, workspace_a.id, "cache me", top_k=3)
    second = run_pipeline(db, workspace_a.id, "cache me", top_k=3)

    assert first["execution_metadata"]["cache_hit"] is False
    assert second["execution_metadata"]["cache_hit"] is True
    assert len(invocations) == 1
    metrics = pipeline_cache_service.get_metrics()
    assert metrics["hits"] == 1 and metrics["misses"] >= 1
    assert second["answer_id"] == first["answer_id"]


def test_failed_runs_are_not_cached(db, workspace_a, scenario):
    scenario.verify_results = [verification(claim("c", "verification_error"))]

    for _ in range(2):
        with pytest.raises(VerificationProviderError):
            run_pipeline(db, workspace_a.id, "will fail", top_k=3)

    assert scenario.calls["verify"] == 2
    assert pipeline_cache_service.get_metrics()["hits"] == 0


# ---------------------------------------------------------------------------
# API contract
# ---------------------------------------------------------------------------


def test_query_endpoint_contract_is_unchanged_through_the_graph(client, workspace_a, scenario):
    scenario.verify_results = [verification(claim("Titan uses mTLS.", "supported"))]

    res = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json={"prompt": "How do they talk?", "top_k": 3})

    assert res.status_code == 201
    body = res.json()
    assert body["verification_status"] == "verified"
    assert body["answer"]["claims"][0]["verdict"] == "supported"
    assert body["execution_metadata"]["orchestrator"] == "langgraph"


def test_query_endpoint_maps_provider_outage_to_502(client, workspace_a, scenario, monkeypatch):
    def boom(*a, **k):
        raise ProviderError("down")

    monkeypatch.setattr(nodes, "retrieve_hybrid", boom)

    res = client.post(f"/api/v1/workspaces/{workspace_a.id}/queries", json={"prompt": "hello there", "top_k": 3})
    assert res.status_code == 502
