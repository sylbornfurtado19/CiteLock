"""Unit and integration tests for workspace API endpoints and tenant isolation."""

import uuid
import pytest
from app.db.models.workspaces import Workspace


def test_list_workspaces_tenant_isolation(client, user_a, user_b, workspace_a, workspace_b):
    """Test that listing workspaces only returns workspaces owned by the authenticated user."""
    response = client.get("/api/v1/workspaces")
    assert response.status_code == 200
    workspaces = response.json()
    assert isinstance(workspaces, list)

    workspace_ids = [w["id"] for w in workspaces]
    # User A should see workspace A but never workspace B
    assert str(workspace_a.id) in workspace_ids
    assert str(workspace_b.id) not in workspace_ids


def test_create_workspace_success(client, user_a):
    """Test creating a new isolated workspace with name and description."""
    payload = {
        "name": "Legal Compliance Q3",
        "description": "Corpus for Q3 corporate compliance and audit review",
    }
    response = client.post("/api/v1/workspaces", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == payload["name"]
    assert data["description"] == payload["description"]
    assert "id" in data
    assert data["owner_id"] == str(user_a.id)
    assert "created_at" in data


def test_create_workspace_without_description(client, user_a):
    """Test creating a workspace with optional description omitted."""
    payload = {"name": "Minimal Workspace"}
    response = client.post("/api/v1/workspaces", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["name"] == "Minimal Workspace"
    assert data["description"] is None
    assert data["owner_id"] == str(user_a.id)


def test_create_workspace_validation_error(client):
    """Test that missing required 'name' field fails with 422 Unprocessable Entity."""
    response = client.post("/api/v1/workspaces", json={"description": "Missing name field"})
    assert response.status_code == 422


def test_get_workspace_by_id(client, workspace_a):
    """Test retrieving details for a valid accessible workspace."""
    response = client.get(f"/api/v1/workspaces/{workspace_a.id}")
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == str(workspace_a.id)
    assert data["name"] == workspace_a.name
    assert data["description"] == workspace_a.description


def test_get_unauthorized_workspace_rejected(client, workspace_b):
    """Test that retrieving another user's workspace is rejected with 404 (isolation defense)."""
    response = client.get(f"/api/v1/workspaces/{workspace_b.id}")
    assert response.status_code == 404
    assert "Workspace not found or unauthorized access" in response.json()["detail"]


def test_get_nonexistent_workspace_rejected(client):
    """Test that retrieving an arbitrary random UUID returns 404."""
    random_id = uuid.uuid4()
    response = client.get(f"/api/v1/workspaces/{random_id}")
    assert response.status_code == 404

