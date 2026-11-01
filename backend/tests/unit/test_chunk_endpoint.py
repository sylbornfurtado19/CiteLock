"""Tests for document chunk retrieval endpoint and multi-tenant isolation."""

import uuid
from app.db.models.documents import Document
from app.db.models.chunks import Chunk


def test_get_document_chunk_success(client, db, workspace_a):
    doc = Document(
        id=uuid.uuid4(),
        workspace_id=workspace_a.id,
        filename="manual.pdf",
        storage_path="path/to/manual.pdf",
        checksum="abcd1234efgh",
        status="indexed",
        file_size_bytes=1024,
        mime_type="application/pdf",
    )
    db.add(doc)
    db.commit()

    chunk = Chunk(
        id=uuid.uuid4(),
        document_id=doc.id,
        chunk_index=0,
        content="Revenue grew by 14% to $12.4M in Q3 2024 according to financial reporting.",
        token_count=15,
        metadata_={"page_number": 3, "section_title": "Financial Highlights"},
    )
    db.add(chunk)
    db.commit()

    response = client.get(f"/api/v1/workspaces/{workspace_a.id}/documents/chunks/{chunk.id}")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["id"] == str(chunk.id)
    assert data["document_id"] == str(doc.id)
    assert data["content"] == chunk.content
    assert data["metadata"]["page_number"] == 3
    assert data["document_filename"] == "manual.pdf"


def test_get_document_chunk_cross_workspace_isolated(client, db, workspace_a, workspace_b):
    # Workspace A owns the document and chunk
    doc = Document(
        id=uuid.uuid4(),
        workspace_id=workspace_a.id,
        filename="secret_a.pdf",
        storage_path="path/to/secret_a.pdf",
        checksum="sec1234",
        status="indexed",
        file_size_bytes=512,
        mime_type="application/pdf",
    )
    db.add(doc)
    db.commit()

    chunk = Chunk(
        id=uuid.uuid4(),
        document_id=doc.id,
        chunk_index=0,
        content="Confidential metrics for Workspace A only.",
        metadata_={"page_number": 1},
    )
    db.add(chunk)
    db.commit()

    # Workspace B attempts to access Workspace A's chunk -> must be 404
    response = client.get(f"/api/v1/workspaces/{workspace_b.id}/documents/chunks/{chunk.id}")
    assert response.status_code == 404


def test_get_document_chunk_not_found(client, db, workspace_a):
    non_existent_id = uuid.uuid4()
    response = client.get(f"/api/v1/workspaces/{workspace_a.id}/documents/chunks/{non_existent_id}")
    assert response.status_code == 404
