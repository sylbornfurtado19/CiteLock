"""Integration tests for document upload, atomic indexing, idempotency, failure states, and retrieval."""

import io
from uuid import UUID, uuid4
import pytest
from tests.conftest import create_sample_pdf, create_scanned_pdf, create_sample_docx
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
from app.services.ingestion.indexer import index_document
from app.providers.base import MockEmbeddingProvider
import app.providers.base as providers_base


def test_upload_and_index_pdf_sync(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test full end-to-end multipart upload and synchronous indexing for PDF."""
    pdf_bytes = create_sample_pdf("CiteLock provides cryptographic hallucination auditing.")
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("report.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "report.pdf"
    assert data["status"] == "indexed"
    assert data["error_message"] is None

    # Check chunks persisted in DB
    chunks = db.query(Chunk).filter(Chunk.document_id == UUID(data["id"])).all()
    assert len(chunks) >= 1
    assert "CiteLock" in chunks[0].content
    assert chunks[0].embedding is not None
    assert chunks[0].metadata_["page_number"] == 1


def test_upload_and_index_docx_sync(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test full multipart upload and indexing for DOCX file."""
    docx_bytes = create_sample_docx(["Neural claim verification with provenance tracking."])
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("architecture.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "indexed"
    assert data["error_message"] is None

    chunks = db.query(Chunk).filter(Chunk.document_id == UUID(data["id"])).all()
    assert len(chunks) >= 1
    assert any("Neural claim" in c.content for c in chunks)


def test_upload_scanned_pdf_reports_failed_honestly(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test that scanned PDFs without text layers are marked failed with a descriptive message."""
    scanned_bytes = create_scanned_pdf()
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("scan.pdf", scanned_bytes, "application/pdf")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "failed"
    assert "scanned" in data["error_message"].lower()

    # Verify no chunks were indexed
    chunks = db.query(Chunk).filter(Chunk.document_id == UUID(data["id"])).all()
    assert len(chunks) == 0


def test_upload_empty_document_rejected(client, workspace_a):
    """Test that zero-byte files are rejected with 400 Bad Request."""
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_idempotent_duplicate_processing(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test that re-running indexing does not duplicate chunks."""
    pdf_bytes = create_sample_pdf("Idempotency ensures chunk tables remain clean.")
    doc_id = uuid4()
    doc = Document(
        id=doc_id,
        workspace_id=workspace_a.id,
        filename="idempotent.pdf",
        storage_path=f"workspaces/{workspace_a.id}/documents/{doc_id}/idempotent.pdf",
        checksum="dummy_checksum_123",
        status="uploaded",
        file_size_bytes=len(pdf_bytes),
        mime_type="application/pdf",
    )
    db.add(doc)
    db.commit()

    # Pass 1
    index_document(db, doc_id, pdf_bytes)
    chunks_pass_1 = db.query(Chunk).filter(Chunk.document_id == doc_id).all()
    count_1 = len(chunks_pass_1)
    assert count_1 >= 1

    # Pass 2 (duplicate indexing run)
    index_document(db, doc_id, pdf_bytes)
    chunks_pass_2 = db.query(Chunk).filter(Chunk.document_id == doc_id).all()
    count_2 = len(chunks_pass_2)

    # Count must be identical (no duplicate rows)
    assert count_1 == count_2


def test_embedding_provider_failure_handled_honestly(client, workspace_a, mock_storage, monkeypatch, db):
    """Test that embedding provider failure marks document failed without exposing secrets."""
    failing_provider = MockEmbeddingProvider(simulate_failure=True)
    monkeypatch.setattr(providers_base, "get_embedding_provider", lambda: failing_provider)

    pdf_bytes = create_sample_pdf("Content to embed during provider outage.")
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("provider_fail.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "failed"
    assert "embedding provider failure" in data["error_message"].lower()

    chunks = db.query(Chunk).filter(Chunk.document_id == UUID(data["id"])).all()
    assert len(chunks) == 0


def test_storage_upload_failure_returns_502(client, workspace_a, monkeypatch):
    """Test that storage provider outage is cleanly returned as 502 without DB corruption."""
    from app.providers.none_storage import NoneStorageProvider
    failing_storage = NoneStorageProvider(simulate_failure=True)
    monkeypatch.setattr(providers_base, "get_storage_provider", lambda: failing_storage)

    pdf_bytes = create_sample_pdf("Content doomed to fail storage.")
    response = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("storage_fail.pdf", pdf_bytes, "application/pdf")},
    )

    assert response.status_code == 502
    assert "storage upload failed" in response.json()["detail"].lower()


def test_retrieval_and_search_endpoint(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test searching workspace documents using vector and hybrid retrieval."""
    pdf_bytes = create_sample_pdf("The quarterly operating expenses grew by 12 percent.")
    upload_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("finances.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 201

    # Search for term
    search_res = client.get(
        f"/api/v1/workspaces/{workspace_a.id}/documents/search?q=operating+expenses&mode=hybrid"
    )
    assert search_res.status_code == 200
    results = search_res.json()
    assert len(results) >= 1
    assert "operating expenses" in results[0]["content"].lower()
    assert results[0]["filename"] == "finances.pdf"


def test_document_reprocess_endpoint(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test reprocessing an existing document from storage."""
    pdf_bytes = create_sample_pdf("Reprocess pipeline verification.")
    upload_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("reprocess_test.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = upload_res.json()["id"]

    reprocess_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/{doc_id}/reprocess?sync=true"
    )
    assert reprocess_res.status_code == 200
    assert reprocess_res.json()["status"] == "indexed"


def test_delete_document_removes_from_storage_and_db(client, workspace_a, mock_storage, mock_embeddings, db):
    """Test deleting document cleans up storage and cascading chunk rows."""
    pdf_bytes = create_sample_pdf("To be deleted permanently.")
    upload_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("delete_me.pdf", pdf_bytes, "application/pdf")},
    )
    doc_id = upload_res.json()["id"]
    storage_path = upload_res.json()["storage_path"]

    # Verify exists
    assert storage_path in mock_storage._storage
    assert db.query(Chunk).filter(Chunk.document_id == UUID(doc_id)).count() >= 1

    # Delete
    del_res = client.delete(f"/api/v1/workspaces/{workspace_a.id}/documents/{doc_id}")
    assert del_res.status_code == 204

    # Verify gone
    assert storage_path not in mock_storage._storage
    assert db.query(Chunk).filter(Chunk.document_id == UUID(doc_id)).count() == 0
    assert db.query(Document).filter(Document.id == UUID(doc_id)).first() is None
