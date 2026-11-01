"""Unit and integration tests for Workspace Settings and Model Configuration endpoints."""

import uuid
import pytest
from app.db.models.workspaces import Workspace
from app.config import get_settings


def test_get_workspace_settings_defaults(client, workspace_a):
    """Test retrieving workspace settings returns valid defaults and deployment info without secrets."""
    response = client.get(f"/api/v1/workspaces/{workspace_a.id}/settings")
    assert response.status_code == 200

    data = response.json()
    assert data["workspace_id"] == str(workspace_a.id)
    assert data["retrieval_top_k"] == 5
    assert data["max_correction_retries"] == 2
    assert data["abstention_policy"] == "strict"
    assert data["preferred_llm_provider"] is None
    assert isinstance(data["available_llm_providers"], list)
    assert len(data["available_llm_providers"]) >= 1

    # Check deployment info structure
    dep_info = data["deployment_info"]
    assert "database_engine" in dep_info
    assert "storage_provider" in dep_info
    assert "embedding_provider" in dep_info
    assert "embedding_dim" in dep_info
    assert "environment" in dep_info
    assert dep_info["embedding_dim"] == 1536

    # Security check: verify no secrets or credentials leaked
    raw_text = response.text.lower()
    assert "api_key" not in raw_text
    assert "citelock_dev_password" not in raw_text
    assert "service_account" not in raw_text


def test_patch_workspace_settings(client, workspace_a):
    """Test updating workspace-level configuration with valid fields."""
    payload = {
        "retrieval_top_k": 8,
        "max_correction_retries": 4,
        "abstention_policy": "soft",
        "preferred_llm_provider": "mock",
    }
    response = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["retrieval_top_k"] == 8
    assert data["max_correction_retries"] == 4
    assert data["abstention_policy"] == "soft"
    assert data["preferred_llm_provider"] == "mock"

    # Verify persistence by fetching again
    fetch_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/settings")
    assert fetch_res.status_code == 200
    fetched_data = fetch_res.json()
    assert fetched_data["retrieval_top_k"] == 8
    assert fetched_data["max_correction_retries"] == 4
    assert fetched_data["abstention_policy"] == "soft"


def test_patch_workspace_settings_validation_errors(client, workspace_a):
    """Test validation boundaries for settings (out of range, invalid enum, unconfigured provider)."""
    # 1. retrieval_top_k out of bounds (> 20)
    res1 = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json={"retrieval_top_k": 50})
    assert res1.status_code == 422

    # 2. retrieval_top_k < 1
    res2 = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json={"retrieval_top_k": 0})
    assert res2.status_code == 422

    # 3. max_correction_retries > 5
    res3 = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json={"max_correction_retries": 10})
    assert res3.status_code == 422

    # 4. Invalid abstention policy
    res4 = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json={"abstention_policy": "yolo"})
    assert res4.status_code == 422

    # 5. Non-existent unconfigured model provider
    res5 = client.patch(
        f"/api/v1/workspaces/{workspace_a.id}/settings",
        json={"preferred_llm_provider": "anthropic_claude_unconfigured_xyz"},
    )
    assert res5.status_code == 400
    assert "not configured on this host" in res5.json()["detail"]


def test_workspace_settings_tenant_isolation(client, user_a, user_b, workspace_a, workspace_b):
    """Test that modifying settings in workspace A leaves workspace B completely unaffected."""
    # User A updates workspace_a settings
    patch_payload = {
        "retrieval_top_k": 12,
        "max_correction_retries": 5,
        "abstention_policy": "soft",
    }
    res_a = client.patch(f"/api/v1/workspaces/{workspace_a.id}/settings", json=patch_payload)
    assert res_a.status_code == 200
    assert res_a.json()["retrieval_top_k"] == 12

    # Verify workspace_b (which is NOT owned by User A) cannot be modified or accessed by User A
    cross_access = client.get(f"/api/v1/workspaces/{workspace_b.id}/settings")
    assert cross_access.status_code in (403, 404)


def test_reset_workspace_settings(client, workspace_a):
    """Test resetting workspace settings back to system defaults."""
    # Modify settings first
    client.patch(
        f"/api/v1/workspaces/{workspace_a.id}/settings",
        json={"retrieval_top_k": 15, "max_correction_retries": 1, "abstention_policy": "soft"},
    )

    # Call reset
    reset_res = client.post(f"/api/v1/workspaces/{workspace_a.id}/settings/reset")
    assert reset_res.status_code == 200

    reset_data = reset_res.json()
    assert reset_data["retrieval_top_k"] == 5
    assert reset_data["max_correction_retries"] == 2
    assert reset_data["abstention_policy"] == "strict"
    assert reset_data["preferred_llm_provider"] is None


def test_connectivity_probe_endpoint(client, workspace_a):
    """Test live connectivity probe pings database, storage, and LLM provider."""
    response = client.post(f"/api/v1/workspaces/{workspace_a.id}/settings/test-connection")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] in ("healthy", "degraded")
    assert "total_latency_ms" in data
    assert data["total_latency_ms"] >= 0

    services = data["services"]
    assert "database" in services
    assert "storage" in services
    assert "llm" in services

    # Verify database probe
    db_service = services["database"]
    assert db_service["status"] == "operational"
    assert db_service["latency_ms"] >= 0
    assert "active" in db_service["details"].lower() or "engine" in db_service["details"].lower()

    # Verify storage probe
    storage_service = services["storage"]
    assert storage_service["status"] == "operational"

    # Verify LLM probe
    llm_service = services["llm"]
    assert llm_service["status"] == "operational"
    assert "verified" in llm_service["details"].lower() or "responsive" in llm_service["details"].lower()

    # Security check: no sensitive tokens or passwords in test connectivity response
    raw_text = response.text.lower()
    assert "bearer" not in raw_text
    assert "password" not in raw_text
    assert "secret" not in raw_text

