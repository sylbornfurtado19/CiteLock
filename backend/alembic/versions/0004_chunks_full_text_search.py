"""Add PostgreSQL Full-Text Search (FTS) GIN index on chunks.content.

Revision ID: 0004_chunks_full_text_search
Revises: 0003_evidence_links_integrity
Create Date: 2026-11-02 08:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0004_chunks_full_text_search"
down_revision: Union[str, None] = "0003_evidence_links_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create GIN expression index on to_tsvector('english', content)
    # Automatically indexes all pre-existing and future chunks in PostgreSQL.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_chunks_content_tsv "
            "ON chunks USING gin (to_tsvector('english', content))"
        )


def downgrade() -> None:
    # Drop GIN index on chunks.content
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_chunks_content_tsv")
