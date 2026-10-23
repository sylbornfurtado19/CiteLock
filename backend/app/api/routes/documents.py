"""Document ingestion endpoints handling multipart upload, signed URL access, and deletion."""

from typing import List
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models.workspaces import Workspace
from app.db.models.documents import Document
from app.api.deps import get_workspace_scoped
from app.schemas import DocumentRead, DocumentSignedUrlResponse
from app.security.file_validation import validate_file_upload, compute_checksum
from app.providers.base import get_storage_provider

router = APIRouter(prefix="/workspaces/{workspace_id}/documents", tags=["Documents"])


@router.get("", response_model=List[DocumentRead])
def list_documents(
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """List all documents indexed in the specified workspace."""
    # TODO: Implement pagination and filtering by processing status
    return db.query(Document).filter(Document.workspace_id == workspace.id).all()


@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Receive multipart file upload, stream to private Firebase Storage, and queue parsing."""
    # TODO: Offload parsing and embedding pipeline to background task or Celery worker
    content = await file.read()
    is_valid, reason = validate_file_upload(file.filename or "unknown", file.content_type or "", content)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    checksum = compute_checksum(content)
    document_id = uuid4()
    storage_path = f"workspaces/{workspace.id}/documents/{document_id}/{file.filename}"

    storage_provider = get_storage_provider()
    storage_provider.upload(storage_path, content, file.content_type or "application/octet-stream")

    doc = Document(
        id=document_id,
        workspace_id=workspace.id,
        filename=file.filename or "unnamed_document",
        storage_path=storage_path,
        checksum=checksum,
        status="indexed",
        file_size_bytes=len(content),
        mime_type=file.content_type or "application/octet-stream",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{document_id}/file", response_model=DocumentSignedUrlResponse)
def get_document_file_url(
    document_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Generate temporary read-only signed URL to view or download private storage document."""
    # TODO: Track download access logs in audit_events table
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_provider = get_storage_provider()
    signed_url = storage_provider.get_signed_url(doc.storage_path, expires_in_seconds=3600)

    return DocumentSignedUrlResponse(
        document_id=doc.id,
        filename=doc.filename,
        download_url=signed_url,
        expires_in_seconds=3600,
    )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Delete document, chunk embeddings, and object from private storage."""
    # TODO: Ensure complete cleanup of associated evidence_links before hard deletion
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_provider = get_storage_provider()
    storage_provider.delete(doc.storage_path)

    db.delete(doc)
    db.commit()
    return None
