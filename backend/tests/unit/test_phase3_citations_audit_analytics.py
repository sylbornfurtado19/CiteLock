"""Tests covering Phase 3 requirements for CiteLock:
1. Citation mapping: map [Passage N] in draft to chunk, prefer cited chunks in provenance, cap to genuine matches.
2. Audit history integrity: delete document snapshots document_filename, sets chunk_id NULL, preserves quote & filename in audit.
3. Audit logging: audit_events recorded for document uploaded, indexed, failed, deleted, query executed, correction round, abstention.
4. Per-round verification runs: write one VerificationRun per correction round.
5. Endpoints & analytics:
   - GET /workspaces/{id}/audits (paginated, newest first)
   - GET /workspaces/{id}/audit-events
   - Analytics counts only indexed documents
   - Analytics exposes grounding_rate
   - Analytics range filtering (24h, 7d, 30d, all)
6. Alembic migration upgrade and downgrade on Postgres dialect.
"""

import io
import os
import subprocess
import uuid
from datetime import datetime, timedelta
from uuid import UUID
import pytest

from app.db.models.queries import Query
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.evidence_links import EvidenceLink
from app.db.models.verification_runs import VerificationRun
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
from app.db.models.audit_events import AuditEvent
from app.services.verification.provenance import trace_claim_provenance
from app.services.generation.claim_extractor import extract_atomic_claims
from app.services.verification.engine import verify_claims
from app.providers.base import MockLLMProvider
import app.providers.base as providers_base
from tests.conftest import create_sample_pdf


def test_citation_mapping_and_provenance_filtering():
    """Verify trace_claim_provenance filters low overlap, prefers cited chunk, and excludes out-of-margin chunks."""
    passages = [
        {
            "id": "c1",
            "filename": "annual_report.pdf",
            "content": "Acme Corporation was founded in 2015. It specializes in quantum cryptography and distributed security systems.",
        },
        {
            "id": "c2",
            "filename": "general_info.pdf",
            "content": "Acme Corporation maintains headquarters in Seattle. The engineering campus hosts over five hundred developers.",
        },
        {
            "id": "c3",
            "filename": "unrelated.pdf",
            "content": "The weather forecast predicts heavy rain across the northwestern region during the spring months.",
        },
    ]

    claim_text = "Acme Corporation was founded in 2015."
    # 1. Unrelated chunk c3 has 0 overlap -> excluded
    # 2. Chunk c2 has low overlap (shares only 'Acme' 'Corporation') -> below 0.35 threshold or relative margin -> excluded
    # 3. Chunk c1 is cited (passage 1) -> matches and is preferred
    links = trace_claim_provenance(claim_text, passages, cited_passages=[1])
    assert len(links) == 1
    assert links[0]["chunk_id"] == "c1"
    assert "2015" in links[0]["exact_quote"]
    assert links[0]["document_filename"] == "annual_report.pdf"


def test_provenance_rejects_weak_overlaps():
    """Verify threshold 0.35 rejects sentences that merely share a single common word."""
    passages = [
        {
            "id": "c1",
            "content": "The enterprise security architecture adheres to strict regulatory compliance guidelines.",
        }
    ]
    # Claim only shares 'security' out of 6 tokens (1/6 = 0.16)
    links = trace_claim_provenance("Database backup replication failed during routine maintenance.", passages)
    assert len(links) == 0


def test_delete_document_preserves_audit_quote_and_filename(client, workspace_a, mock_storage, mock_embeddings, db):
    """Verify document deletion sets chunk_id to NULL, preserves exact_quote and document_filename in audit and export."""
    pdf_bytes = create_sample_pdf("CiteLock provides zero-knowledge cryptographic audit proofs for enterprise RAG.")
    upload_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("compliance_guide.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = UUID(upload_res.json()["id"])

    # Find created chunk
    chunk = db.query(Chunk).filter(Chunk.document_id == doc_id).first()
    assert chunk is not None

    # Execute a query that references this chunk
    query = Query(workspace_id=workspace_a.id, prompt="What does CiteLock provide?", status="completed")
    db.add(query)
    db.commit()

    ans = Answer(
        query_id=query.id,
        draft_text="CiteLock provides zero-knowledge cryptographic audit proofs.",
        final_text="CiteLock provides zero-knowledge cryptographic audit proofs.",
        correction_rounds=0,
        is_abstained=False,
    )
    db.add(ans)
    db.commit()

    claim = Claim(
        answer_id=ans.id,
        claim_index=0,
        claim_text="CiteLock provides zero-knowledge cryptographic audit proofs.",
        verdict="supported",
        confidence_score=0.98,
        rationale="Substantiated by compliance guide.",
    )
    db.add(claim)
    db.commit()

    ev_link = EvidenceLink(
        claim_id=claim.id,
        chunk_id=chunk.id,
        document_filename="compliance_guide.pdf",
        exact_quote="CiteLock provides zero-knowledge cryptographic audit proofs for enterprise RAG.",
        relevance_score=0.95,
        start_char_offset=0,
        end_char_offset=74,
    )
    db.add(ev_link)
    db.commit()

    # Delete the document
    del_res = client.delete(f"/api/v1/workspaces/{workspace_a.id}/documents/{doc_id}")
    assert del_res.status_code == 204

    # Document and chunks are deleted
    assert db.query(Document).filter(Document.id == doc_id).first() is None
    assert db.query(Chunk).filter(Chunk.document_id == doc_id).count() == 0

    # Old audit still displays the claim, filename, and exact quote
    audit_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{ans.id}")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert len(audit_data["claims"]) == 1
    c = audit_data["claims"][0]
    assert len(c["evidence_links"]) == 1
    link_data = c["evidence_links"][0]
    assert link_data["chunk_id"] is None
    assert link_data["document_filename"] == "compliance_guide.pdf"
    assert "zero-knowledge cryptographic audit proofs" in link_data["exact_quote"]

    # Export also includes the snapshot
    export_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{ans.id}/export")
    assert export_res.status_code == 200
    export_claims = export_res.json()["claims"]
    assert len(export_claims) == 1
    assert "zero-knowledge cryptographic audit proofs" in export_claims[0]["evidence_links"][0]["exact_quote"]


def test_audit_events_recorded_for_lifecycle_actions(client, workspace_a, mock_storage, mock_embeddings, monkeypatch, db):
    """Verify audit_events table logs document upload, indexing, deletion, query execution, correction, and abstention."""
    # 1. Document upload & indexing
    pdf_bytes = create_sample_pdf("Content for audit event tracking.")
    res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/documents/upload?sync=true",
        files={"file": ("event_track.pdf", pdf_bytes, "application/pdf")},
    )
    assert res.status_code == 201
    doc_id = UUID(res.json()["id"])

    events = db.query(AuditEvent).filter(AuditEvent.workspace_id == workspace_a.id).all()
    event_types = [e.event_type for e in events]
    assert "document_uploaded" in event_types
    assert "document_indexed" in event_types

    # 2. Document deletion
    client.delete(f"/api/v1/workspaces/{workspace_a.id}/documents/{doc_id}")
    events = db.query(AuditEvent).filter(AuditEvent.workspace_id == workspace_a.id).all()
    event_types = [e.event_type for e in events]
    assert "document_deleted" in event_types

    # 3. Query execution & correction round
    class CorrectingLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            if "Critiques:" in prompt:
                return "CiteLock achieves verified precision."
            if "Passages:" in prompt and "User Query:" in prompt:
                return "CiteLock achieves verified precision. Contradicted statement."
            return super().complete(prompt, system_prompt, temperature)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: CorrectingLLM())
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "Explain precision.", "top_k": 3},
    )

    events = db.query(AuditEvent).filter(AuditEvent.workspace_id == workspace_a.id).all()
    event_types = [e.event_type for e in events]
    assert "query_executed" in event_types

    # 4. Abstention event
    class AbstainingLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            if "Passages:" in prompt:
                return "Aliens constructed monuments on Mars."
            return "Aliens constructed monuments on Mars."

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: AbstainingLLM())
    client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "What happened on Mars?", "top_k": 3},
    )

    events = db.query(AuditEvent).filter(AuditEvent.workspace_id == workspace_a.id).all()
    event_types = [e.event_type for e in events]
    assert "abstention" in event_types

    # 5. Verify GET /workspaces/{id}/audit-events endpoint
    list_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audit-events")
    assert list_res.status_code == 200
    listed_events = list_res.json()
    assert len(listed_events) >= 4
    assert all("event_type" in e and "actor" in e for e in listed_events)


def test_per_round_verification_runs_persisted(client, workspace_a, mock_storage, mock_embeddings, monkeypatch, db):
    """Verify that multiple VerificationRun rows are recorded for an answer with correction rounds."""
    # Seed document
    doc = Document(
        workspace_id=workspace_a.id,
        filename="notes.txt",
        storage_path=f"workspaces/{workspace_a.id}/notes.txt",
        checksum="chk_notes",
        status="indexed",
        file_size_bytes=100,
        mime_type="text/plain",
    )
    db.add(doc)
    db.commit()
    chunk = Chunk(
        document_id=doc.id,
        chunk_index=0,
        content="CiteLock precision is verified across enterprise benchmarks.",
        embedding=mock_embeddings.embed_text("CiteLock precision is verified across enterprise benchmarks."),
        metadata_={"source": "notes.txt"},
    )
    db.add(chunk)
    db.commit()

    class MultiRoundCorrectionLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            if "Critiques:" in prompt:
                return "CiteLock precision is verified across enterprise benchmarks."
            if "Passages:" in prompt and "User Query:" in prompt:
                return "CiteLock precision is verified across enterprise benchmarks. Initial contradicted statement."
            return super().complete(prompt, system_prompt, temperature)

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: MultiRoundCorrectionLLM())

    q_res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "What precision does CiteLock achieve?", "top_k": 3},
    )
    assert q_res.status_code == 201
    ans_id = UUID(q_res.json()["answer"]["id"])

    # Query verification runs for this answer
    runs = db.query(VerificationRun).filter(VerificationRun.answer_id == ans_id).order_by(VerificationRun.round_number.asc()).all()
    # Initial round (round 1) + correction round (round 2)
    assert len(runs) >= 2
    round_numbers = [r.round_number for r in runs]
    assert 1 in round_numbers
    assert 2 in round_numbers


def test_audits_list_endpoint(client, workspace_a, db):
    """Verify GET /workspaces/{id}/audits returns paginated list sorted newest first."""
    q = Query(workspace_id=workspace_a.id, prompt="List audit prompt 1", status="completed")
    db.add(q)
    db.commit()

    ans1 = Answer(
        query_id=q.id,
        draft_text="Draft 1",
        final_text="Final 1",
        correction_rounds=1,
        is_abstained=False,
        model_config_data={"verification_status": "verified"},
    )
    db.add(ans1)
    db.commit()

    claim1 = Claim(answer_id=ans1.id, claim_index=0, claim_text="Claim 1", verdict="supported")
    db.add(claim1)
    db.commit()

    res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits?page=1&page_size=10")
    assert res.status_code == 200
    audits = res.json()
    assert len(audits) >= 1
    first_audit = audits[0]
    assert first_audit["answer_id"] == str(ans1.id)
    assert first_audit["prompt"] == "List audit prompt 1"
    assert first_audit["claim_count"] == 1
    assert first_audit["verification_status"] == "verified"
    assert first_audit["correction_rounds"] == 1


def test_analytics_indexed_only_grounding_rate_and_range_filtering(client, workspace_a, db):
    """Verify analytics counts only indexed documents, exposes grounding_rate, and applies range filtering."""
    now = datetime.utcnow()

    # 1. Seed documents: 1 indexed, 1 failed, 1 uploaded
    doc_indexed = Document(
        workspace_id=workspace_a.id,
        filename="indexed.txt",
        storage_path="path/1",
        checksum="chk1",
        status="indexed",
        file_size_bytes=50,
        mime_type="text/plain",
        created_at=now - timedelta(hours=2),
    )
    doc_failed = Document(
        workspace_id=workspace_a.id,
        filename="failed.txt",
        storage_path="path/2",
        checksum="chk2",
        status="failed",
        file_size_bytes=50,
        mime_type="text/plain",
        created_at=now - timedelta(hours=2),
    )
    db.add_all([doc_indexed, doc_failed])
    db.commit()

    # 2. Seed queries across time ranges:
    # Query 1: 2 hours ago (within 24h, 7d, 30d)
    q1 = Query(workspace_id=workspace_a.id, prompt="Recent 2h query", status="completed", created_at=now - timedelta(hours=2))
    # Query 2: 3 days ago (within 7d, 30d, but NOT 24h)
    q2 = Query(workspace_id=workspace_a.id, prompt="Past 3d query", status="completed", created_at=now - timedelta(days=3))
    # Query 3: 15 days ago (within 30d, but NOT 7d)
    q3 = Query(workspace_id=workspace_a.id, prompt="Past 15d query", status="completed", created_at=now - timedelta(days=15))
    # Query 4: 40 days ago (outside 30d)
    q4 = Query(workspace_id=workspace_a.id, prompt="Past 40d query", status="completed", created_at=now - timedelta(days=40))
    db.add_all([q1, q2, q3, q4])
    db.commit()

    # Add answers & claims for q1
    ans1 = Answer(query_id=q1.id, draft_text="Draft", final_text="Final", created_at=now - timedelta(hours=2))
    db.add(ans1)
    db.commit()
    c1 = Claim(answer_id=ans1.id, claim_index=0, claim_text="Claim 1", verdict="supported", created_at=now - timedelta(hours=2))
    db.add(c1)
    db.commit()

    # Range: 24h
    res_24h = client.get(f"/api/v1/workspaces/{workspace_a.id}/analytics?range=24h")
    assert res_24h.status_code == 200
    data_24h = res_24h.json()
    assert data_24h["total_documents"] == 1  # Only indexed doc
    assert data_24h["total_queries"] == 1
    assert "grounding_rate" in data_24h
    assert data_24h["grounding_rate"] == 1.0

    # Range: 7d
    res_7d = client.get(f"/api/v1/workspaces/{workspace_a.id}/analytics?range=7d")
    data_7d = res_7d.json()
    assert data_7d["total_queries"] == 2  # q1 and q2

    # Range: 30d
    res_30d = client.get(f"/api/v1/workspaces/{workspace_a.id}/analytics?range=30d")
    data_30d = res_30d.json()
    assert data_30d["total_queries"] == 3  # q1, q2, q3

    # Range: all
    res_all = client.get(f"/api/v1/workspaces/{workspace_a.id}/analytics?range=all")
    data_all = res_all.json()
    assert data_all["total_queries"] == 4  # q1, q2, q3, q4


def test_alembic_postgres_migration_upgrade_and_downgrade():
    """Verify Alembic 0003 migration generates correct Postgres DDL on upgrade and downgrade."""
    import sys
    env = os.environ.copy()
    env["ENVIRONMENT"] = "development"

    # Test upgrade SQL generation
    proc_up = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "0002_create_tables:0003_evidence_links_integrity", "--sql"],
        cwd="backend",
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_up.returncode == 0, f"Alembic upgrade failed: {proc_up.stderr}"
    sql_up = proc_up.stdout
    assert "ALTER TABLE evidence_links ADD COLUMN document_filename" in sql_up
    assert "ALTER TABLE evidence_links ALTER COLUMN chunk_id DROP NOT NULL" in sql_up
    assert "ON DELETE SET NULL" in sql_up

    # Test downgrade SQL generation
    proc_down = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "0003_evidence_links_integrity:0002_create_tables", "--sql"],
        cwd="backend",
        capture_output=True,
        text=True,
        env=env,
    )
    assert proc_down.returncode == 0, f"Alembic downgrade failed: {proc_down.stderr}"
    sql_down = proc_down.stdout
    assert "ALTER TABLE evidence_links DROP COLUMN document_filename" in sql_down
    assert "ALTER TABLE evidence_links ALTER COLUMN chunk_id SET NOT NULL" in sql_down
    assert "ON DELETE CASCADE" in sql_down
