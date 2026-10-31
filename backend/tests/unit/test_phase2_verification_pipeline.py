"""Tests covering Phase 2 requirements for CiteLock:
1. Citation markers stripped from claim text before numeric checks, judge, and provenance.
2. Stripped markers saved in cited_passages.
3. Dates like 2023-05-14 not split into three numbers.
4. Per-chunk numeric matching.
5. Wrong figure is contradicted; cited true claim is supported with numeric check passing.
6. Judge outage returns 502 and persists failed query (not an abstained answer).
7. Abstained answer keeps real claims and correct hallucination rate.
8. Audit and export endpoints include correction_history, verification_status, and execution_metadata.
9. DocumentRead.metadata serializes as non-null.
10. Whitespace prompt returns HTTP 422.
"""

import uuid
from uuid import UUID
import pytest
from pydantic import ValidationError

from app.schemas import QueryCreate, DocumentRead, ChunkRead
from app.db.models.queries import Query
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.documents import Document
from app.db.models.chunks import Chunk
from app.services.generation.claim_extractor import strip_citation_markers, extract_atomic_claims
from app.services.verification.numeric import verify_numeric_precision, extract_figures
from app.services.verification.engine import verify_claims
from app.services.verification.judge import evaluate_claim_with_judge, VerificationProviderError
from app.providers.base import MockLLMProvider, ProviderError
import app.providers.base as providers_base


def test_strip_citation_markers():
    """Verify citation markers like [Passage 1] and [Chunk ID: uuid] are stripped and passage IDs extracted."""
    raw = "Acme was founded in 2015 [Passage 1] and expanded in 2020 [Chunk ID: 12345678-1234-5678-1234-567812345678]."
    clean, passages = strip_citation_markers(raw)
    assert "[Passage 1]" not in clean
    assert "[Chunk ID:" not in clean
    assert "2015" in clean and "2020" in clean
    assert passages == [1]


def test_dates_do_not_split_into_three_numbers():
    """Verify dates like 2023-05-14 are treated as single date entities, not 2023, 5, 14."""
    from app.services.verification.numeric import _figure_type

    figs = extract_figures("The agreement was signed on 2023-05-14.")
    assert len(figs) == 1
    assert figs[0] == "2023-05-14"
    assert _figure_type(figs[0]) == "date"

    # Per-chunk matching check: matching date passes
    res_pass = verify_numeric_precision("The agreement was signed on 2023-05-14.", ["Signed on 2023-05-14."])
    assert res_pass["passed"] is True
    assert res_pass["has_contradiction"] is False

    # Conflicting date fails
    res_fail = verify_numeric_precision("The agreement was signed on 2023-05-14.", ["Signed on 2023-05-15."])
    assert res_fail["passed"] is False
    assert res_fail["has_contradiction"] is True


def test_evidence_matching_per_chunk():
    """Verify number matching is evaluated per retrieved chunk, not against a single concatenated string."""
    chunks = [
        "First division has 5 offices.",
        "Second division has 14 departments.",
    ]
    # Claim with a date should not match '5' from chunk 1 and '14' from chunk 2
    res = verify_numeric_precision("The launch occurred on 2023-05-14.", chunks)
    assert res["passed"] is False
    assert res["has_contradiction"] is False  # unverified date, not a contradiction


def test_cited_true_claim_is_supported_with_numeric_check_passing(mock_llm):
    """Verify cited true claim is supported and numeric check passes despite [Passage 1] citation marker."""
    raw_claim = "Acme was founded in 2015 [Passage 1]."
    claims = [{"claim_index": 0, "claim_text": raw_claim}]
    passages = [{"id": "c1", "content": "Acme was founded in 2015."}]

    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "supported"
    assert c["numeric_verified"] is True
    assert c["verification_metadata"]["has_numeric_contradiction"] is False
    assert c["cited_passages"] == [1]
    assert "[Passage 1]" not in c["claim_text"]


def test_wrong_figure_is_still_contradicted():
    """Verify wrong figure in claim with citation marker is still flagged as contradicted."""
    raw_claim = "Acme was founded in 2018 [Passage 1]."
    claims = [{"claim_index": 0, "claim_text": raw_claim}]
    passages = [{"id": "c1", "content": "Acme was founded in 2015."}]

    res = verify_claims(claims, passages)
    c = res["claims"][0]
    assert c["verdict"] == "contradicted"
    assert c["numeric_verified"] is False
    assert c["verification_metadata"]["has_numeric_contradiction"] is True


def test_whitespace_prompt_gives_422(client, workspace_a):
    """Verify whitespace-only prompt is rejected with HTTP 422."""
    with pytest.raises(ValidationError):
        QueryCreate(prompt="   \t\n  ")

    res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "     ", "top_k": 3},
    )
    assert res.status_code == 422


def test_document_metadata_is_non_null(client, workspace_a, db):
    """Verify DocumentRead.metadata and ChunkRead.metadata serialize as non-null dicts."""
    doc = Document(
        workspace_id=workspace_a.id,
        filename="meta_test.txt",
        storage_path=f"workspaces/{workspace_a.id}/meta_test.txt",
        checksum="chk_meta",
        status="indexed",
        file_size_bytes=100,
        mime_type="text/plain",
        metadata_={"author": "Alice", "department": "Research"},
    )
    db.add(doc)
    db.commit()

    chunk = Chunk(
        document_id=doc.id,
        chunk_index=0,
        content="Sample content for chunk metadata.",
        metadata_={"chunk_meta_key": "chunk_meta_val"},
    )
    db.add(chunk)
    db.commit()

    doc_read = DocumentRead.model_validate(doc)
    assert doc_read.metadata is not None
    assert doc_read.metadata.get("author") == "Alice"
    assert doc_read.metadata.get("department") == "Research"

    chunk_read = ChunkRead.model_validate(chunk)
    assert chunk_read.metadata is not None
    assert chunk_read.metadata.get("chunk_meta_key") == "chunk_meta_val"

    res = client.get(f"/api/v1/workspaces/{workspace_a.id}/documents")
    assert res.status_code == 200
    docs = res.json()
    matched = next((d for d in docs if d["id"] == str(doc.id)), None)
    assert matched is not None
    assert matched["metadata"] is not None
    assert matched["metadata"]["author"] == "Alice"


def test_judge_outage_returns_502_and_persists_failed_query(client, workspace_a, mock_embeddings, monkeypatch, db):
    """Verify judge outage returns 502, does not leak internal error, and persists a failed query."""
    doc = Document(
        workspace_id=workspace_a.id,
        filename="arch.txt",
        storage_path=f"workspaces/{workspace_a.id}/arch.txt",
        checksum="chk_arch",
        status="indexed",
        file_size_bytes=100,
        mime_type="text/plain",
    )
    db.add(doc)
    db.commit()

    chunk = Chunk(
        document_id=doc.id,
        chunk_index=0,
        content="CiteLock architecture uses an LLM judge.",
        embedding=mock_embeddings.embed_text("CiteLock architecture uses an LLM judge."),
        metadata_={"source": "arch.txt"},
    )
    db.add(chunk)
    db.commit()

    class FailingJudgeLLM(MockLLMProvider):
        def structured_judge(self, claim, evidence_passages):
            raise RuntimeError("Underlying LLM service 503 connection timeout")

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: FailingJudgeLLM())

    res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "Explain CiteLock architecture.", "top_k": 3},
    )
    assert res.status_code == 502
    # Generic message, not leaking str(e)
    assert "temporarily unavailable" in res.json()["detail"].lower()
    assert "Underlying LLM service" not in res.json()["detail"]

    # Verify failed query record persisted in database
    failed_queries = db.query(Query).filter(
        Query.workspace_id == workspace_a.id,
        Query.status == "failed",
    ).all()
    assert len(failed_queries) >= 1
    last_query = failed_queries[-1]
    assert last_query.prompt == "Explain CiteLock architecture."
    assert "error_summary" in last_query.query_parameters
    assert "verification_error" in last_query.query_parameters["error_summary"]

    # Verify no Answer record was created for this failed query
    answers = db.query(Answer).filter(Answer.query_id == last_query.id).all()
    assert len(answers) == 0


def test_abstained_answer_keeps_real_claims_and_correct_rate(client, workspace_a, monkeypatch, db):
    """Verify abstained answer retains original real evaluated claims and correct hallucination rate."""
    class AbstainingLLM(MockLLMProvider):
        def complete(self, prompt, system_prompt=None, temperature=0.0):
            if "Passages:" in prompt:
                return "The secret quantum core was deployed in 1990. The energy output reached 999 megawatts."
            # During revision: return something that cannot be verified
            return "The secret quantum core was deployed in 1990. The energy output reached 999 megawatts."

    monkeypatch.setattr(providers_base, "get_llm_provider", lambda: AbstainingLLM())

    res = client.post(
        f"/api/v1/workspaces/{workspace_a.id}/queries",
        json={"prompt": "What was the quantum energy output in 1990?", "top_k": 3},
    )
    assert res.status_code == 201
    data = res.json()
    ans = data["answer"]
    assert ans["is_abstained"] is True
    assert "sufficient evidence" in ans["final_text"].lower()

    # The claims must NOT be from the abstention sentence ("The provided reference documents...")
    # They should be the evaluated real claims
    assert len(ans["claims"]) >= 2
    assert any("quantum" in c["claim_text"].lower() for c in ans["claims"])
    assert not any("sufficient evidence" in c["claim_text"].lower() for c in ans["claims"])

    # Hallucination rate reflects the real claims
    from app.db.models.verification_runs import VerificationRun
    run = db.query(VerificationRun).filter(VerificationRun.answer_id == UUID(ans["id"])).first()
    assert run is not None
    # Real claims without evidence have hallucination_rate == 0.0 (insufficient_evidence)
    assert run.hallucination_rate == 0.0


def test_audit_and_export_include_correction_history(client, workspace_a, db):
    """Verify audit and export responses include correction_history, verification_status, and execution_metadata."""
    q = Query(
        workspace_id=workspace_a.id,
        prompt="Audit history test question",
        status="completed",
    )
    db.add(q)
    db.commit()

    ans = Answer(
        query_id=q.id,
        draft_text="Initial draft text.",
        final_text="Final corrected text.",
        correction_rounds=2,
        is_abstained=False,
        model_config_data={
            "correction_history": [
                {"round": 1, "revised_text": "Round 1 revision", "failed_count_before": 2, "failed_count_after": 1},
                {"round": 2, "revised_text": "Round 2 revision", "failed_count_before": 1, "failed_count_after": 0},
            ],
            "verification_status": "verified",
            "execution_metadata": {"latency_ms": 450, "llm_provider": "mock"},
        },
    )
    db.add(ans)
    db.commit()

    c = Claim(
        answer_id=ans.id,
        claim_index=0,
        claim_text="Final verified claim.",
        verdict="supported",
        confidence_score=0.95,
        rationale="Evidence substantiated.",
    )
    db.add(c)
    db.commit()

    # Test audit endpoint
    audit_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{ans.id}")
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert "correction_history" in audit_data
    assert len(audit_data["correction_history"]) == 2
    assert audit_data["correction_history"][0]["round"] == 1
    assert audit_data["verification_status"] == "verified"
    assert audit_data["execution_metadata"]["latency_ms"] == 450

    # Test export endpoint
    export_res = client.get(f"/api/v1/workspaces/{workspace_a.id}/audits/{ans.id}/export")
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert "correction_history" in export_data
    assert len(export_data["correction_history"]) == 2
    assert export_data["verification_status"] == "verified"
    assert export_data["execution_metadata"]["llm_provider"] == "mock"
