"""Integration tests for FastAPI endpoints and database interactions."""

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    """Verify unauthenticated /health returns 200 OK."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "citelock-backend"


def test_developer_verify_endpoint():
    """Verify developer verification API stub returns valid payload."""
    payload = {
        "statement": "The model achieved 95% accuracy on the benchmark.",
        "context_passages": ["The model achieved 95% accuracy on the benchmark."],
    }
    response = client.post("/api/v1/verify", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] == "supported"
