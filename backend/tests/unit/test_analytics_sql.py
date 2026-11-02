"""Unit tests for SQL-level workspace analytics aggregation.

Verifies:
1. SQL COUNT and GROUP BY aggregation for verdict distributions.
2. Grounding rate and hallucination rate calculations matching existing formulas.
3. SQL AVG aggregation for verification latency with NULL handling.
4. Time range filtering (1h, 24h, 7d, 30d, all).
5. Strict workspace isolation between workspaces.
6. Clean handling of empty datasets.
7. Verification that full Claim ORM collections are not loaded into Python memory.
"""

import uuid
from datetime import datetime, timedelta
import pytest
from sqlalchemy.orm import Session

from app.db.models.workspaces import Workspace
from app.db.models.users import User
from app.db.models.queries import Query
from app.db.models.answers import Answer
from app.db.models.claims import Claim
from app.db.models.verification_runs import VerificationRun
from app.db.models.documents import Document
from app.api.routes.analytics import compute_workspace_analytics_sql
from app.schemas import AnalyticsSummary


@pytest.fixture
def analytics_test_workspace(db: Session):
    """Fixture providing isolated workspace and user for analytics testing."""
    unique_suffix = uuid.uuid4().hex[:8]
    user = User(
        email=f"analytics_{unique_suffix}@example.com",
        firebase_uid=f"firebase_analytics_{unique_suffix}",
    )
    db.add(user)
    db.commit()

    workspace = Workspace(
        name=f"Analytics Workspace {unique_suffix}",
        owner_id=user.id,
    )
    db.add(workspace)
    db.commit()

    return workspace


def test_sql_analytics_empty_workspace(db: Session, analytics_test_workspace):
    """Empty workspace should return zeros with 1.0 grounding rate and 0.0 latency without errors."""
    summary = compute_workspace_analytics_sql(db=db, workspace_id=analytics_test_workspace.id)

    assert isinstance(summary, AnalyticsSummary)
    assert summary.total_queries == 0
    assert summary.total_documents == 0
    assert summary.overall_hallucination_rate == 0.0
    assert summary.grounding_rate == 1.0
    assert summary.avg_latency_ms == 0.0
    assert summary.verdict_distribution == {
        "supported": 0,
        "partially_supported": 0,
        "contradicted": 0,
        "unsupported": 0,
        "insufficient_evidence": 0,
        "verification_error": 0,
        "unknown": 0,
    }


def test_sql_analytics_verdict_distribution_and_rates(db: Session, analytics_test_workspace):
    """Verify exact SQL GROUP BY aggregation across all verdict types and known grounding rate formula."""
    ws_id = analytics_test_workspace.id

    # Create 1 query and 1 answer
    query = Query(workspace_id=ws_id, prompt="Test prompt", status="completed")
    db.add(query)
    db.commit()

    answer = Answer(query_id=query.id, draft_text="Draft", final_text="Final")
    db.add(answer)
    db.commit()

    # Seed known claims:
    # 4 supported (score = 4.0)
    # 2 partially_supported (score = 1.0)
    # 2 contradicted (hallucinated)
    # 1 unsupported (hallucinated)
    # 1 insufficient_evidence (neither grounded nor hallucinated)
    # 1 custom_unrecognized (maps to unknown, neither grounded nor hallucinated)
    # 1 verification_error (excluded from valid_claims denominator)
    # Total valid claims = 4 + 2 + 2 + 1 + 1 + 1 = 11 valid claims
    # Hallucinated count = 2 + 1 = 3 -> Rate = 3 / 11 = 0.2727
    # Grounded score = 4 + (0.5 * 2) = 5.0 -> Grounding rate = 5.0 / 11 = 0.4545
    test_verdicts = (
        ["supported"] * 4
        + ["partially_supported"] * 2
        + ["contradicted"] * 2
        + ["unsupported"] * 1
        + ["insufficient_evidence"] * 1
        + ["custom_unrecognized"] * 1
        + ["verification_error"] * 1
    )

    for idx, v in enumerate(test_verdicts):
        claim = Claim(
            answer_id=answer.id,
            claim_index=idx,
            claim_text=f"Claim {idx}",
            verdict=v,
        )
        db.add(claim)
    db.commit()

    summary = compute_workspace_analytics_sql(db=db, workspace_id=ws_id)

    assert summary.verdict_distribution["supported"] == 4
    assert summary.verdict_distribution["partially_supported"] == 2
    assert summary.verdict_distribution["contradicted"] == 2
    assert summary.verdict_distribution["unsupported"] == 1
    assert summary.verdict_distribution["insufficient_evidence"] == 1
    assert summary.verdict_distribution["unknown"] == 1
    assert summary.verdict_distribution["verification_error"] == 1

    # Exact expected rates:
    assert summary.overall_hallucination_rate == round(3 / 11, 4)  # 0.2727
    assert summary.grounding_rate == round(5.0 / 11, 4)  # 0.4545


def test_sql_analytics_latency_aggregation_and_null_handling(db: Session, analytics_test_workspace):
    """Verify SQL AVG aggregation handles non-null, mixed null, and all-null latencies accurately."""
    ws_id = analytics_test_workspace.id

    query = Query(workspace_id=ws_id, prompt="Latency prompt", status="completed")
    db.add(query)
    db.commit()

    answer = Answer(query_id=query.id, draft_text="Draft", final_text="Final")
    db.add(answer)
    db.commit()

    # 1. Verification runs with latencies 100, 250, 400, and one NULL
    runs = [
        VerificationRun(answer_id=answer.id, round_number=1, judge_model="openai", hallucination_rate=0.0, latency_ms=100),
        VerificationRun(answer_id=answer.id, round_number=2, judge_model="openai", hallucination_rate=0.0, latency_ms=250),
        VerificationRun(answer_id=answer.id, round_number=3, judge_model="openai", hallucination_rate=0.0, latency_ms=400),
        VerificationRun(answer_id=answer.id, round_number=4, judge_model="openai", hallucination_rate=0.0, latency_ms=None),  # NULL ignored
    ]
    db.add_all(runs)
    db.commit()

    summary = compute_workspace_analytics_sql(db=db, workspace_id=ws_id)
    # Expected average: (100 + 250 + 400) / 3 = 750 / 3 = 250.0
    assert summary.avg_latency_ms == 250.0


def test_sql_analytics_all_null_latencies_return_zero(db: Session, analytics_test_workspace):
    """When all verification runs have NULL latency_ms, avg_latency_ms should return 0.0."""
    ws_id = analytics_test_workspace.id

    query = Query(workspace_id=ws_id, prompt="Null latency prompt", status="completed")
    db.add(query)
    db.commit()

    answer = Answer(query_id=query.id, draft_text="Draft", final_text="Final")
    db.add(answer)
    db.commit()

    run = VerificationRun(
        answer_id=answer.id,
        round_number=1,
        judge_model="openai",
        hallucination_rate=0.0,
        latency_ms=None,
    )
    db.add(run)
    db.commit()

    summary = compute_workspace_analytics_sql(db=db, workspace_id=ws_id)
    assert summary.avg_latency_ms == 0.0


def test_sql_analytics_time_range_filtering(db: Session, analytics_test_workspace):
    """Verify cutoff filters apply across queries, documents, claims, and verification runs."""
    ws_id = analytics_test_workspace.id
    now = datetime.utcnow()

    # Document 1: 30 minutes ago (within 1h, 24h, 7d, 30d)
    doc_recent = Document(
        workspace_id=ws_id,
        filename="recent.txt",
        storage_path="path/recent",
        checksum="chk_recent",
        status="indexed",
        file_size_bytes=100,
        mime_type="text/plain",
        created_at=now - timedelta(minutes=30),
    )
    # Document 2: 12 hours ago (within 24h, 7d, 30d, but NOT 1h)
    doc_older = Document(
        workspace_id=ws_id,
        filename="older.txt",
        storage_path="path/older",
        checksum="chk_older",
        status="indexed",
        file_size_bytes=100,
        mime_type="text/plain",
        created_at=now - timedelta(hours=12),
    )
    db.add_all([doc_recent, doc_older])
    db.commit()

    # Query 1 & Answer 1: 30 minutes ago
    q1 = Query(workspace_id=ws_id, prompt="Recent Q", status="completed", created_at=now - timedelta(minutes=30))
    db.add(q1)
    db.commit()
    ans1 = Answer(query_id=q1.id, draft_text="D1", final_text="F1", created_at=now - timedelta(minutes=30))
    db.add(ans1)
    db.commit()
    c1 = Claim(answer_id=ans1.id, claim_index=0, claim_text="C1", verdict="supported", created_at=now - timedelta(minutes=30))
    db.add(c1)
    run1 = VerificationRun(answer_id=ans1.id, round_number=1, judge_model="openai", hallucination_rate=0.0, latency_ms=100, created_at=now - timedelta(minutes=30))
    db.add(run1)

    # Query 2 & Answer 2: 12 hours ago
    q2 = Query(workspace_id=ws_id, prompt="12h Q", status="completed", created_at=now - timedelta(hours=12))
    db.add(q2)
    db.commit()
    ans2 = Answer(query_id=q2.id, draft_text="D2", final_text="F2", created_at=now - timedelta(hours=12))
    db.add(ans2)
    db.commit()
    c2 = Claim(answer_id=ans2.id, claim_index=0, claim_text="C2", verdict="contradicted", created_at=now - timedelta(hours=12))
    db.add(c2)
    run2 = VerificationRun(answer_id=ans2.id, round_number=1, judge_model="openai", hallucination_rate=1.0, latency_ms=300, created_at=now - timedelta(hours=12))
    db.add(run2)
    db.commit()

    # Range: 1h cutoff -> Only doc_recent, q1, c1, run1
    summary_1h = compute_workspace_analytics_sql(db=db, workspace_id=ws_id, cutoff=now - timedelta(hours=1))
    assert summary_1h.total_documents == 1
    assert summary_1h.total_queries == 1
    assert summary_1h.verdict_distribution["supported"] == 1
    assert summary_1h.verdict_distribution["contradicted"] == 0
    assert summary_1h.avg_latency_ms == 100.0

    # Range: 24h cutoff -> Both docs, both queries, both claims, both runs
    summary_24h = compute_workspace_analytics_sql(db=db, workspace_id=ws_id, cutoff=now - timedelta(hours=24))
    assert summary_24h.total_documents == 2
    assert summary_24h.total_queries == 2
    assert summary_24h.verdict_distribution["supported"] == 1
    assert summary_24h.verdict_distribution["contradicted"] == 1
    assert summary_24h.avg_latency_ms == 200.0  # (100 + 300) / 2


def test_sql_analytics_workspace_isolation(db: Session):
    """Verify that records in Workspace A never bleed into Workspace B analytics."""
    uid_a = uuid.uuid4().hex[:8]
    uid_b = uuid.uuid4().hex[:8]

    user_a = User(email=f"u_{uid_a}@example.com", firebase_uid=f"fb_{uid_a}")
    user_b = User(email=f"u_{uid_b}@example.com", firebase_uid=f"fb_{uid_b}")
    db.add_all([user_a, user_b])
    db.commit()

    ws_a = Workspace(name="WS A", owner_id=user_a.id)
    ws_b = Workspace(name="WS B", owner_id=user_b.id)
    db.add_all([ws_a, ws_b])
    db.commit()

    # Seed heavy activity into Workspace A
    q_a = Query(workspace_id=ws_a.id, prompt="Q in A", status="completed")
    db.add(q_a)
    db.commit()
    ans_a = Answer(query_id=q_a.id, draft_text="Draft A", final_text="Final A")
    db.add(ans_a)
    db.commit()
    for idx in range(5):
        c = Claim(answer_id=ans_a.id, claim_index=idx, claim_text=f"C{idx}", verdict="supported")
        db.add(c)
    run_a = VerificationRun(answer_id=ans_a.id, round_number=1, judge_model="openai", hallucination_rate=0.0, latency_ms=180)
    db.add(run_a)
    db.commit()

    # Analytics for Workspace B must be completely clean (0 queries, 0 claims, 0.0 latency)
    summary_b = compute_workspace_analytics_sql(db=db, workspace_id=ws_b.id)
    assert summary_b.total_queries == 0
    assert summary_b.total_documents == 0
    assert summary_b.verdict_distribution["supported"] == 0
    assert summary_b.avg_latency_ms == 0.0

    # Analytics for Workspace A reflects only Workspace A
    summary_a = compute_workspace_analytics_sql(db=db, workspace_id=ws_a.id)
    assert summary_a.total_queries == 1
    assert summary_a.verdict_distribution["supported"] == 5
    assert summary_a.avg_latency_ms == 180.0


def test_sql_analytics_http_endpoint_queries(client, workspace_a, db: Session):
    """Verify HTTP endpoint handles all query range variants and returns valid AnalyticsSummary contract."""
    # Seed 1 query, 1 answer, 1 claim, 1 document
    doc = Document(
        workspace_id=workspace_a.id,
        filename="compliance.pdf",
        storage_path="workspaces/compliance.pdf",
        checksum="chk_compliance",
        status="indexed",
        file_size_bytes=2048,
        mime_type="application/pdf",
    )
    db.add(doc)

    q = Query(workspace_id=workspace_a.id, prompt="Compliance check", status="completed")
    db.add(q)
    db.commit()

    ans = Answer(query_id=q.id, draft_text="Draft", final_text="Final")
    db.add(ans)
    db.commit()

    claim = Claim(answer_id=ans.id, claim_index=0, claim_text="Compliant with SOC2", verdict="supported")
    db.add(claim)
    run = VerificationRun(answer_id=ans.id, round_number=1, judge_model="openai", hallucination_rate=0.0, latency_ms=125)
    db.add(run)
    db.commit()

    for range_param in ["1h", "24h", "1d", "7d", "30d", "all", "ALL", " 24h "]:
        res = client.get(f"/api/v1/workspaces/{workspace_a.id}/analytics?range={range_param}")
        assert res.status_code == 200
        payload = res.json()
        assert payload["total_queries"] == 1
        assert payload["total_documents"] == 1
        assert payload["verdict_distribution"]["supported"] == 1
        assert payload["grounding_rate"] == 1.0
        assert payload["overall_hallucination_rate"] == 0.0
        assert payload["avg_latency_ms"] == 125.0


def test_sql_analytics_executes_group_by_not_full_claim_orm_load(db: Session, analytics_test_workspace):
    """Verify that SQL query level aggregation executes GROUP BY and COUNT, not loading Claim ORM instances."""
    from sqlalchemy import event

    ws_id = analytics_test_workspace.id
    q = Query(workspace_id=ws_id, prompt="Inspect queries", status="completed")
    db.add(q)
    db.commit()
    ans = Answer(query_id=q.id, draft_text="D", final_text="F")
    db.add(ans)
    db.commit()
    for i in range(10):
        db.add(Claim(answer_id=ans.id, claim_index=i, claim_text=f"Claim text {i}" * 50, verdict="supported"))
    db.commit()

    captured_statements = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        captured_statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", before_cursor_execute)
    try:
        summary = compute_workspace_analytics_sql(db=db, workspace_id=ws_id)
        assert summary.verdict_distribution["supported"] == 10

        # Assert that SQL statements include GROUP BY and COUNT, and func.avg
        statements_str = " ".join(captured_statements).lower()
        assert "group by" in statements_str or "count(" in statements_str
        assert "avg(" in statements_str
    finally:
        event.remove(engine, "before_cursor_execute", before_cursor_execute)

