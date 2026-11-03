"""Documents whose indexing task was lost must be failed (with Retry available), never left spinning."""

import uuid
from datetime import datetime, timedelta

from app.db.models.documents import Document
from app.services.ingestion.maintenance import STALE_MESSAGE, fail_stale_documents


def make_doc(db, workspace, status, minutes_old):
    doc = Document(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        filename=f"{status}-{minutes_old}.txt",
        storage_path=f"workspaces/{workspace.id}/{uuid.uuid4()}.txt",
        checksum=uuid.uuid4().hex,
        status=status,
        file_size_bytes=10,
        mime_type="text/plain",
    )
    db.add(doc)
    db.commit()
    # backdate after insert (updated_at is maintained automatically on update)
    old = datetime.utcnow() - timedelta(minutes=minutes_old)
    db.query(Document).filter(Document.id == doc.id).update({"created_at": old, "updated_at": old}, synchronize_session=False)
    db.commit()
    db.refresh(doc)
    return doc


def test_old_processing_and_uploaded_documents_are_failed_with_a_retry_message(db, workspace_a):
    processing = make_doc(db, workspace_a, "processing", 30)
    uploaded = make_doc(db, workspace_a, "uploaded", 45)

    count = fail_stale_documents(db, timedelta(minutes=10))

    assert count == 2
    for doc in (processing, uploaded):
        db.refresh(doc)
        assert doc.status == "failed" and doc.error_message == STALE_MESSAGE and "Retry" in doc.error_message


def test_recent_and_finished_documents_are_untouched(db, workspace_a):
    fresh = make_doc(db, workspace_a, "processing", 2)  # may still be genuinely indexing
    indexed = make_doc(db, workspace_a, "indexed", 500)
    failed = make_doc(db, workspace_a, "failed", 500)
    failed.error_message = "original reason"
    db.commit()

    assert fail_stale_documents(db, timedelta(minutes=10)) == 0

    for doc, expected in ((fresh, "processing"), (indexed, "indexed"), (failed, "failed")):
        db.refresh(doc)
        assert doc.status == expected
    assert failed.error_message == "original reason"


def test_sweep_can_be_limited_to_one_workspace(db, workspace_a, workspace_b):
    mine = make_doc(db, workspace_a, "processing", 60)
    theirs = make_doc(db, workspace_b, "processing", 60)

    assert fail_stale_documents(db, timedelta(minutes=10), workspace_id=workspace_a.id) == 1
    db.refresh(mine)
    db.refresh(theirs)
    assert mine.status == "failed" and theirs.status == "processing"


def test_listing_documents_clears_stuck_ones_so_the_ui_offers_retry(client, db, workspace_a):
    stuck = make_doc(db, workspace_a, "processing", 90)

    res = client.get(f"/api/v1/workspaces/{workspace_a.id}/documents")

    assert res.status_code == 200
    row = next(d for d in res.json() if d["id"] == str(stuck.id))
    assert row["status"] == "failed" and "Retry" in row["error_message"]


def test_failed_stale_documents_can_be_reprocessed(client, db, workspace_a, mock_storage):
    """The recovery path the message promises: a swept document is retried through the normal reprocess endpoint."""
    stuck = make_doc(db, workspace_a, "processing", 90)
    mock_storage.upload(stuck.storage_path, b"CiteLock provides auditing.", "text/plain")
    client.get(f"/api/v1/workspaces/{workspace_a.id}/documents")  # triggers the sweep

    res = client.post(f"/api/v1/workspaces/{workspace_a.id}/documents/{stuck.id}/reprocess?sync=true")

    assert res.status_code in (200, 202)
    db.refresh(stuck)
    assert stuck.status in ("indexed", "processing")
