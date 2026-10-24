"""Document ingestion endpoints handling multipart upload, signed URL access, status tracking, and deletion."""

from typing import List, Optional
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, BackgroundTasks, status
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.db.models.workspaces import Workspace
from app.db.models.documents import Document
from app.api.deps import get_workspace_scoped
from app.schemas import DocumentRead, DocumentSignedUrlResponse, SearchResult
from app.security.file_validation import validate_file_upload, compute_checksum, sanitize_filename
import app.providers.base as providers_base
from app.providers.storage_base import StorageError
from app.services.ingestion.indexer import index_document

router = APIRouter(prefix="/workspaces/{workspace_id}/documents", tags=["Documents"])


def process_document_background_task(document_id: UUID, file_bytes: bytes) -> None:
    """Lightweight background task to process and index document asynchronously."""
    db: Session = SessionLocal()
    try:
        index_document(db, document_id, file_bytes)
    except Exception as e:
        # Unexpected fatal errors are logged and recorded on the document in index_document
        pass
    finally:
        db.close()


@router.get("/search", response_model=List[SearchResult])
def search_workspace_documents(
    q: str = Query(..., min_length=1, description="Query string for semantic/lexical search"),
    top_k: int = Query(5, ge=1, le=50),
    mode: str = Query("hybrid", pattern="^(vector|lexical|hybrid)$"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Search indexed document chunks in the workspace using vector, lexical, or hybrid mode."""
    from app.services.retrieval.vector import search_vectors
    from app.services.retrieval.lexical import search_lexical
    from app.services.retrieval.hybrid import retrieve_hybrid

    if mode == "vector":
        return search_vectors(db, workspace.id, q, top_k=top_k)
    elif mode == "lexical":
        return search_lexical(db, workspace.id, q, top_k=top_k)
    else:
        return retrieve_hybrid(db, workspace.id, q, top_k=top_k)


@router.get("", response_model=List[DocumentRead])
def list_documents(
    status_filter: Optional[str] = Query(None, alias="status"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """List all documents indexed in the specified workspace with optional status filtering."""
    query = db.query(Document).filter(Document.workspace_id == workspace.id)
    if status_filter:
        query = query.filter(Document.status == status_filter)
    return query.order_by(Document.created_at.desc()).all()


@router.post("/upload", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    sync: bool = Query(False, description="Whether to block and process synchronously (useful for tests)"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """
    Receive multipart file upload, validate format, stream to private Firebase Storage,
    and trigger extraction, chunking, and pgvector embedding pipeline.
    """
    content = await file.read()
    raw_filename = file.filename or "unnamed_document"
    safe_filename = sanitize_filename(raw_filename)

    is_valid, resolved_mime, reason = validate_file_upload(
        safe_filename,
        file.content_type or "application/octet-stream",
        content,
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

    checksum = compute_checksum(content)
    document_id = uuid4()
    storage_path = f"workspaces/{workspace.id}/documents/{document_id}/{safe_filename}"

    # 1. Stream to private storage provider
    storage_provider = providers_base.get_storage_provider()
    try:
        storage_provider.upload(storage_path, content, resolved_mime)
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Storage upload failed: {str(e)}",
        )

    # 2. Record initial 'uploaded' state in DB
    doc = Document(
        id=document_id,
        workspace_id=workspace.id,
        filename=safe_filename,
        storage_path=storage_path,
        checksum=checksum,
        status="uploaded",
        file_size_bytes=len(content),
        mime_type=resolved_mime,
        metadata_={"original_filename": raw_filename},
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 3. Process indexing pipeline
    if sync:
        doc = index_document(db, doc.id, content)
    else:
        background_tasks.add_task(process_document_background_task, doc.id, content)

    return doc


@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retrieve indexing state, error message, and metadata for a specific document."""
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


@router.post("/{document_id}/reprocess", response_model=DocumentRead)
def reprocess_document(
    document_id: UUID,
    background_tasks: BackgroundTasks,
    sync: bool = Query(False, description="Process synchronously"),
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Retry indexing for a failed document or re-index using current chunking configuration."""
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_provider = providers_base.get_storage_provider()
    try:
        file_bytes = storage_provider.get_file_bytes(doc.storage_path)
    except StorageError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch original file from storage: {e}",
        )

    if sync:
        doc = index_document(db, doc.id, file_bytes)
    else:
        doc.status = "processing"
        doc.error_message = None
        db.commit()
        db.refresh(doc)
        background_tasks.add_task(process_document_background_task, doc.id, file_bytes)

    return doc


@router.get("/{document_id}/file", response_model=DocumentSignedUrlResponse)
def get_document_file_url(
    document_id: UUID,
    workspace: Workspace = Depends(get_workspace_scoped),
    db: Session = Depends(get_db),
):
    """Generate temporary read-only signed URL to view or download private storage document."""
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    storage_provider = providers_base.get_storage_provider()
    try:
        signed_url = storage_provider.get_signed_url(doc.storage_path, expires_in_seconds=3600)
    except StorageError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

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
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.workspace_id == workspace.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # 1. Delete object from storage
    storage_provider = providers_base.get_storage_provider()
    try:
        storage_provider.delete(doc.storage_path)
    except Exception:
        pass  # Proceed with DB deletion even if storage blob was already removed

    # 2. Delete document record (cascades to chunks)
    db.delete(doc)
    db.commit()
    return None
