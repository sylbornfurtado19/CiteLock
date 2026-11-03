"""Housekeeping for documents whose background indexing never finished.

Indexing runs in-process (FastAPI BackgroundTasks). If the server restarts mid-upload, the task is gone and the
document would sit in `uploaded` or `processing` forever. Anything that has not changed for a while is marked
`failed` with a clear reason so the UI offers Retry instead of spinning.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.db.models.documents import Document

logger = logging.getLogger(__name__)

STALE_STATUSES = ("uploaded", "processing")
STALE_MESSAGE = (
    "Processing was interrupted (the server restarted or the task was lost before indexing finished). "
    "Click Retry to process this document again."
)


def fail_stale_documents(
    db: Session,
    older_than: timedelta,
    workspace_id: Optional[UUID] = None,
    now: Optional[datetime] = None,
) -> int:
    """Mark documents stuck in uploaded/processing for longer than `older_than` as failed. Returns the count.

    A threshold (not "everything in flight") protects against another instance that is legitimately still
    indexing during a rolling deploy.
    """
    cutoff = (now or datetime.utcnow()) - older_than
    query = db.query(Document).filter(Document.status.in_(STALE_STATUSES), Document.updated_at < cutoff)
    if workspace_id is not None:
        query = query.filter(Document.workspace_id == workspace_id)

    stale = query.all()
    if not stale:
        return 0

    for doc in stale:
        doc.status = "failed"
        doc.error_message = STALE_MESSAGE
    db.commit()

    try:
        from app.services.audit.recorder import record_audit_event

        for doc in stale:
            record_audit_event(
                db=db,
                workspace_id=doc.workspace_id,
                event_type="document_failed",
                actor="system",
                description=f"Document indexing marked failed after being stuck: {doc.filename}",
                payload={"document_id": str(doc.id), "filename": doc.filename, "error": "stale_processing"},
            )
    except Exception as err:  # the status change above is what matters; auditing is best effort here
        logger.warning("Could not record audit events for stale documents: %s", err)

    logger.warning("Marked %d stale document(s) as failed", len(stale))
    return len(stale)
