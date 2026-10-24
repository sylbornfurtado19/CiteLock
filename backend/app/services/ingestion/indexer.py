"""Document indexing service orchestrating parsing, chunking, embedding generation, and atomic pgvector persistence."""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
import app.providers.base as providers_base
from app.providers.base import ProviderError
from app.providers.storage_base import StorageError
from app.services.ingestion.parser import (
    parse_document,
    IngestionError,
    EmptyDocumentError,
    ScannedDocumentError,
    UnsupportedFileTypeError,
)
from app.services.ingestion.chunker import chunk_document

logger = logging.getLogger(__name__)


def clean_error_message(err: Exception) -> str:
    """Sanitize error messages to ensure API keys, internal credentials, or stack traces are not exposed."""
    msg = str(err)
    # Strip potential Bearer tokens or API keys
    import re
    msg = re.sub(r'sk-[a-zA-Z0-9_-]{20,}', 'sk-***', msg)
    msg = re.sub(r'Bearer\s+[a-zA-Z0-9_\-\.]+', 'Bearer ***', msg)
    if len(msg) > 300:
        msg = msg[:297] + "..."
    return msg


def index_document(
    db: Session,
    document_id: UUID,
    file_bytes: bytes,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> Document:
    """
    Ingest, parse, chunk, embed, and persist a document atomically.
    Transitions: 'uploaded' -> 'processing' -> 'indexed' (or 'failed' on error).
    Guarantees idempotency by deleting any pre-existing chunks for this document.
    """
    settings = get_settings()
    c_size = chunk_size or settings.chunk_size
    c_overlap = chunk_overlap or settings.chunk_overlap

    # Retrieve document record
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise ValueError(f"Document with ID {document_id} does not exist.")

    # 1. Transition to 'processing'
    doc.status = "processing"
    doc.error_message = None
    db.commit()
    db.refresh(doc)

    try:
        # 2. Extract text and structural metadata
        parse_result = parse_document(file_bytes, doc.mime_type, doc.filename)

        # 3. Split into bounded overlapping chunks
        chunks_data = chunk_document(
            parse_result,
            chunk_size=c_size,
            chunk_overlap=c_overlap,
            document_id=doc.id,
            filename=doc.filename,
        )

        if not chunks_data:
            raise EmptyDocumentError("Chunking produced 0 valid text passages.")

        # 4. Generate dense vector embeddings via configured provider
        embedding_provider = providers_base.get_embedding_provider()
        texts_to_embed = [c["content"] for c in chunks_data]
        embeddings = embedding_provider.embed_batch(texts_to_embed)

        if len(embeddings) != len(chunks_data):
            raise ProviderError(f"Embedding count mismatch: expected {len(chunks_data)}, got {len(embeddings)}.")

        # 5. Atomic persistence: delete old chunks (idempotent retry safety) and insert new ones
        with db.begin_nested():
            db.query(Chunk).filter(Chunk.document_id == doc.id).delete()

            for chunk_data, emb in zip(chunks_data, embeddings):
                new_chunk = Chunk(
                    document_id=doc.id,
                    chunk_index=chunk_data["chunk_index"],
                    content=chunk_data["content"],
                    embedding=emb,
                    token_count=chunk_data["token_count"],
                    metadata_=chunk_data["metadata"],
                )
                db.add(new_chunk)

            # 6. Only upon complete success, mark status as 'indexed'
            doc.status = "indexed"
            doc.error_message = None
            doc.metadata_ = {
                "page_count": parse_result.total_pages,
                "character_count": parse_result.total_characters,
                "chunk_count": len(chunks_data),
                "chunk_size": c_size,
                "chunk_overlap": c_overlap,
                **(parse_result.metadata or {}),
            }

        db.commit()
        db.refresh(doc)
        logger.info(f"Successfully indexed document {doc.id} ({doc.filename}) with {len(chunks_data)} chunks.")
        return doc

    except (ScannedDocumentError, EmptyDocumentError, UnsupportedFileTypeError) as e:
        logger.warning(f"Indexing rejected for document {document_id}: {e}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.error_message = str(e)
            db.commit()
            db.refresh(doc)
        return doc

    except (ProviderError, StorageError) as e:
        logger.error(f"External service failure indexing document {document_id}: {e}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.error_message = clean_error_message(e)
            db.commit()
            db.refresh(doc)
        return doc

    except Exception as e:
        logger.exception(f"Unexpected error indexing document {document_id}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            doc.error_message = f"Indexing failed: {clean_error_message(e)}"
            db.commit()
            db.refresh(doc)
        return doc
