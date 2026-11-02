"""Lexical keyword and full-text search service with strict workspace isolation.

Executes PostgreSQL-native full-text search via GIN-indexed to_tsvector, websearch_to_tsquery,
and ts_rank_cd cover density scoring. Falls back safely to in-memory term frequency scoring on SQLite.
"""

import re
from typing import Any, Dict, List
from uuid import UUID
from sqlalchemy import text
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
    Execute lexical search strictly scoped to workspace_id and indexed documents.

    In PostgreSQL:
    - Utilizes GIN expression index on to_tsvector('english', chunks.content).
    - Employs websearch_to_tsquery for syntax-error-free user query parsing (phrases, operators, negations).
    - Blends strict query match with broad disjunctive term matching using ts_rank_cd.
    - Zero full-table chunk loading into Python memory.

    In SQLite:
    - Deterministic in-memory BM25-style term-frequency fallback for offline unit testing.
    """
    cleaned_query = query_text.strip()
    if not cleaned_query:
        return []

    # Extract alphanumeric tokens
    terms = re.findall(r"\w+", cleaned_query.lower())
    if not terms:
        return []

    dialect_name = db.bind.dialect.name if db.bind else "postgresql"

    if dialect_name == "postgresql":
        # Build disjunctive query string for broad matching: 'term1 or term2 or term3'
        or_query_text = " or ".join(dict.fromkeys(terms))

        stmt = text("""
            WITH search_queries AS (
                SELECT 
                    websearch_to_tsquery('english', :query_text) AS strict_q,
                    websearch_to_tsquery('english', :or_query_text) AS broad_q
            )
            SELECT 
                chunks.id AS chunk_id,
                chunks.document_id AS document_id,
                documents.filename AS filename,
                chunks.chunk_index AS chunk_index,
                chunks.content AS content,
                chunks.metadata AS metadata,
                (
                    COALESCE(ts_rank_cd(to_tsvector('english', chunks.content), sq.strict_q), 0.0) * 2.0 +
                    COALESCE(ts_rank_cd(to_tsvector('english', chunks.content), sq.broad_q), 0.0)
                ) AS rank
            FROM chunks
            JOIN documents ON chunks.document_id = documents.id
            CROSS JOIN search_queries sq
            WHERE documents.workspace_id = :workspace_id
              AND documents.status = 'indexed'
              AND (
                  (sq.strict_q != ''::tsquery AND to_tsvector('english', chunks.content) @@ sq.strict_q)
                  OR
                  (sq.broad_q != ''::tsquery AND to_tsvector('english', chunks.content) @@ sq.broad_q)
              )
            ORDER BY rank DESC, chunks.chunk_index ASC
            LIMIT :top_k
        """)

        rows = db.execute(
            stmt,
            {
                "workspace_id": workspace_id,
                "query_text": cleaned_query,
                "or_query_text": or_query_text,
                "top_k": top_k,
            },
        ).fetchall()

        results: List[Dict[str, Any]] = []
        for row in rows:
            meta = row.metadata if isinstance(row.metadata, dict) else {}
            results.append({
                "chunk_id": str(row.chunk_id),
                "document_id": str(row.document_id),
                "filename": row.filename,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "score": round(float(row.rank), 4),
                "metadata": meta,
            })
        return results

    else:
        # SQLite / in-memory fallback for local unit & integration tests
        chunks_with_doc = (
            db.query(Chunk, Document)
            .join(Document, Chunk.document_id == Document.id)
            .filter(
                Document.workspace_id == workspace_id,
                Document.status == "indexed",
            )
            .all()
        )

        term_set = set(terms)
        scored = []
        for chunk, doc in chunks_with_doc:
            content_lower = chunk.content.lower()
            chunk_words = re.findall(r"\w+", content_lower)
            if not chunk_words:
                continue

            match_count = sum(1 for term in term_set if term in content_lower)
            if match_count > 0:
                score = match_count / (len(term_set) + (len(chunk_words) / 500.0))
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
