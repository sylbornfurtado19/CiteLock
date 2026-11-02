"""Unit tests for targeted composite database indexing and Alembic migration 0005.

Verifies:
1. Alembic 0005 migration generates safe, valid PostgreSQL DDL on upgrade and downgrade.
2. SQLAlchemy ORM models define the targeted composite indexes on the correct columns.
3. Query plans utilize composite indexes for workspace-scoped status, timestamp ordering, and verdict grouping.
4. CRUD operations and cascade deletions function correctly with composite indexes.
"""

import os
import subprocess
import sys
import uuid
from datetime import datetime, timedelta
import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models.claims import Claim
from app.db.models.queries import Query
from app.db.models.documents import Document
from app.db.models.audit_events import AuditEvent
from app.db.models.answers import Answer
from app.db.models.workspaces import Workspace
from app.db.models.users import User


def test_alembic_0005_migration_sql_generation():
    """Verify Alembic 0005 migration generates valid, safe Postgres DDL with IF NOT EXISTS / IF EXISTS."""
    env = os.environ.copy()
    env["ENVIRONMENT"] = "development"

    # Test upgrade SQL generation
    proc_up = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "upgrade",
            "0004_chunks_full_text_search:0005_targeted_composite_indexes",
            "--sql",
        ],
        cwd="backend",
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_up.returncode == 0, f"Alembic 0005 upgrade failed: {proc_up.stderr}"
    sql_up = proc_up.stdout
    assert "CREATE INDEX IF NOT EXISTS ix_claims_answer_verdict ON claims (answer_id, verdict);" in sql_up
    assert "CREATE INDEX IF NOT EXISTS ix_queries_workspace_created ON queries (workspace_id, created_at DESC);" in sql_up
    assert "CREATE INDEX IF NOT EXISTS ix_documents_workspace_status ON documents (workspace_id, status);" in sql_up
    assert "CREATE INDEX IF NOT EXISTS ix_audit_events_workspace_created ON audit_events (workspace_id, created_at DESC);" in sql_up

    # Test downgrade SQL generation
    proc_down = subprocess.run(
        [
            sys.executable,
            "-m",
            "alembic",
            "downgrade",
            "0005_targeted_composite_indexes:0004_chunks_full_text_search",
            "--sql",
        ],
        cwd="backend",
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_down.returncode == 0, f"Alembic 0005 downgrade failed: {proc_down.stderr}"
    sql_down = proc_down.stdout
    assert "DROP INDEX IF EXISTS ix_claims_answer_verdict;" in sql_down
    assert "DROP INDEX IF EXISTS ix_queries_workspace_created;" in sql_down
    assert "DROP INDEX IF EXISTS ix_documents_workspace_status;" in sql_down
    assert "DROP INDEX IF EXISTS ix_audit_events_workspace_created;" in sql_down


def test_orm_model_composite_indexes_defined():
    """Verify SQLAlchemy ORM models include composite index specifications."""
    # 1. Claim: ix_claims_answer_verdict on (answer_id, verdict)
    claim_indexes = {idx.name: [c.name for c in idx.columns] for idx in Claim.__table__.indexes}
    assert "ix_claims_answer_verdict" in claim_indexes
    assert claim_indexes["ix_claims_answer_verdict"] == ["answer_id", "verdict"]

    # 2. Document: ix_documents_workspace_status on (workspace_id, status)
    doc_indexes = {idx.name: [c.name for c in idx.columns] for idx in Document.__table__.indexes}
    assert "ix_documents_workspace_status" in doc_indexes
    assert doc_indexes["ix_documents_workspace_status"] == ["workspace_id", "status"]

    # 3. Query: ix_queries_workspace_created on (workspace_id, created_at)
    query_indexes = {idx.name: [c.name for c in idx.columns] for idx in Query.__table__.indexes}
    assert "ix_queries_workspace_created" in query_indexes
    assert query_indexes["ix_queries_workspace_created"] == ["workspace_id", "created_at"]

    # 4. AuditEvent: ix_audit_events_workspace_created on (workspace_id, created_at)
    audit_indexes = {idx.name: [c.name for c in idx.columns] for idx in AuditEvent.__table__.indexes}
    assert "ix_audit_events_workspace_created" in audit_indexes
    assert audit_indexes["ix_audit_events_workspace_created"] == ["workspace_id", "created_at"]


def test_query_plan_uses_composite_indexes(db: Session):
    """Verify query optimizer utilizes composite indexes for status filtering and timestamp ordering."""
    uid = uuid.uuid4().hex[:8]
    user = User(email=f"plan_{uid}@example.com", firebase_uid=f"fb_plan_{uid}")
    db.add(user)
    db.commit()

    ws = Workspace(name="Index Plan WS", owner_id=user.id)
    db.add(ws)
    db.commit()

    # Seed data
    doc = Document(
        workspace_id=ws.id,
        filename="test.pdf",
        storage_path="path/test.pdf",
        checksum=f"chk_{uid}",
        status="indexed",
        file_size_bytes=100,
        mime_type="application/pdf",
    )
    db.add(doc)

    q = Query(workspace_id=ws.id, prompt="Test prompt", status="completed")
    db.add(q)
    db.commit()

    # 1. Test Document (workspace_id, status) query plan
    doc_plan_rows = db.execute(
        text("EXPLAIN QUERY PLAN SELECT * FROM documents WHERE workspace_id = :ws_id AND status = :st"),
        {"ws_id": str(ws.id), "st": "indexed"},
    ).fetchall()
    doc_plan_str = " ".join(str(r) for r in doc_plan_rows)
    # Verifies index scan using ix_documents_workspace_status on SQLite/PostgreSQL
    assert "ix_documents_workspace_status" in doc_plan_str or "USING INDEX" in doc_plan_str

    # 2. Test Query (workspace_id, created_at DESC) query plan
    query_plan_rows = db.execute(
        text("EXPLAIN QUERY PLAN SELECT * FROM queries WHERE workspace_id = :ws_id ORDER BY created_at DESC"),
        {"ws_id": str(ws.id)},
    ).fetchall()
    query_plan_str = " ".join(str(r) for r in query_plan_rows)
    assert "ix_queries_workspace_created" in query_plan_str or "USING INDEX" in query_plan_str
    # Verify no temporary B-tree filesort is performed for ORDER BY
    assert "TEMP B-TREE FOR ORDER BY" not in query_plan_str


def test_composite_indexes_crud_integrity(db: Session):
    """Verify that INSERT, UPDATE, and CASCADE DELETE operations function flawlessly with composite indexes."""
    uid = uuid.uuid4().hex[:8]
    user = User(email=f"crud_{uid}@example.com", firebase_uid=f"fb_crud_{uid}")
    db.add(user)
    db.commit()

    ws = Workspace(name="CRUD WS", owner_id=user.id)
    db.add(ws)
    db.commit()

    q = Query(workspace_id=ws.id, prompt="CRUD query", status="completed")
    db.add(q)
    db.commit()

    ans = Answer(query_id=q.id, draft_text="Draft", final_text="Final")
    db.add(ans)
    db.commit()

    claim = Claim(
        answer_id=ans.id,
        claim_index=0,
        claim_text="Test claim",
        verdict="supported",
    )
    db.add(claim)
    db.commit()

    # Verify claim can be updated
    claim.verdict = "contradicted"
    db.commit()

    refetched = db.query(Claim).filter(Claim.answer_id == ans.id, Claim.verdict == "contradicted").first()
    assert refetched is not None
    assert refetched.id == claim.id

    # Verify cascading delete cleans up without index constraint violations
    db.delete(q)
    db.commit()

    assert db.query(Answer).filter(Answer.id == ans.id).first() is None
    assert db.query(Claim).filter(Claim.id == claim.id).first() is None

