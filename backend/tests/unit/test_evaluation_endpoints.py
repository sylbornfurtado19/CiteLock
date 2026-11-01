"""Unit tests for Evaluation Benchmark runner API endpoints and tenant isolation."""

import pytest
from app.db.models.audit_events import AuditEvent


def test_run_benchmark_and_history(client, workspace_a, db):
    """Test running evaluation benchmark returns real metrics and records audit history."""
    # 1. Initially latest is null
    res_latest_empty = client.get(f"/api/v1/workspaces/{workspace_a.id}/evaluation/latest")
    assert res_latest_empty.status_code == 200
    assert res_latest_empty.json() is None

    # 2. Trigger benchmark run (limit to 3 cases for test speed)
    payload = {"sample_size": 3}
    res_run = client.post(f"/api/v1/workspaces/{workspace_a.id}/evaluation/run", json=payload)
    assert res_run.status_code == 200

    data = res_run.json()
    assert "id" in data
    assert data["total_test_cases"] == 3
    assert data["dataset_name"] == "CiteLock Grounded Truth Benchmark v1"
    assert data["execution_time_ms"] > 0
    assert "systems" in data

    # Verify Plain RAG, Single-Pass Verify, and CiteLock are present
    systems = data["systems"]
    assert "plain_rag" in systems
    assert "single_verify" in systems
    assert "citelock" in systems

    for sys_key, sys_data in systems.items():
        assert "hallucination_rate" in sys_data
        assert "faithfulness" in sys_data
        assert "avg_latency_ms" in sys_data
        assert "total_claims" in sys_data
        assert sys_data["total_claims"] > 0
        assert 0.0 <= sys_data["hallucination_rate"] <= 1.0
        assert 0.0 <= sys_data["faithfulness"] <= 1.0

    # CiteLock should achieve reduction
    assert "hallucination_reduction_pct" in data

    # 3. Verify audit event persistence in database
    event = (
        db.query(AuditEvent)
        .filter(AuditEvent.workspace_id == workspace_a.id, AuditEvent.event_type == "benchmark_executed")
        .first()
    )
    assert event is not None
    assert event.payload["id"] == data["id"]

    # 4. Check latest endpoint
    res_latest = client.get(f"/api/v1/workspaces/{workspace_a.id}/evaluation/latest")
    assert res_latest.status_code == 200
    latest_data = res_latest.json()
    assert latest_data["id"] == data["id"]

    # 5. Check history endpoint
    res_history = client.get(f"/api/v1/workspaces/{workspace_a.id}/evaluation/history")
    assert res_history.status_code == 200
    history = res_history.json()
    assert isinstance(history, list)
    assert len(history) >= 1
    assert history[0]["id"] == str(event.id)
    assert history[0]["total_test_cases"] == 3


def test_benchmark_tenant_isolation(client, user_a, user_b, workspace_a, workspace_b):
    """Test that User A cannot run or view benchmarks for Workspace B."""
    cross_run = client.post(f"/api/v1/workspaces/{workspace_b.id}/evaluation/run", json={"sample_size": 1})
    assert cross_run.status_code in (403, 404)

    cross_history = client.get(f"/api/v1/workspaces/{workspace_b.id}/evaluation/history")
    assert cross_history.status_code in (403, 404)

