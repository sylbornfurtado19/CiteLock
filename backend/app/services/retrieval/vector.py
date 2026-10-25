"""Dense vector similarity search service querying pgvector chunks with strict workspace isolation."""

from typing import Any, Dict, List
from uuid import UUID
import numpy as np
from sqlalchemy.orm import Session

from app.db.models.documents import Document
from app.db.models.chunks import Chunk
import app.providers.base as providers_base


def search_vectors(
    db: Session,
    workspace_id: UUID,
    query_text: str,
    top_k: int = 5,
    min_score: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Execute vector similarity search across document chunks strictly scoped to workspace_id.
    Uses pgvector native cosine distance in PostgreSQL, with in-memory cosine fallback for SQLite testing.
    """
    if not query_text.strip():
        return []

    # Short-circuit if workspace has no indexed documents
    has_indexed_docs = (
        db.query(Document.id)
        .filter(Document.workspace_id == workspace_id, Document.status == "indexed")
        .first()
    )
    if not has_indexed_docs:
        return []

    embedding_provider = providers_base.get_embedding_provider()
    query_embedding = embedding_provider.embed_text(query_text)

    dialect_name = db.bind.dialect.name if db.bind else "postgresql"

    if dialect_name == "postgresql":
        # Native pgvector cosine distance: chunk.embedding.cosine_distance(query_embedding)
        # Cosine distance = 1 - cosine_similarity. Similarity = 1 - distance.
        distance_expr = Chunk.embedding.cosine_distance(query_embedding)
        results = (
            db.query(Chunk, Document, distance_expr.label("distance"))
            .join(Document, Chunk.document_id == Document.id)
            .filter(
                Document.workspace_id == workspace_id,
                Document.status == "indexed",
            )
            .order_by(distance_expr.asc())
            .limit(top_k)
            .all()
        )

        matched_chunks = []
        for chunk, doc, distance in results:
            sim_score = max(0.0, min(1.0, 1.0 - float(distance)))
            if sim_score >= min_score:
                matched_chunks.append({
                    "chunk_id": str(chunk.id),
                    "document_id": str(doc.id),
                    "filename": doc.filename,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "score": round(sim_score, 4),
                    "metadata": chunk.metadata_ or {},
                })
        return matched_chunks

    else:
        # SQLite / in-memory fallback for local unit & integration tests
        results = (
            db.query(Chunk, Document)
            .join(Document, Chunk.document_id == Document.id)
            .filter(
                Document.workspace_id == workspace_id,
                Document.status == "indexed",
            )
            .all()
        )

        q_vec = np.array(query_embedding, dtype=float)
        q_norm = np.linalg.norm(q_vec)

        scored = []
        for chunk, doc in results:
            if chunk.embedding is not None:
                c_vec = np.array(chunk.embedding, dtype=float)
                c_norm = np.linalg.norm(c_vec)
                if q_norm > 0 and c_norm > 0:
                    sim = float(np.dot(q_vec, c_vec) / (q_norm * c_norm))
                else:
                    sim = 0.0
            else:
                sim = 0.0

            if sim >= min_score:
                scored.append((
                    sim,
                    {
                        "chunk_id": str(chunk.id),
                        "document_id": str(doc.id),
                        "filename": doc.filename,
                        "chunk_index": chunk.chunk_index,
                        "content": chunk.content,
                        "score": round(sim, 4),
                        "metadata": chunk.metadata_ or {},
                    },
                ))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:top_k]]
