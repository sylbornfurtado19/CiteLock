"""Snapshot document_filename on evidence_links and make chunk_id nullable with SET NULL on delete.

Revision ID: 0003_evidence_links_integrity
Revises: 0002_create_tables
Create Date: 2026-10-31 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_evidence_links_integrity"
down_revision: Union[str, None] = "0002_create_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add document_filename column to evidence_links
    op.add_column("evidence_links", sa.Column("document_filename", sa.String(length=255), nullable=True))

    # 2. Make chunk_id nullable on evidence_links
    op.alter_column(
        "evidence_links",
        "chunk_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )

    # 3. Update foreign key to ON DELETE SET NULL
    op.drop_constraint("evidence_links_chunk_id_fkey", "evidence_links", type_="foreignkey")
    op.create_foreign_key(
        "evidence_links_chunk_id_fkey",
        "evidence_links",
        "chunks",
        ["chunk_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # 1. Revert foreign key to ON DELETE CASCADE
    op.drop_constraint("evidence_links_chunk_id_fkey", "evidence_links", type_="foreignkey")
    op.create_foreign_key(
        "evidence_links_chunk_id_fkey",
        "evidence_links",
        "chunks",
        ["chunk_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 2. Make chunk_id non-nullable again
    op.alter_column(
        "evidence_links",
        "chunk_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    # 3. Drop document_filename column
    op.drop_column("evidence_links", "document_filename")

