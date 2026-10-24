"""Lexical keyword and term-matching search service with strict workspace isolation."""

import re
from typing import Any, Dict, List
from uuid import UUID
from sqlalchemy.orm import Session

from app.db.models.documents import Document
from app.db.models.chunks import Chunk


def search_lexical(
    db: Session,
    workspace_id: UUID,
    query_text: str,
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Execute keyword search over workspace chunks with BM25-style term-frequency scoring.
    Strictly isolated by workspace_id and indexed document status.
    """
    terms = set(re.findall(r"\w+", query_text.lower()))
    if not terms:
        return []

    chunks_with_doc = (
        db.query(Chunk, Document)
        .join(Document, Chunk.document_id == Document.id)
        .filter(
            Document.workspace_id == workspace_id,
            Document.status == "indexed",
        )
        .all()
    )

    scored = []
    for chunk, doc in chunks_with_doc:
        content_lower = chunk.content.lower()
        chunk_words = re.findall(r"\w+", content_lower)
        if not chunk_words:
            continue

        match_count = sum(1 for term in terms if term in content_lower)
        if match_count > 0:
            score = match_count / (len(terms) + (len(chunk_words) / 500.0))
            scored.append((
                score,
                {
                    "chunk_id": str(chunk.id),
                    "document_id": str(doc.id),
                    "filename": doc.filename,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "score": round(score, 4),
                    "metadata": chunk.metadata_ or {},
                },
            ))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:top_k]]
