import os
"""Unit tests for PostgreSQL full-text lexical search: ranking, workspace isolation, punctuation, and migration DDL."""

import uuid
import pytest
from sqlalchemy import text
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
from app.db.models.workspaces import Workspace
from app.db.models.users import User
from app.services.retrieval.lexical import search_lexical
from app.services.retrieval.hybrid import retrieve_hybrid


@pytest.fixture
def test_workspace(db):
    unique_id = uuid.uuid4().hex[:12]
    user = User(id=uuid.uuid4(), email=f"lexical_{unique_id}@citelock.ai", firebase_uid=f"uid_{unique_id}")
    db.add(user)
    db.flush()

    ws = Workspace(id=uuid.uuid4(), name="Lexical Workspace", owner_id=user.id)
    db.add(ws)
    db.commit()
    return ws


@pytest.fixture
def indexed_docs(db, test_workspace):
    doc1 = Document(
        id=uuid.uuid4(),
        workspace_id=test_workspace.id,
        filename="compliance_report.pdf",
        storage_path="vault/compliance.pdf",
        checksum="chk111",
        status="indexed",
        mime_type="application/pdf",
    )
    doc2 = Document(
        id=uuid.uuid4(),
        workspace_id=test_workspace.id,
        filename="financial_summary.docx",
        storage_path="vault/fin.docx",
        checksum="chk222",
        status="indexed",
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    doc_unindexed = Document(
        id=uuid.uuid4(),
        workspace_id=test_workspace.id,
        filename="unindexed_draft.pdf",
        storage_path="vault/draft.pdf",
        checksum="chk333",
        status="processing",  # Should never be retrieved
        mime_type="application/pdf",
    )
    db.add_all([doc1, doc2, doc_unindexed])
    db.flush()

    chunk1 = Chunk(
        id=uuid.uuid4(),
        document_id=doc1.id,
        chunk_index=0,
        content="CiteLock executes automated factual verification and citation auditing on documents.",
        metadata_={"page": 1},
    )
    chunk2 = Chunk(
        id=uuid.uuid4(),
        document_id=doc2.id,
        chunk_index=0,
        content="Operating revenues expanded by 18% in fiscal year 2026, outperforming sector baselines.",
        metadata_={"page": 2},
    )
    chunk3 = Chunk(
        id=uuid.uuid4(),
        document_id=doc_unindexed.id,
        chunk_index=0,
        content="Secret confidential unindexed text mentioning CiteLock.",
        metadata_={"page": 1},
    )
    db.add_all([chunk1, chunk2, chunk3])
    db.commit()

    return {"ws_id": test_workspace.id, "doc1": doc1, "doc2": doc2, "chunk1": chunk1, "chunk2": chunk2}


def test_lexical_search_finds_relevant_chunks(db, indexed_docs):
    """Verify lexical search matches relevant terms and populates expected schema."""
    res = search_lexical(db, indexed_docs["ws_id"], "CiteLock factual verification", top_k=5)
    assert len(res) >= 1
    top = res[0]
    assert top["chunk_id"] == str(indexed_docs["chunk1"].id)
    assert top["filename"] == "compliance_report.pdf"
    assert "CiteLock" in top["content"]
    assert top["score"] > 0.0
    assert "metadata" in top


def test_lexical_search_numeric_figures(db, indexed_docs):
    """Verify lexical search handles numeric terms like '18%' and '2026'."""
    res = search_lexical(db, indexed_docs["ws_id"], "18% fiscal 2026", top_k=5)
    assert len(res) >= 1
    assert res[0]["chunk_id"] == str(indexed_docs["chunk2"].id)
    assert "18%" in res[0]["content"]


def test_lexical_search_empty_and_whitespace_queries(db, indexed_docs):
    """Verify empty or whitespace-only queries cleanly return an empty list without database exceptions."""
    assert search_lexical(db, indexed_docs["ws_id"], "") == []
    assert search_lexical(db, indexed_docs["ws_id"], "   \n\t  ") == []


def test_lexical_search_punctuation_and_symbols_safe(db, indexed_docs):
    """Verify punctuation-heavy queries without alphanumeric terms return empty list safely."""
    assert search_lexical(db, indexed_docs["ws_id"], "??? !!! ---") == []
    assert search_lexical(db, indexed_docs["ws_id"], "@@#$%^&*()") == []


def test_lexical_search_punctuation_with_valid_terms(db, indexed_docs):
    """Verify queries containing mixed punctuation and valid terms correctly extract terms."""
    res = search_lexical(db, indexed_docs["ws_id"], "CiteLock??? (verification!)", top_k=5)
    assert len(res) >= 1
    assert res[0]["chunk_id"] == str(indexed_docs["chunk1"].id)


def test_lexical_search_strict_workspace_isolation(db, indexed_docs):
    """Verify chunks from Workspace A are never returned when querying Workspace B."""
    foreign_ws_id = uuid.uuid4()
    res = search_lexical(db, foreign_ws_id, "CiteLock factual verification", top_k=5)
    assert len(res) == 0


def test_lexical_search_filters_unindexed_documents(db, indexed_docs):
    """Verify documents with status != 'indexed' are excluded from search results."""
    res = search_lexical(db, indexed_docs["ws_id"], "Secret confidential unindexed", top_k=5)
    assert len(res) == 0


def test_hybrid_retrieval_compatibility_with_lexical(db, indexed_docs):
    """Verify retrieve_hybrid executes seamlessly with updated search_lexical."""
    hybrid_res = retrieve_hybrid(db, indexed_docs["ws_id"], "CiteLock verification", top_k=3)
    assert len(hybrid_res) >= 1
    for item in hybrid_res:
        assert "chunk_id" in item
        assert "fused_score" in item
        assert "content" in item
        assert "filename" in item


def test_alembic_0004_migration_sql_generation():
    """Verify Alembic 0004 migration generates valid PostgreSQL GIN index DDL on upgrade and downgrade."""
    import subprocess
    import sys
    import os

    env = os.environ.copy()
    env["ENVIRONMENT"] = "development"

    # Test upgrade SQL generation
    proc_up = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "0003_evidence_links_integrity:0004_chunks_full_text_search", "--sql"],
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_up.returncode == 0, f"Alembic upgrade failed: {proc_up.stderr}"
    sql_up = proc_up.stdout
    assert "CREATE INDEX IF NOT EXISTS ix_chunks_content_tsv ON chunks USING gin (to_tsvector('english', content))" in sql_up
    assert "0004_chunks_full_text_search" in sql_up

    # Test downgrade SQL generation
    proc_down = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0004_chunks_full_text_search:0003_evidence_links_integrity", "--sql"],
        cwd=os.path.join(os.path.dirname(__file__), "..", ".."),
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_down.returncode == 0, f"Alembic downgrade failed: {proc_down.stderr}"
    sql_down = proc_down.stdout
    assert "DROP INDEX IF EXISTS ix_chunks_content_tsv" in sql_down
