"""Add targeted composite indexes for high-frequency workspace queries.

Revision ID: 0005_targeted_composite_indexes
Revises: 0004_chunks_full_text_search
Create Date: 2026-11-02 10:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0005_targeted_composite_indexes"
down_revision: Union[str, None] = "0004_chunks_full_text_search"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Composite index for claims filtered by answer and verdict (analytics & verification)
    op.create_index(
        "ix_claims_answer_verdict",
        "claims",
        ["answer_id", "verdict"],
        if_not_exists=True,
    )

    # 2. Composite index for queries filtered by workspace and ordered by creation time
    op.create_index(
        "ix_queries_workspace_created",
        "queries",
        ["workspace_id", sa.text("created_at DESC")],
        if_not_exists=True,
    )

    # 3. Composite index for documents filtered by workspace and processing status
    op.create_index(
        "ix_documents_workspace_status",
        "documents",
        ["workspace_id", "status"],
        if_not_exists=True,
    )

    # 4. Composite index for audit events filtered by workspace and ordered by creation time
    op.create_index(
        "ix_audit_events_workspace_created",
        "audit_events",
        ["workspace_id", sa.text("created_at DESC")],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_workspace_created", table_name="audit_events", if_exists=True)
    op.drop_index("ix_documents_workspace_status", table_name="documents", if_exists=True)
    op.drop_index("ix_queries_workspace_created", table_name="queries", if_exists=True)
    op.drop_index("ix_claims_answer_verdict", table_name="claims", if_exists=True)

